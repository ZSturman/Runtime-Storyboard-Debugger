import {
  ApiError,
  createWorkspace,
  fetchFile,
  fetchFileTree,
  fetchFindings,
  fetchReadme,
  fetchWorkspaces,
  startExecutionSession,
  subscribeToExecution,
  subscribeToWorkspace,
  type ExecutionStatus,
  type StoryboardFrame,
  type WorkspaceSession,
} from './api';
import {
  appendOutput,
  closeTab,
  openTab,
  patchTab,
  setBottomTab,
  setRunForm,
  useAppStore,
} from './store';

let workspaceUnsub: (() => void) | null = null;
let executionUnsub: (() => void) | null = null;

export function formatApiError(err: unknown): string {
  if (err instanceof ApiError) {
    return err.suggestedAction ? `${err.message}\n\n${err.suggestedAction}` : err.message;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

export async function bootstrap(): Promise<void> {
  try {
    const list = await fetchWorkspaces();
    const recent = list
      .slice()
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((w) => ({ id: w.id, label: w.sourceLabel }));
    useAppStore.set((s) => ({ ...s, recentWorkspaces: recent, bootstrapping: false }));
    const latest = list.sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (latest && latest.status === 'ready') {
      adoptWorkspace(latest);
    }
  } catch {
    useAppStore.set((s) => ({ ...s, bootstrapping: false }));
  }
}

export async function openSource(input: { type: 'local-path' | 'github-url'; value: string }): Promise<void> {
  useAppStore.set((s) => ({ ...s, workspaceError: null }));
  try {
    const ws = await createWorkspace(
      input.type === 'local-path'
        ? { type: 'local-path', path: input.value.trim() }
        : { type: 'github-url', url: input.value.trim() },
    );
    adoptWorkspace(ws);
  } catch (err) {
    useAppStore.set((s) => ({ ...s, workspaceError: formatApiError(err) }));
  }
}

export function adoptWorkspace(ws: WorkspaceSession): void {
  // Reset workspace-scoped state; close any existing tabs/streams.
  useAppStore.set((s) => ({
    ...s,
    workspace: ws,
    workspaceError: null,
    tabs: [],
    activeTabId: null,
    fileTree: null,
    findings: [],
    execution: null,
    selectedFrameId: null,
    runForm: null,
    output: [],
  }));
  workspaceUnsub?.();
  executionUnsub?.();
  workspaceUnsub = subscribeToWorkspace(ws.id, {
    onEvent: (event) => {
      if (event.workspace) {
        useAppStore.set((s) => ({ ...s, workspace: event.workspace! }));
        if (event.workspace.status === 'ready') refreshWorkspaceData(event.workspace.id);
      }
      if (event.type === 'error') {
        useAppStore.set((s) => ({ ...s, workspaceError: event.message || 'Workspace failed.' }));
      }
    },
  });
  if (ws.status === 'ready') refreshWorkspaceData(ws.id);
}

async function refreshWorkspaceData(workspaceId: string): Promise<void> {
  useAppStore.set((s) => ({ ...s, treeLoading: true, findingsLoading: true }));
  try {
    const [tree, findings, readme] = await Promise.all([
      fetchFileTree(workspaceId),
      fetchFindings(workspaceId),
      fetchReadme(workspaceId).catch(() => null),
    ]);
    useAppStore.set((s) => ({
      ...s,
      fileTree: tree,
      findings,
      treeLoading: false,
      findingsLoading: false,
    }));
    if (readme) {
      openTab({
        id: `readme:${readme.path}`,
        kind: 'readme',
        ref: readme.path,
        label: readme.path,
        contents: readme.contents,
        language: readme.language,
      });
    }
  } catch (err) {
    useAppStore.set((s) => ({ ...s, treeLoading: false, findingsLoading: false }));
    appendOutput(`Failed to load workspace data: ${formatApiError(err)}`);
  }
}

export async function openFileTab(filePath: string, reveal?: { line: number; column?: number }): Promise<void> {
  const state = useAppStore.get();
  const ws = state.workspace;
  if (!ws) return;
  const tabId = `file:${filePath}`;
  const existing = state.tabs.find((t) => t.id === tabId);
  if (existing) {
    openTab({ ...existing, reveal });
    return;
  }
  openTab({
    id: tabId,
    kind: 'file',
    ref: filePath,
    label: filePath.split('/').pop() || filePath,
    loading: true,
    reveal,
  });
  try {
    const file = await fetchFile(ws.id, filePath);
    patchTab(tabId, {
      contents: file.contents,
      language: file.language,
      loading: false,
      error: undefined,
    });
  } catch (err) {
    patchTab(tabId, { loading: false, error: formatApiError(err) });
  }
}

export function selectEntryPointForRun(entryPointId: string): void {
  const ws = useAppStore.get().workspace;
  if (!ws) return;
  const ep = ws.entryPoints.find((e) => e.id === entryPointId);
  if (!ep) return;
  const inputs: Record<string, string | boolean> = {};
  for (const f of ep.inputFields) {
    if (f.type === 'boolean') inputs[f.key] = Boolean(f.defaultValue);
    else if (f.type === 'json') inputs[f.key] = JSON.stringify(f.defaultValue ?? {}, null, 2);
    else inputs[f.key] = f.defaultValue === undefined ? '' : String(f.defaultValue);
  }
  setRunForm({ entryPointId, inputs, flagsText: '{}' });
  // Open the entry point's source file as a side-effect so the dev sees what they're running.
  void openFileTab(ep.file, { line: ep.line });
}

function materializeInputs(ep: { inputFields: { key: string; type: string }[] }, draft: Record<string, string | boolean>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of ep.inputFields) {
    const v = draft[f.key];
    if (f.type === 'boolean') out[f.key] = !!v;
    else if (f.type === 'number') out[f.key] = v === '' || v === undefined ? undefined : Number(v);
    else if (f.type === 'json') {
      try {
        out[f.key] = v ? JSON.parse(v as string) : undefined;
      } catch {
        out[f.key] = undefined;
      }
    } else out[f.key] = v;
  }
  return out;
}

export async function runEntryPoint(): Promise<void> {
  const state = useAppStore.get();
  const ws = state.workspace;
  const form = state.runForm;
  if (!ws || !form) return;
  const ep = ws.entryPoints.find((e) => e.id === form.entryPointId);
  if (!ep) return;
  let flags: Record<string, unknown> = {};
  try {
    flags = form.flagsText.trim() ? JSON.parse(form.flagsText) : {};
  } catch {
    appendOutput(`Invalid flags JSON; running with empty flags.`);
  }
  appendOutput(`▶ Running ${ep.name} (${ep.id})`);
  setBottomTab('storyboard');
  useAppStore.set((s) => ({ ...s, bottomOpen: true, execution: null, selectedFrameId: null }));

  try {
    const exec = await startExecutionSession(
      ws.id,
      ep.id,
      materializeInputs(ep, form.inputs),
      flags,
    );
    useAppStore.set((s) => ({ ...s, execution: exec }));
    executionUnsub?.();
    executionUnsub = subscribeToExecution(ws.id, exec.id, {
      onEvent: (event) => {
        useAppStore.set((s) => {
          if (!s.execution || s.execution.id !== exec.id) return s;
          let next = s.execution;
          if (event.type === 'status') {
            next = { ...next, status: (event.status || next.status) as ExecutionStatus };
          }
          if (event.type === 'trace-event' && event.traceEvent) {
            next = { ...next, events: [...next.events, event.traceEvent] };
          }
          if (event.type === 'frames' && event.frames) {
            next = {
              ...next,
              status: (event.status || next.status) as ExecutionStatus,
              frames: event.frames,
              currentStepId: event.frames[event.frames.length - 1]?.id,
            };
          }
          if (event.type === 'storyboard' && event.storyboard) {
            next = {
              ...next,
              status: 'completed',
              storyboard: event.storyboard,
              storyboardId: event.storyboard.id,
              frames: event.storyboard.frames,
              fallback: event.storyboard.fallback || next.fallback,
            };
          }
          if (event.type === 'fallback') {
            next = { ...next, status: 'fallback-ready', fallback: event.fallback || next.fallback };
          }
          if (event.type === 'error') {
            next = { ...next, error: event.error };
            appendOutput(`✕ Execution error: ${event.error || 'unknown'}`);
          }
          // Auto-select last frame to keep the inspector live.
          const allFrames: StoryboardFrame[] = next.storyboard?.frames || next.frames || [];
          const selectedFrameId = allFrames.length ? allFrames[allFrames.length - 1].id : s.selectedFrameId;
          return { ...s, execution: next, selectedFrameId };
        });
      },
      onError: () => appendOutput('Execution stream disconnected.'),
    });
  } catch (err) {
    appendOutput(`Failed to start execution: ${formatApiError(err)}`);
  }
}

export function selectFrame(frameId: string | null): void {
  useAppStore.set((s) => ({ ...s, selectedFrameId: frameId }));
  if (!frameId) return;
  const s = useAppStore.get();
  const frames = s.execution?.storyboard?.frames || s.execution?.frames || [];
  const f = frames.find((x) => x.id === frameId);
  if (f) {
    void openFileTab(f.file, { line: f.line });
  }
}

export function closeWorkspace(): void {
  workspaceUnsub?.();
  executionUnsub?.();
  workspaceUnsub = null;
  executionUnsub = null;
  useAppStore.set((s) => ({
    ...s,
    workspace: null,
    fileTree: null,
    findings: [],
    tabs: [],
    activeTabId: null,
    execution: null,
    selectedFrameId: null,
    runForm: null,
  }));
}

export function disposeStreams(): void {
  workspaceUnsub?.();
  executionUnsub?.();
}

export { closeTab };
