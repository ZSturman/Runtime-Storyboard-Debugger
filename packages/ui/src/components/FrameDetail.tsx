import { useState, useEffect } from 'react';
import type { StoryboardFrame, SourceSnippet } from '../api';
import { fetchSource } from '../api';

interface FrameDetailProps {
  frame: StoryboardFrame;
  onNavigateToFrame: (frameId: string) => void;
}

export function FrameDetail({ frame, onNavigateToFrame }: FrameDetailProps) {
  const [source, setSource] = useState<SourceSnippet | null>(null);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    setSource(null);
    setShowSource(false);
  }, [frame.id]);

  async function loadSource() {
    if (source) {
      setShowSource(!showSource);
      return;
    }
    try {
      const s = await fetchSource(frame.file, frame.line);
      setSource(s);
      setShowSource(true);
    } catch {
      // Source loading is best-effort
    }
  }

  return (
    <div className="p-4 space-y-5">
      {/* Frame header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <FrameTypeBadge type={frame.type} />
          <h3 className="text-sm font-semibold text-rsd-text">{frame.title}</h3>
        </div>
        <p className="text-xs text-rsd-muted">{frame.description}</p>
      </div>

      {/* Function info */}
      {frame.functionName && (
        <Section title="Function">
          <code className="text-xs font-mono text-rsd-accent">{frame.functionName}()</code>
          {frame.file && (
            <button
              onClick={loadSource}
              className="block text-xs text-rsd-muted hover:text-rsd-accent mt-1 font-mono transition-colors"
            >
              {frame.file}:{frame.line} {showSource ? '▾' : '▸'}
            </button>
          )}
        </Section>
      )}

      {/* Source code */}
      {showSource && source && (
        <div className="bg-rsd-bg rounded-lg border border-rsd-border overflow-hidden">
          <div className="px-3 py-1.5 bg-rsd-border/30 text-xs text-rsd-muted font-mono">
            {source.file}
          </div>
          <pre className="text-xs font-mono overflow-x-auto">
            {source.lines.map((line) => (
              <div
                key={line.number}
                className={`px-3 py-0.5 ${line.highlighted ? 'source-line-highlight bg-rsd-accent/10' : ''}`}
              >
                <span className="inline-block w-8 text-right text-rsd-muted/40 mr-3 select-none">
                  {line.number}
                </span>
                <span className="text-rsd-text">{line.content}</span>
              </div>
            ))}
          </pre>
        </div>
      )}

      {/* Inputs */}
      {Object.keys(frame.inputs).length > 0 && (
        <Section title="Inputs">
          <DataTable data={frame.inputs} />
        </Section>
      )}

      {/* Branch info */}
      {frame.branch && <BranchSection branch={frame.branch} />}

      {/* State */}
      {Object.keys(frame.state).length > 0 && (
        <Section title="State">
          <DataTable data={frame.state} />
        </Section>
      )}

      {/* Side effects */}
      {frame.sideEffects.length > 0 && (
        <Section title="Side Effects">
          <div className="space-y-2">
            {frame.sideEffects.map((se, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="text-rsd-side-effect shrink-0 mt-0.5">◉</span>
                <div>
                  <span className="text-rsd-text font-medium">{se.description}</span>
                  <span className="text-rsd-muted ml-1.5">({se.type})</span>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Return value */}
      {frame.returnValue !== undefined && (
        <Section title="Return Value">
          <code className="text-xs font-mono text-rsd-success break-all">
            {JSON.stringify(frame.returnValue, null, 2)}
          </code>
        </Section>
      )}

      {/* Error */}
      {frame.errorMessage && (
        <Section title="Error">
          <p className="text-xs text-rsd-error">{frame.errorMessage}</p>
        </Section>
      )}

      {/* Navigation */}
      <div className="flex gap-2 pt-2 border-t border-rsd-border">
        {frame.nextFrameId && (
          <NavButton label="Next →" onClick={() => onNavigateToFrame(frame.nextFrameId!)} />
        )}
        {frame.asyncContinuationId && (
          <NavButton
            label="Async continuation ⇢"
            onClick={() => onNavigateToFrame(frame.asyncContinuationId!)}
            variant="async"
          />
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-rsd-muted uppercase tracking-wider mb-2">{title}</h4>
      {children}
    </div>
  );
}

function BranchSection({ branch }: { branch: StoryboardFrame['branch'] }) {
  if (!branch) return null;

  return (
    <Section title="Why This Path?">
      <div className="space-y-2">
        <div className="text-xs">
          <span className="text-rsd-muted">Condition: </span>
          <code className="font-mono text-rsd-branch">{branch.conditionSource}</code>
        </div>

        {Object.keys(branch.conditionValues).length > 0 && (
          <div className="text-xs">
            <span className="text-rsd-muted">Values: </span>
            <DataTable data={branch.conditionValues} />
          </div>
        )}

        <div className="text-xs">
          <span className="text-rsd-muted">Result: </span>
          <span className={branch.taken ? 'text-rsd-branch' : 'text-rsd-branch-alt'}>
            {branch.taken ? 'true — primary branch taken' : 'false — alternate branch taken'}
          </span>
        </div>

        <p className="text-xs text-rsd-text/80 leading-relaxed bg-rsd-bg rounded p-2 border border-rsd-border">
          {branch.explanation}
        </p>

        {branch.alternateDescription && (
          <p className="text-xs text-rsd-muted italic">
            Alternate: {branch.alternateDescription}
          </p>
        )}
      </div>
    </Section>
  );
}

function DataTable({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="bg-rsd-bg rounded border border-rsd-border">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex border-b border-rsd-border last:border-0 text-xs">
          <span className="px-2 py-1.5 text-rsd-muted font-mono w-28 shrink-0 bg-rsd-border/20">
            {key}
          </span>
          <span className="px-2 py-1.5 text-rsd-text font-mono break-all">
            {formatValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function NavButton({ label, onClick, variant = 'default' }: { label: string; onClick: () => void; variant?: string }) {
  const styles = variant === 'async'
    ? 'border-rsd-async/30 text-rsd-async hover:bg-rsd-async/10'
    : 'border-rsd-border text-rsd-text hover:bg-rsd-border/50';

  return (
    <button
      onClick={onClick}
      className={`text-xs px-3 py-1.5 rounded border transition-colors ${styles}`}
    >
      {label}
    </button>
  );
}

function FrameTypeBadge({ type }: { type: string }) {
  const config: Record<string, string> = {
    'function-entry': 'bg-blue-500/20 text-blue-400',
    'return': 'bg-green-500/20 text-green-400',
    'branch': 'bg-amber-500/20 text-amber-400',
    'side-effect': 'bg-emerald-500/20 text-emerald-400',
    'await-boundary': 'bg-purple-500/20 text-purple-400',
    'async-handoff': 'bg-violet-500/20 text-violet-400',
    'error': 'bg-red-500/20 text-red-400',
  };

  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${config[type] || 'bg-gray-500/20 text-gray-400'}`}>
      {type.replace(/-/g, ' ').toUpperCase()}
    </span>
  );
}

function formatValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value, null, 1);
  } catch {
    return String(value);
  }
}
