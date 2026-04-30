import type { ReactNode } from 'react';

export type EmptyStateTone = 'neutral' | 'positive' | 'caution';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  primary?: boolean;
}

interface EmptyStateProps {
  tone?: EmptyStateTone;
  icon?: ReactNode;
  title: string;
  description: string;
  hints?: string[];
  actions?: EmptyStateAction[];
  className?: string;
}

const TONE_STYLES: Record<EmptyStateTone, { border: string; bg: string; iconBg: string; iconText: string }> = {
  neutral: {
    border: 'border-rsd-border',
    bg: 'bg-rsd-bg/30',
    iconBg: 'bg-rsd-surface/60',
    iconText: 'text-rsd-muted',
  },
  positive: {
    border: 'border-emerald-500/20',
    bg: 'bg-emerald-500/5',
    iconBg: 'bg-emerald-500/10',
    iconText: 'text-emerald-300',
  },
  caution: {
    border: 'border-amber-500/30',
    bg: 'bg-amber-500/5',
    iconBg: 'bg-amber-500/10',
    iconText: 'text-amber-300',
  },
};

export function EmptyState({
  tone = 'neutral',
  icon,
  title,
  description,
  hints,
  actions,
  className,
}: EmptyStateProps) {
  const styles = TONE_STYLES[tone];

  return (
    <div
      className={`rounded-3xl border ${styles.border} ${styles.bg} px-5 py-6 ${className ?? ''}`}
      role="status"
    >
      <div className="flex items-start gap-4">
        {icon && (
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${styles.iconBg} ${styles.iconText}`}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-rsd-text">{title}</h3>
          <p className="mt-1 text-sm leading-6 text-rsd-muted">{description}</p>

          {hints && hints.length > 0 && (
            <ul className="mt-3 space-y-1.5 text-xs text-rsd-muted">
              {hints.map((hint, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span aria-hidden className="mt-1 h-1 w-1 shrink-0 rounded-full bg-rsd-muted/60" />
                  <span className="leading-5">{hint}</span>
                </li>
              ))}
            </ul>
          )}

          {actions && actions.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {actions.map((action) => (
                <button
                  key={action.label}
                  onClick={action.onClick}
                  className={
                    action.primary
                      ? 'rounded-xl bg-rsd-accent px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rsd-accent/20 hover:opacity-90 transition'
                      : 'rounded-xl border border-rsd-border px-3 py-1.5 text-xs text-rsd-muted hover:text-rsd-text hover:border-rsd-accent/30 transition'
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
