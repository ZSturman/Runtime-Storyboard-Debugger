interface RunningOverlayProps {
  label: string;
  onCancel: () => void;
}

export function RunningOverlay({ label, onCancel }: RunningOverlayProps) {
  return (
    <div className="min-h-screen flex items-center justify-center phase-enter">
      <div className="text-center space-y-8 max-w-sm">
        {/* Spinner */}
        <div className="relative mx-auto w-20 h-20">
          <div className="absolute inset-0 rounded-full border-2 border-rsd-accent/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-rsd-accent animate-spin-slow" />
          <div className="absolute inset-3 rounded-full border-2 border-transparent border-b-rsd-accent/60 animate-spin-slow" style={{ animationDirection: 'reverse', animationDuration: '2s' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-rsd-accent text-lg">▶</span>
          </div>
        </div>

        {/* Status */}
        <div>
          <p className="text-lg font-semibold text-rsd-text">Executing&hellip;</p>
          <p className="text-sm text-rsd-muted mt-1">{label}</p>
          <p className="text-xs text-rsd-muted/60 mt-3">
            Running the instrumented code and capturing execution trace
          </p>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          className="px-6 py-2.5 rounded-xl border border-rsd-border text-sm text-rsd-muted hover:text-rsd-text hover:border-rsd-error/40 hover:bg-rsd-error/5 transition-all"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
