import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import { glob } from 'glob';
import { ANALYZER_IGNORE_GLOBS, analyzeUnfinishedWork, buildFlowGraph, discoverEntryPoints } from '../analyzer';
import type {
  CreateWorkspaceRequest,
  DetectedScript,
  EntryPoint,
  ExportedSymbol,
  FlowGraph,
  LikelyUserJourney,
  LlmProviderConfig,
  RuntimeBlocker,
  StartupFile,
  UnfinishedWorkFinding,
  WorkspacePhase,
  WorkspacePhaseState,
  WorkspaceSession,
  WorkspaceSource,
  WorkspaceStatus,
  WorkspaceStreamEvent,
} from '../storyboard/types';

const execFileAsync = promisify(execFile);

const STARTUP_FILE_CANDIDATES = [
  'index.ts',
  'index.js',
  'main.ts',
  'main.js',
  'server.ts',
  'server.js',
  'app.ts',
  'app.js',
  'src/index.ts',
  'src/index.js',
  'src/main.ts',
  'src/main.js',
  'src/server.ts',
  'src/server.js',
  'src/app.ts',
  'src/app.js',
];

function nextWorkspaceId(): string {
  return `ws_${randomUUID().slice(0, 8)}`;
}

function buildWorkspaceEvent(
  workspaceId: string,
  type: WorkspaceStreamEvent['type'],
  data: Partial<WorkspaceStreamEvent> = {},
): WorkspaceStreamEvent {
  return {
    id: `wse_${randomUUID().slice(0, 8)}`,
    type,
    workspaceId,
    timestamp: Date.now(),
    ...data,
  };
}

function cacheRoot(): string {
  return path.join(os.homedir(), '.runtime-storyboard-debugger', 'cache');
}

function sanitizeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

function cloneUrlForSource(source: WorkspaceSource): string {
  if (!source.owner || !source.repo) {
    throw new Error(
      '[github_source_incomplete] GitHub source is missing owner/repo details. ' +
        'Suggested action: paste the full repository URL, for example https://github.com/owner/repo.',
    );
  }
  return `https://github.com/${source.owner}/${source.repo}.git`;
}

function gitHubCachePath(source: WorkspaceSource): string {
  const ref = source.ref || 'default';
  return path.join(cacheRoot(), sanitizeSegment(source.owner || 'unknown'), sanitizeSegment(source.repo || 'unknown'), sanitizeSegment(ref));
}

function inferScriptKind(name: string): DetectedScript['kind'] {
  if (name.includes('dev')) return 'dev';
  if (name.includes('build')) return 'build';
  if (name.includes('start')) return 'start';
  if (name.includes('test')) return 'test';
  return 'other';
}

async function runGit(args: string[], cwd?: string): Promise<void> {
  await execFileAsync('git', args, cwd ? { cwd } : undefined);
}

export function parseGitHubUrl(rawUrl: string): WorkspaceSource {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(
      '[github_url_invalid] Could not parse the value as a URL. ' +
        'Suggested action: paste a full URL such as https://github.com/owner/repo.',
    );
  }

  if (parsed.hostname !== 'github.com') {
    throw new Error(
      '[github_host_unsupported] Only github.com URLs are supported in this release. ' +
        'Suggested action: clone the repository locally and rerun rsd with --target <local-path>.',
    );
  }

  const parts = parsed.pathname.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error(
      '[github_url_incomplete] GitHub URL must include an owner and repository name. ' +
        'Suggested action: use the form https://github.com/<owner>/<repo>.',
    );
  }

  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/, '');
  let ref: string | undefined;
  let focusPath: string | undefined;

  if (!owner || !repo) {
    throw new Error('GitHub URL must include an owner and repository name.');
  }

  if (parts.length > 2) {
    const mode = parts[2];
    if (mode !== 'tree' && mode !== 'blob') {
      throw new Error('GitHub URL must point to a repository root, tree, or blob path.');
    }

    if (!parts[3]) {
      throw new Error(`GitHub ${mode} URL must include a ref.`);
    }

    ref = decodeURIComponent(parts[3]);
    const remaining = parts.slice(4).map((segment) => decodeURIComponent(segment)).filter(Boolean);
    if (remaining.length > 0) {
      focusPath = remaining.join('/');
    }
  }

  return {
    type: 'github-url',
    url: rawUrl,
    owner,
    repo,
    ref,
    focusPath,
  };
}

export function buildGitHubCheckoutPlan(
  source: WorkspaceSource,
  options: { exists?: boolean; targetDir?: string } = {},
): {
  targetDir: string;
  cacheState: WorkspaceSession['cacheState'];
  commands: string[][];
} {
  if (!source.owner || !source.repo) {
    throw new Error('GitHub workspace is missing owner or repo metadata.');
  }

  const exists = options.exists || false;
  const targetDir = options.targetDir || gitHubCachePath(source);
  const commands: string[][] = [];

  if (!exists) {
    const cloneArgs = ['clone', '--depth', '1', '--filter=blob:none', '--single-branch'];
    if (source.ref) {
      cloneArgs.push('--branch', source.ref);
    }
    cloneArgs.push(cloneUrlForSource(source), targetDir);
    commands.push(cloneArgs);

    return {
      targetDir,
      cacheState: 'fresh-clone',
      commands,
    };
  }

  if (source.ref) {
    commands.push(['fetch', '--depth', '1', 'origin', source.ref]);
    commands.push(['checkout', '--force', 'FETCH_HEAD']);
    return {
      targetDir,
      cacheState: 'refreshing',
      commands,
    };
  }

  return {
    targetDir,
    cacheState: 'cached',
    commands,
  };
}

async function ensureGitHubCheckout(
  source: WorkspaceSource,
  onPhase: (phase: WorkspacePhase, detail: string, progress: number) => void,
): Promise<{ cachePath: string; cacheState: WorkspaceSession['cacheState'] }> {
  if (!source.owner || !source.repo) {
    throw new Error('GitHub workspace is missing owner or repo metadata.');
  }

  const targetDir = gitHubCachePath(source);
  const exists = fs.existsSync(path.join(targetDir, '.git'));

  await fs.promises.mkdir(path.dirname(targetDir), { recursive: true });
  const plan = buildGitHubCheckoutPlan(source, { exists, targetDir });

  if (!exists) {
    onPhase('repo-ingestion', `Cloning ${source.owner}/${source.repo}${source.ref ? `@${source.ref}` : ''}`, 12);
  } else if (plan.cacheState === 'refreshing') {
    onPhase('repo-ingestion', `Refreshing ${source.owner}/${source.repo}@${source.ref}`, 18);
  } else {
    onPhase('repo-ingestion', `Reusing cached checkout for ${source.owner}/${source.repo}`, 12);
  }

  for (const args of plan.commands) {
    await runGit(args, args[0] === 'clone' ? undefined : targetDir);
  }

  return { cachePath: targetDir, cacheState: plan.cacheState };
}

async function detectScripts(targetDir: string): Promise<DetectedScript[]> {
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8')) as { scripts?: Record<string, string> };
    return Object.entries(parsed.scripts || {}).map(([name, command]) => ({
      name,
      command,
      kind: inferScriptKind(name),
    }));
  } catch {
    return [];
  }
}

async function detectStartupFiles(targetDir: string, entryPoints: EntryPoint[]): Promise<StartupFile[]> {
  const fromEntryPoints = entryPoints
    .filter((entryPoint) => entryPoint.type === 'main-function')
    .map((entryPoint) => ({
      file: entryPoint.file,
      symbol: entryPoint.name,
      line: entryPoint.line,
      reason: entryPoint.description,
    }));

  const directMatches: StartupFile[] = [];
  for (const candidate of STARTUP_FILE_CANDIDATES) {
    const fullPath = path.join(targetDir, candidate);
    if (!fs.existsSync(fullPath)) continue;

    directMatches.push({
      file: path.relative(targetDir, fullPath),
      line: 1,
      reason: 'Common startup file naming convention',
    });
  }

  return dedupeByFile([...fromEntryPoints, ...directMatches]);
}

function detectExportedFunctions(entryPoints: EntryPoint[]): ExportedSymbol[] {
  return entryPoints
    .filter((entryPoint) => entryPoint.type === 'exported-function')
    .map((entryPoint) => ({
      name: entryPoint.name,
      file: entryPoint.file,
      line: entryPoint.line,
      kind: entryPoint.name === 'default' ? 'default' : 'function',
    }));
}

function dedupeByFile(items: StartupFile[]): StartupFile[] {
  const seen = new Set<string>();
  const result: StartupFile[] = [];
  for (const item of items) {
    const key = `${item.file}:${item.symbol || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function routeResourceName(route: EntryPoint): string {
  const cleaned = (route.httpPath || route.name).replace(/^\//, '');
  const firstSegment = cleaned.split('/').find(Boolean);
  return firstSegment || route.name;
}

function buildLikelyJourneys(entryPoints: EntryPoint[], startupFiles: StartupFile[], scripts: DetectedScript[]): LikelyUserJourney[] {
  const journeys: LikelyUserJourney[] = [];

  const routeGroups = new Map<string, EntryPoint[]>();
  for (const route of entryPoints.filter((entryPoint) => entryPoint.type === 'http-route')) {
    const key = routeResourceName(route);
    const group = routeGroups.get(key) || [];
    group.push(route);
    routeGroups.set(key, group);
  }

  for (const [resource, routes] of routeGroups.entries()) {
    journeys.push({
      id: `journey_${sanitizeSegment(resource)}`,
      title: `Explore ${resource}`,
      summary: `Follow the ${resource} request flow through ${routes.length} detected route${routes.length === 1 ? '' : 's'}.`,
      confidence: routes.length > 1 ? 'high' : 'medium',
      entryPointIds: routes.map((route) => route.id),
      rationale: routes.map((route) => `${route.httpMethod || 'CALL'} ${route.httpPath || route.name}`),
    });
  }

  if (startupFiles.length > 0) {
    journeys.push({
      id: 'journey_startup',
      title: 'Understand app startup',
      summary: 'Start with the detected startup files and bootstrapping entry points.',
      confidence: 'medium',
      entryPointIds: entryPoints.filter((entryPoint) => entryPoint.type === 'main-function').map((entryPoint) => entryPoint.id),
      rationale: startupFiles.map((file) => `${file.file}${file.symbol ? ` → ${file.symbol}` : ''}`),
    });
  }

  const startScripts = scripts.filter((script) => script.kind === 'start' || script.kind === 'dev');
  if (startScripts.length > 0) {
    journeys.push({
      id: 'journey_runtime',
      title: 'Start the app runtime',
      summary: 'Use the detected start scripts as the likely runtime entry path.',
      confidence: 'medium',
      entryPointIds: [],
      rationale: startScripts.map((script) => `${script.name}: ${script.command}`),
    });
  }

  const exportedFunctions = entryPoints.filter((entryPoint) => entryPoint.type === 'exported-function').slice(0, 5);
  for (const entryPoint of exportedFunctions) {
    journeys.push({
      id: `journey_fn_${entryPoint.id}`,
      title: `Inspect ${entryPoint.name}`,
      summary: `Step through the exported function ${entryPoint.name} directly.`,
      confidence: 'low',
      entryPointIds: [entryPoint.id],
      rationale: [entryPoint.description],
    });
  }

  return journeys;
}

function buildRuntimeBlockers(
  source: WorkspaceSource,
  entryPoints: EntryPoint[],
  scripts: DetectedScript[],
): RuntimeBlocker[] {
  const blockers: RuntimeBlocker[] = [];

  if (source.type === 'github-url') {
    blockers.push({
      id: 'remote-explicit-opt-in',
      title: 'Remote runtime execution is opt-in',
      detail: 'GitHub repos are analyzed automatically, but dependency install and runtime execution should only begin when the user explicitly starts a run.',
      severity: 'info',
    });
  }

  if (entryPoints.length === 0) {
    blockers.push({
      id: 'no-entry-points',
      title: 'No entry points detected',
      detail: 'Static analysis could not find routes, exported functions, or startup files to anchor a walkthrough.',
      severity: 'critical',
    });
  }

  if (!entryPoints.some((entryPoint) => entryPoint.runSupport.status === 'supported')) {
    blockers.push({
      id: 'no-runnable-entry-points',
      title: 'No directly runnable entry points',
      detail: 'The workspace can still be explored statically, but no supported direct runtime entry points were detected.',
      severity: 'warning',
    });
  }

  if (scripts.length === 0) {
    blockers.push({
      id: 'no-package-scripts',
      title: 'No package scripts detected',
      detail: 'Runtime startup commands may need to be inferred manually because package.json scripts were not found.',
      severity: 'info',
    });
  }

  return blockers;
}

function buildEntryPointFlowGraph(entryPoint: EntryPoint, findings: UnfinishedWorkFinding[], targetDir: string): FlowGraph | null {
  const functionName = entryPoint.name.includes(' ')
    ? entryPoint.name.split(' ').pop() || entryPoint.name
    : entryPoint.name;

  const flowGraph = buildFlowGraph(entryPoint.file, functionName, targetDir);
  if (!flowGraph) {
    return null;
  }

  const nodes = Object.fromEntries(
    Object.entries(flowGraph.nodes).map(([nodeId, node]) => {
      const nodeFindings = findings.filter((finding) => finding.file === node.file && finding.line === node.line);
      return [nodeId, { ...node, findings: nodeFindings }];
    }),
  );

  return {
    ...flowGraph,
    entryPointId: entryPoint.id,
    nodes,
    findings: findings.filter((finding) => Object.values(flowGraph.nodes).some((node) => node.file === finding.file)),
  };
}

export function buildWorkspaceSourceLabel(source: WorkspaceSource): string {
  if (source.type === 'local-path') {
    return source.path || 'Local workspace';
  }

  if (source.owner && source.repo) {
    const baseLabel = `${source.owner}/${source.repo}${source.ref ? `@${source.ref}` : ''}`;
    // TODO: Feed focusPath into entry-point prioritization once navigation becomes state-aware.
    return source.focusPath ? `${baseLabel} (focus: ${source.focusPath})` : baseLabel;
  }

  return source.url || 'GitHub workspace';
}

function phaseState(phase: WorkspacePhase, status: WorkspacePhaseState['status'], detail: string, progress: number): WorkspacePhaseState {
  return {
    phase,
    status,
    detail,
    progress,
    updatedAt: Date.now(),
  };
}

export class WorkspaceManager {
  private readonly workspaces = new Map<string, WorkspaceSession>();
  private readonly workspaceSubscribers = new Map<string, Set<(event: WorkspaceStreamEvent) => void>>();
  private readonly analysisJobs = new Map<string, Promise<void>>();
  private defaultWorkspaceId?: string;

  constructor(defaultTargetDir?: string) {
    if (defaultTargetDir) {
      this.defaultWorkspaceId = 'default';
      void this.createWorkspace({
        source: {
          type: 'local-path',
          path: defaultTargetDir,
        },
      }, 'default');
    }
  }

  listWorkspaces(): WorkspaceSession[] {
    return Array.from(this.workspaces.values());
  }

  getDefaultWorkspaceId(): string | undefined {
    return this.defaultWorkspaceId;
  }

  getWorkspace(workspaceId: string): WorkspaceSession | undefined {
    return this.workspaces.get(workspaceId);
  }

  async createWorkspace(request: CreateWorkspaceRequest, forcedId?: string): Promise<WorkspaceSession> {
    const source = request.source.type === 'github-url' && request.source.url
      ? parseGitHubUrl(request.source.url)
      : request.source;

    const workspaceId = forcedId || nextWorkspaceId();
    const now = Date.now();
    const workspace: WorkspaceSession = {
      id: workspaceId,
      sourceType: source.type,
      source,
      sourceLabel: buildWorkspaceSourceLabel(source),
      cachePath: source.type === 'local-path' ? source.path : undefined,
      cacheState: source.type === 'local-path' ? 'local' : 'fresh-clone',
      status: 'running',
      phase: 'repo-ingestion',
      phaseDetail: source.type === 'local-path' ? 'Preparing local workspace' : 'Preparing GitHub workspace',
      progress: 4,
      phaseHistory: [phaseState('repo-ingestion', 'active', source.type === 'local-path' ? 'Preparing local workspace' : 'Preparing GitHub workspace', 4)],
      detectedScripts: [],
      routes: [],
      startupFiles: [],
      exportedFunctions: [],
      likelyJourneys: [],
      flowGraphs: {},
      entryPoints: [],
      unfinishedWork: [],
      runtimeBlockers: [],
      createdAt: now,
      updatedAt: now,
      errors: [],
    };

    this.workspaces.set(workspaceId, workspace);
    this.publish(workspaceId, buildWorkspaceEvent(workspaceId, 'workspace-updated', { workspace }));

    const job = this.populateWorkspace(workspaceId)
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        this.patchWorkspace(workspaceId, (current) => ({
          ...current,
          status: 'failed',
          phase: 'failed',
          phaseDetail: message,
          progress: 100,
          errors: [...current.errors, message],
          phaseHistory: [...current.phaseHistory, phaseState('failed', 'failed', message, 100)],
        }));
        this.publish(workspaceId, buildWorkspaceEvent(workspaceId, 'error', { message }));
      })
      .finally(() => {
        this.analysisJobs.delete(workspaceId);
      });

    this.analysisJobs.set(workspaceId, job);
    return workspace;
  }

  async waitForWorkspace(workspaceId: string): Promise<WorkspaceSession> {
    const job = this.analysisJobs.get(workspaceId);
    if (job) {
      await job;
    }
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found.`);
    }
    return workspace;
  }

  subscribe(workspaceId: string, listener: (event: WorkspaceStreamEvent) => void): () => void {
    const listeners = this.workspaceSubscribers.get(workspaceId) || new Set();
    listeners.add(listener);
    this.workspaceSubscribers.set(workspaceId, listeners);

    return () => {
      const currentListeners = this.workspaceSubscribers.get(workspaceId);
      currentListeners?.delete(listener);
      if (currentListeners && currentListeners.size === 0) {
        this.workspaceSubscribers.delete(workspaceId);
      }
    };
  }

  async updateLlmConfig(workspaceId: string, config: LlmProviderConfig): Promise<WorkspaceSession> {
    this.patchWorkspace(workspaceId, (current) => ({
      ...current,
      llmConfig: config,
    }));
    return this.waitForWorkspace(workspaceId);
  }

  private async populateWorkspace(workspaceId: string): Promise<void> {
    const workspace = this.getRequiredWorkspace(workspaceId);
    const updatePhase = (phase: WorkspacePhase, detail: string, progress: number, status: WorkspacePhaseState['status'] = 'active') => {
      this.patchWorkspace(workspaceId, (current) => ({
        ...current,
        phase,
        phaseDetail: detail,
        progress,
        phaseHistory: [...current.phaseHistory, phaseState(phase, status, detail, progress)],
      }));
      this.publish(workspaceId, buildWorkspaceEvent(workspaceId, 'phase', { phase, detail, progress }));
    };

    updatePhase('repo-ingestion', workspace.sourceType === 'local-path' ? 'Validating local path' : 'Resolving GitHub repository', 8);

    const resolved = await this.resolveWorkspacePath(workspace.source, updatePhase);
    const targetDir = resolved.cachePath;

    this.patchWorkspace(workspaceId, (current) => ({
      ...current,
      cachePath: targetDir,
      cacheState: resolved.cacheState,
    }));

    updatePhase('dependency-discovery', 'Scanning package scripts and startup hints', 28);
    const detectedScripts = await detectScripts(targetDir);

    updatePhase('static-analysis', 'Discovering entry points and unfinished work', 44);
    const entryPoints = await discoverEntryPoints(targetDir);
    const unfinishedWork = await analyzeUnfinishedWork(targetDir);

    updatePhase('static-analysis', 'Building flow graphs and likely journeys', 68);
    const flowGraphs = Object.fromEntries(
      entryPoints.map((entryPoint) => [entryPoint.id, buildEntryPointFlowGraph(entryPoint, unfinishedWork, targetDir)]).filter((item): item is [string, FlowGraph] => Boolean(item[1])),
    );

    const startupFiles = await detectStartupFiles(targetDir, entryPoints);
    const exportedFunctions = detectExportedFunctions(entryPoints);
    const likelyJourneys = buildLikelyJourneys(entryPoints, startupFiles, detectedScripts);
    const runtimeBlockers = buildRuntimeBlockers(workspace.source, entryPoints, detectedScripts);

    this.patchWorkspace(workspaceId, (current) => ({
      ...current,
      status: 'ready',
      phase: 'ready',
      phaseDetail: 'Workspace ready to explore',
      progress: 100,
      cachePath: targetDir,
      cacheState: resolved.cacheState,
      detectedScripts,
      routes: entryPoints.filter((entryPoint) => entryPoint.type === 'http-route'),
      startupFiles,
      exportedFunctions,
      likelyJourneys,
      flowGraphs,
      entryPoints,
      unfinishedWork,
      runtimeBlockers,
      phaseHistory: [...current.phaseHistory, phaseState('ready', 'complete', 'Workspace ready to explore', 100)],
    }));

    this.publish(workspaceId, buildWorkspaceEvent(workspaceId, 'ready', { workspace: this.getRequiredWorkspace(workspaceId) }));
  }

  private async resolveWorkspacePath(
    source: WorkspaceSource,
    onPhase: (phase: WorkspacePhase, detail: string, progress: number) => void,
  ): Promise<{ cachePath: string; cacheState: WorkspaceSession['cacheState'] }> {
    if (source.type === 'local-path') {
      const targetPath = path.resolve(source.path || '');
      if (!targetPath || !fs.existsSync(targetPath)) {
        throw new Error(`Local path not found: ${source.path || '<missing>'}`);
      }
      return {
        cachePath: targetPath,
        cacheState: 'local',
      };
    }

    return ensureGitHubCheckout(source, onPhase);
  }

  private getRequiredWorkspace(workspaceId: string): WorkspaceSession {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found.`);
    }
    return workspace;
  }

  private patchWorkspace(workspaceId: string, transform: (workspace: WorkspaceSession) => WorkspaceSession): void {
    const current = this.getRequiredWorkspace(workspaceId);
    const next = {
      ...transform(current),
      updatedAt: Date.now(),
    };
    this.workspaces.set(workspaceId, next);
    this.publish(workspaceId, buildWorkspaceEvent(workspaceId, 'workspace-updated', { workspace: next }));
  }

  private publish(workspaceId: string, event: WorkspaceStreamEvent): void {
    const listeners = this.workspaceSubscribers.get(workspaceId);
    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const listener of listeners) {
      listener(event);
    }
  }
}

export async function collectSourceFiles(targetDir: string): Promise<string[]> {
  return glob('**/*.{ts,js,tsx,jsx}', {
    cwd: targetDir,
    absolute: true,
    ignore: ANALYZER_IGNORE_GLOBS,
  });
}
