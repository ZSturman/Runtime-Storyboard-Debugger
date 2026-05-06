import { useEffect, useState } from 'react';
import { fetchStoryboard, fetchStoryboards } from '../../api';
import { openTab } from '../../store';

interface Summary {
  id: string;
  entryPoint: { name: string; type: string };
  totalFrames: number;
  scenarioName?: string;
}

export function StoryboardsView() {
  const [list, setList] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchStoryboards()
      .then((res) => {
        if (cancelled) return;
        setList(res.storyboards as Summary[]);
      })
      .catch(() => {
        if (cancelled) return;
        setList([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
  }, []);

  async function open(summary: Summary) {
    const { storyboard } = await fetchStoryboard(summary.id);
    openTab({
      id: `storyboard:${storyboard.id}`,
      kind: 'storyboard',
      ref: storyboard.id,
      label: `Storyboard · ${summary.entryPoint.name}`,
      data: storyboard,
    });
  }

  return (
    <div className="h-full overflow-y-auto py-1">
      {loading && <div className="px-3 py-2 text-editor-xs text-editor-text-muted">Loading…</div>}
      {!loading && list.length === 0 && (
        <div className="px-3 py-2 text-editor-xs text-editor-text-muted">
          No storyboards yet. Run an entry point to capture one.
        </div>
      )}
      {list.map((s) => (
        <button
          key={s.id}
          onClick={() => void open(s)}
          className="block w-full truncate px-3 py-1 text-left text-editor-sm text-editor-text hover:bg-editor-list-hover"
        >
          <div className="truncate">{s.entryPoint.name}</div>
          <div className="truncate font-mono text-[10px] text-editor-text-muted">
            {s.scenarioName ?? s.entryPoint.type} · {s.totalFrames} frames
          </div>
        </button>
      ))}
    </div>
  );
}
