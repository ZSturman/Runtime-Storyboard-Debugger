import type { WorkspaceSession } from '../api';
import { EmptyState } from './EmptyState';
import { LlmAssistPanel } from './LlmAssistPanel';

interface WorkspaceOverviewScreenProps {
  workspace: WorkspaceSession;
  selectedEntryPointId: string | null;
  technicalDetails: boolean;
  onCreateAnother: () => void;
  onSelectEntryPoint: (entryPointId: string) => void;
  onShowTour?: () => void;
}

export function WorkspaceOverviewScreen({
  workspace,
  selectedEntryPointId,
  technicalDetails,
  onCreateAnother,
  onSelectEntryPoint,
  onShowTour,
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
                {workspace.entryPoints.length} entry points, {workspace.likelyJourneys.length} suggested starts, {workspace.unfinishedWork.length} attention items.
              </p>
            </div>
            <button
              onClick={onCreateAnother}
              className="rounded-xl border border-rsd-border px-3 py-2 text-xs text-rsd-muted transition-colors hover:text-rsd-text"
            >
              New workspace
            </button>
          </div>

          {onShowTour && (
            <div className="mt-3">
              <button
                onClick={onShowTour}
                className="text-xs text-rsd-muted hover:text-rsd-accent transition-colors underline-offset-2 hover:underline"
              >
                Show welcome tour
              </button>
            </div>
          )}

          <div className="mt-6">
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Start here</div>
              <span
                className="text-rsd-muted/70 text-[11px]"
                title="Routes, exported functions, and startup files RSD recommends tracing first based on static analysis."
              >
                ⓘ
              </span>
            </div>
            <div className="mt-3 space-y-3">
              {workspace.likelyJourneys.length === 0 && (
                <EmptyState
                  icon={<span aria-hidden>✨</span>}
                  title="No suggested starting points yet"
                  description="RSD couldn't auto-rank a journey for this workspace, but you can still pick any entry point on the right."
                  hints={[
                    'Routes and exported functions appear under "Entry points".',
                    'Add JSDoc, route handlers, or named exports to help RSD highlight a path next time.',
                  ]}
                />
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
              <div className="flex items-center gap-2">
                <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Entry points</div>
                <span
                  className="text-rsd-muted/70 text-[11px]"
                  title="Places where execution can start: HTTP routes, exported functions, and main scripts."
                >
                  ⓘ
                </span>
              </div>
              <p className="mt-2 text-sm text-rsd-muted">
                Pick a route, exported function, or startup path to configure and trace.
              </p>
            </div>
            {technicalDetails && (
              <div className="text-xs text-rsd-muted">{workspace.cacheState.replace(/-/g, ' ')}</div>
            )}
          </div>

          <div className="mt-5 grid gap-3">
            {workspace.entryPoints.length === 0 && (
              <EmptyState
                tone="caution"
                icon={<span aria-hidden>🔍</span>}
                title="No entry points detected"
                description="RSD scanned the workspace but didn't find HTTP routes, exported functions, or startup files it can trace."
                hints={[
                  'Confirm the path passed to --target points at the project root, not a subfolder of generated output.',
                  'Make sure functions are exported (named or default) so RSD can call them.',
                  'Express routes are detected when the app or router is exported as default.',
                ]}
                actions={[{ label: 'Choose a different workspace', onClick: onCreateAnother }]}
              />
            )}
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
            <div className="flex items-center gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Setup needed</div>
              <span
                className="text-rsd-muted/70 text-[11px]"
                title="Things RSD detected that may prevent runtime tracing — missing env vars, install steps, or unsupported runtimes."
              >
                ⓘ
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {workspace.runtimeBlockers.length === 0 && (
                <EmptyState
                  tone="positive"
                  icon={<span aria-hidden>✓</span>}
                  title="Ready to trace"
                  description="No setup blockers detected. You can run any supported route or exported function."
                />
              )}
              {workspace.runtimeBlockers.map((blocker) => (
                <div key={blocker.id} className="rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-4">
                  <div className="flex items-start gap-2">
                    <span aria-hidden className="mt-0.5 text-amber-300">!</span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-rsd-text">{blocker.title}</div>
                      <div className="mt-1 text-xs leading-6 text-rsd-muted">{blocker.detail}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {workspace.detectedScripts.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center gap-2">
                  <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Detected scripts</div>
                  <span
                    className="text-rsd-muted/70 text-[11px]"
                    title="Scripts RSD found in package.json that you might want to run to set up the project before tracing."
                  >
                    ⓘ
                  </span>
                </div>
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
