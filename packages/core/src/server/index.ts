import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { analyzeUnfinishedWork, buildFlowGraph, discoverEntryPoints } from '../analyzer';
import { buildStoryboard } from '../storyboard/frame-builder';
import type {
  EntryPoint,
  FlowGraph,
  RunFallback,
  SourceSnippet,
  Storyboard,
  StoryboardFrame,
  UnfinishedWorkFinding,
} from '../storyboard/types';
import {
  executeFunctionEntryPoint,
  executeHttpRouteEntryPoint,
} from './execution';

export interface ServerConfig {
  targetDir: string;
  port: number;
  uiDistPath?: string;
}

export class ServerStartupError extends Error {
  code?: string;
  port: number;

  constructor(message: string, port: number, code?: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'ServerStartupError';
    this.code = code;
    this.port = port;
  }
}

interface CachedAnalysis {
  entryPoints: EntryPoint[];
  unfinishedWork: UnfinishedWorkFinding[];
}

function attachFindingsToEntryPoints(entryPoints: EntryPoint[], findings: UnfinishedWorkFinding[]): EntryPoint[] {
  return entryPoints.map((entryPoint) => ({
    ...entryPoint,
    unfinishedWork: findings.filter((finding) => finding.file === entryPoint.file),
  }));
}

function createAnalysisGapFinding(entryPoint: EntryPoint, detail: string): UnfinishedWorkFinding {
  return {
    id: `uw_gap_${entryPoint.id}`,
    kind: 'analysis-gap',
    severity: 'warning',
    title: 'Static analysis gap',
    detail,
    file: entryPoint.file,
    line: entryPoint.line,
    symbolName: entryPoint.name,
  };
}

function annotateFlowGraph(flowGraph: FlowGraph, findings: UnfinishedWorkFinding[]): FlowGraph {
  const nodes = Object.fromEntries(
    Object.entries(flowGraph.nodes).map(([nodeId, node]) => {
      const nodeFindings = findings.filter((finding) => finding.file === node.file && finding.line === node.line);
      return [nodeId, { ...node, findings: nodeFindings }];
    }),
  );

  return {
    ...flowGraph,
    nodes,
    findings: findings.filter((finding) =>
      Object.values(flowGraph.nodes).some((node) => node.file === finding.file),
    ),
  };
}

function buildEntryPointFlowGraph(entryPoint: EntryPoint, findings: UnfinishedWorkFinding[], targetDir: string): FlowGraph | null {
  const functionName = entryPoint.name.includes(' ')
    ? entryPoint.name.split(' ').pop()!
    : entryPoint.name;

  const flowGraph = buildFlowGraph(entryPoint.file, functionName, targetDir);
  if (!flowGraph) {
    return null;
  }

  flowGraph.entryPointId = entryPoint.id;
  return annotateFlowGraph(flowGraph, findings);
}

function attachFrameNavigation(frames: StoryboardFrame[]): StoryboardFrame[] {
  return frames.map((frame, index) => ({
    ...frame,
    previousFrameId: index > 0 ? frames[index - 1].id : undefined,
  }));
}

function attachFlowMetadata(frames: StoryboardFrame[], flowGraph: FlowGraph | null): StoryboardFrame[] {
  if (!flowGraph) {
    return frames;
  }

  return frames.map((frame) => {
    const matchingNode = Object.values(flowGraph.nodes).find((node) => node.file === frame.file && node.line === frame.line);
    if (!matchingNode) {
      return frame;
    }

    const updatedBranch = frame.branch
      ? {
          ...frame.branch,
          options: [
            {
              id: `${frame.id}_taken`,
              label: frame.branch.taken ? 'Taken path' : 'Taken path (alternate)',
              description: frame.branch.taken
                ? 'This was the path used in the current run.'
                : 'The runtime followed the alternate path here.',
              taken: true,
              flowNodeId: frame.branch.taken ? matchingNode.branchTrue : matchingNode.branchFalse,
            },
            {
              id: `${frame.id}_alternate`,
              label: 'Alternate path',
              description: frame.branch.alternateDescription || 'Preview the other possible route from this decision.',
              taken: false,
              flowNodeId: frame.branch.taken ? matchingNode.branchFalse : matchingNode.branchTrue,
            },
          ],
        }
      : undefined;

    return {
      ...frame,
      flowNodeId: matchingNode.id,
      branch: updatedBranch,
    };
  });
}

function buildFallback(
  entryPoint: EntryPoint,
  flowGraph: FlowGraph | null,
  unfinishedWork: UnfinishedWorkFinding[],
  summary: string,
  blocker: string,
  technicalDetails: string[] = [],
): RunFallback {
  return {
    summary,
    blockers: [blocker],
    flowGraph,
    unfinishedWork,
    technicalDetails,
  };
}

async function ensureAnalysis(config: ServerConfig, cached: CachedAnalysis | null): Promise<CachedAnalysis> {
  if (cached) {
    return cached;
  }

  const started = Date.now();
  const [entryPoints, unfinishedWork] = await Promise.all([
    discoverEntryPoints(config.targetDir),
    analyzeUnfinishedWork(config.targetDir),
  ]);
  const elapsed = Date.now() - started;

  // Soft Phase 1 budget: examples/order-api should analyze in well under 2s.
  // We log (don't throw) when a workspace exceeds the budget so larger repos still work.
  const ANALYSIS_BUDGET_MS = 2000;
  if (elapsed > ANALYSIS_BUDGET_MS) {
    console.warn(
      `[rsd:perf] Analysis took ${elapsed}ms (soft budget ${ANALYSIS_BUDGET_MS}ms). ` +
        `Consider narrowing --target to a subdirectory if this feels slow.`,
    );
  }

  return {
    entryPoints: attachFindingsToEntryPoints(entryPoints, unfinishedWork),
    unfinishedWork,
  };
}

async function createStoryboardFromExecution(
  config: ServerConfig,
  entryPoint: EntryPoint,
  flowGraph: FlowGraph | null,
  unfinishedWork: UnfinishedWorkFinding[],
  scenarioName: string | undefined,
  execution: Awaited<ReturnType<typeof executeFunctionEntryPoint>>,
): Promise<Storyboard> {
  const storyboard = buildStoryboard(execution.events, entryPoint, scenarioName);
  storyboard.frames = attachFlowMetadata(attachFrameNavigation(storyboard.frames), flowGraph);
  storyboard.metadata.durationMs = execution.durationMs;
  storyboard.metadata.runContext = execution.runContext;
  storyboard.metadata.unfinishedWorkCount = unfinishedWork.length;
  storyboard.metadata.technicalNotes = execution.technicalNotes;

  if (!flowGraph) {
    const gapFinding = createAnalysisGapFinding(entryPoint, 'A static flow graph could not be built for this entry point.');
    storyboard.fallback = buildFallback(
      entryPoint,
      null,
      [...unfinishedWork, gapFinding],
      'Execution ran, but static branch preview is incomplete for this entry point.',
      gapFinding.detail,
      execution.technicalNotes,
    );
  }

  return storyboard;
}

export function createServer(config: ServerConfig) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let cachedAnalysis: CachedAnalysis | null = null;
  const storyboards = new Map<string, Storyboard>();

  function sendError(
    res: express.Response,
    status: number,
    code: string,
    message: string,
    suggestedAction: string,
    cause?: unknown,
  ): void {
    const causeMessage =
      cause instanceof Error ? cause.message : cause === undefined ? undefined : String(cause);
    res.status(status).json({
      error: {
        code,
        message,
        cause: causeMessage,
        suggestedAction,
      },
      // Back-compat: older clients read `error` as a string.
      message,
    });
  }

  app.get('/api/entry-points', async (_req, res) => {
    try {
      cachedAnalysis = await ensureAnalysis(config, cachedAnalysis);
      res.json({ entryPoints: cachedAnalysis.entryPoints });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        'analysis_failed',
        'Could not analyze the target directory.',
        'Confirm the path passed to --target exists and is a project you have permission to read, then retry. If the failure persists, run with DEBUG=rsd:* for full stack traces.',
        err,
      );
    }
  });

  app.get('/api/entry-points/:id/flow', async (req, res) => {
    try {
      cachedAnalysis = await ensureAnalysis(config, cachedAnalysis);
      const entryPoint = cachedAnalysis.entryPoints.find((candidate) => candidate.id === req.params.id);
      if (!entryPoint) {
        sendError(
          res,
          404,
          'entry_point_not_found',
          `Entry point "${req.params.id}" not found in this workspace.`,
          'Refresh the workspace overview — the entry point list may be out of date if files were renamed or deleted since startup.',
        );
        return;
      }

      const flowGraph = buildEntryPointFlowGraph(entryPoint, entryPoint.unfinishedWork, config.targetDir);
      if (!flowGraph) {
        res.json({
          flowGraph: null,
          message: 'Could not build flow graph for this entry point',
          unfinishedWork: [
            ...entryPoint.unfinishedWork,
            createAnalysisGapFinding(entryPoint, 'A static flow graph could not be created for this entry point.'),
          ],
        });
        return;
      }

      res.json({ flowGraph, unfinishedWork: entryPoint.unfinishedWork });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        'flow_graph_failed',
        'Could not build the flow graph for this entry point.',
        'The source file may use unsupported syntax for the static analyzer. Try running it anyway — runtime tracing often works even when static analysis cannot.',
        err,
      );
    }
  });

  app.post('/api/entry-points/:id/run', async (req, res) => {
    try {
      cachedAnalysis = await ensureAnalysis(config, cachedAnalysis);
      const entryPoint = cachedAnalysis.entryPoints.find((candidate) => candidate.id === req.params.id);
      if (!entryPoint) {
        sendError(
          res,
          404,
          'entry_point_not_found',
          `Entry point "${req.params.id}" not found in this workspace.`,
          'Refresh the workspace overview and try selecting the entry point again.',
        );
        return;
      }

      const inputs = (req.body?.inputs as Record<string, unknown>) || {};
      const flags = (req.body?.flags as Record<string, unknown>) || {};
      const rerunContext = req.body?.rerunContext as { storyboardId?: string; frameId?: string } | undefined;
      const flowGraph = buildEntryPointFlowGraph(entryPoint, entryPoint.unfinishedWork, config.targetDir);

      if (entryPoint.runSupport.status !== 'supported') {
        res.json({
          fallback: buildFallback(
            entryPoint,
            flowGraph,
            entryPoint.unfinishedWork,
            'This entry point is available for guided exploration, but direct execution is not supported in the current release.',
            entryPoint.runSupport.reason || 'Execution support is not available for this entry point.',
          ),
        });
        return;
      }

      try {
        const execution = entryPoint.invocationKind === 'http-route'
          ? await executeHttpRouteEntryPoint(config.targetDir, entryPoint, inputs, flags, rerunContext)
          : await executeFunctionEntryPoint(config.targetDir, entryPoint, inputs, flags, rerunContext);

        const storyboard = await createStoryboardFromExecution(
          config,
          entryPoint,
          flowGraph,
          entryPoint.unfinishedWork,
          undefined,
          execution,
        );
        storyboards.set(storyboard.id, storyboard);

        res.json({ storyboard, fallback: storyboard.fallback || null });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        res.json({
          fallback: buildFallback(
            entryPoint,
            flowGraph,
            entryPoint.unfinishedWork,
            'Runtime execution could not complete, but static analysis is still available.',
            message,
            [message],
          ),
        });
      }
    } catch (err: unknown) {
      sendError(
        res,
        500,
        'run_failed',
        'The run could not be started.',
        'Verify the entry point still exists and that required inputs were provided. Check the server console for a stack trace.',
        err,
      );
    }
  });

  app.get('/api/storyboards', (_req, res) => {
    const list = Array.from(storyboards.values()).map((storyboard) => ({
      id: storyboard.id,
      entryPoint: storyboard.entryPoint.name,
      totalFrames: storyboard.metadata.totalFrames,
      scenarioName: storyboard.metadata.scenarioName,
      runContext: storyboard.metadata.runContext,
      unfinishedWorkCount: storyboard.metadata.unfinishedWorkCount || 0,
    }));
    res.json({ storyboards: list });
  });

  app.get('/api/storyboards/:id', (req, res) => {
    const storyboard = storyboards.get(req.params.id);
    if (!storyboard) {
      sendError(
        res,
        404,
        'storyboard_not_found',
        `Storyboard "${req.params.id}" was not found.`,
        'Storyboards are kept in memory only. If the server was restarted, re-run the entry point to capture a new storyboard.',
      );
      return;
    }
    res.json({ storyboard });
  });

  app.get('/api/source', (req, res) => {
    try {
      const file = req.query.file as string;
      const line = parseInt(req.query.line as string, 10) || 1;
      const context = parseInt(req.query.context as string, 10) || 5;

      if (!file) {
        sendError(
          res,
          400,
          'missing_file_param',
          'The `file` query parameter is required.',
          'Append `?file=<relative-path>` to the request URL.',
        );
        return;
      }

      const fullPath = path.resolve(config.targetDir, file);
      if (!fullPath.startsWith(path.resolve(config.targetDir))) {
        sendError(
          res,
          400,
          'path_outside_target',
          'The requested file resolves outside the target directory.',
          'Use a path relative to the target directory; absolute paths and `..` segments that escape the target are not allowed.',
        );
        return;
      }
      if (!fs.existsSync(fullPath)) {
        sendError(
          res,
          404,
          'source_file_missing',
          `Source file "${file}" was not found on disk.`,
          'The file may have been moved, renamed, or deleted since the workspace was analyzed. Refresh the workspace overview to rebuild the index.',
        );
        return;
      }

      const content = fs.readFileSync(fullPath, 'utf-8');
      const allLines = content.split('\n');
      const startLine = Math.max(1, line - context);
      const endLine = Math.min(allLines.length, line + context);

      const snippet: SourceSnippet = {
        file,
        startLine,
        endLine,
        lines: allLines.slice(startLine - 1, endLine).map((sourceLine, index) => ({
          number: startLine + index,
          content: sourceLine,
          highlighted: startLine + index === line,
        })),
      };

      res.json({ source: snippet });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        'source_read_failed',
        'Could not read the requested source file.',
        'Confirm the server has permission to read the file and that it is not locked by another process.',
        err,
      );
    }
  });

  if (config.uiDistPath && fs.existsSync(config.uiDistPath)) {
    app.use(express.static(config.uiDistPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.uiDistPath!, 'index.html'));
    });
  }

  return app;
}

export function startServer(config: ServerConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    const app = createServer(config);
    const server = app.listen(config.port, '127.0.0.1');

    const handleError = (err: NodeJS.ErrnoException) => {
      const message = err.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Stop the process using it or rerun with --port <open-port>.`
        : `Failed to start server on port ${config.port}: ${err.message}`;

      reject(new ServerStartupError(message, config.port, err.code, { cause: err }));
    };

    server.once('error', handleError);
    server.once('listening', () => {
      server.off('error', handleError);
      console.log(`\n  Runtime Storyboard Debugger`);
      console.log(`  ─────────────────────────────`);
      console.log(`  Target:  ${config.targetDir}`);
      console.log(`  Server:  http://localhost:${config.port}`);
      console.log(`  API:     http://localhost:${config.port}/api/entry-points`);
      if (config.uiDistPath) {
        console.log(`  UI:      http://localhost:${config.port}`);
      }
      console.log(`  ─────────────────────────────\n`);
      resolve();
    });
  });
}
