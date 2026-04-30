import { useEffect, useMemo, useRef, useState } from 'react';
import type { BranchPathOption, EntryPoint, ExecutionSession, StoryboardFrame, WorkspaceSession } from '../api';
import { EmptyState } from './EmptyState';
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
  onPrepareRerun: (frame: StoryboardFrame, branchOption?: BranchPathOption) => void;
  onOpenShortcutSheet?: () => void;
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
  onOpenShortcutSheet,
}: LiveExecutionScreenProps) {
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [filterQuery, setFilterQuery] = useState('');
  const filterInputRef = useRef<HTMLInputElement | null>(null);
  const flowMapRef = useRef<HTMLDivElement | null>(null);
  const frames = execution.storyboard?.frames || execution.frames || [];
  const flowGraph = workspace.flowGraphs[entryPoint.id] || execution.fallback?.flowGraph || execution.storyboard?.fallback?.flowGraph || null;

  const filterTerm = filterQuery.trim().toLowerCase();
  const matchedIndexes = useMemo(() => {
    if (!filterTerm) return null;
    const matches = new Set<number>();
    frames.forEach((frame, index) => {
      const haystack = `${frame.title || ''} ${frame.description || ''} ${frame.functionName || ''} ${frame.type}`.toLowerCase();
      if (haystack.includes(filterTerm)) matches.add(index);
    });
    return matches;
  }, [frames, filterTerm]);

  useEffect(() => {
    setPreviewNodeId(null);
  }, [currentFrame?.id]);

  // Keyboard nav scoped to the live execution screen.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (isTypingTarget(event.target) && event.key !== 'Escape') return;
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          onSelectFrameIndex(Math.max(0, currentFrameIndex - 1));
          break;
        case 'ArrowRight':
          event.preventDefault();
          onSelectFrameIndex(Math.min(Math.max(0, frames.length - 1), currentFrameIndex + 1));
          break;
        case 'ArrowUp':
          event.preventDefault();
          onSelectFrameIndex(Math.max(0, currentFrameIndex - 5));
          break;
        case 'ArrowDown':
          event.preventDefault();
          onSelectFrameIndex(Math.min(Math.max(0, frames.length - 1), currentFrameIndex + 5));
          break;
        case 'f':
        case 'F':
          event.preventDefault();
          flowMapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          break;
        case 'c':
        case 'C':
          event.preventDefault();
          onReconfigure();
          break;
        case 'b':
        case 'B':
          event.preventDefault();
          onBackToWorkspace();
          break;
        case '/':
          event.preventDefault();
          filterInputRef.current?.focus();
          filterInputRef.current?.select();
          break;
        case 'Escape':
          if (filterQuery) {
            event.preventDefault();
            setFilterQuery('');
            filterInputRef.current?.blur();
          }
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentFrameIndex, frames.length, filterQuery, onSelectFrameIndex, onReconfigure, onBackToWorkspace]);

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
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Execution timeline</div>
            {frames.length > 0 && (
              <span className="text-[10px] text-rsd-muted/80">
                <kbd className="rounded border border-rsd-border bg-rsd-bg/60 px-1 font-mono">/</kbd> filter
              </span>
            )}
          </div>
          {frames.length > 0 && (
            <input
              ref={filterInputRef}
              type="text"
              value={filterQuery}
              onChange={(event) => setFilterQuery(event.target.value)}
              placeholder="Filter steps…"
              className="mt-3 w-full rounded-xl border border-rsd-border bg-rsd-bg/50 px-3 py-1.5 text-xs text-rsd-text placeholder:text-rsd-muted/60 focus:outline-none focus:ring-2 focus:ring-rsd-accent/30"
            />
          )}
          {filterTerm && matchedIndexes && (
            <div className="mt-2 text-[11px] text-rsd-muted">
              {matchedIndexes.size} match{matchedIndexes.size === 1 ? '' : 'es'}
            </div>
          )}
          <div className="mt-3 space-y-2">
            {frames.length === 0 && (
              <EmptyState
                icon={<span aria-hidden>⏳</span>}
                title="Waiting for runtime events"
                description="Steps will appear here as the execution session captures them. Most runs populate within a second or two."
                hints={[
                  'If nothing appears, the entry point may have completed without instrumented work.',
                  'You can re-run with different inputs from the footer at any time.',
                ]}
              />
            )}
            {frames.length > 0 && filterTerm && matchedIndexes && matchedIndexes.size === 0 && (
              <div className="rounded-2xl border border-rsd-border bg-rsd-surface/40 px-4 py-3 text-xs text-rsd-muted">
                No steps match “{filterTerm}”. Press <kbd className="rounded border border-rsd-border bg-rsd-bg/60 px-1 font-mono">Esc</kbd> to clear the filter.
              </div>
            )}

            {frames.map((frame, index) => {
              const isMatch = !matchedIndexes || matchedIndexes.has(index);
              const isActive = index === currentFrameIndex;
              return (
                <button
                  key={`${frame.id}_${index}`}
                  onClick={() => onSelectFrameIndex(index)}
                  className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
                    isActive
                      ? 'border-rsd-accent/40 bg-rsd-accent/10'
                      : isMatch
                        ? 'border-rsd-border bg-rsd-surface/40 hover:border-rsd-accent/20'
                        : 'border-rsd-border/40 bg-rsd-surface/20 opacity-40 hover:opacity-70'
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
              );
            })}
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

        <aside ref={flowMapRef} className="border-l border-rsd-border/50 bg-rsd-surface/35 p-5 overflow-y-auto">
          <div className="flex items-center gap-2">
            <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Flow map</div>
            <span
              className="text-rsd-muted/70 text-[11px]"
              title="A static map of every branch and call this entry point can take. The current step is highlighted."
            >
              ⓘ
            </span>
          </div>
          <div className="mt-4">
            <FlowMap
              flowGraph={flowGraph}
              highlightedNodeId={previewNodeId || currentFrame?.flowNodeId || null}
              compact={false}
              onNodeClick={(nodeId) => {
                const targetIndex = frames.findIndex((frame) => frame.flowNodeId === nodeId);
                if (targetIndex >= 0) {
                  onSelectFrameIndex(targetIndex);
                } else {
                  setPreviewNodeId(nodeId);
                }
              }}
            />
          </div>

          {execution.fallback && (
            <div className="mt-6 rounded-3xl border border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-center gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-amber-300">Static analysis</div>
                <span
                  className="text-amber-300/70 text-[11px]"
                  title="What RSD can show from the source code alone, when runtime tracing was incomplete."
                >
                  ⓘ
                </span>
              </div>
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
              <div className="flex items-center gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Setup needed</div>
                <span
                  className="text-rsd-muted/70 text-[11px]"
                  title="Things that may need to be set up before runtime tracing can run cleanly."
                >
                  ⓘ
                </span>
              </div>
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
        onOpenShortcutSheet={onOpenShortcutSheet}
      />
    </div>
  );
}

function friendlyStatus(status: string) {
  return status.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (target.isContentEditable) return true;
  return false;
}
