const API_BASE = '/api';

export interface EntryPoint {
  id: string;
  name: string;
  type: string;
  file: string;
  line: number;
  description: string;
  httpMethod?: string;
  httpPath?: string;
}

export interface Scenario {
  name: string;
  path: string;
  description: string;
}

export interface SideEffect {
  type: string;
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
  nextFrameId?: string;
  asyncContinuationId?: string;
  depth: number;
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
  };
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

export async function fetchEntryPoints(): Promise<EntryPoint[]> {
  const res = await fetch(`${API_BASE}/entry-points`);
  const data = await res.json();
  return data.entryPoints;
}

export async function fetchScenarios(): Promise<Scenario[]> {
  const res = await fetch(`${API_BASE}/scenarios`);
  const data = await res.json();
  return data.scenarios;
}

export async function runScenario(scenarioPath: string): Promise<Storyboard> {
  const res = await fetch(`${API_BASE}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ scenarioPath }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.storyboard;
}

export async function fetchSource(file: string, line: number, context: number = 8): Promise<SourceSnippet> {
  const params = new URLSearchParams({ file, line: String(line), context: String(context) });
  const res = await fetch(`${API_BASE}/source?${params}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.source;
}

export async function fetchStoryboard(id: string): Promise<Storyboard> {
  const res = await fetch(`${API_BASE}/storyboards/${encodeURIComponent(id)}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.storyboard;
}
