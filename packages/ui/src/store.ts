import { create } from './tinyStore';
import type {
  EntryPoint,
  ExecutionSession,
  FileContents,
  FileTreeNode,
  StoryboardFrame,
  UnfinishedWorkFinding,
  WorkspaceSession,
} from './api';

export type ActivityId = 'explorer' | 'search' | 'findings' | 'entry-points' | 'storyboards';

export interface OpenTab {
  id: string;
  kind: 'file' | 'readme' | 'storyboard' | 'flow-graph';
  // For 'file'/'readme': workspace-relative path. For 'storyboard': storyboard id. For 'flow-graph': entryPointId.
  ref: string;
  label: string;
  // file-only fields
  language?: string;
  contents?: string;
  loading?: boolean;
  error?: string;
  // ephemeral cursor request
  reveal?: { line: number; column?: number };
  // arbitrary tab payload (e.g., loaded storyboard, flow-graph cache)
  data?: unknown;
}

export interface RunFormState {
  entryPointId: string;
  inputs: Record<string, string | boolean>;
  flagsText: string;
}

export interface AppState {
  // Workspace lifecycle
  workspace: WorkspaceSession | null;
  workspaceError: string | null;
  bootstrapping: boolean;

  // File tree
  fileTree: FileTreeNode | null;
  treeLoading: boolean;

  // Findings
  findings: UnfinishedWorkFinding[];
  findingsLoading: boolean;

  // UI state
  activity: ActivityId;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  bottomOpen: boolean;
  bottomDetached: boolean;
  bottomTab: 'storyboard' | 'trace' | 'output' | 'problems';
  paletteOpen: boolean;

  // Editor tabs
  tabs: OpenTab[];
  activeTabId: string | null;

  // Execution (one active at a time)
  execution: ExecutionSession | null;
  selectedFrameId: string | null;

  // Run form (shown in inspector when an entry point is selected)
  runForm: RunFormState | null;

  // History
  recentWorkspaces: { id: string; label: string }[];
  output: string[]; // simple log lines for "Output" tab
}

const INITIAL: AppState = {
  workspace: null,
  workspaceError: null,
  bootstrapping: true,
  fileTree: null,
  treeLoading: false,
  findings: [],
  findingsLoading: false,
  activity: 'explorer',
  sidebarOpen: true,
  inspectorOpen: true,
  bottomOpen: false,
  bottomDetached: false,
  bottomTab: 'storyboard',
  paletteOpen: false,
  tabs: [],
  activeTabId: null,
  execution: null,
  selectedFrameId: null,
  runForm: null,
  recentWorkspaces: [],
  output: [],
};

export const useAppStore = create<AppState>(INITIAL);

// ── Convenience selectors ────────────────────────────────────────────

export function activeTab(state: AppState): OpenTab | null {
  if (!state.activeTabId) return null;
  return state.tabs.find((t) => t.id === state.activeTabId) || null;
}

export function selectedFrame(state: AppState): StoryboardFrame | null {
  if (!state.execution || !state.selectedFrameId) return null;
  const frames = state.execution.storyboard?.frames || state.execution.frames || [];
  return frames.find((f) => f.id === state.selectedFrameId) || null;
}

export function findEntryPointForFile(state: AppState, file: string): EntryPoint[] {
  const eps = state.workspace?.entryPoints || [];
  return eps.filter((e) => e.file === file);
}

// ── Actions ──────────────────────────────────────────────────────────

export function setBottomTab(tab: AppState['bottomTab']): void {
  useAppStore.set((s) => ({ ...s, bottomTab: tab, bottomOpen: true }));
}

export function appendOutput(line: string): void {
  useAppStore.set((s) => ({ ...s, output: [...s.output.slice(-499), `[${new Date().toLocaleTimeString()}] ${line}`] }));
}

export function openTab(tab: OpenTab): void {
  useAppStore.set((s) => {
    const existing = s.tabs.find((t) => t.id === tab.id);
    if (existing) {
      return {
        ...s,
        tabs: s.tabs.map((t) => (t.id === tab.id ? { ...t, ...tab, reveal: tab.reveal ?? t.reveal } : t)),
        activeTabId: tab.id,
      };
    }
    return { ...s, tabs: [...s.tabs, tab], activeTabId: tab.id };
  });
}

export function closeTab(tabId: string): void {
  useAppStore.set((s) => {
    const idx = s.tabs.findIndex((t) => t.id === tabId);
    if (idx < 0) return s;
    const next = s.tabs.filter((t) => t.id !== tabId);
    let activeId = s.activeTabId;
    if (s.activeTabId === tabId) {
      activeId = next[idx]?.id ?? next[idx - 1]?.id ?? null;
    }
    return { ...s, tabs: next, activeTabId: activeId };
  });
}

export function setActiveTab(tabId: string | null): void {
  useAppStore.set((s) => ({ ...s, activeTabId: tabId }));
}

export function setRunForm(form: RunFormState | null): void {
  useAppStore.set((s) => ({ ...s, runForm: form }));
}

export function patchTab(tabId: string, patch: Partial<OpenTab>): void {
  useAppStore.set((s) => ({
    ...s,
    tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, ...patch } : t)),
  }));
}

export function setFileContents(filePath: string, contents: FileContents): void {
  const tabId = `file:${filePath}`;
  patchTab(tabId, {
    contents: contents.contents,
    language: contents.language,
    loading: false,
    error: undefined,
  });
}
