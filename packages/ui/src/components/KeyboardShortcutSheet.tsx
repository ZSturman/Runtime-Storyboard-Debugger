import { useEffect } from 'react';

interface KeyboardShortcutSheetProps {
  open: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: Array<{ keys: string[]; description: string }>;
}

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Live execution',
    shortcuts: [
      { keys: ['←'], description: 'Previous step' },
      { keys: ['→'], description: 'Next step' },
      { keys: ['↑'], description: 'Jump back 5 steps' },
      { keys: ['↓'], description: 'Jump forward 5 steps' },
      { keys: ['F'], description: 'Focus flow map' },
      { keys: ['/'], description: 'Filter the timeline' },
      { keys: ['C'], description: 'Re-run with different inputs' },
      { keys: ['B'], description: 'Back to workspace overview' },
    ],
  },
  {
    title: 'Anywhere',
    shortcuts: [
      { keys: ['?'], description: 'Open this shortcut sheet' },
      { keys: ['Esc'], description: 'Close overlays / clear filter' },
    ],
  },
];

export function KeyboardShortcutSheet({ open, onClose }: KeyboardShortcutSheetProps) {
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-xl rounded-3xl border border-rsd-border bg-rsd-surface/95 p-6 shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Keyboard shortcuts</div>
            <h2 className="mt-1 text-xl font-bold text-rsd-text">Move faster</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-rsd-border px-3 py-1.5 text-xs text-rsd-muted hover:text-rsd-text"
            aria-label="Close shortcut sheet"
          >
            Esc
          </button>
        </div>

        <div className="mt-5 grid gap-5">
          {GROUPS.map((group) => (
            <section key={group.title}>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rsd-muted">
                {group.title}
              </h3>
              <div className="mt-2 divide-y divide-rsd-border/50 rounded-2xl border border-rsd-border bg-rsd-bg/40">
                {group.shortcuts.map((shortcut) => (
                  <div key={shortcut.description} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="text-sm text-rsd-text/85">{shortcut.description}</span>
                    <span className="flex items-center gap-1">
                      {shortcut.keys.map((key) => (
                        <kbd
                          key={key}
                          className="rounded-md border border-rsd-border bg-rsd-surface/80 px-2 py-0.5 text-[11px] font-mono text-rsd-text shadow-sm"
                        >
                          {key}
                        </kbd>
                      ))}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="mt-5 text-[11px] leading-5 text-rsd-muted">
          Shortcuts are ignored while typing in inputs. Press <kbd className="rounded border border-rsd-border px-1 font-mono">?</kbd> any time to reopen this sheet.
        </p>
      </div>
    </div>
  );
}
