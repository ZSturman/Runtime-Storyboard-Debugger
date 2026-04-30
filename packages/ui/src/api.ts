const API_BASE = '/api';

export interface UnfinishedWorkFinding {
  id: string;
  kind: 'todo' | 'fixme' | 'hack' | 'tbd' | 'placeholder' | 'stub' | 'not-implemented' | 'analysis-gap';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  detail: string;
  file: string;
  line: number;
  symbolName?: string;
}

export interface EntryPointParameter {
  name: string;
  type?: string;
  required?: boolean;
  uiControl?: 'text' | 'number' | 'boolean' | 'json';
  description?: string;
}

export interface EntryPointInputField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'json';
  location: 'argument' | 'body' | 'query' | 'params' | 'headers' | 'flags';
  required: boolean;
  helpText?: string;
  defaultValue?: unknown;
  exampleValue?: unknown;
  friendlyLabel?: string;
  hidden?: boolean;
}

export interface ExampleSet {
  id: string;
  label: string;
  description: string;
  values: Record<string, unknown>;
}

export interface Scenario {
  name: string;
  path: string;
  description: string;
}

export interface RouteRequestShape {
  method: string;
  path: string;
  fields: EntryPointInputField[];
}

export interface EntryPoint {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  description: string;
  httpMethod?: string;
  httpPath?: string;
  parameters: EntryPointParameter[];
  invocationKind: 'function' | 'http-route' | 'preview';
  runSupport: {
    status: 'supported' | 'preview-only';
    reason?: string;
  };
  inputFields: EntryPointInputField[];
  routeRequestShape?: RouteRequestShape;
  exampleSets: ExampleSet[];
  unfinishedWork: UnfinishedWorkFinding[];
  confidence?: 'low' | 'medium' | 'high';
  detectionReason?: string;
  tags?: string[];
}

export interface SideEffect {
  type: string;
  description: string;
  data?: unknown;
}

export interface BranchPathOption {
  id: string;
  label: string;
  description: string;
  taken: boolean;
  flowNodeId?: string;
}

export interface BranchInfo {
  conditionSource: string;
  conditionValues: Record<string, unknown>;
  taken: boolean;
  explanation: string;
  alternateDescription?: string;
  options: BranchPathOption[];
}

export interface StoryboardFrame {
  id: string;
  sequence: number;
  type: string;
  title: string;
  description: string;
  functionName: string;
  file: string;
  line: number;
  inputs: Record<string, unknown>;
  state: Record<string, unknown>;
  sideEffects: SideEffect[];
  branch?: BranchInfo;
  returnValue?: unknown;
  errorMessage?: string;
  timestampMs?: number;
  nextFrameId?: string;
  previousFrameId?: string;
  asyncContinuationId?: string;
  depth: number;
  flowNodeId?: string;
  variables?: Record<string, unknown>;
  snapshotLabel?: string;
  statusLabel?: string;
  waitInfo?: {
    description: string;
    status: 'started' | 'completed';
  };
}

export interface FlowNode {
  id: string;
  type: string;
  label: string;
  file: string;
  line: number;
  children: string[];
  condition?: string;
  branchTrue?: string;
  branchFalse?: string;
  findings?: UnfinishedWorkFinding[];
}

export interface FlowGraph {
  entryPointId: string;
  nodes: Record<string, FlowNode>;
  rootNodeId: string;
  findings: UnfinishedWorkFinding[];
}

export interface RunFallback {
  summary: string;
  blockers: string[];
  flowGraph: FlowGraph | null;
  unfinishedWork: UnfinishedWorkFinding[];
  technicalDetails: string[];
}

export interface Storyboard {
  id: string;
  entryPoint: EntryPoint;
  frames: StoryboardFrame[];
  metadata: {
    startTime: number;
    endTime: number;
    totalFrames: number;
    scenarioName?: string;
    entryPointId?: string;
    durationMs?: number;
    runContext?: {
      mode: 'entry-point' | 'scenario-preset';
      entryPointId?: string;
      entryPointName?: string;
      scenarioPath?: string;
      inputs?: Record<string, unknown>;
      flags?: Record<string, unknown>;
      rerunOfStoryboardId?: string;
      rerunFromFrameId?: string;
    };
    unfinishedWorkCount?: number;
    technicalNotes?: string[];
  };
  fallback?: RunFallback;
}

export interface SourceLine {
  number: number;
  content: string;
  highlighted: boolean;
}

export interface SourceSnippet {
  file: string;
  startLine: number;
  endLine: number;
  lines: SourceLine[];
}

export interface DetectedScript {
  name: string;
  command: string;
  kind: 'dev' | 'build' | 'start' | 'test' | 'other';
}

export interface StartupFile {
  file: string;
  symbol?: string;
  line: number;
  reason: string;
}

export interface ExportedSymbol {
  name: string;
  file: string;
  line: number;
  kind: 'function' | 'const' | 'default';
}

export interface LikelyUserJourney {
  id: string;
  title: string;
  summary: string;
  confidence: 'low' | 'medium' | 'high';
  entryPointIds: string[];
  rationale: string[];
}

export interface RuntimeBlocker {
  id: string;
  title: string;
  detail: string;
  severity: 'info' | 'warning' | 'critical';
}

export type WorkspaceSourceType = 'local-path' | 'github-url';
export type WorkspacePhase = 'idle' | 'repo-ingestion' | 'dependency-discovery' | 'static-analysis' | 'runtime-instrumentation' | 'execution' | 'fallback-analysis' | 'ready' | 'failed';
export type WorkspaceStatus = 'idle' | 'running' | 'ready' | 'failed';
export type ExecutionStatus = 'queued' | 'preparing-runtime' | 'executing' | 'awaiting-async' | 'completed' | 'failed' | 'fallback-ready' | 'cancelled' | 'stalled';
export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter';

export interface WorkspaceSource {
  type: WorkspaceSourceType;
  path?: string;
  url?: string;
  ref?: string;
  owner?: string;
  repo?: string;
  focusPath?: string;
}

export interface WorkspaceSession {
  id: string;
  sourceType: WorkspaceSourceType;
  source: WorkspaceSource;
  sourceLabel: string;
  cachePath?: string;
  cacheState: 'fresh-clone' | 'cached' | 'refreshing' | 'local';
  status: WorkspaceStatus;
  phase: WorkspacePhase;
  phaseDetail: string;
  progress: number;
  phaseHistory: Array<{
    phase: WorkspacePhase;
    status: 'pending' | 'active' | 'complete' | 'failed';
    detail: string;
    progress: number;
    updatedAt: number;
  }>;
  detectedScripts: DetectedScript[];
  routes: EntryPoint[];
  startupFiles: StartupFile[];
  exportedFunctions: ExportedSymbol[];
  likelyJourneys: LikelyUserJourney[];
  flowGraphs: Record<string, FlowGraph>;
  entryPoints: EntryPoint[];
  unfinishedWork: UnfinishedWorkFinding[];
  runtimeBlockers: RuntimeBlocker[];
  llmConfig?: {
    enabled: boolean;
    provider?: LlmProvider;
    apiKey?: string;
    model?: string;
    configuredAt?: number;
  };
  createdAt: number;
  updatedAt: number;
  errors: string[];
}

export interface ExecutionSession {
  id: string;
  workspaceId: string;
  entryPointId: string;
  status: ExecutionStatus;
  startedAt: number;
  lastEventAt: number;
  events: TraceEvent[];
  frames: StoryboardFrame[];
  fallback?: RunFallback | null;
  storyboardId?: string;
  storyboard?: Storyboard;
  currentStepId?: string;
  error?: string;
}

export interface TraceEvent {
  id: string;
  type: string;
  timestamp: number;
  functionName: string;
  file: string;
  line: number;
  depth: number;
  asyncContextId: string;
  args?: Record<string, unknown>;
  returnValue?: unknown;
  errorMessage?: string;
  conditionSource?: string;
  conditionResult?: boolean;
  conditionParts?: Record<string, unknown>;
  sideEffectType?: string;
  sideEffectDescription?: string;
  sideEffectData?: unknown;
  snapshotLabel?: string;
  snapshotValues?: Record<string, unknown>;
  statusLabel?: string;
  phase?: WorkspacePhase;
  message?: string;
}

export interface WorkspaceStreamEvent {
  id: string;
  type: 'workspace-updated' | 'phase' | 'log' | 'ready' | 'error';
  workspaceId: string;
  timestamp: number;
  workspace?: WorkspaceSession;
  phase?: WorkspacePhase;
  detail?: string;
  progress?: number;
  message?: string;
}

export interface ExecutionStreamEvent {
  id: string;
  type: 'status' | 'trace-event' | 'frames' | 'storyboard' | 'fallback' | 'error';
  workspaceId: string;
  executionId: string;
  timestamp: number;
  status?: ExecutionStatus;
  traceEvent?: TraceEvent;
  frames?: StoryboardFrame[];
  storyboard?: Storyboard;
  fallback?: RunFallback | null;
  error?: string;
}

export interface LlmModelOption {
  id: string;
  label: string;
  provider: LlmProvider;
  source: 'provider' | 'curated';
}

export interface ApiErrorPayload {
  code: string;
  message: string;
  cause?: string;
  suggestedAction: string;
}

export class ApiError extends Error {
  code: string;
  cause?: string;
  suggestedAction: string;
  status: number;

  constructor(status: number, payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.cause = payload.cause;
    this.suggestedAction = payload.suggestedAction;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (data && typeof data === 'object' && data.error && typeof data.error === 'object' && 'code' in data.error) {
      throw new ApiError(response.status, data.error as ApiErrorPayload);
    }
    const message =
      (typeof data?.error === 'string' && data.error) ||
      (typeof data?.message === 'string' && data.message) ||
      `Request failed: ${response.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchWorkspaces(): Promise<WorkspaceSession[]> {
  const data = await requestJson<{ workspaces: WorkspaceSession[] }>(`${API_BASE}/workspaces`);
  return data.workspaces;
}

export async function createWorkspace(source: WorkspaceSource): Promise<WorkspaceSession> {
  const data = await requestJson<{ workspace: WorkspaceSession }>(`${API_BASE}/workspaces`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source }),
  });
  return data.workspace;
}

export async function fetchWorkspace(workspaceId: string): Promise<WorkspaceSession> {
  const data = await requestJson<{ workspace: WorkspaceSession }>(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}`);
  return data.workspace;
}

export function subscribeToWorkspace(workspaceId: string, handlers: {
  onEvent: (event: WorkspaceStreamEvent) => void;
  onError?: (error: Event) => void;
}): () => void {
  const source = new EventSource(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/stream`);
  const forward = (event: Event) => {
    const message = event as MessageEvent<string>;
    handlers.onEvent(JSON.parse(message.data) as WorkspaceStreamEvent);
  };

  ['workspace', 'workspace-updated', 'phase', 'ready', 'error'].forEach((eventName) => {
    source.addEventListener(eventName, forward);
  });
  if (handlers.onError) {
    source.addEventListener('error', handlers.onError);
  }

  return () => source.close();
}

export async function startExecutionSession(
  workspaceId: string,
  entryPointId: string,
  inputs: Record<string, unknown>,
  flags: Record<string, unknown>,
  rerunContext?: { storyboardId?: string; frameId?: string },
): Promise<ExecutionSession> {
  const data = await requestJson<{ execution: ExecutionSession }>(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/executions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryPointId, inputs, flags, rerunContext }),
  });
  return data.execution;
}

export async function fetchExecutionSession(workspaceId: string, executionId: string): Promise<ExecutionSession> {
  const data = await requestJson<{ execution: ExecutionSession }>(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/executions/${encodeURIComponent(executionId)}`);
  return data.execution;
}

export function subscribeToExecution(
  workspaceId: string,
  executionId: string,
  handlers: {
    onEvent: (event: ExecutionStreamEvent) => void;
    onError?: (error: Event) => void;
  },
): () => void {
  const source = new EventSource(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/executions/${encodeURIComponent(executionId)}/stream`);
  const forward = (event: Event) => {
    const message = event as MessageEvent<string>;
    handlers.onEvent(JSON.parse(message.data) as ExecutionStreamEvent);
  };

  ['execution', 'status', 'trace-event', 'frames', 'storyboard', 'fallback', 'error'].forEach((eventName) => {
    source.addEventListener(eventName, forward);
  });
  if (handlers.onError) {
    source.addEventListener('error', handlers.onError);
  }

  return () => source.close();
}

export async function fetchWorkspaceSource(workspaceId: string, file: string, line: number, context: number = 8): Promise<SourceSnippet> {
  const params = new URLSearchParams({ file, line: String(line), context: String(context) });
  const data = await requestJson<{ source: SourceSnippet }>(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/source?${params}`);
  return data.source;
}

export async function updateWorkspaceLlmConfig(
  workspaceId: string,
  config: { enabled: boolean; provider?: LlmProvider; apiKey?: string; model?: string },
): Promise<WorkspaceSession> {
  const data = await requestJson<{ workspace: WorkspaceSession }>(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/llm/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  return data.workspace;
}

export async function fetchProviderModels(workspaceId: string, provider: LlmProvider, apiKey?: string): Promise<LlmModelOption[]> {
  const params = new URLSearchParams({ provider });
  if (apiKey) params.set('apiKey', apiKey);
  const data = await requestJson<{ models: LlmModelOption[] }>(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/llm/models?${params.toString()}`);
  return data.models;
}

export async function requestLlmAssist(workspaceId: string, prompt: string): Promise<{ text: string; provider: LlmProvider; model: string }> {
  const data = await requestJson<{ result: { text: string; provider: LlmProvider; model: string } }>(`${API_BASE}/workspaces/${encodeURIComponent(workspaceId)}/llm/assist`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  return data.result;
}
