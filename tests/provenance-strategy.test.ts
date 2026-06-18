import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import {
  ruleHash,
  recordDecision,
  rejectedRuleHashes,
  filterRejected,
} from '../src/proposer/provenance.js';
import {
  resolveStrategy,
  selectByStrategy,
  detectConflict,
} from '../src/proposer/strategy.js';
import type { PatternRecord } from '../src/shared/schema.js';

async function tmp(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'driftlens-prov-'));
  // provenance writes to .driftlens/proposals.jsonl
  const { mkdir } = await import('fs/promises');
  await mkdir(path.join(dir, '.driftlens'), { recursive: true });
  return dir;
}

function pattern(partial: Partial<PatternRecord>): PatternRecord {
  return {
    pattern_id: partial.pattern_id ?? 'p1',
    name: partial.name ?? 'rule-name',
    description: '',
    occurrences: partial.occurrences ?? 5,
    confidence: partial.confidence ?? 0.9,
    proposed_rule: partial.proposed_rule ?? 'always sanitize input',
    example_before: '',
    example_after: '',
    target_skills: ['developer'],
    target_formats: ['copilot'],
    source_correction_ids: [],
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    status: 'pending',
    pr_url: null,
    drift_score_impact: 0,
    avg_friction_score: null,
    total_prompt_turns_saved: null,
    constraint_block: null,
    impact_score: partial.impact_score ?? 0.5,
  };
}

describe('provenance & rejection learning (E-F2/E-P1)', () => {
  it('produces a stable hash regardless of whitespace/case', () => {
    expect(ruleHash('Always Sanitize  Input')).toBe(ruleHash('always sanitize input'));
  });

  it('records and reads back a rejected decision', async () => {
    const dir = await tmp();
    await recordDecision(dir, pattern({ proposed_rule: 'use prepared statements' }), 'rejected', 'too broad');
    const rejected = await rejectedRuleHashes(dir);
    expect(rejected.has(ruleHash('use prepared statements'))).toBe(true);
    const log = await readFile(path.join(dir, '.driftlens', 'proposals.jsonl'), 'utf8');
    expect(log).toContain('rejected');
  });

  it('filters out previously-rejected candidates', async () => {
    const dir = await tmp();
    await recordDecision(dir, pattern({ proposed_rule: 'rule a' }), 'rejected');
    const { allowed, skipped } = await filterRejected(dir, [
      pattern({ proposed_rule: 'rule a' }),
      pattern({ proposed_rule: 'rule b' }),
    ]);
    expect(allowed.length).toBe(1);
    expect(skipped.length).toBe(1);
    expect(allowed[0]!.proposed_rule).toBe('rule b');
  });
});

describe('strategy presets (E-P3)', () => {
  it('resolves known presets and falls back to balanced', () => {
    expect(resolveStrategy('conservative').minConfidence).toBe(0.85);
    expect(resolveStrategy('aggressive').minOccurrences).toBe(2);
    expect(resolveStrategy('nonsense')).toEqual(resolveStrategy('balanced'));
  });

  it('selects patterns meeting the active thresholds', () => {
    const ps = [
      pattern({ pattern_id: 'a', confidence: 0.9, occurrences: 5, impact_score: 0.6 }),
      pattern({ pattern_id: 'b', confidence: 0.6, occurrences: 5, impact_score: 0.6 }),
    ];
    const selected = selectByStrategy(ps, resolveStrategy('conservative'));
    expect(selected.map((p) => p.pattern_id)).toEqual(['a']);
  });
});

describe('conflict-aware writing (E-P2)', () => {
  it('detects a duplicate rule', () => {
    const skill = '- always sanitize user input before running a query';
    const res = detectConflict('always sanitize user input before running a query', skill);
    expect(res.kind).toBe('duplicate');
  });

  it('detects a contradiction', () => {
    const skill = '- always use async functions in this module';
    const res = detectConflict('never use async functions in this module', skill);
    expect(res.kind).toBe('contradiction');
  });

  it('returns none for unrelated rules', () => {
    const skill = '- prefer kebab-case file names';
    const res = detectConflict('validate jwt tokens on every request', skill);
    expect(res.kind).toBe('none');
  });
});
