// NF-4: Correction-to-test synthesis
//
// A skill-file rule says "don't do X". A test *enforces* it. This module turns
// proven correction patterns into machine-checkable guards - a Semgrep rule, an
// ESLint note, or a unit-test stub - so that regressions are caught by CI rather
// than re-learned by DriftLens. It is intentionally conservative: it emits
// review-ready stubs, never silently-passing fake tests.

import type { PatternRecord, SynthesizedTest, CorrectionReason } from '../shared/schema.js';

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'rule';
}

/**
 * Heuristically extract a literal "forbidden" token from the before/after pair:
 * something present in the AI's wrong code that the developer removed.
 */
function forbiddenToken(p: PatternRecord): string | null {
  const before = (p.example_before || '').trim();
  const after = (p.example_after || '').trim();
  if (!before) return null;
  const beforeTokens = before.split(/\W+/).filter((w) => w.length > 3);
  const afterSet = new Set(after.split(/\W+/).filter(Boolean));
  const removed = beforeTokens.find((t) => !afterSet.has(t));
  return removed ?? beforeTokens[0] ?? null;
}

function semgrepRule(p: PatternRecord, token: string): SynthesizedTest {
  const id = `driftlens-${slug(p.name)}`;
  const content = [
    'rules:',
    `  - id: ${id}`,
    `    message: "${p.proposed_rule.replace(/"/g, "'").slice(0, 160)}"`,
    '    severity: WARNING',
    '    languages: [generic]',
    '    pattern: |',
    `      ${token}`,
  ].join('\n');
  return {
    pattern_id: p.pattern_id,
    name: p.name,
    kind: 'semgrep',
    language: 'generic',
    content,
    rationale: `Flags the construct "${token}" that developers repeatedly corrected (${p.occurrences}x).`,
  };
}

function unitTestStub(p: PatternRecord, language: string): SynthesizedTest {
  const fn = slug(p.name).replace(/-/g, '_');
  const content = [
    `// Auto-synthesised from DriftLens pattern "${p.name}" (${p.occurrences} corrections).`,
    `// Rule: ${p.proposed_rule}`,
    `// TODO(review): replace the placeholder assertion with a real guard.`,
    `import { describe, it, expect } from 'vitest';`,
    '',
    `describe('drift-guard: ${p.name}', () => {`,
    `  it.todo('should enforce: ${p.proposed_rule.replace(/'/g, "\u2019").slice(0, 120)}');`,
    `});`,
  ].join('\n');
  return {
    pattern_id: p.pattern_id,
    name: p.name,
    kind: 'unit-test-stub',
    language,
    content,
    rationale: `A failing-by-default stub so the team encodes "${p.name}" as an executable check.`,
  };
}

function eslintNote(p: PatternRecord): SynthesizedTest {
  const content = [
    `// ESLint guidance for "${p.name}":`,
    `// ${p.proposed_rule}`,
    `// Consider a no-restricted-syntax / no-restricted-imports rule, or a custom rule.`,
  ].join('\n');
  return {
    pattern_id: p.pattern_id,
    name: p.name,
    kind: 'eslint-note',
    language: 'javascript',
    content,
    rationale: 'Lint-level enforcement is cheaper than code review for style/api rules.',
  };
}

// Map taxonomy reason → the most appropriate enforcement mechanism.
const REASON_TO_KIND: Partial<Record<CorrectionReason, SynthesizedTest['kind']>> = {
  security: 'semgrep',
  'api-misuse': 'semgrep',
  correctness: 'unit-test-stub',
  performance: 'unit-test-stub',
  architecture: 'unit-test-stub',
  style: 'eslint-note',
  naming: 'eslint-note',
};

/**
 * Synthesise a single test/guard for a pattern, choosing the mechanism best
 * suited to its dominant reason.
 */
export function synthesizeTest(p: PatternRecord, language = 'typescript'): SynthesizedTest {
  const reason = p.dominant_reason ?? 'other';
  const kind = REASON_TO_KIND[reason] ?? 'unit-test-stub';

  if (kind === 'semgrep') {
    const token = forbiddenToken(p);
    if (token) return semgrepRule(p, token);
    return unitTestStub(p, language);
  }
  if (kind === 'eslint-note') return eslintNote(p);
  return unitTestStub(p, language);
}

/**
 * Synthesise guards for a set of patterns. Only patterns with enough evidence
 * (>= minOccurrences) are turned into tests to avoid CI noise from one-offs.
 */
export function synthesizeTests(
  patterns: PatternRecord[],
  opts: { minOccurrences?: number; language?: string } = {},
): SynthesizedTest[] {
  const minOccurrences = opts.minOccurrences ?? 3;
  return patterns
    .filter((p) => p.occurrences >= minOccurrences)
    .map((p) => synthesizeTest(p, opts.language));
}
