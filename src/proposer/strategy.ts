// E-P2 / E-P3: Conflict-aware proposing & strategy presets
//
// Two safeguards against a noisy, contradictory skill file:
//   1. Conflict detection - before adding a rule, check whether the skill file
//      already contains a semantically overlapping or directly contradictory
//      rule, so we can supersede/skip instead of stacking duplicates.
//   2. Strategy presets - a single `--strategy` knob that maps to a coherent
//      set of thresholds, so users don't have to tune confidence/occurrence/
//      impact independently.

import type { PatternRecord } from '../shared/schema.js';

export type ProposalStrategy = 'conservative' | 'balanced' | 'aggressive';

export interface StrategyThresholds {
  minConfidence: number;
  minOccurrences: number;
  minImpact: number;
  maxPerFile: number;
}

const STRATEGY_PRESETS: Record<ProposalStrategy, StrategyThresholds> = {
  // High bar: only propose well-evidenced, high-impact rules, few at a time.
  conservative: { minConfidence: 0.85, minOccurrences: 4, minImpact: 0.5, maxPerFile: 3 },
  // Sensible defaults.
  balanced: { minConfidence: 0.75, minOccurrences: 3, minImpact: 0.3, maxPerFile: 6 },
  // Cast a wide net; surface more candidates, accept more noise.
  aggressive: { minConfidence: 0.55, minOccurrences: 2, minImpact: 0.1, maxPerFile: 12 },
};

export function resolveStrategy(strategy: string | undefined): StrategyThresholds {
  const key = (strategy ?? 'balanced').toLowerCase() as ProposalStrategy;
  return STRATEGY_PRESETS[key] ?? STRATEGY_PRESETS.balanced;
}

// Antonym pairs that mark two rules as contradictory rather than merely similar.
const OPPOSING_PAIRS: Array<[string, string]> = [
  ['always', 'never'],
  ['use', 'avoid'],
  ['enable', 'disable'],
  ['public', 'private'],
  ['sync', 'async'],
  ['inline', 'extract'],
  ['required', 'optional'],
  ['camelcase', 'snake_case'],
  ['tabs', 'spaces'],
];

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

export interface ConflictResult {
  kind: 'none' | 'duplicate' | 'overlap' | 'contradiction';
  similarity: number;
  existingLine: string | null;
}

/**
 * Split an existing skill file into candidate rule lines (bullets / numbered).
 */
function existingRuleLines(skillContent: string): string[] {
  return skillContent
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^([-*]|\d+\.)\s+/.test(l));
}

/**
 * Compare a proposed rule against the rules already present in a skill file.
 */
export function detectConflict(proposedRule: string, skillContent: string): ConflictResult {
  const proposedTokens = tokenSet(proposedRule);
  const proposedLower = proposedRule.toLowerCase();
  let best: ConflictResult = { kind: 'none', similarity: 0, existingLine: null };

  for (const line of existingRuleLines(skillContent)) {
    const sim = jaccard(proposedTokens, tokenSet(line));
    const lineLower = line.toLowerCase();

    // Contradiction beats similarity: opposing directive on shared subject.
    const contradicts = OPPOSING_PAIRS.some(
      ([x, y]) =>
        (proposedLower.includes(x) && lineLower.includes(y)) ||
        (proposedLower.includes(y) && lineLower.includes(x)),
    );
    if (contradicts && sim >= 0.2) {
      return { kind: 'contradiction', similarity: sim, existingLine: line };
    }

    if (sim > best.similarity) {
      best = {
        kind: sim >= 0.8 ? 'duplicate' : sim >= 0.5 ? 'overlap' : 'none',
        similarity: sim,
        existingLine: sim >= 0.5 ? line : null,
      };
    }
  }

  return best;
}

/**
 * Apply strategy thresholds to a set of pending patterns, returning the subset
 * eligible for proposal (already sorted by impact upstream).
 */
export function selectByStrategy(
  patterns: PatternRecord[],
  thresholds: StrategyThresholds,
): PatternRecord[] {
  return patterns.filter(
    (p) =>
      p.confidence >= thresholds.minConfidence &&
      p.occurrences >= thresholds.minOccurrences &&
      (p.impact_score ?? 0) >= thresholds.minImpact,
  );
}
