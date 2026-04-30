import { useEffect, useState } from 'react';

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

interface TourStep {
  badge: string;
  title: string;
  body: string;
}

const STEPS: TourStep[] = [
  {
    badge: 'Step 1 · Overview',
    title: 'You are looking at what RSD found',
    body:
      'RSD ingested the repo and surfaced everything it can reason about statically: entry points (routes and exported functions), suggested places to start, attention items, and detected scripts.',
  },
  {
    badge: 'Step 2 · Start here',
    title: 'Pick a place to start',
    body:
      'The "Start here" list ranks the most useful entry points to trace first. Click one to open it — you can always come back and pick another. Browse "Entry points" if you want every detected option.',
  },
  {
    badge: 'Step 3 · Configure',
    title: 'Provide inputs, see the path',
    body:
      'On the Configure screen, fill in the required fields (or load an example). The flow map on the right shows every branch this entry point can take. Hit "Show advanced" only if you need optional fields or execution flags.',
  },
  {
    badge: 'Step 4 · Run',
    title: 'Watch it explain itself',
    body:
      'When you Run, RSD traces the actual execution and turns it into a timeline of steps you can scrub. Each step shows what happened, what changed, and why a branch went the way it did. Use ←/→ to step through and ? for shortcuts.',
  },
];

const STORAGE_KEY = 'rsd:onboarding-tour-seen';

export function shouldShowTour(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(STORAGE_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markTourSeen(): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // best-effort
  }
}

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    if (open) setStepIndex(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        markTourSeen();
        onClose();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setStepIndex((index) => Math.min(STEPS.length - 1, index + 1));
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setStepIndex((index) => Math.max(0, index - 1));
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;

  function finish() {
    markTourSeen();
    onClose();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Welcome tour"
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm p-4 sm:items-center"
    >
      <div className="relative w-full max-w-lg rounded-3xl border border-rsd-border bg-rsd-surface/95 p-6 shadow-2xl shadow-black/40">
        <div className="flex items-start justify-between gap-3">
          <div className="text-[11px] uppercase tracking-[0.18em] text-rsd-accent">{step.badge}</div>
          <button
            onClick={finish}
            className="text-xs text-rsd-muted hover:text-rsd-text"
            aria-label="Skip tour"
          >
            Skip
          </button>
        </div>

        <h2 className="mt-3 text-lg font-bold text-rsd-text">{step.title}</h2>
        <p className="mt-2 text-sm leading-6 text-rsd-text/85">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, index) => (
              <button
                key={index}
                onClick={() => setStepIndex(index)}
                aria-label={`Go to step ${index + 1}`}
                className={`rounded-full transition-all ${
                  index === stepIndex ? 'w-2.5 h-2.5 bg-rsd-accent' : 'w-1.5 h-1.5 bg-rsd-border hover:bg-rsd-muted'
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setStepIndex((index) => Math.max(0, index - 1))}
              disabled={stepIndex === 0}
              className="rounded-xl border border-rsd-border px-3 py-1.5 text-xs text-rsd-muted disabled:opacity-30 disabled:pointer-events-none hover:text-rsd-text"
            >
              Back
            </button>
            {isLast ? (
              <button
                onClick={finish}
                className="rounded-xl bg-rsd-accent px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rsd-accent/20 hover:opacity-90"
              >
                Got it
              </button>
            ) : (
              <button
                onClick={() => setStepIndex((index) => Math.min(STEPS.length - 1, index + 1))}
                className="rounded-xl bg-rsd-accent px-4 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rsd-accent/20 hover:opacity-90"
              >
                Next →
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
