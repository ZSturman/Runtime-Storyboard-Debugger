import { useEffect, useState } from 'react';
import { searchFiles, type SearchHit } from '../../api';
import { openFileTab } from '../../controller';
import { useAppStore } from '../../store';

export function SearchView() {
  const ws = useAppStore((s) => s.workspace);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);

  useEffect(() => {
    if (!ws) return;
    const q = query.trim();
    if (!q) {
      setHits([]);
      setTruncated(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(() => {
      searchFiles(ws.id, q)
        .then((res) => {
          if (cancelled) return;
          setHits(res.hits);
          setTruncated(res.truncated);
        })
        .catch(() => {
          if (cancelled) return;
          setHits([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [ws?.id, query]);

  const grouped = groupBy(hits, (h) => h.path);

  return (
    <div className="flex h-full flex-col">
      <div className="px-3 pb-2">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search workspace…"
          className="w-full rounded border border-editor-border bg-editor-bg px-2 py-1 text-editor-sm text-editor-text outline-none focus:border-editor-accent"
        />
        <div className="mt-1 text-editor-xs text-editor-text-muted">
          {loading
            ? 'Searching…'
            : query.trim()
              ? `${hits.length} hit${hits.length === 1 ? '' : 's'} in ${grouped.size} file${grouped.size === 1 ? '' : 's'}${truncated ? ' (truncated)' : ''}`
              : 'Type to search file contents.'}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-2">
        {[...grouped.entries()].map(([file, fileHits]) => (
          <div key={file} className="mb-1">
            <div className="bg-editor-panel-header/40 px-3 py-0.5 text-editor-xs text-editor-text-muted">
              {file} <span className="text-editor-text-muted/70">({fileHits.length})</span>
            </div>
            {fileHits.map((h, i) => (
              <button
                key={`${file}:${h.line}:${i}`}
                onClick={() => void openFileTab(h.path, { line: h.line })}
                className="block w-full truncate px-3 py-0.5 text-left font-mono text-editor-xs text-editor-text hover:bg-editor-list-hover"
              >
                <span className="text-editor-text-muted">{h.line}: </span>
                {h.preview}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function groupBy<T, K>(arr: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}
