import { useEffect } from 'react';
import { Shell } from './components/Shell';
import { WorkspacePicker } from './components/WorkspacePicker';
import { bootstrap, disposeStreams } from './controller';
import { loadPersistedUI, startPersistingUI } from './persistence';
import { useAppStore } from './store';

export function App() {
  const ws = useAppStore((s) => s.workspace);
  const bootstrapping = useAppStore((s) => s.bootstrapping);

  useEffect(() => {
    loadPersistedUI();
    const stopPersist = startPersistingUI();
    void bootstrap();
    return () => {
      stopPersist();
      disposeStreams();
    };
  }, []);

  if (!ws && bootstrapping) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-editor-bg text-editor-text-muted">
        Loading…
      </div>
    );
  }
  if (!ws) return <WorkspacePicker />;
  return <Shell />;
}

export default App;
