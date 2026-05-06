import { Allotment } from 'allotment';
import { ActivityBar } from './ActivityBar';
import { BottomPanel } from './BottomPanel';
import { CommandPalette } from './CommandPalette';
import { EditorArea } from './EditorArea';
import { Inspector } from './Inspector';
import { Sidebar } from './Sidebar';
import { TitleBar } from './TitleBar';
import { useAppStore } from '../store';

export function Shell() {
  const sidebarOpen = useAppStore((s) => s.sidebarOpen);
  const inspectorOpen = useAppStore((s) => s.inspectorOpen);
  const bottomOpen = useAppStore((s) => s.bottomOpen);
  const bottomDetached = useAppStore((s) => s.bottomDetached);

  const showBottomPane = bottomOpen && !bottomDetached;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-editor-bg text-editor-text">
      <TitleBar />
      <div className="flex-1 overflow-hidden">
        <Allotment vertical>
          <Allotment.Pane>
            <div className="flex h-full w-full">
              <ActivityBar />
              <div className="flex-1 overflow-hidden">
                <Allotment>
                  {sidebarOpen && (
                    <Allotment.Pane preferredSize={260} minSize={180} maxSize={520}>
                      <Sidebar />
                    </Allotment.Pane>
                  )}
                  <Allotment.Pane>
                    <EditorArea />
                  </Allotment.Pane>
                  {inspectorOpen && (
                    <Allotment.Pane preferredSize={320} minSize={220} maxSize={560}>
                      <Inspector />
                    </Allotment.Pane>
                  )}
                </Allotment>
              </div>
            </div>
          </Allotment.Pane>
          {showBottomPane && (
            <Allotment.Pane preferredSize={240} minSize={120}>
              <BottomPanel />
            </Allotment.Pane>
          )}
        </Allotment>
      </div>
      {bottomOpen && bottomDetached && <BottomPanel />}
      <CommandPalette />
    </div>
  );
}
