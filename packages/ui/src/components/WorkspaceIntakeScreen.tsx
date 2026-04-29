interface WorkspaceIntakeScreenProps {
  sourceType: 'local-path' | 'github-url';
  sourceValue: string;
  error: string | null;
  onChangeSourceType: (value: 'local-path' | 'github-url') => void;
  onChangeSourceValue: (value: string) => void;
  onCreateWorkspace: () => void;
}

export function WorkspaceIntakeScreen({
  sourceType,
  sourceValue,
  error,
  onChangeSourceType,
  onChangeSourceValue,
  onCreateWorkspace,
}: WorkspaceIntakeScreenProps) {
  return (
    <div className="min-h-screen px-6 py-10 phase-enter">
      <div className="max-w-5xl mx-auto grid lg:grid-cols-[1.2fr,0.8fr] gap-8 items-start">
        <section className="rounded-3xl border border-rsd-border bg-rsd-surface/70 p-8 shadow-2xl shadow-black/20">
          <div className="inline-flex items-center gap-2 rounded-full border border-rsd-accent/30 bg-rsd-accent/10 px-3 py-1 text-xs text-rsd-accent">
            Visible reasoning first
          </div>
          <h1 className="mt-5 text-4xl font-bold tracking-tight text-rsd-text">
            Open a repo and watch it explain itself
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-rsd-text/80">
            Point Runtime Storyboard Debugger at a local folder or a public GitHub repo. It will ingest the codebase,
            detect likely entry points and user journeys, and then let you trace a run step by step with branch reasons,
            snapshots, waits, outputs, and fallbacks when runtime execution is incomplete.
          </p>

          <div className="mt-8 grid sm:grid-cols-2 gap-3">
            <button
              onClick={() => onChangeSourceType('local-path')}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                sourceType === 'local-path'
                  ? 'border-rsd-accent/40 bg-rsd-accent/10'
                  : 'border-rsd-border bg-rsd-bg/30 hover:border-rsd-accent/20'
              }`}
            >
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Local path</div>
              <div className="mt-2 text-lg font-semibold text-rsd-text">Analyze a folder on this machine</div>
              <div className="mt-2 text-sm text-rsd-muted">Best for direct runtime tracing and quick iteration.</div>
            </button>
            <button
              onClick={() => onChangeSourceType('github-url')}
              className={`rounded-2xl border p-4 text-left transition-colors ${
                sourceType === 'github-url'
                  ? 'border-rsd-accent/40 bg-rsd-accent/10'
                  : 'border-rsd-border bg-rsd-bg/30 hover:border-rsd-accent/20'
              }`}
            >
              <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">GitHub URL</div>
              <div className="mt-2 text-lg font-semibold text-rsd-text">Ingest a public repository</div>
              <div className="mt-2 text-sm text-rsd-muted">Static analysis runs immediately. Runtime is explicit opt-in.</div>
            </button>
          </div>

          <div className="mt-8">
            <label className="block text-xs uppercase tracking-[0.2em] text-rsd-muted mb-2">
              {sourceType === 'local-path' ? 'Directory path' : 'Repository URL'}
            </label>
            <input
              value={sourceValue}
              onChange={(event) => onChangeSourceValue(event.target.value)}
              placeholder={sourceType === 'local-path' ? '/Users/you/project' : 'https://github.com/owner/repo/tree/main'}
              className="w-full rounded-2xl border border-rsd-border bg-rsd-bg/60 px-4 py-4 text-sm text-rsd-text focus:outline-none focus:ring-2 focus:ring-rsd-accent/30"
            />
            {sourceType === 'github-url' && (
              <div className="mt-3 rounded-2xl border border-rsd-border/70 bg-rsd-bg/30 px-4 py-3 text-xs leading-6 text-rsd-muted">
                Accepted forms: <code>https://github.com/owner/repo</code>, <code>.../repo.git</code>, <code>.../tree/main</code>, and <code>.../blob/main/path/to/file.ts</code>.
                Tree and blob URLs keep the repo-wide analysis but remember the focused subpath as a starting hint.
              </div>
            )}
          </div>

          {error && (
            <div className="mt-4 rounded-2xl border border-rsd-error/30 bg-rsd-error/10 px-4 py-3 text-sm text-rsd-error">
              {error}
            </div>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={onCreateWorkspace}
              className="rounded-2xl bg-rsd-accent px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-rsd-accent/20 transition-opacity hover:opacity-90"
            >
              Create workspace
            </button>
            <p className="text-xs text-rsd-muted">
              The non-LLM path is the default. LLM help stays optional and session-only.
            </p>
          </div>
        </section>

        <aside className="rounded-3xl border border-rsd-border bg-rsd-bg/40 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-rsd-muted">What you’ll see</h2>
          <div className="mt-5 space-y-4">
            {[
              ['Repo ingestion', 'Clone or validate the source and surface progress instead of a blank wait state.'],
              ['Automatic understanding', 'Entry points, routes, startup files, scripts, blockers, and likely journeys appear first.'],
              ['Live execution', 'Current step, current function, branches, snapshots, waits, returns, and logs update while the run is happening.'],
              ['Graceful fallback', 'If runtime tracing stalls or fails, static analysis stays visible with a blocker explanation.'],
            ].map(([title, detail]) => (
              <div key={title} className="rounded-2xl border border-rsd-border/70 bg-rsd-surface/50 p-4">
                <div className="text-sm font-semibold text-rsd-text">{title}</div>
                <div className="mt-1 text-xs leading-6 text-rsd-muted">{detail}</div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
