import express from 'express';
import cors from 'cors';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { analyzeUnfinishedWork, buildFlowGraph, discoverEntryPoints } from '../analyzer';
import { buildStoryboard } from '../storyboard/frame-builder';
import type {
  EntryPoint,
  FlowGraph,
  LlmProvider,
  LlmProviderConfig,
  RunFallback,
  SourceSnippet,
  Storyboard,
  StoryboardFrame,
  UnfinishedWorkFinding,
  WorkspaceSession,
  WorkspaceStreamEvent,
} from '../storyboard/types';
import {
  executeFunctionEntryPoint,
  executeHttpRouteEntryPoint,
} from './execution';
import { WorkspaceManager } from './workspaces';
import { assistWithLlm, listModelsForProvider } from './llm';
import {
  findReadme,
  listTree,
  readFileContents,
  searchWorkspace,
  WorkspaceFileError,
} from './files';

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

type ExecutionStatus =
  | 'queued'
  | 'preparing-runtime'
  | 'executing'
  | 'awaiting-async'
  | 'completed'
  | 'failed'
  | 'fallback-ready'
  | 'cancelled'
  | 'stalled';

interface ExecutionSession {
  id: string;
  workspaceId: string;
  entryPointId: string;
  status: ExecutionStatus;
  startedAt: number;
  lastEventAt: number;
  frames: StoryboardFrame[];
  fallback?: RunFallback | null;
  storyboardId?: string;
  storyboard?: Storyboard;
  error?: string;
}

interface ExecutionStreamEvent {
  id: string;
  type: 'status' | 'frames' | 'storyboard' | 'fallback' | 'error';
  workspaceId: string;
  executionId: string;
  timestamp: number;
  status?: ExecutionStatus;
  frames?: StoryboardFrame[];
  storyboard?: Storyboard;
  fallback?: RunFallback | null;
  error?: string;
}

export function createServer(config: ServerConfig) {
  const app = express();
  app.use(cors());
  app.use(express.json());

  let cachedAnalysis: CachedAnalysis | null = null;
  const storyboards = new Map<string, Storyboard>();
  const manager = new WorkspaceManager(config.targetDir);
  const executionSessions = new Map<string, ExecutionSession>();
  const executionSubscribers = new Map<string, Set<(event: ExecutionStreamEvent) => void>>();

  function publishExecution(executionId: string, event: ExecutionStreamEvent): void {
    const subs = executionSubscribers.get(executionId);
    if (!subs) return;
    for (const sub of subs) sub(event);
  }

  function patchExecution(executionId: string, patch: Partial<ExecutionSession>): ExecutionSession {
    const session = executionSessions.get(executionId)!;
    const next: ExecutionSession = { ...session, ...patch, lastEventAt: Date.now() };
    executionSessions.set(executionId, next);
    return next;
  }

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

  // ── Workspace CRUD routes ──────────────────────────────────────────

  app.get('/api/workspaces', (_req, res) => {
    res.json({ workspaces: manager.listWorkspaces() });
  });

  app.post('/api/workspaces', async (req, res) => {
    try {
      const source = req.body?.source as WorkspaceSession['source'] | undefined;
      if (!source?.type) {
        sendError(
          res,
          400,
          'invalid_source',
          'A `source` object with a `type` field is required.',
          'Provide `{ source: { type: "local-path", path: "..." } }` or a GitHub URL source.',
        );
        return;
      }
      const workspace = await manager.createWorkspace({ source });
      res.status(201).json({ workspace });
    } catch (err: unknown) {
      sendError(
        res,
        500,
        'workspace_create_failed',
        'Could not create workspace.',
        'Check that the source path exists and is readable.',
        err,
      );
    }
  });

  app.get('/api/workspaces/:id', (req, res) => {
    const workspace = manager.getWorkspace(req.params.id);
    if (!workspace) {
      sendError(
        res,
        404,
        'workspace_not_found',
        `Workspace "${req.params.id}" not found.`,
        'The workspace may have expired. Create a new one.',
      );
      return;
    }
    res.json({ workspace });
  });

  app.get('/api/workspaces/:id/stream', (req, res) => {
    const workspace = manager.getWorkspace(req.params.id);
    if (!workspace) {
      sendError(
        res,
        404,
        'workspace_not_found',
        `Workspace "${req.params.id}" not found.`,
        'Create the workspace before subscribing to its stream.',
      );
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send current state immediately so client doesn't have to wait
    const current = manager.getWorkspace(req.params.id)!;
    const initEvent: WorkspaceStreamEvent = {
      id: `wse_init_${randomUUID().slice(0, 8)}`,
      type: 'workspace-updated',
      workspaceId: current.id,
      timestamp: Date.now(),
      workspace: current,
    };
    res.write(`event: workspace-updated\ndata: ${JSON.stringify(initEvent)}\n\n`);

    const unsubscribe = manager.subscribe(req.params.id, (event: WorkspaceStreamEvent) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  // ── Execution session routes ───────────────────────────────────────

  app.post('/api/workspaces/:id/executions', async (req, res) => {
    try {
      const workspace = manager.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(
          res,
          404,
          'workspace_not_found',
          `Workspace "${req.params.id}" not found.`,
          'Create the workspace first.',
        );
        return;
      }

      const targetDir = workspace.cachePath;
      if (!targetDir) {
        sendError(
          res,
          409,
          'workspace_not_ready',
          'Workspace is still being prepared.',
          'Wait for the workspace stream to emit a `ready` event before starting an execution.',
        );
        return;
      }

      const { entryPointId, inputs = {}, flags = {}, rerunContext } = req.body as {
        entryPointId: string;
        inputs?: Record<string, unknown>;
        flags?: Record<string, unknown>;
        rerunContext?: { storyboardId?: string; frameId?: string };
      };

      const entryPoint = workspace.entryPoints.find((ep) => ep.id === entryPointId);
      if (!entryPoint) {
        sendError(
          res,
          404,
          'entry_point_not_found',
          `Entry point "${entryPointId}" not found in workspace.`,
          'Refresh the workspace to get an up-to-date list of entry points.',
        );
        return;
      }

      const executionId = `exec_${randomUUID().slice(0, 8)}`;
      const workspaceId = req.params.id;
      const session: ExecutionSession = {
        id: executionId,
        workspaceId,
        entryPointId,
        status: 'queued',
        startedAt: Date.now(),
        lastEventAt: Date.now(),
        frames: [],
        fallback: null,
      };
      executionSessions.set(executionId, session);

      res.status(202).json({ execution: session });

      void (async () => {
        try {
          const flowGraph = workspace.flowGraphs[entryPointId] ?? null;

          patchExecution(executionId, { status: 'preparing-runtime' });
          publishExecution(executionId, {
            id: `ese_${randomUUID().slice(0, 8)}`,
            type: 'status',
            workspaceId,
            executionId,
            timestamp: Date.now(),
            status: 'preparing-runtime',
          });

          if (entryPoint.runSupport.status !== 'supported') {
            const fallback = buildFallback(
              entryPoint,
              flowGraph,
              entryPoint.unfinishedWork,
              'This entry point is available for guided exploration, but direct execution is not supported in the current release.',
              entryPoint.runSupport.reason || 'Execution support is not available for this entry point.',
            );
            patchExecution(executionId, { status: 'fallback-ready', fallback });
            publishExecution(executionId, {
              id: `ese_${randomUUID().slice(0, 8)}`,
              type: 'fallback',
              workspaceId,
              executionId,
              timestamp: Date.now(),
              status: 'fallback-ready',
              fallback,
            });
            return;
          }

          patchExecution(executionId, { status: 'executing' });
          publishExecution(executionId, {
            id: `ese_${randomUUID().slice(0, 8)}`,
            type: 'status',
            workspaceId,
            executionId,
            timestamp: Date.now(),
            status: 'executing',
          });

          const execution = entryPoint.invocationKind === 'http-route'
            ? await executeHttpRouteEntryPoint(targetDir, entryPoint, inputs, flags, rerunContext)
            : await executeFunctionEntryPoint(targetDir, entryPoint, inputs, flags, rerunContext);

          const storyboard = buildStoryboard(execution.events, entryPoint, undefined);
          storyboard.frames = attachFlowMetadata(attachFrameNavigation(storyboard.frames), flowGraph);
          storyboard.metadata.durationMs = execution.durationMs;
          storyboard.metadata.runContext = execution.runContext;
          storyboard.metadata.unfinishedWorkCount = entryPoint.unfinishedWork.length;
          storyboard.metadata.technicalNotes = execution.technicalNotes;
          storyboards.set(storyboard.id, storyboard);

          patchExecution(executionId, {
            status: 'completed',
            storyboard,
            storyboardId: storyboard.id,
            frames: storyboard.frames,
          });
          publishExecution(executionId, {
            id: `ese_${randomUUID().slice(0, 8)}`,
            type: 'storyboard',
            workspaceId,
            executionId,
            timestamp: Date.now(),
            status: 'completed',
            storyboard,
            frames: storyboard.frames,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const ws = manager.getWorkspace(workspaceId);
          const flowGraph = ws?.flowGraphs[entryPointId] ?? null;
          const fallback = buildFallback(
            entryPoint,
            flowGraph,
            entryPoint.unfinishedWork,
            'Runtime execution could not complete, but static analysis is still available.',
            message,
            [message],
          );
          patchExecution(executionId, { status: 'failed', error: message, fallback });
          publishExecution(executionId, {
            id: `ese_${randomUUID().slice(0, 8)}`,
            type: 'error',
            workspaceId,
            executionId,
            timestamp: Date.now(),
            status: 'failed',
            error: message,
            fallback,
          });
        }
      })();
    } catch (err: unknown) {
      sendError(
        res,
        500,
        'execution_start_failed',
        'Could not start execution.',
        'Verify the workspace is ready and the entry point ID is correct.',
        err,
      );
    }
  });

  app.get('/api/workspaces/:id/executions/:executionId', (req, res) => {
    const session = executionSessions.get(req.params.executionId);
    if (!session || session.workspaceId !== req.params.id) {
      sendError(
        res,
        404,
        'execution_not_found',
        `Execution "${req.params.executionId}" not found.`,
        'Execution sessions are kept in memory only. Restart the run to capture a new session.',
      );
      return;
    }
    res.json({ execution: session });
  });

  app.get('/api/workspaces/:id/executions/:executionId/stream', (req, res) => {
    const session = executionSessions.get(req.params.executionId);
    if (!session || session.workspaceId !== req.params.id) {
      sendError(
        res,
        404,
        'execution_not_found',
        `Execution "${req.params.executionId}" not found.`,
        'Create the execution before subscribing to its stream.',
      );
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // If execution already reached a terminal state, send final event and close
    const current = executionSessions.get(req.params.executionId)!;
    if (current.status === 'completed' || current.status === 'failed' || current.status === 'fallback-ready') {
      const type = current.status === 'completed' ? 'storyboard' : current.status === 'fallback-ready' ? 'fallback' : 'error';
      const terminalEvent: ExecutionStreamEvent = {
        id: `ese_init_${randomUUID().slice(0, 8)}`,
        type,
        workspaceId: current.workspaceId,
        executionId: current.id,
        timestamp: Date.now(),
        status: current.status,
        storyboard: current.storyboard,
        fallback: current.fallback,
        error: current.error,
        frames: current.frames,
      };
      res.write(`event: ${type}\ndata: ${JSON.stringify(terminalEvent)}\n\n`);
      res.end();
      return;
    }

    const executionId = req.params.executionId;

    const listener = (event: ExecutionStreamEvent): void => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      if (event.status === 'completed' || event.status === 'failed' || event.status === 'fallback-ready') {
        cleanup();
        res.end();
      }
    };

    const subs = executionSubscribers.get(executionId) || new Set<(event: ExecutionStreamEvent) => void>();
    subs.add(listener);
    executionSubscribers.set(executionId, subs);

    function cleanup(): void {
      const currentSubs = executionSubscribers.get(executionId);
      currentSubs?.delete(listener);
      if (currentSubs?.size === 0) executionSubscribers.delete(executionId);
    }

    req.on('close', cleanup);
  });

  // ── Workspace-scoped source ────────────────────────────────────────

  app.get('/api/workspaces/:id/source', (req, res) => {
    try {
      const workspace = manager.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(res, 404, 'workspace_not_found', `Workspace "${req.params.id}" not found.`, 'Create the workspace first.');
        return;
      }

      const targetDir = workspace.cachePath;
      if (!targetDir) {
        sendError(res, 409, 'workspace_not_ready', 'Workspace is still being prepared.', 'Wait for the workspace to reach a ready state.');
        return;
      }

      const file = req.query.file as string;
      const line = parseInt(req.query.line as string, 10) || 1;
      const context = parseInt(req.query.context as string, 10) || 5;

      if (!file) {
        sendError(res, 400, 'missing_file_param', 'The `file` query parameter is required.', 'Append `?file=<relative-path>` to the request URL.');
        return;
      }

      const fullPath = path.resolve(targetDir, file);
      if (!fullPath.startsWith(path.resolve(targetDir))) {
        sendError(res, 400, 'path_outside_target', 'The requested file resolves outside the workspace directory.', 'Use a path relative to the workspace root; `..` segments that escape the workspace are not allowed.');
        return;
      }

      if (!fs.existsSync(fullPath)) {
        sendError(res, 404, 'source_file_missing', `Source file "${file}" was not found on disk.`, 'The file may have been moved, renamed, or deleted since the workspace was analyzed.');
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
      sendError(res, 500, 'source_read_failed', 'Could not read the requested source file.', 'Confirm the server has permission to read the file.', err);
    }
  });

  // ── Workspace files (file tree, raw contents, search, findings) ───

  function requireReadyWorkspace(req: express.Request, res: express.Response): { cachePath: string; workspace: WorkspaceSession } | null {
    const workspace = manager.getWorkspace(req.params.id);
    if (!workspace) {
      sendError(res, 404, 'workspace_not_found', `Workspace "${req.params.id}" not found.`, 'Create the workspace first.');
      return null;
    }
    if (!workspace.cachePath) {
      sendError(res, 409, 'workspace_not_ready', 'Workspace is still being prepared.', 'Wait for the workspace to reach a ready state.');
      return null;
    }
    return { cachePath: workspace.cachePath, workspace };
  }

  function handleFileError(res: express.Response, err: unknown): void {
    if (err instanceof WorkspaceFileError) {
      sendError(res, err.status, err.code, err.message, err.hint || 'Use a workspace-relative path with no `..` segments.');
      return;
    }
    sendError(res, 500, 'file_io_failed', 'File operation failed.', 'Check server logs for details.', err);
  }

  app.get('/api/workspaces/:id/tree', (req, res) => {
    const ctx = requireReadyWorkspace(req, res);
    if (!ctx) return;
    try {
      const tree = listTree(ctx.cachePath);
      res.json({ tree });
    } catch (err) {
      handleFileError(res, err);
    }
  });

  app.get('/api/workspaces/:id/file', (req, res) => {
    const ctx = requireReadyWorkspace(req, res);
    if (!ctx) return;
    const filePath = (req.query.path as string | undefined)?.trim();
    if (!filePath) {
      sendError(res, 400, 'missing_path_param', 'The `path` query parameter is required.', 'Append `?path=<workspace-relative-path>` to the request URL.');
      return;
    }
    try {
      const file = readFileContents(ctx.cachePath, filePath);
      res.json({ file });
    } catch (err) {
      handleFileError(res, err);
    }
  });

  app.get('/api/workspaces/:id/readme', (req, res) => {
    const ctx = requireReadyWorkspace(req, res);
    if (!ctx) return;
    try {
      const name = findReadme(ctx.cachePath);
      if (!name) {
        res.json({ file: null });
        return;
      }
      const file = readFileContents(ctx.cachePath, name);
      res.json({ file });
    } catch (err) {
      handleFileError(res, err);
    }
  });

  app.get('/api/workspaces/:id/findings', (req, res) => {
    const ctx = requireReadyWorkspace(req, res);
    if (!ctx) return;
    res.json({ findings: ctx.workspace.unfinishedWork || [] });
  });

  app.get('/api/workspaces/:id/search', (req, res) => {
    const ctx = requireReadyWorkspace(req, res);
    if (!ctx) return;
    const q = (req.query.q as string | undefined)?.trim();
    if (!q) {
      res.json({ hits: [] });
      return;
    }
    const caseSensitive = req.query.caseSensitive === '1' || req.query.caseSensitive === 'true';
    try {
      const hits = searchWorkspace(ctx.cachePath, q, { caseSensitive });
      res.json({ hits, query: q, truncated: hits.length >= 500 });
    } catch (err) {
      handleFileError(res, err);
    }
  });

  app.get('/api/workspaces/:id/entry-points-on-file', (req, res) => {
    const ctx = requireReadyWorkspace(req, res);
    if (!ctx) return;
    const filePath = (req.query.path as string | undefined)?.trim();
    if (!filePath) {
      sendError(res, 400, 'missing_path_param', 'The `path` query parameter is required.', 'Append `?path=<workspace-relative-path>` to the request URL.');
      return;
    }
    const matches = (ctx.workspace.entryPoints || []).filter((ep) => ep.file === filePath);
    res.json({ entryPoints: matches });
  });

  // ── Workspace LLM routes ───────────────────────────────────────────

  app.post('/api/workspaces/:id/llm/config', async (req, res) => {
    try {
      const workspace = manager.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(res, 404, 'workspace_not_found', `Workspace "${req.params.id}" not found.`, 'Create the workspace first.');
        return;
      }
      const llmConfig = req.body as LlmProviderConfig;
      const updated = await manager.updateLlmConfig(req.params.id, llmConfig);
      res.json({ workspace: updated });
    } catch (err: unknown) {
      sendError(res, 500, 'llm_config_failed', 'Could not update LLM configuration.', 'Check the request body matches the expected config shape.', err);
    }
  });

  app.get('/api/workspaces/:id/llm/models', async (req, res) => {
    try {
      const workspace = manager.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(res, 404, 'workspace_not_found', `Workspace "${req.params.id}" not found.`, 'Create the workspace first.');
        return;
      }
      const provider = req.query.provider as string | undefined;
      if (!provider) {
        sendError(res, 400, 'missing_provider_param', 'The `provider` query parameter is required.', 'Append `?provider=openai` (or another supported provider) to the request URL.');
        return;
      }
      const apiKey = req.query.apiKey as string | undefined;
      const models = await listModelsForProvider(provider as LlmProvider, apiKey);
      res.json({ models });
    } catch (err: unknown) {
      sendError(res, 500, 'models_fetch_failed', 'Could not fetch model list.', 'Check the provider name and API key are correct.', err);
    }
  });

  app.post('/api/workspaces/:id/llm/assist', async (req, res) => {
    try {
      const workspace = manager.getWorkspace(req.params.id);
      if (!workspace) {
        sendError(res, 404, 'workspace_not_found', `Workspace "${req.params.id}" not found.`, 'Create the workspace first.');
        return;
      }
      const prompt = req.body?.prompt as string | undefined;
      if (!prompt) {
        sendError(res, 400, 'missing_prompt', 'A `prompt` field is required in the request body.', 'Provide `{ "prompt": "your question" }` in the request body.');
        return;
      }
      const result = await assistWithLlm(workspace.llmConfig, workspace, prompt);
      res.json({ result });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      sendError(res, 500, 'llm_assist_failed', message, 'Check that LLM is configured for this workspace via POST /api/workspaces/:id/llm/config.', err);
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
