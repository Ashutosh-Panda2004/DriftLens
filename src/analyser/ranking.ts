// E-A3: Impact-based pattern ranking
//
// Patterns are not equally important. A security mistake that recurs weekly is
// far more valuable to fix than a stylistic nit seen twice months ago. This
// module computes a single, deterministic `impact_score` in [0, 1] from three
// signals - frequency, recency, and reason severity - and sorts patterns by it.

import type { PatternRecord, CorrectionReason } from '../shared/schema.js';

// Severity weight per reason. Security/correctness dominate; style is lowest.
const REASON_SEVERITY: Record<CorrectionReason, number> = {
  security: 1.0,
  correctness: 0.9,
  performance: 0.7,
  architecture: 0.7,
  'api-misuse': 0.6,
  testing: 0.5,
  naming: 0.35,
  style: 0.25,
  other: 0.4,
};

const FREQUENCY_WEIGHT = 0.45;
const SEVERITY_WEIGHT = 0.35;
const RECENCY_WEIGHT = 0.2;
const RECENCY_HALF_LIFE_DAYS = 30;

/**
 * Normalised frequency in [0, 1] using a saturating curve so that very large
 * clusters do not dwarf everything else. 10 occurrences ~= 0.83.
 */
function frequencyScore(occurrences: number): number {
  if (occurrences <= 0) return 0;
  return occurrences / (occurrences + 2);
}

/**
 * Recency in [0, 1] via exponential decay on days since last seen. Guards
 * against unparseable / future dates.
 */
function recencyScore(lastSeen: string, now: number): number {
  const t = Date.parse(lastSeen);
  if (Number.isNaN(t)) return 0.5;
  const ageDays = Math.max(0, (now - t) / 86_400_000);
  return Math.pow(0.5, ageDays / RECENCY_HALF_LIFE_DAYS);
}

function severityScore(p: PatternRecord): number {
  const reason = p.dominant_reason ?? 'other';
  return REASON_SEVERITY[reason] ?? 0.4;
}

/**
 * Compute the impact score for a single pattern. Pure and deterministic given
 * a fixed `now`.
 */
export function computeImpactScore(p: PatternRecord, now: number = Date.now()): number {
  const freq = frequencyScore(p.occurrences);
  const sev = severityScore(p);
  const rec = recencyScore(p.last_seen, now);
  const score = FREQUENCY_WEIGHT * freq + SEVERITY_WEIGHT * sev + RECENCY_WEIGHT * rec;
  // Clamp defensively.
  return Math.max(0, Math.min(1, score));
}

/**
 * Annotate each pattern with `impact_score` and return a new array sorted by
 * descending impact. Stable tie-break by occurrences then name for determinism.
 */
export function rankPatterns(patterns: PatternRecord[], now: number = Date.now()): PatternRecord[] {
  return patterns
    .map((p) => ({ ...p, impact_score: computeImpactScore(p, now) }))
    .sort((a, b) => {
      if (b.impact_score !== a.impact_score) return b.impact_score - a.impact_score;
      if (b.occurrences !== a.occurrences) return b.occurrences - a.occurrences;
      return a.name.localeCompare(b.name);
    });
}
