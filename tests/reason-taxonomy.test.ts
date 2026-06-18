import { describe, it, expect } from 'vitest';
import type { CorrectionRecord } from '../src/shared/schema.js';
import {
  classifyReasons,
  dominantReason,
  aggregateReasons,
} from '../src/analyser/reason-classifier.js';

function correction(partial: Partial<CorrectionRecord>): CorrectionRecord {
  return {
    id: partial.id ?? 'c1',
    ts: partial.ts ?? new Date().toISOString(),
    correction_type: 'reprompt',
    commit_hash: null,
    skill_active: 'developer',
    file: partial.file ?? 'src/app.ts',
    language: 'typescript',
    ai_wrote: partial.ai_wrote ?? null,
    human_committed: partial.human_committed ?? null,
    developer_instruction: partial.developer_instruction ?? null,
    struggle_chain: null,
    context_before: '',
    context_after: '',
    detection_method: 'session_log',
    detection_confidence: 0.85,
    session_id: partial.session_id ?? null,
    session_log_source: null,
    agent: 'claude',
    model_used: 'unknown',
    generation_timestamp: null,
    time_to_commit_ms: null,
    estimated_manual_time_ms: null,
    model_version: null,
    agent_session_tokens: null,
    module_category: null,
    pattern_categories: partial.pattern_categories ?? [],
  };
}

describe('reason classifier (E-C1)', () => {
  it('classifies a security correction', () => {
    const c = correction({ developer_instruction: 'sanitize this input to prevent SQL injection' });
    expect(classifyReasons(c)).toContain('security');
    expect(dominantReason(c)).toBe('security');
  });

  it('classifies a performance correction', () => {
    const c = correction({ developer_instruction: 'this is slow, add caching to optimize it' });
    expect(classifyReasons(c)).toContain('performance');
  });

  it('falls back to other when nothing matches', () => {
    const c = correction({ developer_instruction: 'zzzz qqqq' });
    expect(classifyReasons(c)).toEqual(['other']);
    expect(dominantReason(c)).toBe('other');
  });

  it('prioritises security over style when both present', () => {
    const c = correction({
      developer_instruction: 'fix the lint formatting and also escape the xss vulnerability',
    });
    expect(dominantReason(c)).toBe('security');
  });

  it('is deterministic across repeated calls', () => {
    const c = correction({ developer_instruction: 'rename this to use camelCase naming' });
    expect(classifyReasons(c)).toEqual(classifyReasons(c));
  });

  it('aggregates a breakdown and dominant reason across a cluster', () => {
    const corrections = [
      correction({ id: 'a', developer_instruction: 'prevent sql injection' }),
      correction({ id: 'b', developer_instruction: 'prevent sql injection again' }),
      correction({ id: 'c', developer_instruction: 'fix the formatting style' }),
    ];
    const { dominant, breakdown } = aggregateReasons(corrections);
    expect(dominant).toBe('security');
    expect(breakdown.security).toBe(2);
    expect(breakdown.style).toBe(1);
  });

  it('preserves valid pre-existing taxonomy categories', () => {
    const c = correction({ developer_instruction: 'noop', pattern_categories: ['testing'] });
    expect(classifyReasons(c)).toEqual(['other']); // text-only
    const { breakdown } = aggregateReasons([c]);
    expect(breakdown.testing).toBe(1); // merged from existing categories
  });
});
