import { closeTab, setActiveTab, useAppStore } from '../store';
import { FileEditor } from './editor/FileEditor';
import { MarkdownView } from './editor/MarkdownView';
import { StoryboardView } from './editor/StoryboardView';

export function EditorArea() {
  const tabs = useAppStore((s) => s.tabs);
  const activeId = useAppStore((s) => s.activeTabId);
  const findings = useAppStore((s) => s.findings);
  const eps = useAppStore((s) => s.workspace?.entryPoints ?? []);
  const exec = useAppStore((s) => s.execution);
  const selectedFrameId = useAppStore((s) => s.selectedFrameId);
  const frames = exec?.storyboard?.frames || exec?.frames || [];

  const active = tabs.find((t) => t.id === activeId) || null;

  return (
    <div className="flex h-full w-full flex-col bg-editor-bg">
      <div className="flex h-9 shrink-0 items-end overflow-x-auto border-b border-editor-border-soft bg-editor-tabs">
        {tabs.length === 0 && (
          <div className="px-3 py-2 text-editor-xs text-editor-text-muted">No file open. Pick one from the Explorer.</div>
        )}
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <div
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`group flex h-9 max-w-[260px] cursor-pointer items-center gap-2 border-r border-editor-border-soft px-3 text-editor-sm ${
                isActive
                  ? 'bg-editor-bg text-editor-text-strong'
                  : 'bg-editor-tabs text-editor-text-muted hover:text-editor-text'
              }`}
              title={t.ref}
            >
              <span className="truncate">
                {t.kind === 'readme' && '📘 '}
                {t.kind === 'storyboard' && '◰ '}
                {t.kind === 'flow-graph' && '◇ '}
                {t.label}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(t.id);
                }}
                className="rounded text-editor-text-muted opacity-0 hover:bg-editor-list-hover hover:text-editor-text group-hover:opacity-100"
                title="Close"
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex-1 overflow-hidden">
        {!active && <EmptyState />}
        {active?.kind === 'file' && (
          <FileEditor
            tab={active}
            findings={findings}
            entryPoints={eps}
            frames={frames}
            selectedFrameId={selectedFrameId}
          />
        )}
        {active?.kind === 'readme' && <MarkdownView tab={active} />}
        {active?.kind === 'storyboard' && <StoryboardView tab={active} />}
        {active?.kind === 'flow-graph' && (
          <div className="p-4 text-editor-sm text-editor-text-muted">Flow graph view coming soon.</div>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <div className="max-w-md px-4 text-editor-text-muted">
        <div className="text-editor-text-strong text-base font-semibold">Welcome.</div>
        <div className="mt-2 text-editor-sm">
          Open a file from the Explorer, scan TODOs in Findings, or pick an Entry Point and hit
          <span className="mx-1 rounded bg-editor-accent-active/30 px-1 text-editor-accent">▶ Run</span>
          to capture a runtime storyboard.
        </div>
      </div>
    </div>
  );
}
