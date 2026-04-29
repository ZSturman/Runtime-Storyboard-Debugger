import { useEffect, useState } from 'react';
import type { EntryPoint, ExecutionSession, StoryboardFrame, WorkspaceSession } from '../api';
import { FlowMap } from './FlowMap';
import { StepCard } from './StepCard';
import { StepNavigation } from './StepNavigation';

interface LiveExecutionScreenProps {
  workspace: WorkspaceSession;
  entryPoint: EntryPoint;
  execution: ExecutionSession;
  currentFrame: StoryboardFrame | null;
  currentFrameIndex: number;
  technicalDetails: boolean;
  onSelectFrameIndex: (index: number) => void;
  onBackToWorkspace: () => void;
  onReconfigure: () => void;
  onPrepareRerun: (frame: StoryboardFrame) => void;
}

export function LiveExecutionScreen({
  workspace,
  entryPoint,
  execution,
  currentFrame,
  currentFrameIndex,
  technicalDetails,
  onSelectFrameIndex,
  onBackToWorkspace,
  onReconfigure,
  onPrepareRerun,
}: LiveExecutionScreenProps) {
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const frames = execution.storyboard?.frames || execution.frames || [];
  const flowGraph = workspace.flowGraphs[entryPoint.id] || execution.fallback?.flowGraph || execution.storyboard?.fallback?.flowGraph || null;

  useEffect(() => {
    setPreviewNodeId(null);
  }, [currentFrame?.id]);

  return (
    <div className="min-h-screen flex flex-col phase-enter">
      <div className="border-b border-rsd-border/60 bg-rsd-surface/70 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Live execution</div>
            <h1 className="mt-1 text-2xl font-bold text-rsd-text">
              {entryPoint.httpMethod ? `${entryPoint.httpMethod} ${entryPoint.httpPath}` : entryPoint.name}
            </h1>
            <div className="mt-2 text-sm text-rsd-muted">
              {friendlyStatus(execution.status)}{frames.length > 0 ? ` · ${frames.length} captured step${frames.length === 1 ? '' : 's'}` : ''}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onBackToWorkspace}
              className="rounded-xl border border-rsd-border px-3 py-2 text-xs text-rsd-muted transition-colors hover:text-rsd-text"
            >
              Workspace
            </button>
            <button
              onClick={onReconfigure}
              className="rounded-xl border border-rsd-border px-3 py-2 text-xs text-rsd-muted transition-colors hover:text-rsd-text"
            >
              Adjust inputs
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 grid xl:grid-cols-[0.32fr,0.88fr,0.56fr] overflow-hidden">
        <aside className="border-r border-rsd-border/50 bg-rsd-bg/35 p-4 overflow-y-auto">
          <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Execution timeline</div>
          <div className="mt-4 space-y-2">
            {frames.length === 0 && (
              <div className="rounded-2xl border border-rsd-border bg-rsd-surface/50 px-4 py-4 text-sm text-rsd-muted">
                Waiting for runtime events. The execution session will populate this timeline as steps are captured.
              </div>
            )}

            {frames.map((frame, index) => (
              <button
                key={`${frame.id}_${index}`}
                onClick={() => onSelectFrameIndex(index)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                  index === currentFrameIndex
                    ? 'border-rsd-accent/40 bg-rsd-accent/10'
                    : 'border-rsd-border bg-rsd-surface/40 hover:border-rsd-accent/20'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">{frame.type}</div>
                  {frame.timestampMs !== undefined && (
                    <div className="text-[11px] text-rsd-muted">{frame.timestampMs}ms</div>
                  )}
                </div>
                <div className="mt-2 text-sm font-semibold text-rsd-text">{frame.title || frame.snapshotLabel || frame.statusLabel || frame.functionName}</div>
                <div className="mt-1 text-xs leading-6 text-rsd-muted line-clamp-2">{frame.description}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="overflow-y-auto p-6">
          {currentFrame ? (
            <StepCard
              workspaceId={workspace.id}
              frame={currentFrame}
              technicalDetails={technicalDetails}
              onPreviewBranch={(option) => setPreviewNodeId(option.flowNodeId || null)}
              onPrepareRerun={onPrepareRerun}
              onNavigateToFrame={(frameId) => {
                const nextIndex = frames.findIndex((frame) => frame.id === frameId);
                if (nextIndex >= 0) onSelectFrameIndex(nextIndex);
              }}
            />
          ) : (
            <div className="rounded-3xl border border-rsd-border bg-rsd-surface/50 p-8 text-center text-sm text-rsd-muted">
              No execution steps have been captured yet.
            </div>
          )}
        </main>

        <aside className="border-l border-rsd-border/50 bg-rsd-surface/35 p-5 overflow-y-auto">
          <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Flow map</div>
          <div className="mt-4">
            <FlowMap flowGraph={flowGraph} highlightedNodeId={previewNodeId || currentFrame?.flowNodeId || null} compact={false} />
          </div>

          {execution.fallback && (
            <div className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="text-xs uppercase tracking-[0.2em] text-amber-300">Fallback analysis</div>
              <div className="mt-3 text-sm font-semibold text-amber-100">{execution.fallback.summary}</div>
              <div className="mt-3 space-y-2">
                {execution.fallback.blockers.map((blocker) => (
                  <div key={blocker} className="rounded-2xl border border-amber-500/10 bg-black/10 px-3 py-3 text-xs leading-6 text-amber-100/80">
                    {blocker}
                  </div>
                ))}
              </div>
            </div>
          )}

          {workspace.runtimeBlockers.length > 0 && (
            <div className="mt-6">
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Trust signals</div>
              <div className="mt-3 space-y-2">
                {workspace.runtimeBlockers.slice(0, 4).map((blocker) => (
                  <div key={blocker.id} className="rounded-2xl border border-rsd-border bg-rsd-bg/40 px-3 py-3 text-xs leading-6 text-rsd-muted">
                    <span className="font-semibold text-rsd-text">{blocker.title}</span>
                    {' — '}{blocker.detail}
                  </div>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <StepNavigation
        currentIndex={currentFrameIndex}
        totalSteps={Math.max(frames.length, 1)}
        onPrevious={() => onSelectFrameIndex(Math.max(0, currentFrameIndex - 1))}
        onNext={() => onSelectFrameIndex(Math.min(Math.max(0, frames.length - 1), currentFrameIndex + 1))}
        onJumpTo={onSelectFrameIndex}
        onStartOver={onBackToWorkspace}
        onReconfigure={onReconfigure}
      />
    </div>
  );
}

function friendlyStatus(status: string) {
  return status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
