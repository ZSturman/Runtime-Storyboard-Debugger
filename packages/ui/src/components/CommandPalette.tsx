import { useEffect, useMemo, useState } from 'react';
import type { FileTreeNode } from '../api';
import { openFileTab, selectEntryPointForRun } from '../controller';
import { useAppStore } from '../store';

interface PaletteItem {
  id: string;
  label: string;
  detail?: string;
  category: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useAppStore((s) => s.paletteOpen);
  const ws = useAppStore((s) => s.workspace);
  const findings = useAppStore((s) => s.findings);
  const fileTree = useAppStore((s) => s.fileTree);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open) setQuery('');
    setActive(0);
  }, [open]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useAppStore.set((s) => ({ ...s, paletteOpen: !s.paletteOpen }));
      }
      if (e.key === 'Escape' && useAppStore.get().paletteOpen) {
        useAppStore.set((s) => ({ ...s, paletteOpen: false }));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const items: PaletteItem[] = useMemo(() => {
    if (!ws) return [];
    const out: PaletteItem[] = [];
    // Files
    walkTree(fileTree, (path, name) => {
      out.push({
        id: `file:${path}`,
        category: 'File',
        label: name,
        detail: path,
        run: () => void openFileTab(path),
      });
    });
    // Entry points
    for (const ep of ws.entryPoints) {
      out.push({
        id: `ep:${ep.id}`,
        category: 'Run',
        label: `▶ ${ep.name}`,
        detail: `${ep.file}:${ep.line}`,
        run: () => selectEntryPointForRun(ep.id),
      });
    }
    // Findings
    for (const f of findings.slice(0, 200)) {
      out.push({
        id: `f:${f.id}`,
        category: f.kind.toUpperCase(),
        label: f.title,
        detail: `${f.file}:${f.line}`,
        run: () => void openFileTab(f.file, { line: f.line }),
      });
    }
    return out;
  }, [ws, fileTree, findings]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 60);
    const ranked: { item: PaletteItem; score: number }[] = [];
    for (const it of items) {
      const hay = `${it.label} ${it.detail ?? ''}`.toLowerCase();
      const idx = hay.indexOf(q);
      if (idx >= 0) ranked.push({ item: it, score: idx });
    }
    ranked.sort((a, b) => a.score - b.score);
    return ranked.slice(0, 60).map((x) => x.item);
  }, [items, query]);

  if (!open) return null;

  function run(item: PaletteItem) {
    useAppStore.set((s) => ({ ...s, paletteOpen: false }));
    item.run();
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/40 pt-[120px]"
      onClick={() => useAppStore.set((s) => ({ ...s, paletteOpen: false }))}
    >
      <div
        className="w-[640px] overflow-hidden rounded-md border border-editor-border bg-editor-bg-alt shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(filtered.length - 1, a + 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const item = filtered[active];
              if (item) run(item);
            }
          }}
          placeholder="Search files, entry points, findings…"
          className="block w-full bg-transparent px-3 py-3 text-editor text-editor-text outline-none"
        />
        <div className="max-h-[420px] overflow-y-auto border-t border-editor-border-soft">
          {filtered.map((it, i) => (
            <div
              key={it.id}
              onMouseEnter={() => setActive(i)}
              onClick={() => run(it)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-1.5 text-editor-sm ${
                i === active ? 'bg-editor-list-active text-editor-text-strong' : 'text-editor-text'
              }`}
            >
              <span className="w-14 shrink-0 text-editor-xs uppercase tracking-wide text-editor-text-muted">
                {it.category}
              </span>
              <span className="truncate">{it.label}</span>
              {it.detail && (
                <span className="ml-auto truncate font-mono text-[10px] text-editor-text-muted">
                  {it.detail}
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-3 py-2 text-editor-sm text-editor-text-muted">No matches.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function walkTree(
  node: FileTreeNode | null,
  visit: (path: string, name: string) => void,
): void {
  if (!node) return;
  if (node.type === 'file') visit(node.path, node.name);
  for (const c of node.children ?? []) walkTree(c, visit);
}
