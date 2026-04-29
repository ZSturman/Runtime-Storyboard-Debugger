import { useEffect, useState } from 'react';
import {
  fetchProviderModels,
  requestLlmAssist,
  updateWorkspaceLlmConfig,
  type LlmModelOption,
  type LlmProvider,
  type WorkspaceSession,
} from '../api';

interface LlmAssistPanelProps {
  workspace: WorkspaceSession;
}

const PROVIDERS: Array<{ id: LlmProvider; label: string }> = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
];

export function LlmAssistPanel({ workspace }: LlmAssistPanelProps) {
  const [provider, setProvider] = useState<LlmProvider>(workspace.llmConfig?.provider || 'openai');
  const [apiKey, setApiKey] = useState(workspace.llmConfig?.apiKey || '');
  const [model, setModel] = useState(workspace.llmConfig?.model || '');
  const [models, setModels] = useState<LlmModelOption[]>([]);
  const [prompt, setPrompt] = useState('Summarize the most important user journey to inspect first, explain why, and call out any uncertainty.');
  const [saving, setSaving] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [result, setResult] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProvider(workspace.llmConfig?.provider || 'openai');
    setApiKey(workspace.llmConfig?.apiKey || '');
    setModel(workspace.llmConfig?.model || '');
  }, [workspace.id, workspace.llmConfig?.provider, workspace.llmConfig?.apiKey, workspace.llmConfig?.model]);

  async function handleLoadModels() {
    setLoadingModels(true);
    setError(null);
    try {
      const nextModels = await fetchProviderModels(workspace.id, provider, apiKey || undefined);
      setModels(nextModels);
      if (!model && nextModels[0]) {
        setModel(nextModels[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingModels(false);
    }
  }

  async function handleSaveConfig() {
    setSaving(true);
    setError(null);
    try {
      await updateWorkspaceLlmConfig(workspace.id, {
        enabled: true,
        provider,
        apiKey,
        model,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function handleAssist() {
    setSaving(true);
    setError(null);
    try {
      await handleSaveConfig();
      const nextResult = await requestLlmAssist(workspace.id, prompt);
      setResult(nextResult.text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-rsd-border bg-rsd-surface/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">Optional LLM assistance</div>
          <p className="mt-2 text-sm leading-6 text-rsd-muted">
            Keep repo understanding deterministic by default, then layer interpretation on top when you want help prioritizing paths or explaining uncertainty.
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs uppercase tracking-[0.2em] text-rsd-muted">Provider</label>
        <select
          value={provider}
          onChange={(event) => setProvider(event.target.value as LlmProvider)}
          className="col-span-2 rounded-2xl border border-rsd-border bg-rsd-bg/50 px-3 py-3 text-sm text-rsd-text"
        >
          {PROVIDERS.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>

        <label className="col-span-2 text-xs uppercase tracking-[0.2em] text-rsd-muted">API key</label>
        <input
          type="password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder="Session only"
          className="col-span-2 rounded-2xl border border-rsd-border bg-rsd-bg/50 px-3 py-3 text-sm text-rsd-text"
        />

        <div className="col-span-2 flex items-center gap-2">
          <button
            onClick={handleLoadModels}
            className="rounded-xl border border-rsd-border px-3 py-2 text-xs text-rsd-muted transition-colors hover:text-rsd-text"
          >
            {loadingModels ? 'Loading models...' : 'Load models'}
          </button>
          <div className="text-[11px] text-rsd-muted">Uses provider listing when available, otherwise falls back to curated defaults.</div>
        </div>

        <label className="col-span-2 text-xs uppercase tracking-[0.2em] text-rsd-muted">Model</label>
        {models.length > 0 ? (
          <select
            value={model}
            onChange={(event) => setModel(event.target.value)}
            className="col-span-2 rounded-2xl border border-rsd-border bg-rsd-bg/50 px-3 py-3 text-sm text-rsd-text"
          >
            {models.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        ) : (
          <input
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder="Enter model id"
            className="col-span-2 rounded-2xl border border-rsd-border bg-rsd-bg/50 px-3 py-3 text-sm text-rsd-text"
          />
        )}
      </div>

      <label className="mt-5 block text-xs uppercase tracking-[0.2em] text-rsd-muted">Ask for help</label>
      <textarea
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        rows={5}
        className="mt-2 w-full rounded-2xl border border-rsd-border bg-rsd-bg/50 px-3 py-3 text-sm text-rsd-text"
      />

      {error && (
        <div className="mt-4 rounded-2xl border border-rsd-error/30 bg-rsd-error/10 px-4 py-3 text-sm text-rsd-error">
          {error}
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={handleSaveConfig}
          className="rounded-xl border border-rsd-border px-3 py-2 text-xs text-rsd-muted transition-colors hover:text-rsd-text"
        >
          Save config
        </button>
        <button
          onClick={handleAssist}
          disabled={!provider || !model || !apiKey || saving}
          className="rounded-xl bg-rsd-accent px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {saving ? 'Thinking...' : 'Use LLM assistance'}
        </button>
      </div>

      {result && (
        <div className="mt-5 rounded-2xl border border-rsd-border bg-rsd-bg/60 p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-rsd-muted">LLM output</div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-rsd-text">{result}</p>
        </div>
      )}
    </section>
  );
}
