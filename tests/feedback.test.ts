import { describe, it, expect } from 'vitest';
import { detectRegression } from '../src/feedback/regression.js';
import type { PatternRecord } from '../src/shared/schema.js';

function mockPattern(status: PatternRecord['status'] = 'merged'): PatternRecord {
  return {
    pattern_id: 'p1',
    name: 'test-pattern',
    description: 'test',
    occurrences: 10,
    confidence: 0.9,
    proposed_rule: 'rule',
    example_before: 'before',
    example_after: 'after',
    target_skills: ['developer'],
    target_formats: ['claude'],
    source_correction_ids: [],
    first_seen: '2026-05-01T00:00:00Z',
    last_seen: '2026-05-15T00:00:00Z',
    status,
    pr_url: 'https://github.com/repo/pull/1',
    drift_score_impact: 0.1,
    avg_friction_score: null,
    total_prompt_turns_saved: null,
    constraint_block: null,
  };
}

describe('detectRegression', () => {
  it('returns false for non-merged pattern', () => {
    expect(detectRegression(mockPattern('pending'), 5, 8)).toBe(false);
  });

  it('returns false when corrections decreased', () => {
    expect(detectRegression(mockPattern('merged'), 10, 3)).toBe(false);
  });

  it('returns false for slight increase (< 20%)', () => {
    expect(detectRegression(mockPattern('merged'), 10, 11)).toBe(false);
  });

  it('returns true for >20% increase in corrections after merge with count > 2', () => {
    expect(detectRegression(mockPattern('merged'), 5, 7)).toBe(true);
  });

  it('returns false when post-merge count is <= 2 even with large pct increase', () => {
    expect(detectRegression(mockPattern('merged'), 1, 2)).toBe(false);
  });
});
