import { ExplorerView } from './sidebar/ExplorerView';
import { SearchView } from './sidebar/SearchView';
import { FindingsView } from './sidebar/FindingsView';
import { EntryPointsView } from './sidebar/EntryPointsView';
import { StoryboardsView } from './sidebar/StoryboardsView';
import { useAppStore } from '../store';

const TITLES: Record<string, string> = {
  explorer: 'Explorer',
  search: 'Search',
  findings: 'Findings',
  'entry-points': 'Entry Points',
  storyboards: 'Storyboards',
};

export function Sidebar() {
  const activity = useAppStore((s) => s.activity);
  return (
    <div className="flex h-full w-full flex-col bg-editor-sidebar">
      <div className="flex h-9 shrink-0 items-center px-4 text-editor-xs uppercase tracking-wider text-editor-text-muted">
        {TITLES[activity]}
      </div>
      <div className="flex-1 overflow-hidden">
        {activity === 'explorer' && <ExplorerView />}
        {activity === 'search' && <SearchView />}
        {activity === 'findings' && <FindingsView />}
        {activity === 'entry-points' && <EntryPointsView />}
        {activity === 'storyboards' && <StoryboardsView />}
      </div>
    </div>
  );
}
