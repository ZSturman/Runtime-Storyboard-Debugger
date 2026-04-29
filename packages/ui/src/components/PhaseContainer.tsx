import type { ReactNode } from 'react';

interface PhaseContainerProps {
  children: ReactNode;
  technicalDetails: boolean;
  onToggleTechnicalDetails: () => void;
  showTechnicalToggle?: boolean;
}

export function PhaseContainer({
  children,
  technicalDetails,
  onToggleTechnicalDetails,
  showTechnicalToggle = true,
}: PhaseContainerProps) {
  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <header className="h-11 bg-rsd-surface/80 backdrop-blur-sm border-b border-rsd-border/50 flex items-center justify-between px-5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-rsd-accent" />
          <span className="text-sm font-semibold tracking-wide text-rsd-text">RSD</span>
          <span className="text-xs text-rsd-muted hidden sm:inline">Runtime Storyboard Debugger</span>
        </div>
        {showTechnicalToggle && (
          <button
            onClick={onToggleTechnicalDetails}
            className={`text-xs px-3 py-1 rounded-lg border transition-colors ${
              technicalDetails
                ? 'border-rsd-accent/30 bg-rsd-accent/10 text-rsd-accent'
                : 'border-rsd-border text-rsd-muted hover:text-rsd-text'
            }`}
          >
            {technicalDetails ? '⚙ Technical' : '⚙'}
          </button>
        )}
      </header>

      {/* Phase content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
