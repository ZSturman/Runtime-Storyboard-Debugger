interface StepNavigationProps {
  currentIndex: number;
  totalSteps: number;
  onPrevious: () => void;
  onNext: () => void;
  onJumpTo: (index: number) => void;
  onStartOver: () => void;
  onReconfigure: () => void;
  onOpenShortcutSheet?: () => void;
}

export function StepNavigation({
  currentIndex,
  totalSteps,
  onPrevious,
  onNext,
  onJumpTo,
  onStartOver,
  onReconfigure,
  onOpenShortcutSheet,
}: StepNavigationProps) {
  const hasPrevious = currentIndex > 0;
  const hasNext = currentIndex < totalSteps - 1;

  return (
    <div className="border-t border-rsd-border/50 bg-rsd-surface/60 backdrop-blur-sm px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Prev */}
        <button
          onClick={onPrevious}
          disabled={!hasPrevious}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-rsd-border text-sm text-rsd-text hover:bg-rsd-border/30 disabled:opacity-30 disabled:pointer-events-none transition-colors min-w-[120px]"
        >
          <span>←</span>
          <span>Previous</span>
        </button>

        {/* Center: Progress dots + counter */}
        <div className="flex flex-col items-center gap-1.5">
          <span className="text-xs text-rsd-muted">
            Step {currentIndex + 1} of {totalSteps}
          </span>
          <div className="flex items-center gap-1">
            {totalSteps <= 12 ? (
              Array.from({ length: totalSteps }, (_, i) => (
                <button
                  key={i}
                  onClick={() => onJumpTo(i)}
                  className={`
                    rounded-full transition-all
                    ${i === currentIndex
                      ? 'w-2.5 h-2.5 bg-rsd-accent'
                      : 'w-1.5 h-1.5 bg-rsd-border hover:bg-rsd-muted'
                    }
                  `}
                  title={`Step ${i + 1}`}
                />
              ))
            ) : (
              /* Condensed: show first, around current, and last */
              <CondensedDots
                currentIndex={currentIndex}
                totalSteps={totalSteps}
                onJumpTo={onJumpTo}
              />
            )}
          </div>
        </div>

        {/* Right: Next */}
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rsd-accent text-sm text-white font-medium hover:opacity-90 disabled:opacity-30 disabled:pointer-events-none transition-opacity min-w-[120px] justify-center"
        >
          <span>Next</span>
          <span>→</span>
        </button>
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <button
          onClick={onReconfigure}
          className="text-xs text-rsd-muted hover:text-rsd-accent transition-colors"
        >
          Re-run with different inputs
        </button>
        <span className="text-rsd-border">·</span>
        <button
          onClick={onStartOver}
          className="text-xs text-rsd-muted hover:text-rsd-text transition-colors"
        >
          Start over
        </button>
        {onOpenShortcutSheet && (
          <>
            <span className="text-rsd-border">·</span>
            <button
              onClick={onOpenShortcutSheet}
              className="text-xs text-rsd-muted hover:text-rsd-text transition-colors flex items-center gap-1.5"
              title="Open keyboard shortcuts (?)"
            >
              <kbd className="rounded border border-rsd-border bg-rsd-bg/60 px-1 font-mono text-[10px]">?</kbd>
              <span>Shortcuts</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function CondensedDots({
  currentIndex,
  totalSteps,
  onJumpTo,
}: {
  currentIndex: number;
  totalSteps: number;
  onJumpTo: (index: number) => void;
}) {
  // Show: [0, 1, ..., current-1, current, current+1, ..., total-2, total-1]
  const visible = new Set<number>();
  visible.add(0);
  visible.add(totalSteps - 1);
  for (let i = Math.max(0, currentIndex - 1); i <= Math.min(totalSteps - 1, currentIndex + 1); i++) {
    visible.add(i);
  }

  const sorted = Array.from(visible).sort((a, b) => a - b);
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const idx = sorted[i];

    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      elements.push(
        <span key={`gap-${idx}`} className="text-[10px] text-rsd-muted px-0.5">…</span>
      );
    }

    elements.push(
      <button
        key={idx}
        onClick={() => onJumpTo(idx)}
        className={`
          rounded-full transition-all
          ${idx === currentIndex
            ? 'w-2.5 h-2.5 bg-rsd-accent'
            : 'w-1.5 h-1.5 bg-rsd-border hover:bg-rsd-muted'
          }
        `}
        title={`Step ${idx + 1}`}
      />
    );
  }

  return <>{elements}</>;
}
