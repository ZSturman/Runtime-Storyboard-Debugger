import { useState } from 'react';
import { useApi } from './hooks/useApi';
import { fetchEntryPoints, fetchScenarios, runScenario } from './api';
import type { Storyboard, StoryboardFrame } from './api';
import { Layout } from './components/Layout';
import { EntryPointPanel } from './components/EntryPointPanel';
import { StoryboardTimeline } from './components/StoryboardTimeline';
import { FrameDetail } from './components/FrameDetail';

export default function App() {
  const entryPoints = useApi(fetchEntryPoints);
  const scenarios = useApi(fetchScenarios);
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<StoryboardFrame | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleRunScenario(scenarioPath: string) {
    setRunning(true);
    setError(null);
    setSelectedFrame(null);
    try {
      const sb = await runScenario(scenarioPath);
      setStoryboard(sb);
      if (sb.frames.length > 0) {
        setSelectedFrame(sb.frames[0]);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setRunning(false);
    }
  }

  function handleSelectFrame(frame: StoryboardFrame) {
    setSelectedFrame(frame);
  }

  function handleNavigateToFrame(frameId: string) {
    if (!storyboard) return;
    const frame = storyboard.frames.find((f) => f.id === frameId);
    if (frame) setSelectedFrame(frame);
  }

  const sidebar = (
    <EntryPointPanel
      entryPoints={entryPoints.data || []}
      scenarios={scenarios.data || []}
      loading={entryPoints.loading || scenarios.loading}
      onRunScenario={handleRunScenario}
      running={running}
    />
  );

  const main = (
    <>
      {error && (
        <div className="m-4 p-3 bg-rsd-error/10 border border-rsd-error/30 rounded-lg text-rsd-error text-sm">
          {error}
        </div>
      )}
      {storyboard ? (
        <StoryboardTimeline
          storyboard={storyboard}
          selectedFrameId={selectedFrame?.id || null}
          onSelectFrame={handleSelectFrame}
        />
      ) : (
        <EmptyState running={running} />
      )}
    </>
  );

  const detail = selectedFrame ? (
    <FrameDetail
      frame={selectedFrame}
      onNavigateToFrame={handleNavigateToFrame}
    />
  ) : null;

  return <Layout sidebar={sidebar} main={main} detail={detail} />;
}

function EmptyState({ running }: { running: boolean }) {
  if (running) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-rsd-accent border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-rsd-muted">Running scenario...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center max-w-md px-6">
        <h2 className="text-lg font-semibold text-rsd-text mb-2">Runtime Storyboard Debugger</h2>
        <p className="text-rsd-muted text-sm leading-relaxed mb-4">
          Select a scenario from the left panel to generate a storyboard.
          Each scenario exercises a different flow through the target application.
        </p>
        <div className="text-xs text-rsd-muted/60 space-y-1">
          <p>1. Choose a scenario to see what happens</p>
          <p>2. Click frames to inspect each step</p>
          <p>3. Follow the causal story through the system</p>
        </div>
      </div>
    </div>
  );
}
