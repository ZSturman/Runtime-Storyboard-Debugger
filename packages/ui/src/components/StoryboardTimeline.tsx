import type { Storyboard, StoryboardFrame } from '../api';

interface StoryboardTimelineProps {
  storyboard: Storyboard;
  selectedFrameId: string | null;
  onSelectFrame: (frame: StoryboardFrame) => void;
}

export function StoryboardTimeline({ storyboard, selectedFrameId, onSelectFrame }: StoryboardTimelineProps) {
  const { frames, metadata } = storyboard;

  return (
    <div className="p-6">
      {/* Storyboard header */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-rsd-text">
          {metadata.scenarioName ? formatName(metadata.scenarioName) : 'Storyboard'}
        </h2>
        <p className="text-xs text-rsd-muted mt-1">
          {metadata.totalFrames} frames · {storyboard.entryPoint.name}
        </p>
      </div>

      {/* Timeline */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-rsd-border" />

        <div className="space-y-1">
          {frames.map((frame, index) => (
            <TimelineFrame
              key={frame.id}
              frame={frame}
              isSelected={frame.id === selectedFrameId}
              isFirst={index === 0}
              isLast={index === frames.length - 1}
              onClick={() => onSelectFrame(frame)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface TimelineFrameProps {
  frame: StoryboardFrame;
  isSelected: boolean;
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
}

function TimelineFrame({ frame, isSelected, onClick }: TimelineFrameProps) {
  const config = frameTypeConfig[frame.type] || frameTypeConfig.default;

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left relative pl-12 pr-4 py-3 rounded-lg transition-all
        ${isSelected
          ? 'bg-rsd-accent/10 border border-rsd-accent/30'
          : 'hover:bg-rsd-border/30 border border-transparent'
        }
      `}
    >
      {/* Timeline dot */}
      <div className={`
        absolute left-3.5 top-4 w-3 h-3 rounded-full border-2 z-10
        ${isSelected ? 'border-rsd-accent bg-rsd-accent' : `border-current ${config.dotColor}`}
      `} />

      {/* Async connector */}
      {frame.type === 'async-handoff' && (
        <div className="absolute left-4.5 -top-1 w-2 border-t-2 border-dashed border-rsd-async" />
      )}

      {/* Content */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${config.badge}`}>
              {config.label}
            </span>
            <span className="text-sm font-medium text-rsd-text truncate">
              {frame.title}
            </span>
          </div>

          <p className="text-xs text-rsd-muted line-clamp-2 mt-0.5">
            {frame.description}
          </p>

          {/* Side effect badges */}
          {frame.sideEffects.length > 0 && (
            <div className="flex gap-1.5 mt-1.5">
              {frame.sideEffects.map((se, i) => (
                <span key={i} className="inline-flex items-center text-xs text-rsd-side-effect bg-rsd-side-effect/10 px-1.5 py-0.5 rounded">
                  {sideEffectLabel(se.type)}
                </span>
              ))}
            </div>
          )}

          {/* Branch indicator */}
          {frame.branch && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span className={`text-xs px-1.5 py-0.5 rounded ${frame.branch.taken ? 'bg-rsd-branch/10 text-rsd-branch' : 'bg-rsd-branch-alt/10 text-rsd-branch-alt'}`}>
                {frame.branch.taken ? 'condition met' : 'condition not met'}
              </span>
            </div>
          )}
        </div>

        {/* Source location */}
        <span className="text-xs text-rsd-muted/60 font-mono shrink-0 mt-0.5">
          {frame.file ? `${shortFile(frame.file)}:${frame.line}` : ''}
        </span>
      </div>
    </button>
  );
}

const frameTypeConfig: Record<string, { label: string; badge: string; dotColor: string }> = {
  'function-entry': {
    label: 'CALL',
    badge: 'bg-blue-500/10 text-blue-400',
    dotColor: 'text-blue-400',
  },
  'return': {
    label: 'RETURN',
    badge: 'bg-green-500/10 text-green-400',
    dotColor: 'text-green-400',
  },
  'branch': {
    label: 'BRANCH',
    badge: 'bg-amber-500/10 text-amber-400',
    dotColor: 'text-amber-400',
  },
  'side-effect': {
    label: 'EFFECT',
    badge: 'bg-emerald-500/10 text-emerald-400',
    dotColor: 'text-emerald-400',
  },
  'await-boundary': {
    label: 'AWAIT',
    badge: 'bg-purple-500/10 text-purple-400',
    dotColor: 'text-purple-400',
  },
  'async-handoff': {
    label: 'ASYNC',
    badge: 'bg-violet-500/10 text-violet-400',
    dotColor: 'text-violet-400',
  },
  'error': {
    label: 'ERROR',
    badge: 'bg-red-500/10 text-red-400',
    dotColor: 'text-red-400',
  },
  default: {
    label: 'STEP',
    badge: 'bg-gray-500/10 text-gray-400',
    dotColor: 'text-gray-400',
  },
};

function sideEffectLabel(type: string): string {
  const labels: Record<string, string> = {
    'db-write': '💾 DB Write',
    'db-read': '📖 DB Read',
    'http-call': '🌐 HTTP',
    'file-write': '📝 File',
    'event-emit': '📡 Event',
    'log': '📋 Log',
    'state-mutation': '🔄 State',
    'notification': '📧 Notify',
  };
  return labels[type] || '◉ Effect';
}

function shortFile(file: string): string {
  const parts = file.split('/');
  return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : file;
}

function formatName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
