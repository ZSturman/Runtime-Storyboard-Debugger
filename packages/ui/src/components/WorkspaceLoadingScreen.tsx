import type { WorkspaceSession } from '../api';

interface WorkspaceLoadingScreenProps {
  workspace: WorkspaceSession;
  error: string | null;
  onCreateAnother: () => void;
}

export function WorkspaceLoadingScreen({
  workspace,
  error,
  onCreateAnother,
}: WorkspaceLoadingScreenProps) {
  const phases = collapsePhaseHistory(workspace.phaseHistory);

  return (
    <div className="min-h-screen px-6 py-8 phase-enter">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[0.95fr,1.05fr] gap-6">
        <section className="rounded-3xl border border-rsd-border bg-rsd-surface/70 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Workspace</div>
              <h1 className="mt-2 text-2xl font-bold text-rsd-text">{workspace.sourceLabel}</h1>
              <p className="mt-2 text-sm text-rsd-muted">
                {workspace.phaseDetail}
              </p>
            </div>
            <button
              onClick={onCreateAnother}
              className="rounded-xl border border-rsd-border px-3 py-2 text-xs text-rsd-muted transition-colors hover:text-rsd-text"
            >
              New workspace
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-rsd-border bg-rsd-bg/60 p-4">
            <div className="flex items-center justify-between text-xs text-rsd-muted">
              <span>{workspace.phase.replace(/-/g, ' ')}</span>
              <span>{workspace.progress}%</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-rsd-border/70">
              <div
                className="h-2 rounded-full bg-gradient-to-r from-rsd-accent to-emerald-400 transition-all duration-500"
                style={{ width: `${workspace.progress}%` }}
              />
            </div>
          </div>

          {(error || workspace.errors.length > 0) && (
            <div className="mt-5 rounded-2xl border border-rsd-error/30 bg-rsd-error/10 px-4 py-3 text-sm text-rsd-error">
              {error || workspace.errors.at(-1)}
            </div>
          )}

          {workspace.runtimeBlockers.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Early blockers</div>
              {workspace.runtimeBlockers.slice(0, 4).map((blocker) => (
                <div key={blocker.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
                  <div className="text-sm font-medium text-amber-100">{blocker.title}</div>
                  <div className="mt-1 text-xs leading-6 text-amber-100/70">{blocker.detail}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-rsd-border bg-rsd-bg/30 p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Pipeline</div>
          <div className="mt-5 space-y-3">
            {phases.map((phase, index) => (
              <div
                key={`${phase.phase}_${index}`}
                className={`rounded-2xl border px-4 py-4 ${
                  phase.status === 'complete'
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : phase.status === 'failed'
                      ? 'border-rsd-error/30 bg-rsd-error/10'
                      : phase.phase === workspace.phase
                        ? 'border-rsd-accent/30 bg-rsd-accent/10'
                        : 'border-rsd-border bg-rsd-surface/40'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-rsd-text">{friendlyPhase(phase.phase)}</div>
                  <div className="text-[11px] uppercase tracking-[0.2em] text-rsd-muted">{phase.status}</div>
                </div>
                <div className="mt-2 text-xs leading-6 text-rsd-muted">{phase.detail}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function collapsePhaseHistory(history: WorkspaceSession['phaseHistory']) {
  const latest = new Map<string, WorkspaceSession['phaseHistory'][number]>();
  for (const item of history) {
    latest.set(item.phase, item);
  }
  return Array.from(latest.values());
}

function friendlyPhase(phase: string) {
  return phase.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}
