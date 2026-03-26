import type { EntryPoint, Scenario } from '../api';

interface EntryPointPanelProps {
  entryPoints: EntryPoint[];
  scenarios: Scenario[];
  loading: boolean;
  onRunScenario: (path: string) => void;
  running: boolean;
}

export function EntryPointPanel({ entryPoints, scenarios, loading, onRunScenario, running }: EntryPointPanelProps) {
  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-rsd-border rounded w-2/3" />
          <div className="h-3 bg-rsd-border rounded w-full" />
          <div className="h-3 bg-rsd-border rounded w-3/4" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      {/* Scenarios */}
      <section>
        <h3 className="text-xs font-semibold text-rsd-muted uppercase tracking-wider mb-3">
          Scenarios
        </h3>
        <div className="space-y-1">
          {scenarios.map((scenario) => (
            <button
              key={scenario.path}
              onClick={() => onRunScenario(scenario.path)}
              disabled={running}
              className="w-full text-left p-2.5 rounded-lg hover:bg-rsd-border/50 transition-colors group disabled:opacity-50"
            >
              <div className="flex items-center gap-2">
                <ScenarioIcon name={scenario.name} />
                <span className="text-sm font-medium text-rsd-text group-hover:text-white truncate">
                  {formatScenarioName(scenario.name)}
                </span>
              </div>
              {scenario.description && (
                <p className="text-xs text-rsd-muted mt-1 ml-6 line-clamp-2">
                  {scenario.description}
                </p>
              )}
            </button>
          ))}
          {scenarios.length === 0 && (
            <p className="text-xs text-rsd-muted">No scenarios found</p>
          )}
        </div>
      </section>

      {/* Entry Points */}
      <section>
        <h3 className="text-xs font-semibold text-rsd-muted uppercase tracking-wider mb-3">
          Entry Points
        </h3>
        <div className="space-y-1">
          {entryPoints.map((ep) => (
            <div key={ep.id} className="p-2.5 rounded-lg hover:bg-rsd-border/50 transition-colors">
              <div className="flex items-center gap-2">
                <EntryPointIcon type={ep.type} />
                <span className="text-sm font-mono text-rsd-text truncate">{ep.name}</span>
              </div>
              <p className="text-xs text-rsd-muted mt-0.5 ml-6 truncate">
                {ep.file}:{ep.line}
              </p>
            </div>
          ))}
          {entryPoints.length === 0 && (
            <p className="text-xs text-rsd-muted">No entry points discovered</p>
          )}
        </div>
      </section>
    </div>
  );
}

function EntryPointIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    'http-route': 'bg-blue-500',
    'exported-function': 'bg-green-500',
    'main-function': 'bg-amber-500',
    'event-handler': 'bg-purple-500',
  };
  return <div className={`w-1.5 h-1.5 rounded-full ${colors[type] || 'bg-gray-500'} shrink-0`} />;
}

function ScenarioIcon({ name }: { name: string }) {
  const icons: Record<string, string> = {
    'straight-through': '→',
    'conditional-branch': '⑂',
    'validation-failure': '✕',
    'async-handoff': '⇢',
    'side-effects': '◉',
  };
  return (
    <span className="w-4 h-4 flex items-center justify-center text-xs text-rsd-accent shrink-0">
      {icons[name] || '▸'}
    </span>
  );
}

function formatScenarioName(name: string): string {
  return name.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
