import { describe, it, expect } from 'vitest';
import { clusterCorrections } from '../src/analyser/clustering.js';
import type { CorrectionRecord } from '../src/shared/schema.js';

function correction(id: string, language: string, category: string | null): CorrectionRecord {
  return {
    id,
    ts: new Date().toISOString(),
    correction_type: 'reprompt',
    commit_hash: null,
    skill_active: 'developer',
    file: `src/${id}.ts`,
    language,
    ai_wrote: null,
    human_committed: null,
    developer_instruction: `instruction ${id}`,
    struggle_chain: null,
    context_before: '',
    context_after: '',
    detection_method: 'session_log',
    detection_confidence: 0.85,
    session_id: null,
    session_log_source: null,
    agent: 'claude',
    model_used: 'unknown',
    generation_timestamp: null,
    time_to_commit_ms: null,
    estimated_manual_time_ms: null,
    model_version: null,
    agent_session_tokens: null,
    module_category: category,
    pattern_categories: [],
  };
}

describe('scalable clustering (E-A1)', () => {
  it('greedy and blocking agree when blocks are homogeneous', () => {
    // All same category → one block → identical to greedy.
    const corrections = [
      correction('a', 'typescript', 'data-layer'),
      correction('b', 'typescript', 'data-layer'),
      correction('c', 'typescript', 'data-layer'),
    ];
    const embeddings = [
      [1, 0, 0],
      [0.99, 0.01, 0],
      [0.98, 0.02, 0],
    ];
    const greedy = clusterCorrections(embeddings, corrections, 0.9, 2, { useBlocking: false });
    const blocked = clusterCorrections(embeddings, corrections, 0.9, 2, { useBlocking: true });
    expect(blocked.length).toBe(greedy.length);
    expect(blocked[0]!.corrections.length).toBe(greedy[0]!.corrections.length);
  });

  it('does not cross-cluster items in different blocks', () => {
    // Identical embeddings but different categories → blocking keeps them apart.
    const corrections = [
      correction('a', 'typescript', 'data-layer'),
      correction('b', 'python', 'api-handler'),
    ];
    const embeddings = [
      [1, 0, 0],
      [1, 0, 0],
    ];
    const blocked = clusterCorrections(embeddings, corrections, 0.9, 2, { useBlocking: true });
    // Each block has only one item, below minOccurrences=2 → no clusters.
    expect(blocked.length).toBe(0);
  });

  it('is deterministic across runs', () => {
    const corrections = Array.from({ length: 6 }, (_, i) =>
      correction(`c${i}`, 'typescript', 'general'),
    );
    const embeddings = corrections.map((_, i) => [1 - i * 0.001, i * 0.001, 0]);
    const a = clusterCorrections(embeddings, corrections, 0.9, 2, { useBlocking: true });
    const b = clusterCorrections(embeddings, corrections, 0.9, 2, { useBlocking: true });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
