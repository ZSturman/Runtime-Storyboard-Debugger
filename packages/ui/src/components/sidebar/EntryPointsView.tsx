import { selectEntryPointForRun } from '../../controller';
import { useAppStore } from '../../store';

export function EntryPointsView() {
  const eps = useAppStore((s) => s.workspace?.entryPoints ?? []);
  const runForm = useAppStore((s) => s.runForm);
  return (
    <div className="h-full overflow-y-auto py-1">
      {eps.length === 0 && (
        <div className="px-3 py-2 text-editor-xs text-editor-text-muted">
          No entry points detected.
        </div>
      )}
      {eps.map((ep) => {
        const selected = runForm?.entryPointId === ep.id;
        return (
          <button
            key={ep.id}
            onClick={() => selectEntryPointForRun(ep.id)}
            className={`block w-full truncate px-3 py-1 text-left text-editor-sm hover:bg-editor-list-hover ${
              selected ? 'bg-editor-list-active text-editor-text-strong' : 'text-editor-text'
            }`}
            title={ep.description}
          >
            <div className="flex items-center gap-1.5 truncate">
              {ep.httpMethod ? (
                <span className="rounded bg-editor-accent-active/30 px-1 py-0 font-mono text-[10px] text-editor-accent">
                  {ep.httpMethod}
                </span>
              ) : (
                <span className="text-editor-good">▶</span>
              )}
              <span className="truncate">
                {ep.httpPath || ep.name}
              </span>
            </div>
            <div className="truncate font-mono text-[10px] text-editor-text-muted">
              {ep.file}:{ep.line}
            </div>
          </button>
        );
      })}
    </div>
  );
}
