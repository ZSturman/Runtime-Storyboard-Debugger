import type { LlmModelOption, LlmProvider, LlmProviderConfig, WorkspaceSession } from '../storyboard/types';

const CURATED_MODELS: Record<LlmProvider, string[]> = {
  openai: ['gpt-5.4', 'gpt-5.4-mini', 'gpt-4.1'],
  anthropic: ['claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  openrouter: ['openai/gpt-5.4', 'anthropic/claude-sonnet-4-5', 'google/gemini-2.5-pro'],
};

function curatedModels(provider: LlmProvider): LlmModelOption[] {
  return CURATED_MODELS[provider].map((model) => ({
    id: model,
    label: model,
    provider,
    source: 'curated',
  }));
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Provider request failed with ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listModelsForProvider(provider: LlmProvider, apiKey?: string): Promise<LlmModelOption[]> {
  if (!apiKey) {
    return curatedModels(provider);
  }

  try {
    switch (provider) {
      case 'openai': {
        const data = await fetchJson<{ data?: Array<{ id: string }> }>('https://api.openai.com/v1/models', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        const models = (data.data || [])
          .map((model) => model.id)
          .filter((id) => id.startsWith('gpt') || id.includes('o'))
          .slice(0, 20);
        return models.length > 0
          ? models.map((model) => ({ id: model, label: model, provider, source: 'provider' as const }))
          : curatedModels(provider);
      }

      case 'gemini': {
        const data = await fetchJson<{ models?: Array<{ name: string; displayName?: string }> }>(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`, {
          headers: {},
        });
        const models = (data.models || [])
          .map((model) => model.name.replace(/^models\//, ''))
          .filter((name) => name.includes('gemini'))
          .slice(0, 20);
        return models.length > 0
          ? models.map((model) => ({ id: model, label: model, provider, source: 'provider' as const }))
          : curatedModels(provider);
      }

      case 'openrouter': {
        const data = await fetchJson<{ data?: Array<{ id: string; name?: string }> }>('https://openrouter.ai/api/v1/models', {
          headers: {
            Authorization: `Bearer ${apiKey}`,
          },
        });
        const models = (data.data || []).slice(0, 25).map((model) => ({
          id: model.id,
          label: model.name || model.id,
          provider,
          source: 'provider' as const,
        }));
        return models.length > 0 ? models : curatedModels(provider);
      }

      case 'anthropic':
      default:
        return curatedModels(provider);
    }
  } catch {
    return curatedModels(provider);
  }
}

function buildWorkspaceContext(workspace: WorkspaceSession): string {
  const journeyLines = workspace.likelyJourneys
    .slice(0, 5)
    .map((journey) => `- ${journey.title}: ${journey.summary}`)
    .join('\n');
  const entryPointLines = workspace.entryPoints
    .slice(0, 8)
    .map((entryPoint) => `- ${entryPoint.httpMethod ? `${entryPoint.httpMethod} ${entryPoint.httpPath}` : entryPoint.name} (${entryPoint.file}:${entryPoint.line})`)
    .join('\n');
  const blockerLines = workspace.runtimeBlockers
    .slice(0, 6)
    .map((blocker) => `- ${blocker.title}: ${blocker.detail}`)
    .join('\n');

  return [
    `Workspace: ${workspace.sourceLabel}`,
    `Phase: ${workspace.phase}`,
    journeyLines ? `Likely journeys:\n${journeyLines}` : '',
    entryPointLines ? `Entry points:\n${entryPointLines}` : '',
    blockerLines ? `Known blockers:\n${blockerLines}` : '',
  ].filter(Boolean).join('\n\n');
}

export async function assistWithLlm(config: LlmProviderConfig | undefined, workspace: WorkspaceSession, prompt: string): Promise<{ text: string; provider: LlmProvider; model: string }> {
  if (!config?.enabled || !config.provider || !config.model || !config.apiKey) {
    throw new Error('LLM assistance is not configured for this workspace.');
  }

  const system = 'You are helping explain an unfamiliar codebase. Prefer concise, practical guidance, call out uncertainty, and suggest alternate traces when relevant.';
  const combinedPrompt = `${buildWorkspaceContext(workspace)}\n\nUser request:\n${prompt}`;

  switch (config.provider) {
    case 'openai': {
      const data = await fetchJson<{ choices?: Array<{ message?: { content?: string } }> }>('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: combinedPrompt },
          ],
        }),
      });

      return {
        text: data.choices?.[0]?.message?.content || 'No response returned.',
        provider: config.provider,
        model: config.model,
      };
    }

    case 'openrouter': {
      const data = await fetchJson<{ choices?: Array<{ message?: { content?: string } }> }>('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: combinedPrompt },
          ],
        }),
      });

      return {
        text: data.choices?.[0]?.message?.content || 'No response returned.',
        provider: config.provider,
        model: config.model,
      };
    }

    case 'anthropic': {
      const data = await fetchJson<{ content?: Array<{ text?: string }> }>('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1024,
          system,
          messages: [
            {
              role: 'user',
              content: combinedPrompt,
            },
          ],
        }),
      });

      return {
        text: data.content?.map((part) => part.text || '').join('\n').trim() || 'No response returned.',
        provider: config.provider,
        model: config.model,
      };
    }

    case 'gemini': {
      const data = await fetchJson<{ candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }>(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `${system}\n\n${combinedPrompt}`,
                  },
                ],
              },
            ],
          }),
        },
      );

      return {
        text: data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('\n').trim() || 'No response returned.',
        provider: config.provider,
        model: config.model,
      };
    }
  }
}
