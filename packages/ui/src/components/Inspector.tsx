import { runEntryPoint, selectEntryPointForRun } from '../controller';
import { activeTab, selectedFrame, setRunForm, useAppStore } from '../store';

export function Inspector() {
  const tab = useAppStore(activeTab);
  const frame = useAppStore(selectedFrame);
  const runForm = useAppStore((s) => s.runForm);
  const eps = useAppStore((s) => s.workspace?.entryPoints ?? []);

  return (
    <div className="flex h-full w-full flex-col border-l border-editor-border-soft bg-editor-sidebar">
      <div className="flex h-9 shrink-0 items-center px-4 text-editor-xs uppercase tracking-wider text-editor-text-muted">
        Inspector
      </div>
      <div className="flex-1 overflow-y-auto">
        {frame && <FramePanel />}
        {!frame && runForm && <RunFormPanel />}
        {!frame && !runForm && tab && <TabInfoPanel />}
        {!frame && !runForm && !tab && (
          <div className="px-4 py-2 text-editor-sm text-editor-text-muted">
            Select an entry point or a frame to see details here.
          </div>
        )}
      </div>
    </div>
  );

  function TabInfoPanel() {
    if (!tab) return null;
    const fileEps = eps.filter((e) => e.file === tab.ref);
    return (
      <div className="px-4 py-2 text-editor-sm text-editor-text">
        <div className="font-mono text-editor-xs text-editor-text-muted">{tab.ref}</div>
        {fileEps.length > 0 && (
          <div className="mt-3">
            <div className="text-editor-xs uppercase tracking-wide text-editor-text-muted">Entry points in this file</div>
            <div className="mt-1 space-y-1">
              {fileEps.map((ep) => (
                <button
                  key={ep.id}
                  onClick={() => selectEntryPointForRun(ep.id)}
                  className="block w-full truncate rounded px-2 py-1 text-left text-editor-sm hover:bg-editor-list-hover"
                >
                  <span className="text-editor-good">▶</span> {ep.name}{' '}
                  <span className="text-editor-text-muted">:{ep.line}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
}

function RunFormPanel() {
  const runForm = useAppStore((s) => s.runForm)!;
  const ep = useAppStore((s) => s.workspace?.entryPoints.find((e) => e.id === runForm.entryPointId));
  if (!ep) return null;
  return (
    <div className="px-4 py-2 text-editor-sm text-editor-text">
      <div className="text-editor-text-strong font-semibold">{ep.name}</div>
      <div className="font-mono text-editor-xs text-editor-text-muted">
        {ep.file}:{ep.line}
      </div>
      {ep.description && <div className="mt-2 text-editor-text-muted">{ep.description}</div>}
      <div className="mt-3 space-y-2">
        {ep.inputFields.map((field) => (
          <label key={field.key} className="block">
            <div className="text-editor-xs text-editor-text-muted">
              {field.label || field.key}
              {field.required ? ' *' : ''}
            </div>
            {field.type === 'boolean' ? (
              <input
                type="checkbox"
                checked={!!runForm.inputs[field.key]}
                onChange={(e) =>
                  setRunForm({ ...runForm, inputs: { ...runForm.inputs, [field.key]: e.target.checked } })
                }
                className="mt-0.5"
              />
            ) : field.type === 'json' ? (
              <textarea
                rows={4}
                value={String(runForm.inputs[field.key] ?? '')}
                onChange={(e) =>
                  setRunForm({ ...runForm, inputs: { ...runForm.inputs, [field.key]: e.target.value } })
                }
                className="mt-0.5 w-full rounded border border-editor-border bg-editor-bg px-2 py-1 font-mono text-editor-xs text-editor-text outline-none focus:border-editor-accent"
              />
            ) : (
              <input
                type={field.type === 'number' ? 'number' : 'text'}
                value={String(runForm.inputs[field.key] ?? '')}
                onChange={(e) =>
                  setRunForm({ ...runForm, inputs: { ...runForm.inputs, [field.key]: e.target.value } })
                }
                className="mt-0.5 w-full rounded border border-editor-border bg-editor-bg px-2 py-1 font-mono text-editor-xs text-editor-text outline-none focus:border-editor-accent"
              />
            )}
          </label>
        ))}
        <label className="block">
          <div className="text-editor-xs text-editor-text-muted">Flags (JSON)</div>
          <textarea
            rows={3}
            value={runForm.flagsText}
            onChange={(e) => setRunForm({ ...runForm, flagsText: e.target.value })}
            className="mt-0.5 w-full rounded border border-editor-border bg-editor-bg px-2 py-1 font-mono text-editor-xs text-editor-text outline-none focus:border-editor-accent"
          />
        </label>
      </div>
      <button
        onClick={() => void runEntryPoint()}
        className="mt-3 w-full rounded bg-editor-accent-active px-3 py-1.5 text-editor-sm text-white hover:bg-editor-accent"
      >
        ▶ Run
      </button>
    </div>
  );
}

function FramePanel() {
  const frame = useAppStore(selectedFrame)!;
  return (
    <div className="px-4 py-2 text-editor-sm text-editor-text">
      <div className="text-editor-text-strong font-semibold">{frame.title}</div>
      <div className="font-mono text-editor-xs text-editor-text-muted">
        {frame.file}:{frame.line} · {frame.type}
      </div>
      <div className="mt-2 text-editor-text-muted">{frame.description}</div>

      {frame.variables && Object.keys(frame.variables).length > 0 && (
        <Section title="Variables">
          <table className="w-full text-editor-xs">
            <tbody>
              {Object.entries(frame.variables).map(([name, value]) => (
                <tr key={name} className="border-b border-editor-border-soft">
                  <td className="py-0.5 pr-2 font-mono text-editor-text">{name}</td>
                  <td className="py-0.5 truncate font-mono text-editor-text-muted">{summarizeValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}

      {frame.sideEffects && frame.sideEffects.length > 0 && (
        <Section title="Side effects">
          <ul className="list-disc pl-4 text-editor-xs text-editor-text-muted">
            {frame.sideEffects.map((s, i) => (
              <li key={i}>{s.description}</li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="text-editor-xs uppercase tracking-wide text-editor-text-muted">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function summarizeValue(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'string') return v.length > 80 ? `"${v.slice(0, 80)}…"` : `"${v}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  } catch {
    return String(v);
  }
}
