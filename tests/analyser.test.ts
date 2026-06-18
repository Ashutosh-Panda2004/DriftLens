import { describe, it, expect } from 'vitest';
import { levenshtein } from '../src/analyser/no-llm.js';
import { clusterCorrections } from '../src/analyser/clustering.js';
import type { CorrectionRecord } from '../src/shared/schema.js';

function mockCorrection(id: string, text: string): CorrectionRecord {
  return {
    id,
    ts: new Date().toISOString(),
    correction_type: 'reprompt',
    commit_hash: null,
    skill_active: 'developer',
    file: 'src/App.tsx',
    language: 'typescript',
    ai_wrote: null,
    human_committed: null,
    developer_instruction: text,
    struggle_chain: null,
    context_before: '',
    context_after: '',
    detection_method: 'session_log',
    detection_confidence: 0.85,
    session_id: null,
    session_log_source: null,
    agent: 'claude',
    model_used: 'unknown',
  };
}

function makeEmbedding(values: number[]): number[] {
  return values;
}

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('hello', 'hello')).toBe(0);
  });

  it('returns correct distance for single substitution', () => {
    expect(levenshtein('cat', 'bat')).toBe(1);
  });

  it('returns string length for empty vs non-empty', () => {
    expect(levenshtein('', 'hello')).toBe(5);
    expect(levenshtein('hello', '')).toBe(5);
  });
});

describe('clusterCorrections', () => {
  it('clusters similar embeddings', () => {
    const corrections = [
      mockCorrection('1', 'use service layer'),
      mockCorrection('2', 'use service layer'),
      mockCorrection('3', 'use service layer'),
    ];

    // Create embeddings that are very similar (pointing in same direction)
    const embeddings = [
      makeEmbedding([1, 0, 0]),
      makeEmbedding([0.99, 0.01, 0]),
      makeEmbedding([0.98, 0.02, 0]),
    ];

    const clusters = clusterCorrections(embeddings, corrections, 0.9, 2);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.corrections).toHaveLength(3);
  });

  it('does NOT cluster dissimilar embeddings', () => {
    const corrections = [
      mockCorrection('1', 'use service layer'),
      mockCorrection('2', 'different unrelated thing'),
      mockCorrection('3', 'another correction'),
    ];

    const embeddings = [
      makeEmbedding([1, 0, 0]),
      makeEmbedding([0, 1, 0]),
      makeEmbedding([0, 0, 1]),
    ];

    const clusters = clusterCorrections(embeddings, corrections, 0.9, 2);
    expect(clusters).toHaveLength(0); // None reach min 2 together
  });

  it('filters by minOccurrences', () => {
    const corrections = [
      mockCorrection('1', 'use service layer'),
      mockCorrection('2', 'use service layer'),
    ];

    const embeddings = [
      makeEmbedding([1, 0]),
      makeEmbedding([0.99, 0.01]),
    ];

    const clustersMin2 = clusterCorrections(embeddings, corrections, 0.9, 2);
    expect(clustersMin2).toHaveLength(1);

    const clustersMin3 = clusterCorrections(embeddings, corrections, 0.9, 3);
    expect(clustersMin3).toHaveLength(0);
  });
});
