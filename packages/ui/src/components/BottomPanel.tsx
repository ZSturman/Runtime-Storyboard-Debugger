import { Rnd } from 'react-rnd';
import { selectFrame } from '../controller';
import { useAppStore } from '../store';

const TABS = [
  { id: 'storyboard', label: 'Storyboard' },
  { id: 'trace', label: 'Trace' },
  { id: 'output', label: 'Output' },
  { id: 'problems', label: 'Problems' },
] as const;

function BottomBody() {
  const tab = useAppStore((s) => s.bottomTab);
  if (tab === 'storyboard') return <StoryboardTimeline />;
  if (tab === 'trace') return <TraceList />;
  if (tab === 'output') return <OutputView />;
  return <ProblemsView />;
}

export function BottomPanel() {
  const open = useAppStore((s) => s.bottomOpen);
  const detached = useAppStore((s) => s.bottomDetached);
  const tab = useAppStore((s) => s.bottomTab);

  if (!open) return null;
  if (detached) {
    return (
      <Rnd
        default={{ x: 100, y: 200, width: 760, height: 320 }}
        minWidth={420}
        minHeight={180}
        bounds="window"
        dragHandleClassName="rsd-bottom-handle"
        style={{ zIndex: 50 }}
      >
        <div className="flex h-full w-full flex-col rounded border border-editor-border bg-editor-bg-alt shadow-2xl">
          <Header onDock floating />
          <div className="flex-1 overflow-hidden">
            <BottomBody />
          </div>
        </div>
      </Rnd>
    );
  }

  return (
    <div className="flex h-full w-full flex-col border-t border-editor-border-soft bg-editor-bg-alt">
      <Header />
      <div className="flex-1 overflow-hidden">
        <BottomBody />
      </div>
    </div>
  );

  function Header({ floating, onDock }: { floating?: boolean; onDock?: boolean } = {}) {
    return (
      <div className="rsd-bottom-handle flex h-9 shrink-0 items-center justify-between border-b border-editor-border-soft bg-editor-panel-header px-2">
        <div className="flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => useAppStore.set((s) => ({ ...s, bottomTab: t.id }))}
              className={`rounded px-2 py-0.5 text-editor-xs ${
                tab === t.id
                  ? 'bg-editor-bg text-editor-text-strong'
                  : 'text-editor-text-muted hover:text-editor-text'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => useAppStore.set((s) => ({ ...s, bottomDetached: !s.bottomDetached }))}
            className="rounded px-1.5 py-0.5 text-editor-xs text-editor-text-muted hover:text-editor-text"
            title={floating ? 'Dock to bottom' : 'Detach to floating window'}
          >
            {floating ? '⊟ Dock' : '⊞ Detach'}
          </button>
          <button
            onClick={() => useAppStore.set((s) => ({ ...s, bottomOpen: false }))}
            className="rounded px-1.5 py-0.5 text-editor-xs text-editor-text-muted hover:text-editor-text"
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
    );
  }
}

function StoryboardTimeline() {
  const exec = useAppStore((s) => s.execution);
  const selectedFrameId = useAppStore((s) => s.selectedFrameId);
  const frames = exec?.storyboard?.frames || exec?.frames || [];
  if (frames.length === 0) {
    return (
      <div className="p-3 text-editor-sm text-editor-text-muted">
        No frames yet. Select an entry point and run it to capture a storyboard.
      </div>
    );
  }
  return (
    <div className="h-full overflow-auto p-2">
      <div className="flex flex-wrap gap-1">
        {frames.map((f, idx) => {
          const isSel = f.id === selectedFrameId;
          return (
            <button
              key={f.id}
              onClick={() => selectFrame(f.id)}
              title={`${f.title} (${f.file}:${f.line})`}
              className={`rounded border px-2 py-1 text-left text-editor-xs ${
                isSel
                  ? 'border-editor-accent bg-editor-accent/20 text-editor-text-strong'
                  : 'border-editor-border-soft bg-editor-bg text-editor-text hover:border-editor-accent/50'
              }`}
            >
              <div className="text-editor-text-muted">
                {String(idx + 1).padStart(2, '0')} · {f.type}
              </div>
              <div className="max-w-[180px] truncate">{f.title}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TraceList() {
  const events = useAppStore((s) => s.execution?.events ?? []);
  if (events.length === 0) {
    return <div className="p-3 text-editor-sm text-editor-text-muted">No trace events yet.</div>;
  }
  return (
    <div className="h-full overflow-auto p-1 font-mono text-editor-xs">
      {events.map((e) => (
        <div key={e.id} className="flex gap-2 px-1 py-0.5 hover:bg-editor-list-hover">
          <span className="w-16 text-editor-text-muted">{e.type}</span>
          <span className="text-editor-text">{e.functionName || '(anon)'}</span>
          <span className="ml-auto text-editor-text-muted">
            {e.file}:{e.line}
          </span>
        </div>
      ))}
    </div>
  );
}

function OutputView() {
  const lines = useAppStore((s) => s.output);
  if (lines.length === 0) {
    return <div className="p-3 text-editor-sm text-editor-text-muted">No output.</div>;
  }
  return (
    <div className="h-full overflow-auto p-2 font-mono text-editor-xs text-editor-text">
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

function ProblemsView() {
  const findings = useAppStore((s) => s.findings);
  const error = useAppStore((s) => s.execution?.error);
  if (!error && findings.length === 0) {
    return <div className="p-3 text-editor-sm text-editor-text-muted">No problems detected.</div>;
  }
  return (
    <div className="h-full overflow-auto p-2 text-editor-sm">
      {error && (
        <div className="mb-2 rounded border border-editor-error/40 bg-editor-error/10 px-2 py-1 text-editor-error">
          {error}
        </div>
      )}
      {findings.map((f) => (
        <div key={f.id} className="px-2 py-0.5 text-editor-xs">
          <span className="text-deco-todo">{f.kind.toUpperCase()}</span>{' '}
          <span className="text-editor-text">{f.title}</span>{' '}
          <span className="font-mono text-editor-text-muted">
            {f.file}:{f.line}
          </span>
        </div>
      ))}
    </div>
  );
}
