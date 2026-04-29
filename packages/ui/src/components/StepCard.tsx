import { useState, useEffect } from 'react';
import type { BranchPathOption, SourceSnippet, StoryboardFrame } from '../api';
import { fetchWorkspaceSource } from '../api';

interface StepCardProps {
  workspaceId: string;
  frame: StoryboardFrame;
  technicalDetails: boolean;
  onPreviewBranch: (option: BranchPathOption) => void;
  onPrepareRerun: (frame: StoryboardFrame) => void;
  onNavigateToFrame: (frameId: string) => void;
}

export function StepCard({
  workspaceId,
  frame,
  technicalDetails,
  onPreviewBranch,
  onPrepareRerun,
  onNavigateToFrame,
}: StepCardProps) {
  const [source, setSource] = useState<SourceSnippet | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    setSource(null);
    setShowSource(false);
  }, [frame.id]);

  async function toggleSource() {
    if (source) {
      setShowSource((v) => !v);
      return;
    }
    try {
      const s = await fetchWorkspaceSource(workspaceId, frame.file, frame.line);
      setSource(s);
      setShowSource(true);
    } catch {
      // best-effort
    }
  }

  return (
    <div className="space-y-5 animate-fade-in" key={frame.id}>
      {/* Header */}
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <FrameTypeBadge type={frame.type} />
          <h2 className="text-xl font-bold text-rsd-text">{frame.title}</h2>
        </div>
        <p className="text-sm text-rsd-text/80 leading-relaxed">{frame.description}</p>
      </div>

      {/* Branch decisions as "doors" */}
      {frame.branch && (
        <section className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">
            Decision Point
          </h3>
          <p className="text-sm text-rsd-text leading-relaxed">{frame.branch.explanation}</p>

          <div className="grid grid-cols-1 gap-2">
            {frame.branch.options.map((option) => (
              <button
                key={option.id}
                onClick={() => onPreviewBranch(option)}
                className={`
                  group w-full text-left rounded-xl border px-4 py-3 transition-all
                  ${option.taken
                    ? 'border-rsd-branch/40 bg-rsd-branch/10'
                    : 'border-rsd-border hover:border-rsd-branch-alt/30 hover:bg-rsd-branch-alt/5'
                  }
                `}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className={`text-sm ${option.taken ? 'text-rsd-branch' : 'text-rsd-muted'}`}>
                      {option.taken ? '✓' : '○'}
                    </span>
                    <div>
                      <div className={`text-sm font-medium ${option.taken ? 'text-rsd-text' : 'text-rsd-text/80'}`}>
                        {option.label}
                      </div>
                      <div className="text-xs text-rsd-muted mt-0.5">{option.description}</div>
                    </div>
                  </div>
                  {option.taken ? (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-rsd-branch/20 text-rsd-branch shrink-0">
                      taken
                    </span>
                  ) : (
                    <span className="text-xs text-rsd-muted group-hover:text-rsd-branch-alt transition-colors shrink-0">
                      explore →
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          <button
            onClick={() => onPrepareRerun(frame)}
            className="text-xs px-3 py-1.5 rounded-lg border border-rsd-border text-rsd-muted hover:text-rsd-text hover:border-rsd-accent/30 transition-colors"
          >
            Re-run with different inputs to try another path
          </button>
        </section>
      )}

      {/* Side effects */}
      {frame.sideEffects.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">
            Side Effects
          </h3>
          <div className="flex flex-wrap gap-2">
            {frame.sideEffects.map((se, i) => (
              <div
                key={`${se.type}_${i}`}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rsd-side-effect/20 bg-rsd-side-effect/5"
              >
                <SideEffectIcon type={se.type} />
                <div>
                  <div className="text-xs font-medium text-rsd-text">{se.description}</div>
                  <div className="text-[11px] text-rsd-muted">{friendlySideEffectLabel(se.type)}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Return value */}
      {frame.returnValue !== undefined && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">
            Return Value
          </h3>
          <div className="rounded-lg border border-rsd-border bg-rsd-bg px-4 py-3">
            <p className="text-sm text-rsd-text">{friendlyValue(frame.returnValue)}</p>
            {technicalDetails && (
              <pre className="mt-2 text-xs font-mono text-rsd-text/70 whitespace-pre-wrap break-all">
                {JSON.stringify(frame.returnValue, null, 2)}
              </pre>
            )}
          </div>
        </section>
      )}

      {/* State snapshot */}
      {Object.keys(frame.state).length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">
            State at this point
          </h3>
          <div className="rounded-lg border border-rsd-border bg-rsd-bg overflow-hidden">
            {Object.entries(frame.state).map(([key, value]) => (
              <div key={key} className="flex border-b border-rsd-border/50 last:border-0 text-xs">
                <span className="px-3 py-2 text-rsd-muted font-mono w-28 shrink-0 bg-rsd-surface/50">{key}</span>
                <span className="px-3 py-2 text-rsd-text break-all">{friendlyValue(value)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Error */}
      {frame.errorMessage && (
        <section className="rounded-xl border border-rsd-error/30 bg-rsd-error/10 px-4 py-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-error mb-1">Error</h3>
          <p className="text-sm text-rsd-error">{frame.errorMessage}</p>
        </section>
      )}

      {/* Async continuation */}
      {frame.asyncContinuationId && (
        <button
          onClick={() => onNavigateToFrame(frame.asyncContinuationId!)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-rsd-async/30 bg-rsd-async/5 text-sm text-rsd-async hover:bg-rsd-async/10 transition-colors"
        >
          <span>◇</span>
          <span>Follow async continuation →</span>
        </button>
      )}

      {/* Source code (technical) */}
      {technicalDetails && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">Source</h3>

          {Object.keys(frame.inputs).length > 0 && (
            <div className="rounded-lg border border-rsd-border bg-rsd-bg overflow-hidden mb-2">
              <div className="px-3 py-1.5 bg-rsd-surface/50 text-[11px] text-rsd-muted font-medium uppercase tracking-wider">Inputs</div>
              {Object.entries(frame.inputs).map(([key, value]) => (
                <div key={key} className="flex border-b border-rsd-border/50 last:border-0 text-xs">
                  <span className="px-3 py-2 text-rsd-muted font-mono w-28 shrink-0">{key}</span>
                  <span className="px-3 py-2 text-rsd-text break-all">{JSON.stringify(value)}</span>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={toggleSource}
            className="text-xs text-rsd-accent hover:text-white transition-colors font-mono"
          >
            {frame.file}:{frame.line} {showSource ? '▾' : '▸'}
          </button>
          {showSource && source && (
            <div className="bg-rsd-bg rounded-lg border border-rsd-border overflow-hidden">
              <div className="px-3 py-1.5 bg-rsd-surface/50 text-xs text-rsd-muted font-mono">{source.file}</div>
              <pre className="text-xs font-mono overflow-x-auto">
                {source.lines.map((line) => (
                  <div
                    key={line.number}
                    className={`px-3 py-0.5 ${line.highlighted ? 'source-line-highlight bg-rsd-accent/10' : ''}`}
                  >
                    <span className="inline-block w-8 text-right text-rsd-muted/40 mr-3 select-none">
                      {line.number}
                    </span>
                    <span className="text-rsd-text">{line.content || ' '}</span>
                  </div>
                ))}
              </pre>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function FrameTypeBadge({ type }: { type: string }) {
  const config: Record<string, { label: string; style: string }> = {
    status: { label: 'STATUS', style: 'bg-slate-500/15 text-slate-300 border-slate-500/20' },
    'function-entry': { label: 'CALL', style: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
    branch: { label: 'BRANCH', style: 'bg-amber-500/15 text-amber-400 border-amber-500/20' },
    'side-effect': { label: 'EFFECT', style: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' },
    'state-snapshot': { label: 'SNAPSHOT', style: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20' },
    log: { label: 'LOG', style: 'bg-orange-500/15 text-orange-300 border-orange-500/20' },
    return: { label: 'RETURN', style: 'bg-green-500/15 text-green-400 border-green-500/20' },
    'await-boundary': { label: 'AWAIT', style: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
    'async-handoff': { label: 'ASYNC', style: 'bg-violet-500/15 text-violet-400 border-violet-500/20' },
    error: { label: 'ERROR', style: 'bg-red-500/15 text-red-400 border-red-500/20' },
  };

  const c = config[type] || { label: 'STEP', style: 'bg-gray-500/15 text-gray-400 border-gray-500/20' };

  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-lg border ${c.style}`}>
      {c.label}
    </span>
  );
}

function SideEffectIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    'db-write': '💾',
    'db-read': '📖',
    'http-call': '🌐',
    'file-write': '📄',
    'event-emit': '📡',
    notification: '🔔',
    log: '📝',
    'state-mutation': '⟳',
  };

  return <span className="text-sm">{icons[type] || '◉'}</span>;
}

function friendlySideEffectLabel(type: string): string {
  const labels: Record<string, string> = {
    'db-write': 'Database write',
    'db-read': 'Database read',
    'http-call': 'HTTP call',
    'file-write': 'File write',
    'event-emit': 'Event emitted',
    notification: 'Notification',
    log: 'Log message',
    'state-mutation': 'State change',
  };
  return labels[type] || 'Side effect';
}

function friendlyValue(value: unknown): string {
  if (value === null) return 'No value';
  if (value === undefined) return 'No value returned';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    if (keys.length === 0) return 'Empty object';
    return keys.slice(0, 4).map((k) => `${k}: ${shortVal((value as Record<string, unknown>)[k])}`).join(', ');
  }
  return String(value);
}

function shortVal(value: unknown): string {
  if (typeof value === 'string') return value.length > 30 ? value.slice(0, 30) + '…' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return '…';
}
