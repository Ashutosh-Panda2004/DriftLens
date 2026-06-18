import { describe, it, expect, vi } from 'vitest';
import { getSkillAdapter } from '../src/adapters/skill-formats.js';
import type { PatternRecord } from '../src/shared/schema.js';

function mockPattern(override: Partial<PatternRecord> = {}): PatternRecord {
  return {
    pattern_id: 'test-pattern-id',
    name: 'service-layer-enforcement',
    description: 'AI calls fetch directly',
    occurrences: 5,
    confidence: 0.88,
    proposed_rule: 'Never call fetch directly. Use the service layer.',
    example_before: "fetch('/api/users')",
    example_after: "userService.getAll()",
    target_skills: ['developer'],
    target_formats: ['copilot', 'claude'],
    source_correction_ids: ['id1', 'id2'],
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

describe('MarkdownSkillAdapter', () => {
  it('reads empty file without error', async () => {
    const adapter = getSkillAdapter('claude');
    const result = await adapter.read('/nonexistent/CLAUDE.md');
    expect(result.raw).toBe('');
  });

  it('finds no locked sections in clean file', () => {
    const adapter = getSkillAdapter('claude');
    const content = '# Rules\n\n- Follow conventions\n\n## Developer Rules\n\n- Be precise';
    const locked = adapter.findLockedSections(content);
    expect(locked).toHaveLength(0);
  });

  it('finds LOCKED section', () => {
    const adapter = getSkillAdapter('claude');
    const content = '# Rules\n<!-- LOCKED -->\n- Do not modify this\n<!-- /LOCKED -->\n## Other';
    const locked = adapter.findLockedSections(content);
    expect(locked).toHaveLength(1);
  });

  it('finds existing Learned Rules section', () => {
    const adapter = getSkillAdapter('claude');
    const content = '# Rules\n\n## Learned Rules\n\n- Previous rule\n';
    const idx = adapter.findLearnedRulesSection(content);
    expect(idx).not.toBeNull();
  });

  it('returns null when no Learned Rules section', () => {
    const adapter = getSkillAdapter('claude');
    const content = '# Rules\n\n## Developer Rules\n\n- Some rule\n';
    const idx = adapter.findLearnedRulesSection(content);
    expect(idx).toBeNull();
  });

  it('writes pattern to empty file creating Learned Rules section', async () => {
    const adapter = getSkillAdapter('claude');
    const { tmpdir } = await import('os');
    const { join } = await import('path');
    const { writeFileSync, unlinkSync } = await import('fs');

    const tmpFile = join(tmpdir(), 'test-skill.md');
    writeFileSync(tmpFile, '# My Rules\n\n- Be precise\n');

    const existing = '# My Rules\n\n- Be precise\n';
    const result = await adapter.write(tmpFile, mockPattern(), existing);
    expect(result).toContain('## Learned Rules');
    expect(result).toContain('Never call fetch directly');
    expect(result).toContain('DriftLens');

    unlinkSync(tmpFile);
  });
});

describe('adapter factory', () => {
  it('returns markdown adapter for claude', () => {
    const adapter = getSkillAdapter('claude');
    expect(adapter).toBeDefined();
  });

  it('returns adapter for all supported formats', () => {
    for (const fmt of ['copilot', 'claude', 'cursor', 'gemini', 'windsurf', 'codex', 'universal']) {
      expect(getSkillAdapter(fmt)).toBeDefined();
    }
  });
});
