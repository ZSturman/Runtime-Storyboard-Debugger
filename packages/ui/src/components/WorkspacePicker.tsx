import { useState } from 'react';
import { openSource } from '../controller';
import { useAppStore } from '../store';

export function WorkspacePicker() {
  const error = useAppStore((s) => s.workspaceError);
  const recent = useAppStore((s) => s.recentWorkspaces);
  const bootstrapping = useAppStore((s) => s.bootstrapping);
  const [tab, setTab] = useState<'local-path' | 'github-url'>('local-path');
  const [value, setValue] = useState('');

  function submit() {
    if (!value.trim()) return;
    void openSource({ type: tab, value });
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-editor-bg">
      <div className="w-[520px] rounded-md border border-editor-border bg-editor-bg-alt p-6">
        <div className="text-editor-text-strong text-base font-semibold">Open a project</div>
        <div className="mt-1 text-editor-sm text-editor-text-muted">
          Point RSD at a local folder or paste a public GitHub URL.
        </div>

        <div className="mt-5 flex gap-1 border-b border-editor-border">
          {(['local-path', 'github-url'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 text-editor-sm border-b-2 -mb-px ${
                tab === t
                  ? 'border-editor-accent text-editor-text-strong'
                  : 'border-transparent text-editor-text-muted hover:text-editor-text'
              }`}
            >
              {t === 'local-path' ? 'Local Folder' : 'GitHub URL'}
            </button>
          ))}
        </div>

        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
          placeholder={tab === 'local-path' ? '/Users/you/project' : 'https://github.com/owner/repo'}
          className="mt-4 w-full rounded border border-editor-border bg-editor-bg px-3 py-2 text-editor font-mono text-editor-text outline-none focus:border-editor-accent"
        />

        {error && (
          <div className="mt-3 whitespace-pre-line rounded border border-editor-error/40 bg-editor-error/10 px-3 py-2 text-editor-sm text-editor-error">
            {error}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-editor-xs text-editor-text-muted">
            {bootstrapping ? 'Loading…' : 'Press Enter to open.'}
          </span>
          <button
            onClick={submit}
            disabled={!value.trim()}
            className="rounded bg-editor-accent-active px-3 py-1.5 text-editor-sm text-white hover:bg-editor-accent disabled:opacity-50"
          >
            Open
          </button>
        </div>

        {recent.length > 0 && (
          <div className="mt-6">
            <div className="text-editor-xs uppercase tracking-wide text-editor-text-muted">Recent</div>
            <div className="mt-2 space-y-1">
              {recent.slice(0, 6).map((w) => (
                <div
                  key={w.id}
                  className="truncate rounded px-2 py-1 text-editor-sm text-editor-text-muted hover:bg-editor-list-hover"
                  title={w.label}
                >
                  {w.label}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
