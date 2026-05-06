import { closeWorkspace, runEntryPoint } from '../controller';
import { useAppStore } from '../store';

export function TitleBar() {
  const ws = useAppStore((s) => s.workspace);
  const status = ws?.status ?? 'idle';
  const phase = ws?.phase ?? 'idle';
  const execStatus = useAppStore((s) => s.execution?.status);
  const runForm = useAppStore((s) => s.runForm);

  return (
    <div className="flex h-9 shrink-0 items-center justify-between border-b border-editor-border-soft bg-editor-panel-header px-3 text-editor-sm">
      <div className="flex items-center gap-2 text-editor-text-muted">
        <span className="font-semibold text-editor-text-strong">RSD</span>
        {ws && (
          <>
            <span className="text-editor-border">·</span>
            <span className="truncate" title={ws.sourceLabel}>
              {ws.sourceLabel}
            </span>
            <span className={`ml-1 rounded px-1.5 py-0.5 text-editor-xs ${
              status === 'ready'
                ? 'bg-editor-good/20 text-editor-good'
                : status === 'failed'
                  ? 'bg-editor-error/20 text-editor-error'
                  : 'bg-editor-warn/20 text-editor-warn'
            }`}>
              {status === 'ready' ? 'ready' : phase}
            </span>
          </>
        )}
        {execStatus && (
          <>
            <span className="text-editor-border">·</span>
            <span className="text-editor-xs text-editor-text-muted">run: {execStatus}</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-1">
        {ws && (
          <>
            <button
              onClick={() => useAppStore.set((s) => ({ ...s, paletteOpen: true }))}
              className="rounded border border-editor-border px-2 py-0.5 text-editor-xs text-editor-text-muted hover:border-editor-accent hover:text-editor-text"
              title="Command Palette"
            >
              ⌘K
            </button>
            <button
              onClick={() => runForm && void runEntryPoint()}
              disabled={!runForm}
              className="rounded bg-editor-accent-active px-2.5 py-0.5 text-editor-xs text-white hover:bg-editor-accent disabled:opacity-40"
              title={runForm ? 'Run selected entry point' : 'Select an entry point in the sidebar'}
            >
              ▶ Run
            </button>
            <button
              onClick={closeWorkspace}
              className="rounded border border-editor-border px-2 py-0.5 text-editor-xs text-editor-text-muted hover:border-editor-accent hover:text-editor-text"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
