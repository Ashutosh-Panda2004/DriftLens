import { describe, it, expect } from 'vitest';
import { mkdtemp, mkdir, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import path from 'path';
import type { PatternRecord, RuleRegistry } from '../src/shared/schema.js';
import { exportRegistry, importRegistry } from '../src/team/registry.js';
import { synthesizeTest, synthesizeTests } from '../src/proposer/test-synthesis.js';

function pattern(partial: Partial<PatternRecord>): PatternRecord {
  return {
    pattern_id: partial.pattern_id ?? 'p1',
    name: partial.name ?? 'sanitize-input',
    description: partial.description ?? 'desc',
    occurrences: partial.occurrences ?? 5,
    confidence: partial.confidence ?? 0.9,
    proposed_rule: partial.proposed_rule ?? 'always sanitize input',
    example_before: partial.example_before ?? 'execRaw(userInput)',
    example_after: partial.example_after ?? 'execSafe(sanitize(userInput))',
    target_skills: ['developer'],
    target_formats: ['copilot'],
    source_correction_ids: partial.source_correction_ids ?? ['c1', 'c2'],
    first_seen: new Date().toISOString(),
    last_seen: new Date().toISOString(),
    status: partial.status ?? 'merged',
    pr_url: null,
    drift_score_impact: 0,
    avg_friction_score: null,
    total_prompt_turns_saved: null,
    constraint_block: null,
    dominant_reason: partial.dominant_reason ?? 'security',
  };
}

async function repo(patterns: PatternRecord[]): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'driftlens-reg-'));
  await mkdir(path.join(dir, '.driftlens'), { recursive: true });
  await writeFile(path.join(dir, '.driftlens', 'patterns.json'), JSON.stringify(patterns), 'utf8');
  return dir;
}

describe('org rule registry (NF-3)', () => {
  it('exports only proven, confident rules', async () => {
    const dir = await repo([
      pattern({ pattern_id: 'a', confidence: 0.9, status: 'merged' }),
      pattern({ pattern_id: 'b', confidence: 0.4, status: 'merged' }),
      pattern({ pattern_id: 'c', confidence: 0.9, status: 'rejected' }),
    ]);
    const reg = await exportRegistry({ cwd: dir, minConfidence: 0.75, source: 'team-x' });
    expect(reg.rules.map((r) => r.rule_id)).toEqual(['a']);
    expect(reg.source).toBe('team-x');
  });

  it('imports rules idempotently', async () => {
    const dir = await repo([]);
    const registry: RuleRegistry = {
      registry_version: '1',
      exported_at: new Date().toISOString(),
      source: 'org',
      scope: 'org',
      rules: [{
        rule_id: 'x',
        name: 'imported-rule',
        rule_text: 'validate all jwt tokens',
        reason: 'security',
        confidence: 0.9,
        occurrences: 7,
        scope: 'org',
        version: '1',
        provenance: { source_repo: 'core', first_seen: new Date().toISOString(), last_seen: new Date().toISOString(), evidence_correction_count: 7 },
      }],
    };
    const first = await importRegistry(dir, registry);
    expect(first.imported).toBe(1);
    const second = await importRegistry(dir, registry);
    expect(second.imported).toBe(0);
    expect(second.skipped_existing).toBe(1);
  });
});

describe('correction-to-test synthesis (NF-4)', () => {
  it('emits a semgrep rule for a security pattern', () => {
    const t = synthesizeTest(pattern({ dominant_reason: 'security' }));
    expect(t.kind).toBe('semgrep');
    expect(t.content).toContain('rules:');
  });

  it('emits an eslint note for a style pattern', () => {
    const t = synthesizeTest(pattern({ dominant_reason: 'style' }));
    expect(t.kind).toBe('eslint-note');
  });

  it('emits a unit-test stub for correctness patterns', () => {
    const t = synthesizeTest(pattern({ dominant_reason: 'correctness' }));
    expect(t.kind).toBe('unit-test-stub');
    expect(t.content).toContain('describe(');
  });

  it('skips patterns below the occurrence threshold', () => {
    const tests = synthesizeTests([pattern({ occurrences: 1 })], { minOccurrences: 3 });
    expect(tests).toEqual([]);
  });
});
