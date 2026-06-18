import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeFileSync, rmSync, mkdtempSync } from 'fs';
import { readJsonl, readJsonFile } from '../src/shared/io.js';
import { getSkillAdapter } from '../src/adapters/skill-formats.js';
import type { PatternRecord } from '../src/shared/schema.js';

function tmpFile(name: string, content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'driftlens-io-'));
  const fp = join(dir, name);
  writeFileSync(fp, content);
  return fp;
}

function mockPattern(override: Partial<PatternRecord> = {}): PatternRecord {
  return {
    pattern_id: 'p1',
    name: 'service-layer-enforcement',
    description: 'AI calls fetch directly',
    occurrences: 5,
    confidence: 0.88,
    proposed_rule: 'Never call fetch directly. Use the service layer.',
    example_before: "fetch('/api/users')",
    example_after: 'userService.getAll()',
    target_skills: ['developer'],
    target_formats: ['claude'],
    source_correction_ids: ['id1'],
    first_seen: '2026-05-20T10:00:00Z',
    last_seen: '2026-05-25T10:00:00Z',
    status: 'pending',
    pr_url: null,
    drift_score_impact: 0.05,
    avg_friction_score: null,
    total_prompt_turns_saved: null,
    constraint_block: null,
    ...override,
  };
}

describe('readJsonl', () => {
  it('returns [] for a missing file', async () => {
    expect(await readJsonl('/does/not/exist.jsonl')).toEqual([]);
  });

  it('skips malformed and blank lines instead of throwing', async () => {
    const fp = tmpFile(
      'c.jsonl',
      '{"a":1}\n\n{ broken json \n{"a":2}\n'
    );
    const rows = await readJsonl<{ a: number }>(fp);
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe('readJsonFile', () => {
  it('returns the fallback for a missing file', async () => {
    expect(await readJsonFile('/nope.json', { ok: true })).toEqual({ ok: true });
  });

  it('returns the fallback for corrupt JSON', async () => {
    const fp = tmpFile('p.json', '{ not valid');
    expect(await readJsonFile(fp, [])).toEqual([]);
  });

  it('parses valid JSON', async () => {
    const fp = tmpFile('p.json', '[{"x":1}]');
    expect(await readJsonFile(fp, [])).toEqual([{ x: 1 }]);
  });
});

describe('skill insertion idempotency', () => {
  it('does not duplicate a rule when written twice', async () => {
    const adapter = getSkillAdapter('claude');
    const fp = tmpFile('CLAUDE.md', '# Rules\n\n- Be precise\n');

    const first = await adapter.write(fp, mockPattern(), '# Rules\n\n- Be precise\n');
    const second = await adapter.write(fp, mockPattern(), first);

    const occurrences = second.split('Never call fetch directly').length - 1;
    expect(occurrences).toBe(1);

    rmSync(fp, { force: true });
  });

  it('preserves content that follows the Learned Rules section', async () => {
    const adapter = getSkillAdapter('claude');
    const existing =
      '# Rules\n\n## Learned Rules\n\n- Existing rule\n\n## Appendix\n\nKeep me.\n';
    const fp = tmpFile('CLAUDE.md', existing);

    const result = await adapter.write(fp, mockPattern(), existing);
    expect(result).toContain('## Appendix');
    expect(result).toContain('Keep me.');
    expect(result).toContain('Never call fetch directly');
    // The new rule must be inserted before the Appendix heading.
    expect(result.indexOf('Never call fetch directly')).toBeLessThan(
      result.indexOf('## Appendix')
    );

    rmSync(fp, { force: true });
  });
});
