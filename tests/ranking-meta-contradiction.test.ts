import { describe, it, expect } from 'vitest';
import type { PatternRecord, CorrectionRecord } from '../src/shared/schema.js';
import { computeImpactScore, rankPatterns } from '../src/analyser/ranking.js';
import { detectMetaPatterns } from '../src/analyser/meta-patterns.js';
import { detectContradictions } from '../src/analyser/contradiction.js';

function pattern(partial: Partial<PatternRecord>): PatternRecord {
  return {
    pattern_id: partial.pattern_id ?? 'p1',
    name: partial.name ?? 'some-pattern',
    description: partial.description ?? '',
    occurrences: partial.occurrences ?? 1,
    confidence: partial.confidence ?? 0.7,
    proposed_rule: partial.proposed_rule ?? 'do the thing',
    example_before: partial.example_before ?? '',
    example_after: partial.example_after ?? '',
    target_skills: ['developer'],
    target_formats: ['copilot'],
    source_correction_ids: partial.source_correction_ids ?? [],
    first_seen: partial.first_seen ?? new Date().toISOString(),
    last_seen: partial.last_seen ?? new Date().toISOString(),
    status: partial.status ?? 'pending',
    pr_url: null,
    drift_score_impact: 0,
    avg_friction_score: null,
    total_prompt_turns_saved: null,
    constraint_block: null,
    dominant_reason: partial.dominant_reason,
  };
}

function correction(partial: Partial<CorrectionRecord>): CorrectionRecord {
  return {
    id: partial.id ?? 'c1',
    ts: new Date().toISOString(),
    correction_type: 'reprompt',
    commit_hash: null,
    skill_active: 'developer',
    file: partial.file ?? 'src/app.ts',
    language: 'typescript',
    ai_wrote: null,
    human_committed: null,
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
    pattern_categories: [],
  };
}

describe('impact ranking (E-A3)', () => {
  const now = Date.parse('2024-06-01T00:00:00Z');

  it('scores security higher than style for equal frequency/recency', () => {
    const sec = pattern({ dominant_reason: 'security', occurrences: 5, last_seen: new Date(now).toISOString() });
    const sty = pattern({ dominant_reason: 'style', occurrences: 5, last_seen: new Date(now).toISOString() });
    expect(computeImpactScore(sec, now)).toBeGreaterThan(computeImpactScore(sty, now));
  });

  it('keeps scores within [0, 1]', () => {
    const p = pattern({ occurrences: 99999, dominant_reason: 'security' });
    const s = computeImpactScore(p, now);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });

  it('ranks patterns deterministically by impact descending', () => {
    const a = pattern({ pattern_id: 'a', dominant_reason: 'style', occurrences: 2, last_seen: new Date(now - 90 * 86400000).toISOString() });
    const b = pattern({ pattern_id: 'b', dominant_reason: 'security', occurrences: 10, last_seen: new Date(now).toISOString() });
    const ranked = rankPatterns([a, b], now);
    expect(ranked[0]!.pattern_id).toBe('b');
    expect(ranked[0]!.impact_score).toBeGreaterThan(ranked[1]!.impact_score ?? 0);
  });
});

describe('meta-patterns (E-A2)', () => {
  it('groups patterns sharing reason and tokens', () => {
    const p1 = pattern({ pattern_id: 'p1', name: 'sql injection user input', proposed_rule: 'always sanitize sql user input', dominant_reason: 'security' });
    const p2 = pattern({ pattern_id: 'p2', name: 'sql injection query', proposed_rule: 'sanitize sql input before query', dominant_reason: 'security' });
    const p3 = pattern({ pattern_id: 'p3', name: 'naming convention', proposed_rule: 'use camelCase', dominant_reason: 'naming' });
    const metas = detectMetaPatterns([p1, p2, p3]);
    expect(metas.length).toBe(1);
    expect(metas[0]!.member_pattern_ids).toEqual(expect.arrayContaining(['p1', 'p2']));
    expect(metas[0]!.dominant_reason).toBe('security');
  });

  it('returns nothing when no patterns are related', () => {
    const p1 = pattern({ pattern_id: 'p1', name: 'alpha beta', dominant_reason: 'style' });
    const p2 = pattern({ pattern_id: 'p2', name: 'gamma delta', dominant_reason: 'naming' });
    expect(detectMetaPatterns([p1, p2])).toEqual([]);
  });
});

describe('contradiction detection (E-A5)', () => {
  it('flags opposing instructions on the same file', () => {
    const a = correction({ id: 'a', file: 'src/api.ts', developer_instruction: 'always use async here', session_id: 'dev1' });
    const b = correction({ id: 'b', file: 'src/api.ts', developer_instruction: 'never use async, keep it sync', session_id: 'dev2' });
    const found = detectContradictions([a, b]);
    expect(found.length).toBe(1);
    expect(found[0]!.severity).toBe('high');
    expect(found[0]!.file_or_topic).toBe('src/api.ts');
  });

  it('does not flag agreeing instructions', () => {
    const a = correction({ id: 'a', file: 'src/api.ts', developer_instruction: 'use async here' });
    const b = correction({ id: 'b', file: 'src/api.ts', developer_instruction: 'use async there too' });
    expect(detectContradictions([a, b])).toEqual([]);
  });
});
