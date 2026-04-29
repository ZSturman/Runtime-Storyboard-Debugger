// ─── Entry Points ────────────────────────────────────────────────

export type EntryPointType =
  | 'http-route'
  | 'exported-function'
  | 'event-handler'
  | 'main-function'
  | 'module-export';

export interface EntryPointParameter {
  name: string;
  type?: string;
  required?: boolean;
  uiControl?: InputControlType;
  description?: string;
}

export type InputControlType = 'text' | 'number' | 'boolean' | 'json';

export interface EntryPointInputField {
  key: string;
  label: string;
  type: InputControlType;
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

export interface RouteRequestShape {
  method: string;
  path: string;
  fields: EntryPointInputField[];
}

export interface EntryPointRunSupport {
  status: 'supported' | 'preview-only';
  reason?: string;
}

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

export interface EntryPoint {
  id: string;
  name: string;
  type: EntryPointType;
  file: string;
  line: number;
  column?: number;
  description: string;
  parameters: EntryPointParameter[];
  httpMethod?: string;
  httpPath?: string;
  invocationKind: 'function' | 'http-route' | 'preview';
  runSupport: EntryPointRunSupport;
  inputFields: EntryPointInputField[];
  routeRequestShape?: RouteRequestShape;
  exampleSets: ExampleSet[];
  unfinishedWork: UnfinishedWorkFinding[];
}

// ─── Trace Events (raw runtime capture) ──────────────────────────

export type TraceEventType =
  | 'function-enter'
  | 'function-exit'
  | 'branch'
  | 'await-start'
  | 'await-end'
  | 'side-effect'
  | 'state-snapshot'
  | 'status'
  | 'stdout'
  | 'stderr'
  | 'error';

export interface TraceEvent {
  id: string;
  type: TraceEventType;
  timestamp: number;
  functionName: string;
  file: string;
  line: number;
  column?: number;
  depth: number;
  asyncContextId: string;
  args?: Record<string, unknown>;
  returnValue?: unknown;
  errorMessage?: string;
  conditionSource?: string;
  conditionResult?: boolean;
  conditionParts?: Record<string, unknown>;
  sideEffectType?: SideEffectType;
  sideEffectDescription?: string;
  sideEffectData?: unknown;
  snapshotLabel?: string;
  snapshotValues?: Record<string, unknown>;
  statusLabel?: string;
  phase?: WorkspacePhase;
  message?: string;
}

// ─── Storyboard Frames ──────────────────────────────────────────

export type FrameType =
  | 'status'
  | 'function-entry'
  | 'branch'
  | 'await-boundary'
  | 'side-effect'
  | 'state-snapshot'
  | 'log'
  | 'return'
  | 'error'
  | 'async-handoff';

export type SideEffectType =
  | 'db-write'
  | 'db-read'
  | 'http-call'
  | 'file-write'
  | 'file-read'
  | 'event-emit'
  | 'log'
  | 'state-mutation'
  | 'notification'
  | 'unknown';

export interface SideEffect {
  type: SideEffectType;
  description: string;
  data?: unknown;
}

export interface BranchInfo {
  conditionSource: string;
  conditionValues: Record<string, unknown>;
  taken: boolean;
  explanation: string;
  alternateDescription?: string;
  options: BranchPathOption[];
}

export interface BranchPathOption {
  id: string;
  label: string;
  description: string;
  taken: boolean;
  flowNodeId?: string;
}

export interface StoryboardFrame {
  id: string;
  sequence: number;
  type: FrameType;
  title: string;
  description: string;
  functionName: string;
  file: string;
  line: number;
  column?: number;
  inputs: Record<string, unknown>;
  state: Record<string, unknown>;
  sideEffects: SideEffect[];
  branch?: BranchInfo;
  returnValue?: unknown;
  errorMessage?: string;
  nextFrameId?: string;
  previousFrameId?: string;
  asyncContinuationId?: string;
  duration?: number;
  depth: number;
  flowNodeId?: string;
  timestampMs?: number;
  variables?: Record<string, unknown>;
  rawEventIds?: string[];
  snapshotLabel?: string;
  statusLabel?: string;
  waitInfo?: {
    description: string;
    status: 'started' | 'completed';
  };
}

// ─── Storyboard ─────────────────────────────────────────────────

export interface RunContext {
  mode: 'entry-point' | 'scenario-preset';
  entryPointId?: string;
  entryPointName?: string;
  scenarioPath?: string;
  inputs?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  rerunOfStoryboardId?: string;
  rerunFromFrameId?: string;
}

export interface RunFallback {
  summary: string;
  blockers: string[];
  flowGraph: FlowGraph | null;
  unfinishedWork: UnfinishedWorkFinding[];
  technicalDetails: string[];
}

export interface StoryboardMetadata {
  startTime: number;
  endTime: number;
  totalFrames: number;
  scenarioName?: string;
  entryPointId?: string;
  durationMs?: number;
  runContext?: RunContext;
  unfinishedWorkCount?: number;
  technicalNotes?: string[];
}

export interface Storyboard {
  id: string;
  entryPoint: EntryPoint;
  frames: StoryboardFrame[];
  metadata: StoryboardMetadata;
  fallback?: RunFallback;
}

// ─── Flow Graph (static analysis) ───────────────────────────────

export type FlowNodeType =
  | 'entry'
  | 'function-call'
  | 'branch'
  | 'loop'
  | 'await'
  | 'return'
  | 'throw'
  | 'side-effect';

export interface FlowNode {
  id: string;
  type: FlowNodeType;
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

// ─── API Types ──────────────────────────────────────────────────

export interface AnalysisResult {
  targetDir: string;
  entryPoints: EntryPoint[];
  flowGraphs: Record<string, FlowGraph>;
  unfinishedWork: UnfinishedWorkFinding[];
}

export interface RunRequest {
  scenarioPath?: string;
  targetDir?: string;
  entryPointId?: string;
  inputs?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  rerunContext?: {
    storyboardId?: string;
    frameId?: string;
  };
}

export interface SourceSnippet {
  file: string;
  startLine: number;
  endLine: number;
  lines: { number: number; content: string; highlighted: boolean }[];
}

export interface WorkspaceSource {
  type: 'local-path' | 'github-url';
  path?: string;
  url?: string;
  ref?: string;
  owner?: string;
  repo?: string;
  focusPath?: string;
}

export interface CreateWorkspaceRequest {
  source: WorkspaceSource;
}

export type WorkspacePhase =
  | 'idle'
  | 'repo-ingestion'
  | 'dependency-discovery'
  | 'static-analysis'
  | 'runtime-instrumentation'
  | 'execution'
  | 'fallback-analysis'
  | 'ready'
  | 'failed';

export interface WorkspacePhaseState {
  phase: WorkspacePhase;
  status: 'pending' | 'active' | 'complete' | 'failed';
  detail: string;
  progress: number;
  updatedAt: number;
}

export type WorkspaceStatus = 'idle' | 'running' | 'ready' | 'failed';

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

export type LlmProvider = 'openai' | 'anthropic' | 'gemini' | 'openrouter';

export interface LlmProviderConfig {
  enabled: boolean;
  provider?: LlmProvider;
  apiKey?: string;
  model?: string;
  configuredAt?: number;
}

export interface LlmModelOption {
  id: string;
  label: string;
  provider: LlmProvider;
  source: 'provider' | 'curated';
}

export interface WorkspaceSession {
  id: string;
  sourceType: WorkspaceSource['type'];
  source: WorkspaceSource;
  sourceLabel: string;
  cachePath?: string;
  cacheState: 'fresh-clone' | 'cached' | 'refreshing' | 'local';
  status: WorkspaceStatus;
  phase: WorkspacePhase;
  phaseDetail: string;
  progress: number;
  phaseHistory: WorkspacePhaseState[];
  detectedScripts: DetectedScript[];
  routes: EntryPoint[];
  startupFiles: StartupFile[];
  exportedFunctions: ExportedSymbol[];
  likelyJourneys: LikelyUserJourney[];
  flowGraphs: Record<string, FlowGraph>;
  entryPoints: EntryPoint[];
  unfinishedWork: UnfinishedWorkFinding[];
  runtimeBlockers: RuntimeBlocker[];
  llmConfig?: LlmProviderConfig;
  createdAt: number;
  updatedAt: number;
  errors: string[];
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
