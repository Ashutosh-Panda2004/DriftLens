// DriftLens - Embedding provider adapters (raw fetch, no SDKs)
// NOTE: Anthropic does NOT offer an embedding API. Use Voyage, OpenAI, or Ollama.

import type { EmbeddingAdapter, DriftLensConfig } from '../shared/schema.js';
import { resolveApiKey } from '../shared/config.js';
import { fetchWithTimeout } from '../shared/http.js';

// ─── Voyage AI ────────────────────────────────────────────────────────────────

class VoyageAdapter implements EmbeddingAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetchWithTimeout('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: this.model,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Voyage AI API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map((d) => d.embedding);
  }
}

// ─── OpenAI ───────────────────────────────────────────────────────────────────

class OpenAIEmbeddingAdapter implements EmbeddingAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly baseUrl: string = 'https://api.openai.com'
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const response = await fetchWithTimeout(`${this.baseUrl}/v1/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ input: texts, model: this.model }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI embeddings API error ${response.status}: ${body}`);
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[] }>;
    };
    return data.data.map((d) => d.embedding);
  }
}

// ─── Ollama ───────────────────────────────────────────────────────────────────

class OllamaEmbeddingAdapter implements EmbeddingAdapter {
  constructor(
    private readonly model: string,
    private readonly baseUrl: string = 'http://localhost:11434'
  ) {}

  async embed(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (const text of texts) {
      const response = await fetchWithTimeout(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, input: text }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Ollama embed API error ${response.status}: ${body}`);
      }

      const data = (await response.json()) as { embeddings: number[][] };
      const embedding = data.embeddings?.[0];
      if (!Array.isArray(embedding) || embedding.length === 0) {
        throw new Error(
          `Ollama returned an empty or invalid embedding for text: "${text.slice(0, 50)}". ` +
            `Aborting to avoid misaligned vectors during clustering.`
        );
      }
      embeddings.push(embedding);
    }

    return embeddings;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createEmbeddingAdapter(config: DriftLensConfig): EmbeddingAdapter {
  const apiKey = config.embeddings.apiKey.startsWith('env:')
    ? resolveApiKey(config.embeddings.apiKey)
    : config.embeddings.apiKey;

  switch (config.embeddings.provider) {
    case 'voyage':
      return new VoyageAdapter(apiKey, config.embeddings.model);
    case 'openai':
      return new OpenAIEmbeddingAdapter(apiKey, config.embeddings.model, config.embeddings.baseUrl);
    case 'ollama':
      return new OllamaEmbeddingAdapter(
        config.embeddings.model,
        config.embeddings.baseUrl ?? 'http://localhost:11434'
      );
    default: {
      const _exhaustive: never = config.embeddings.provider;
      throw new Error(`Unknown embedding provider: ${String(_exhaustive)}`);
    }
  }
}
