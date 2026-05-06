import { useMemo, useState } from 'react';
import { openFileTab } from '../../controller';
import { useAppStore } from '../../store';
import type { UnfinishedWorkFinding } from '../../api';

const KIND_LABELS: Record<string, string> = {
  todo: 'TODO',
  fixme: 'FIXME',
  hack: 'HACK',
  tbd: 'TBD',
  placeholder: 'Placeholder',
  stub: 'Stub',
  'not-implemented': 'Not implemented',
  'analysis-gap': 'Analysis gap',
};

const KIND_COLOR: Record<string, string> = {
  todo: 'text-deco-todo',
  fixme: 'text-deco-fixme',
  hack: 'text-deco-fixme',
  stub: 'text-deco-stub',
};

export function FindingsView() {
  const findings = useAppStore((s) => s.findings);
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return findings;
    return findings.filter((f) =>
      `${f.title} ${f.detail} ${f.file} ${f.kind}`.toLowerCase().includes(q),
    );
  }, [findings, filter]);

  const grouped = useMemo(() => {
    const m = new Map<string, UnfinishedWorkFinding[]>();
    for (const f of filtered) {
      const list = m.get(f.kind) ?? [];
      list.push(f);
      m.set(f.kind, list);
    }
    return m;
  }, [filtered]);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter findings…"
          className="w-full rounded border border-editor-border bg-editor-bg px-2 py-1 text-editor-sm text-editor-text outline-none focus:border-editor-accent"
        />
        <div className="mt-1 text-editor-xs text-editor-text-muted">
          {filtered.length} of {findings.length} {findings.length === 1 ? 'finding' : 'findings'}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {findings.length === 0 && (
          <div className="px-3 py-2 text-editor-xs text-editor-text-muted">
            No TODOs, FIXMEs, or stubs detected in this workspace.
          </div>
        )}
        {[...grouped.entries()].map(([kind, list]) => (
          <div key={kind} className="mb-1">
            <div className={`bg-editor-panel-header/40 px-3 py-0.5 text-editor-xs uppercase tracking-wide ${KIND_COLOR[kind] ?? 'text-editor-text-muted'}`}>
              {KIND_LABELS[kind] ?? kind} <span className="text-editor-text-muted/70">({list.length})</span>
            </div>
            {list.map((f) => (
              <button
                key={f.id}
                onClick={() => void openFileTab(f.file, { line: f.line })}
                className="block w-full truncate px-3 py-0.5 text-left text-editor-xs text-editor-text hover:bg-editor-list-hover"
                title={f.detail}
              >
                <div className="truncate">
                  <span className={KIND_COLOR[kind] ?? 'text-editor-text-muted'}>●</span>{' '}
                  {f.title}
                </div>
                <div className="truncate font-mono text-[10px] text-editor-text-muted">
                  {f.file}:{f.line}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
