import { useAppStore, type ActivityId } from '../store';

interface ActivityIconProps {
  id: ActivityId;
  label: string;
  badge?: number;
  symbol: string;
}

function Icon({ id, label, badge, symbol }: ActivityIconProps) {
  const active = useAppStore((s) => s.activity);
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const isActive = active === id && sidebarOpen;
  return (
    <button
      title={label}
      onClick={() => {
        useAppStore.set((s) => {
          if (s.activity === id) return { ...s, sidebarOpen: !s.sidebarOpen };
          return { ...s, activity: id, sidebarOpen: true };
        });
      }}
      className={`relative flex h-12 w-12 items-center justify-center text-[18px] ${
        isActive ? 'text-editor-text-strong' : 'text-editor-text-muted hover:text-editor-text'
      }`}
    >
      {isActive && <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-editor-text-strong" />}
      <span>{symbol}</span>
      {badge !== undefined && badge > 0 && (
        <span className="absolute right-1 top-1 rounded-full bg-editor-accent-active px-1 text-[9px] font-semibold leading-tight text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

export function ActivityBar() {
  const findingsCount = useAppStore((s) => s.findings.length);
  const epCount = useAppStore((s) => s.workspace?.entryPoints.length ?? 0);
  return (
    <div className="flex h-full w-12 shrink-0 flex-col items-center justify-between border-r border-editor-border-soft bg-editor-activitybar">
      <div className="flex flex-col">
        <Icon id="explorer" label="Explorer" symbol="🗂" />
        <Icon id="search" label="Search" symbol="⌕" />
        <Icon id="findings" label="Findings (TODOs / FIXMEs)" symbol="!" badge={findingsCount} />
        <Icon id="entry-points" label="Entry Points" symbol="▶" badge={epCount} />
        <Icon id="storyboards" label="Storyboards" symbol="◰" />
      </div>
      <div className="mb-2 flex flex-col">
        <button
          title="Command Palette (⌘K)"
          onClick={() => useAppStore.set((s) => ({ ...s, paletteOpen: true }))}
          className="flex h-12 w-12 items-center justify-center text-editor-text-muted hover:text-editor-text"
        >
          ⌘
        </button>
      </div>
    </div>
  );
}
