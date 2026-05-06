import type { OpenTab } from '../../store';
import type { Storyboard } from '../../api';

export function StoryboardView({ tab }: { tab: OpenTab }) {
  const board = tab.data as Storyboard | undefined;
  if (!board) {
    return <div className="p-3 text-editor-sm text-editor-text-muted">Storyboard not loaded.</div>;
  }
  return (
    <div className="h-full overflow-y-auto px-6 py-4 text-editor-sm text-editor-text">
      <div className="mb-3">
        <div className="text-editor-text-strong text-base font-semibold">{board.entryPoint?.name ?? board.id}</div>
        <div className="text-editor-xs text-editor-text-muted">
          {board.frames.length} frames · {new Date(board.metadata.startTime).toLocaleString()}
        </div>
      </div>
      <ol className="space-y-2">
        {board.frames.map((f, idx) => (
          <li key={f.id} className="rounded border border-editor-border-soft bg-editor-bg-alt p-2">
            <div className="flex items-baseline gap-2">
              <span className="text-editor-xs text-editor-text-muted">{String(idx + 1).padStart(2, '0')}</span>
              <span className="rounded bg-editor-accent-active/30 px-1 font-mono text-[10px] text-editor-accent">
                {f.type}
              </span>
              <span className="font-medium text-editor-text-strong">{f.title}</span>
              <span className="ml-auto font-mono text-[10px] text-editor-text-muted">
                {f.file}:{f.line}
              </span>
            </div>
            <div className="mt-1 text-editor-text-muted">{f.description}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
