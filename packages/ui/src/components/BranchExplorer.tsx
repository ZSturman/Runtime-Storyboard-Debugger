import type { StoryboardFrame } from '../api';

interface BranchExplorerProps {
  frame: StoryboardFrame;
}

export function BranchExplorer({ frame }: BranchExplorerProps) {
  if (!frame.branch) return null;

  const { conditionSource, conditionValues, taken, explanation, alternateDescription } = frame.branch;

  return (
    <div className="bg-rsd-surface rounded-lg border border-rsd-border p-4 space-y-4">
      <h3 className="text-sm font-semibold text-rsd-text flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-rsd-branch" />
        Branch Analysis
      </h3>

      {/* Condition */}
      <div>
        <label className="text-xs text-rsd-muted uppercase tracking-wider">Condition</label>
        <code className="block mt-1 text-sm font-mono text-rsd-branch bg-rsd-bg rounded p-2 border border-rsd-border">
          {conditionSource}
        </code>
      </div>

      {/* Values at decision point */}
      {Object.keys(conditionValues).length > 0 && (
        <div>
          <label className="text-xs text-rsd-muted uppercase tracking-wider">Values at Decision Point</label>
          <div className="mt-1 bg-rsd-bg rounded border border-rsd-border">
            {Object.entries(conditionValues).map(([key, val]) => (
              <div key={key} className="flex items-center px-2 py-1 text-xs border-b border-rsd-border last:border-0">
                <span className="font-mono text-rsd-muted w-32">{key}</span>
                <span className="font-mono text-rsd-text">{JSON.stringify(val)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Path visualization */}
      <div className="flex gap-4">
        <PathCard
          label="Taken Path"
          active={taken}
          color="rsd-branch"
          description={taken ? 'This path was executed' : 'This path was not taken'}
        />
        <PathCard
          label="Alternate Path"
          active={!taken}
          color="rsd-branch-alt"
          description={alternateDescription || (taken ? 'This path was skipped' : 'This path was executed')}
        />
      </div>

      {/* Explanation */}
      <div className="bg-rsd-bg rounded border border-rsd-border p-3">
        <p className="text-xs text-rsd-text leading-relaxed">{explanation}</p>
      </div>
    </div>
  );
}

function PathCard({ label, active, color, description }: { label: string; active: boolean; color: string; description: string }) {
  return (
    <div className={`flex-1 rounded-lg border p-3 ${active ? `border-${color}/40 bg-${color}/5` : 'border-rsd-border opacity-50'}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <div className={`w-1.5 h-1.5 rounded-full ${active ? `bg-${color}` : 'bg-rsd-muted'}`} />
        <span className="text-xs font-medium text-rsd-text">{label}</span>
      </div>
      <p className="text-xs text-rsd-muted">{description}</p>
    </div>
  );
}
