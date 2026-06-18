import { describe, it, expect } from 'vitest';
import type { PatternRecord, CorrectionRecord, FeedbackRecord } from '../src/shared/schema.js';
import { computePatternEffectiveness, computeEffectiveness } from '../src/feedback/effectiveness.js';

function pattern(partial: Partial<PatternRecord>): PatternRecord {
  return {
    pattern_id: partial.pattern_id ?? 'p1',
    name: partial.name ?? 'sanitize-sql-input',
    description: '',
    occurrences: partial.occurrences ?? 5,
    confidence: 0.8,
    proposed_rule: partial.proposed_rule ?? 'always sanitize sql user input before query',
    example_before: '',
    example_after: '',
    target_skills: ['developer'],
    target_formats: ['copilot'],
    source_correction_ids: [],
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    status: 'merged',
    pr_url: null,
    drift_score_impact: 0,
    avg_friction_score: null,
    total_prompt_turns_saved: null,
    constraint_block: null,
    dominant_reason: partial.dominant_reason ?? 'security',
  };
}

function correction(id: string, ts: string, instruction: string): CorrectionRecord {
  return {
    id,
    ts,
    correction_type: 'reprompt',
    commit_hash: null,
    skill_active: 'developer',
    file: 'src/db.ts',
    language: 'typescript',
    ai_wrote: null,
    human_committed: null,
    developer_instruction: instruction,
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
    module_category: null,
    pattern_categories: [],
  };
}

const MERGE = '2024-06-01T00:00:00Z';
const before = (d: number) => new Date(Date.parse(MERGE) - d * 86400000).toISOString();
const after = (d: number) => new Date(Date.parse(MERGE) + d * 86400000).toISOString();

describe('effectiveness (E-F1)', () => {
  it('measures a reduction after merge', () => {
    const p = pattern({});
    const corrections = [
      correction('1', before(5), 'sanitize sql input'),
      correction('2', before(4), 'sanitize sql input'),
      correction('3', before(3), 'sanitize sql input'),
      correction('4', after(2), 'sanitize sql input'),
    ];
    const res = computePatternEffectiveness(p, corrections, MERGE, 30);
    expect(res.corrections_before).toBe(3);
    expect(res.corrections_after).toBe(1);
    expect(res.reduction_pct).toBeCloseTo(66.7, 0);
  });

  it('flags low confidence below the sample threshold', () => {
    const p = pattern({});
    const res = computePatternEffectiveness(p, [correction('1', before(1), 'sanitize sql input')], MERGE, 30);
    expect(res.low_confidence).toBe(true);
  });

  it('never produces NaN/Infinity when there are no before-corrections', () => {
    const p = pattern({});
    const res = computePatternEffectiveness(p, [correction('1', after(1), 'sanitize sql input')], MERGE, 30);
    expect(Number.isFinite(res.reduction_pct)).toBe(true);
    expect(res.reduction_pct).toBe(0);
  });

  it('handles a missing merge timestamp', () => {
    const p = pattern({});
    const res = computePatternEffectiveness(p, [correction('1', before(1), 'sanitize sql input')], null, 30);
    expect(res.merged_at).toBeNull();
    expect(res.low_confidence).toBe(true);
  });

  it('joins effectiveness to feedback merge timestamps', () => {
    const p = pattern({ pattern_id: 'px' });
    const feedback: FeedbackRecord[] = [{
      pattern_id: 'px',
      proposed_at: before(10),
      pr_url: 'http://x',
      pr_status: 'merged',
      merged_at: MERGE,
      corrections_before_merge: 0,
      corrections_after_merge: 0,
      reduction_pct: 0,
      regressed: false,
    }];
    const corrections = [correction('1', before(2), 'sanitize sql input')];
    const results = computeEffectiveness([p], corrections, feedback, 30);
    expect(results[0]!.merged_at).toBe(MERGE);
  });
});
