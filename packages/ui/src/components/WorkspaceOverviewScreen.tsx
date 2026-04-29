import type { WorkspaceSession } from '../api';
import { LlmAssistPanel } from './LlmAssistPanel';

interface WorkspaceOverviewScreenProps {
  workspace: WorkspaceSession;
  selectedEntryPointId: string | null;
  technicalDetails: boolean;
  onCreateAnother: () => void;
  onSelectEntryPoint: (entryPointId: string) => void;
}

export function WorkspaceOverviewScreen({
  workspace,
  selectedEntryPointId,
  technicalDetails,
  onCreateAnother,
  onSelectEntryPoint,
}: WorkspaceOverviewScreenProps) {
  return (
    <div className="min-h-screen px-6 py-6 phase-enter">
      <div className="max-w-7xl mx-auto grid xl:grid-cols-[0.95fr,1.05fr,0.9fr] gap-6">
        <aside className="rounded-3xl border border-rsd-border bg-rsd-surface/60 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Workspace ready</div>
              <h1 className="mt-2 text-2xl font-bold text-rsd-text">{workspace.sourceLabel}</h1>
              <p className="mt-2 text-sm leading-6 text-rsd-muted">
                {workspace.entryPoints.length} entry points, {workspace.likelyJourneys.length} likely journeys, {workspace.unfinishedWork.length} attention items.
              </p>
            </div>
            <button
              onClick={onCreateAnother}
              className="rounded-xl border border-rsd-border px-3 py-2 text-xs text-rsd-muted transition-colors hover:text-rsd-text"
            >
              New workspace
            </button>
          </div>

          <div className="mt-6">
            <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Likely journeys</div>
            <div className="mt-3 space-y-3">
              {workspace.likelyJourneys.length === 0 && (
                <div className="rounded-2xl border border-rsd-border bg-rsd-bg/30 px-4 py-4 text-sm text-rsd-muted">
                  No likely journeys were inferred. Browse entry points directly instead.
                </div>
              )}
              {workspace.likelyJourneys.map((journey) => (
                <div key={journey.id} className="rounded-2xl border border-rsd-border bg-rsd-bg/30 px-4 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-rsd-text">{journey.title}</div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-rsd-muted">{journey.confidence}</span>
                  </div>
                  <div className="mt-2 text-xs leading-6 text-rsd-muted">{journey.summary}</div>
                  {technicalDetails && journey.rationale.length > 0 && (
                    <div className="mt-3 text-[11px] leading-5 text-rsd-muted">
                      {journey.rationale.join(' • ')}
                    </div>
                  )}
                  {journey.entryPointIds[0] && (
                    <button
                      onClick={() => onSelectEntryPoint(journey.entryPointIds[0])}
                      className="mt-3 text-xs text-rsd-accent transition-colors hover:text-white"
                    >
                      Open first traceable path →
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </aside>

        <section className="rounded-3xl border border-rsd-border bg-rsd-bg/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Entry points</div>
              <p className="mt-2 text-sm text-rsd-muted">
                Pick a route, exported function, or startup path to configure and trace.
              </p>
            </div>
            <div className="text-xs text-rsd-muted">{workspace.cacheState.replace(/-/g, ' ')}</div>
          </div>

          <div className="mt-5 grid gap-3">
            {workspace.entryPoints.map((entryPoint) => {
              const runnable = entryPoint.runSupport.status === 'supported';
              const selected = selectedEntryPointId === entryPoint.id;
              return (
                <button
                  key={entryPoint.id}
                  onClick={() => onSelectEntryPoint(entryPoint.id)}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    selected
                      ? 'border-rsd-accent/40 bg-rsd-accent/10'
                      : 'border-rsd-border bg-rsd-surface/50 hover:border-rsd-accent/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-rsd-text">
                        {entryPoint.httpMethod ? `${entryPoint.httpMethod} ${entryPoint.httpPath}` : entryPoint.name}
                      </div>
                      <div className="mt-1 text-xs leading-6 text-rsd-muted">{entryPoint.description}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`text-[10px] uppercase tracking-[0.2em] ${runnable ? 'text-rsd-accent' : 'text-rsd-muted'}`}>
                        {runnable ? 'runnable' : 'preview'}
                      </div>
                      {entryPoint.confidence && (
                        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-rsd-muted">{entryPoint.confidence}</div>
                      )}
                    </div>
                  </div>
                  {technicalDetails && entryPoint.detectionReason && (
                    <div className="mt-3 rounded-xl border border-rsd-border/70 bg-rsd-bg/30 px-3 py-2 text-[11px] text-rsd-muted">
                      {entryPoint.detectionReason}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-6">
          <section className="rounded-3xl border border-rsd-border bg-rsd-surface/50 p-5">
            <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Runtime readiness</div>
            <div className="mt-4 space-y-3">
              {workspace.runtimeBlockers.length === 0 && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-4 text-sm text-emerald-100">
                  No immediate runtime blockers detected. You can start from any supported route or function.
                </div>
              )}
              {workspace.runtimeBlockers.map((blocker) => (
                <div key={blocker.id} className="rounded-2xl border border-rsd-border bg-rsd-bg/30 px-4 py-4">
                  <div className="text-sm font-semibold text-rsd-text">{blocker.title}</div>
                  <div className="mt-1 text-xs leading-6 text-rsd-muted">{blocker.detail}</div>
                </div>
              ))}
            </div>

            {workspace.detectedScripts.length > 0 && (
              <div className="mt-5">
                <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Detected scripts</div>
                <div className="mt-3 space-y-2">
                  {workspace.detectedScripts.slice(0, technicalDetails ? workspace.detectedScripts.length : 5).map((script) => (
                    <div key={script.name} className="rounded-xl border border-rsd-border/70 bg-rsd-bg/30 px-3 py-3 text-xs text-rsd-text">
                      <span className="font-semibold">{script.name}</span>
                      <span className="text-rsd-muted"> — {script.command}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          <LlmAssistPanel workspace={workspace} />
        </div>
      </div>
    </div>
  );
}
