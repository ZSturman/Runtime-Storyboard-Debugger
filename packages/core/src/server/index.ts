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

  const [entryPoints, unfinishedWork] = await Promise.all([
    discoverEntryPoints(config.targetDir),
    analyzeUnfinishedWork(config.targetDir),
  ]);

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

  app.get('/api/entry-points', async (_req, res) => {
    try {
      cachedAnalysis = await ensureAnalysis(config, cachedAnalysis);
      res.json({ entryPoints: cachedAnalysis.entryPoints });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get('/api/entry-points/:id/flow', async (req, res) => {
    try {
      cachedAnalysis = await ensureAnalysis(config, cachedAnalysis);
      const entryPoint = cachedAnalysis.entryPoints.find((candidate) => candidate.id === req.params.id);
      if (!entryPoint) {
        res.status(404).json({ error: 'Entry point not found' });
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
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post('/api/entry-points/:id/run', async (req, res) => {
    try {
      cachedAnalysis = await ensureAnalysis(config, cachedAnalysis);
      const entryPoint = cachedAnalysis.entryPoints.find((candidate) => candidate.id === req.params.id);
      if (!entryPoint) {
        res.status(404).json({ error: 'Entry point not found' });
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
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
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
      res.status(404).json({ error: 'Storyboard not found' });
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
        res.status(400).json({ error: 'file query parameter is required' });
        return;
      }

      const fullPath = path.resolve(config.targetDir, file);
      if (!fullPath.startsWith(path.resolve(config.targetDir))) {
        res.status(400).json({ error: 'file must be within target directory' });
        return;
      }
      if (!fs.existsSync(fullPath)) {
        res.status(404).json({ error: `File not found: ${file}` });
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
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
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
