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
}

// ─── Trace Events (raw runtime capture) ──────────────────────────

export type TraceEventType =
  | 'function-enter'
  | 'function-exit'
  | 'branch'
  | 'await-start'
  | 'await-end'
  | 'side-effect'
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
}

// ─── Storyboard Frames ──────────────────────────────────────────

export type FrameType =
  | 'function-entry'
  | 'branch'
  | 'await-boundary'
  | 'side-effect'
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
  asyncContinuationId?: string;
  duration?: number;
  depth: number;
}

// ─── Storyboard ─────────────────────────────────────────────────

export interface StoryboardMetadata {
  startTime: number;
  endTime: number;
  totalFrames: number;
  scenarioName?: string;
  entryPointId?: string;
}

export interface Storyboard {
  id: string;
  entryPoint: EntryPoint;
  frames: StoryboardFrame[];
  metadata: StoryboardMetadata;
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
}

export interface FlowGraph {
  entryPointId: string;
  nodes: Record<string, FlowNode>;
  rootNodeId: string;
}

// ─── API Types ──────────────────────────────────────────────────

export interface AnalysisResult {
  targetDir: string;
  entryPoints: EntryPoint[];
  flowGraphs: Record<string, FlowGraph>;
}

export interface RunRequest {
  scenarioPath: string;
  targetDir: string;
}

export interface SourceSnippet {
  file: string;
  startLine: number;
  endLine: number;
  lines: { number: number; content: string; highlighted: boolean }[];
}
