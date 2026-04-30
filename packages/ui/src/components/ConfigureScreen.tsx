import { useState } from 'react';
import type { EntryPoint, EntryPointInputField, ExampleSet, FlowGraph, UnfinishedWorkFinding } from '../api';
import { FlowMap } from './FlowMap';

interface ConfigureScreenProps {
  entryPoint: EntryPoint;
  flowGraph: FlowGraph | null;
  flowLoading: boolean;
  unfinishedWork: UnfinishedWorkFinding[];
  draftInputs: Record<string, string | boolean>;
  flagsText: string;
  technicalDetails: boolean;
  error: string | null;
  rerunLabel: string | null;
  onChangeInput: (key: string, value: string | boolean) => void;
  onChangeFlagsText: (value: string) => void;
  onRun: () => void;
  onLoadExampleSet: (exampleSet: ExampleSet) => void;
  onClearRerunContext: () => void;
  onBack: () => void;
}

export function ConfigureScreen({
  entryPoint,
  flowGraph,
  flowLoading,
  unfinishedWork,
  draftInputs,
  flagsText,
  technicalDetails,
  error,
  rerunLabel,
  onChangeInput,
  onChangeFlagsText,
  onRun,
  onLoadExampleSet,
  onClearRerunContext,
  onBack,
}: ConfigureScreenProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Field visibility is independent of technical mode now: required fields are always visible,
  // and optional + hidden fields + execution flags collapse into a single "Show advanced" disclosure.
  const requiredFields = entryPoint.inputFields.filter((f) => f.required && !f.hidden);
  const optionalFields = entryPoint.inputFields.filter((f) => !f.required || f.hidden);
  const noRequired = requiredFields.length === 0;
  const noFields = entryPoint.inputFields.length === 0;
  const hasExamples = entryPoint.exampleSets && entryPoint.exampleSets.length > 0;
  const locationLabels = technicalDetails ? technicalLocationLabels : friendlyLocationLabels;

  const requiredByLocation = groupByLocation(requiredFields);
  const optionalByLocation = groupByLocation(optionalFields);

  return (
    <div className="min-h-screen flex flex-col phase-enter">
      {/* Top bar */}
      <div className="px-8 py-4 border-b border-rsd-border/50 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-sm text-rsd-muted hover:text-rsd-text transition-colors"
        >
          <span>←</span>
          <span>All entry points</span>
        </button>
        <div className="flex items-center gap-2">
          {entryPoint.httpMethod && (
            <MethodBadge method={entryPoint.httpMethod} />
          )}
          <span className="text-sm font-semibold text-rsd-text">
            {entryPoint.httpPath || entryPoint.name}
          </span>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Left column: Configure */}
        <div className="flex-1 p-8 overflow-y-auto">
          <div className="max-w-lg space-y-6">
            {/* Header */}
            <div>
              <h1 className="text-2xl font-bold text-rsd-text">{entryPoint.name}</h1>
              <p className="text-sm text-rsd-text/80 mt-1 font-medium">{describeAction(entryPoint)}</p>
              <p className="text-xs text-rsd-muted mt-1 leading-relaxed">{entryPoint.description}</p>
              {technicalDetails && (
                <p className="text-xs text-rsd-muted/80 mt-2 font-mono">{entryPoint.file}:{entryPoint.line}</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="p-4 rounded-xl border border-rsd-error/30 bg-rsd-error/10 text-rsd-error text-sm leading-relaxed whitespace-pre-line">
                {error}
              </div>
            )}

            {/* Rerun context */}
            {rerunLabel && (
              <div className="rounded-xl border border-rsd-accent/30 bg-rsd-accent/10 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm text-rsd-text">{rerunLabel}</div>
                  <button
                    onClick={onClearRerunContext}
                    className="text-xs px-3 py-1 rounded border border-rsd-border text-rsd-muted hover:text-rsd-text transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}

            {/* Quick start examples */}
            {hasExamples && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Quick Start — Load an example
                </h3>
                <div className="flex flex-wrap gap-2">
                  {entryPoint.exampleSets.map((es) => (
                    <button
                      key={es.id}
                      onClick={() => onLoadExampleSet(es)}
                      className="text-xs px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20 transition-colors"
                      title={es.description}
                    >
                      {es.label}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-rsd-muted leading-relaxed">
                  Click to fill in all fields, then hit Run.
                </p>
              </div>
            )}

            {/* No-input action */}
            {noFields && (
              <div className="rounded-xl border border-rsd-accent/20 bg-rsd-accent/5 p-6 text-center space-y-4">
                <p className="text-sm text-rsd-text">No input required — just run it.</p>
                <button
                  onClick={onRun}
                  disabled={entryPoint.runSupport.status !== 'supported'}
                  className="px-8 py-3 rounded-xl bg-rsd-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-lg shadow-rsd-accent/20"
                >
                  Run →
                </button>
              </div>
            )}

            {/* Input fields */}
            {!noFields && (
              <>
                {!noRequired && Object.entries(requiredByLocation).map(([location, fields]) => (
                  <section key={location} className="space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">
                      {locationLabels[location] || location}
                    </h3>
                    <div className="space-y-3">
                      {fields.map((field) => (
                        <FieldInput
                          key={field.key}
                          field={field}
                          value={draftInputs[field.key]}
                          technicalDetails={technicalDetails}
                          onChange={(value) => onChangeInput(field.key, value)}
                        />
                      ))}
                    </div>
                  </section>
                ))}

                {/* Single advanced disclosure: optional fields + hidden fields + execution flags. */}
                <div>
                    <button
                      onClick={() => setShowAdvanced((prev) => !prev)}
                      className="text-xs text-rsd-muted hover:text-rsd-text transition-colors flex items-center gap-1"
                      aria-expanded={showAdvanced}
                    >
                      <span className="text-[10px]">{showAdvanced ? '▾' : '▸'}</span>
                      {showAdvanced ? 'Hide advanced' : 'Show advanced'}
                      {optionalFields.length > 0 && (
                        <span className="text-rsd-muted/70">
                          {' '}
                          ({optionalFields.length} optional field{optionalFields.length !== 1 ? 's' : ''} + execution flags)
                        </span>
                      )}
                    </button>
                    {showAdvanced && (
                      <div className="mt-3 space-y-4">
                        {Object.entries(optionalByLocation).map(([location, fields]) => (
                          <section key={location} className="space-y-3">
                            <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">
                              {locationLabels[location] || location}
                            </h3>
                            <div className="space-y-3">
                              {fields.map((field) => (
                                <FieldInput
                                  key={field.key}
                                  field={field}
                                  value={draftInputs[field.key]}
                                  technicalDetails={technicalDetails}
                                  onChange={(value) => onChangeInput(field.key, value)}
                                />
                              ))}
                            </div>
                          </section>
                        ))}

                        <section className="space-y-2">
                          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted">Execution flags</h3>
                          <textarea
                            value={flagsText}
                            onChange={(e) => onChangeFlagsText(e.target.value)}
                            rows={4}
                            className="w-full rounded-lg border border-rsd-border bg-rsd-bg px-3 py-2 text-sm text-rsd-text font-mono focus:outline-none focus:ring-2 focus:ring-rsd-accent/30"
                            placeholder="--flag value (one per line)"
                          />
                        </section>
                      </div>
                    )}
                  </div>

                {/* Run button */}
                <div className="pt-2">
                  <button
                    onClick={onRun}
                    disabled={entryPoint.runSupport.status !== 'supported'}
                    className="w-full py-3 rounded-xl bg-rsd-accent text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-lg shadow-rsd-accent/20"
                  >
                    Run this entry point →
                  </button>
                  <p className="text-xs text-rsd-muted text-center mt-2">
                    Your inputs stay in place — tweak and rerun to explore different branches.
                  </p>
                </div>
              </>
            )}

            {/* Unfinished work */}
            {unfinishedWork.length > 0 && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                  Attention items
                </h3>
                {unfinishedWork.slice(0, technicalDetails ? unfinishedWork.length : 3).map((finding) => (
                  <div key={finding.id} className="text-xs text-amber-100/80 leading-relaxed">
                    <span className="font-medium text-amber-200">{finding.title}</span>
                    {' — '}{finding.detail}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Flow Map */}
        <div className="w-96 border-l border-rsd-border/50 bg-rsd-surface/30 p-6 overflow-y-auto">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-rsd-muted mb-4">
            Possible Paths
          </h3>
          {flowLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-2 border-rsd-accent/30 border-t-rsd-accent rounded-full animate-spin-slow" />
            </div>
          ) : (
            <FlowMap flowGraph={flowGraph} compact={false} />
          )}
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  technicalDetails,
  onChange,
}: {
  field: EntryPointInputField;
  value: string | boolean | undefined;
  technicalDetails: boolean;
  onChange: (value: string | boolean) => void;
}) {
  const label = technicalDetails ? field.label : (field.friendlyLabel || field.label);

  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-rsd-text">{label}</span>
        <div className="flex items-center gap-2">
          {field.required && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rsd-accent/10 text-rsd-accent">required</span>
          )}
          {technicalDetails && (
            <span className="text-[11px] font-mono text-rsd-muted">{field.key}</span>
          )}
        </div>
      </div>
      {field.type === 'boolean' ? (
        <div className="mt-2 flex items-center gap-3 rounded-lg border border-rsd-border bg-rsd-bg px-3 py-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(e.target.checked)}
            className="accent-rsd-accent"
          />
          <span className="text-sm text-rsd-text">Enabled</span>
        </div>
      ) : field.type === 'json' ? (
        <textarea
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.exampleValue !== undefined ? `e.g. ${JSON.stringify(field.exampleValue)}` : undefined}
          rows={technicalDetails ? 8 : 5}
          className="mt-2 w-full rounded-lg border border-rsd-border bg-rsd-bg px-3 py-2 text-sm text-rsd-text font-mono focus:outline-none focus:ring-2 focus:ring-rsd-accent/30 placeholder:text-rsd-muted/40"
        />
      ) : (
        <input
          type={field.type === 'number' ? 'number' : 'text'}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.exampleValue !== undefined ? `e.g. ${field.exampleValue}` : undefined}
          className="mt-2 w-full rounded-lg border border-rsd-border bg-rsd-bg px-3 py-2 text-sm text-rsd-text focus:outline-none focus:ring-2 focus:ring-rsd-accent/30 placeholder:text-rsd-muted/40"
        />
      )}
      {field.helpText && (
        <p className="text-xs text-rsd-muted mt-1 leading-relaxed">{field.helpText}</p>
      )}
    </label>
  );
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-emerald-500/15 text-emerald-300',
    POST: 'bg-blue-500/15 text-blue-300',
    PUT: 'bg-amber-500/15 text-amber-300',
    DELETE: 'bg-red-500/15 text-red-300',
  };

  return (
    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${colors[method] || 'bg-slate-500/15 text-slate-300'}`}>
      {method}
    </span>
  );
}

function describeAction(ep: EntryPoint): string {
  if (ep.invocationKind === 'http-route') {
    const verbs: Record<string, string> = {
      GET: `Fetch data from ${ep.httpPath}`,
      POST: `Create a new resource at ${ep.httpPath}`,
      PUT: `Update a resource at ${ep.httpPath}`,
      PATCH: `Update a resource at ${ep.httpPath}`,
      DELETE: `Remove a resource at ${ep.httpPath}`,
    };
    return verbs[ep.httpMethod || ''] || `Send a ${ep.httpMethod} request to ${ep.httpPath}`;
  }
  if (ep.invocationKind === 'function') return `Call the "${ep.name}" function`;
  return `Run ${ep.name}`;
}

function groupByLocation(fields: EntryPointInputField[]): Record<string, EntryPointInputField[]> {
  return fields.reduce<Record<string, EntryPointInputField[]>>((groups, field) => {
    if (!groups[field.location]) groups[field.location] = [];
    groups[field.location].push(field);
    return groups;
  }, {});
}

const friendlyLocationLabels: Record<string, string> = {
  argument: 'Inputs',
  body: 'What to send',
  query: 'Search & filter options',
  params: 'Which resource',
  headers: 'Request headers',
  flags: 'Execution flags',
};

const technicalLocationLabels: Record<string, string> = {
  argument: 'Parameters',
  body: 'Request body',
  query: 'Query string',
  params: 'Route parameters',
  headers: 'Headers',
  flags: 'Execution flags',
};
