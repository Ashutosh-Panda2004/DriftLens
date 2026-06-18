// E-F1: Causal rule-effectiveness measurement
//
// Did proposing a rule actually reduce the corrections it targeted? This module
// measures that causally by comparing the rate of matching corrections in a
// fixed window *before* a rule was merged to the rate *after*. It is fully
// deterministic, guards every ratio against NaN/Infinity, and flags results as
// low-confidence when the sample is too small to trust (N < 20).

import type {
  CorrectionRecord,
  PatternRecord,
  FeedbackRecord,
  CorrectionReason,
} from '../shared/schema.js';
import { reasonsForRecord } from '../analyser/reason-classifier.js';

export interface EffectivenessResult {
  pattern_id: string;
  name: string;
  merged_at: string | null;
  window_days: number;
  corrections_before: number;
  corrections_after: number;
  reduction_pct: number;
  low_confidence: boolean;
  last_fired: string | null;
}

const MIN_SAMPLE = 20;
const DAY_MS = 86_400_000;

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3),
  );
}

/**
 * Does a correction plausibly belong to the same problem the pattern targets?
 * We require a shared dominant reason and at least two overlapping content
 * tokens to keep matching precise without an LLM.
 */
function correctionMatchesPattern(
  c: CorrectionRecord,
  patternReason: CorrectionReason | null,
  patternTokens: Set<string>,
): boolean {
  if (patternReason) {
    const reasons = reasonsForRecord(c);
    if (!reasons.includes(patternReason)) return false;
  }
  const cText = [c.developer_instruction, c.ai_wrote, c.human_committed, c.file]
    .filter(Boolean)
    .join(' ');
  const cTokens = tokenSet(cText);
  let overlap = 0;
  for (const t of patternTokens) {
    if (cTokens.has(t)) {
      overlap++;
      if (overlap >= 2) return true;
    }
  }
  return false;
}

/**
 * Compute effectiveness for a single pattern given its merge timestamp.
 */
export function computePatternEffectiveness(
  pattern: PatternRecord,
  corrections: CorrectionRecord[],
  mergedAt: string | null,
  windowDays: number,
): EffectivenessResult {
  const patternTokens = tokenSet(`${pattern.name} ${pattern.proposed_rule}`);
  const patternReason = pattern.dominant_reason ?? null;

  const matching = corrections.filter((c) =>
    correctionMatchesPattern(c, patternReason, patternTokens),
  );

  const lastFired = matching
    .map((c) => c.ts)
    .filter((ts) => !Number.isNaN(Date.parse(ts)))
    .sort()
    .pop() ?? null;

  if (!mergedAt || Number.isNaN(Date.parse(mergedAt))) {
    return {
      pattern_id: pattern.pattern_id,
      name: pattern.name,
      merged_at: null,
      window_days: windowDays,
      corrections_before: matching.length,
      corrections_after: 0,
      reduction_pct: 0,
      low_confidence: true,
      last_fired: lastFired,
    };
  }

  const mergeMs = Date.parse(mergedAt);
  const windowMs = windowDays * DAY_MS;

  let before = 0;
  let after = 0;
  for (const c of matching) {
    const t = Date.parse(c.ts);
    if (Number.isNaN(t)) continue;
    if (t >= mergeMs - windowMs && t < mergeMs) before++;
    else if (t >= mergeMs && t <= mergeMs + windowMs) after++;
  }

  // Guard the ratio: only meaningful when there were corrections beforehand.
  const reductionPct = before > 0 ? ((before - after) / before) * 100 : 0;
  const lowConfidence = before + after < MIN_SAMPLE;

  return {
    pattern_id: pattern.pattern_id,
    name: pattern.name,
    merged_at: mergedAt,
    window_days: windowDays,
    corrections_before: before,
    corrections_after: after,
    reduction_pct: Math.round(reductionPct * 10) / 10,
    low_confidence: lowConfidence,
    last_fired: lastFired,
  };
}

/**
 * Compute effectiveness for every pattern, looking up merge timestamps from the
 * feedback records (falling back to null when a pattern was never merged).
 */
export function computeEffectiveness(
  patterns: PatternRecord[],
  corrections: CorrectionRecord[],
  feedback: FeedbackRecord[],
  windowDays = 30,
): EffectivenessResult[] {
  const mergeByPattern = new Map<string, string | null>();
  for (const f of feedback) {
    mergeByPattern.set(f.pattern_id, f.merged_at);
  }

  return patterns.map((p) =>
    computePatternEffectiveness(p, corrections, mergeByPattern.get(p.pattern_id) ?? null, windowDays),
  );
}
