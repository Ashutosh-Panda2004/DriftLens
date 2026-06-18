// DriftLens - LLM provider adapters (raw fetch, no SDKs)

import type { LLMAdapter, DriftLensConfig } from '../shared/schema.js';
import { resolveApiKey } from '../shared/config.js';
import { fetchWithTimeout } from '../shared/http.js';

// ─── Anthropic ────────────────────────────────────────────────────────────────

class AnthropicAdapter implements LLMAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async complete(
    prompt: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      content: Array<{ type: string; text: string }>;
    };
    return data.content.map((c) => c.text).join('');
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

class OpenAIAdapter implements LLMAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string = 'https://api.openai.com'
  ) {}

  async complete(
    prompt: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const response = await fetchWithTimeout(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: options.temperature ?? 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message.content ?? '';
  }
}

// ─── Gemini ───────────────────────────────────────────────────────────────────

class GeminiAdapter implements LLMAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async complete(
    prompt: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    // Pass the API key via header (x-goog-api-key) rather than the query string
    // so it does not leak into request logs, proxies, or error messages.
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature ?? 0.3,
          maxOutputTokens: options.maxTokens ?? 1024,
        },
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Gemini API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    };
    return data.candidates[0]?.content.parts.map((p) => p.text).join('') ?? '';
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

class OllamaAdapter implements LLMAdapter {
  constructor(
    private readonly model: string,
    private readonly baseUrl: string = 'http://localhost:11434'
  ) {}

  async complete(
    prompt: string,
    options: { temperature?: number; maxTokens?: number } = {}
  ): Promise<string> {
    const response = await fetchWithTimeout(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.3,
          num_predict: options.maxTokens ?? 1024,
        },
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as { message: { content: string } };
    return data.message.content;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createLLMAdapter(config: DriftLensConfig): LLMAdapter {
  const apiKey = resolveApiKey(config.llm.apiKey);

  switch (config.llm.provider) {
    case 'anthropic':
      return new AnthropicAdapter(apiKey, config.llm.analysisModel);
    case 'openai':
      return new OpenAIAdapter(apiKey, config.llm.analysisModel, config.llm.baseUrl);
    case 'gemini':
      return new GeminiAdapter(apiKey, config.llm.analysisModel);
    case 'ollama':
      return new OllamaAdapter(config.llm.analysisModel, config.llm.baseUrl ?? 'http://localhost:11434');
    default: {
      const _exhaustive: never = config.llm.provider;
      throw new Error(`Unknown LLM provider: ${String(_exhaustive)}`);
    }
  }
}

export function createProposalLLMAdapter(config: DriftLensConfig): LLMAdapter {
  const apiKey = resolveApiKey(config.llm.apiKey);

  switch (config.llm.provider) {
    case 'anthropic':
      return new AnthropicAdapter(apiKey, config.llm.proposalModel);
    case 'openai':
      return new OpenAIAdapter(apiKey, config.llm.proposalModel, config.llm.baseUrl);
    case 'gemini':
      return new GeminiAdapter(apiKey, config.llm.proposalModel);
    case 'ollama':
      return new OllamaAdapter(config.llm.proposalModel, config.llm.baseUrl ?? 'http://localhost:11434');
    default: {
      const _exhaustive: never = config.llm.provider;
      throw new Error(`Unknown LLM provider: ${String(_exhaustive)}`);
    }
  }
}
