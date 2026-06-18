// E-C1: Correction-reason taxonomy
//
// Assigns every correction one or more reasons from a closed taxonomy so that
// downstream prioritisation, reporting, and skill proposals can reason about
// *why* a developer corrected the AI - not just *that* they did. Works entirely
// rule-based (no LLM required), so it is deterministic and free to run in
// `--no-llm` mode. The LLM analysis path may refine the dominant reason later.

import type { CorrectionRecord, CorrectionReason } from '../shared/schema.js';
import { REASON_KEYWORDS, REASON_PRIORITY } from '../shared/constants.js';

const VALID_REASONS = new Set<CorrectionReason>([
  'security', 'correctness', 'performance', 'architecture',
  'style', 'api-misuse', 'naming', 'testing', 'other',
]);

/**
 * Build the searchable text for a correction. Combines the developer's
 * instruction (the strongest signal of intent) with the before/after code and
 * any extracted struggle-chain rules.
 */
function signalText(c: CorrectionRecord): string {
  const parts: string[] = [];
  if (c.developer_instruction) parts.push(c.developer_instruction);
  if (c.struggle_chain?.rules_extracted?.length) {
    parts.push(c.struggle_chain.rules_extracted.join(' '));
  }
  if (c.ai_wrote) parts.push(c.ai_wrote);
  if (c.human_committed) parts.push(c.human_committed);
  if (c.file) parts.push(c.file);
  return parts.join(' \n ').toLowerCase();
}

/**
 * Classify a single correction into one or more taxonomy reasons. Always
 * returns at least one reason (`other` when nothing matches), so callers never
 * have to defend against empty arrays.
 */
export function classifyReasons(c: CorrectionRecord): CorrectionReason[] {
  const text = signalText(c);
  const matched: CorrectionReason[] = [];

  for (const reason of Object.keys(REASON_KEYWORDS)) {
    const keywords = REASON_KEYWORDS[reason] ?? [];
    if (keywords.some((kw) => text.includes(kw))) {
      matched.push(reason as CorrectionReason);
    }
  }

  if (matched.length === 0) return ['other'];

  // Order by taxonomy priority so the dominant reason is stable.
  return matched.sort((a, b) => REASON_PRIORITY.indexOf(a) - REASON_PRIORITY.indexOf(b));
}

/**
 * Pick the single dominant reason for a correction using the priority order.
 */
export function dominantReason(c: CorrectionRecord): CorrectionReason {
  return classifyReasons(c)[0] ?? 'other';
}

/**
 * Merge any pre-existing `pattern_categories` already on the record with the
 * freshly classified reasons. Existing valid taxonomy values are preserved;
 * unknown free-text categories are dropped from the canonical reason view but
 * left untouched on the record itself by the caller.
 */
export function reasonsForRecord(c: CorrectionRecord): CorrectionReason[] {
  const fromText = classifyReasons(c);
  const fromExisting = (c.pattern_categories ?? []).filter(
    (cat): cat is CorrectionReason => VALID_REASONS.has(cat as CorrectionReason),
  );
  const merged = new Set<CorrectionReason>([...fromExisting, ...fromText]);
  return [...merged].sort((a, b) => REASON_PRIORITY.indexOf(a) - REASON_PRIORITY.indexOf(b));
}

/**
 * Aggregate the reason distribution across a cluster of corrections and return
 * the breakdown plus the dominant reason. Deterministic: ties are broken by
 * taxonomy priority.
 */
export function aggregateReasons(corrections: CorrectionRecord[]): {
  dominant: CorrectionReason;
  breakdown: Partial<Record<CorrectionReason, number>>;
} {
  const breakdown: Partial<Record<CorrectionReason, number>> = {};

  for (const c of corrections) {
    for (const reason of reasonsForRecord(c)) {
      breakdown[reason] = (breakdown[reason] ?? 0) + 1;
    }
  }

  let dominant: CorrectionReason = 'other';
  let bestCount = -1;
  for (const reason of REASON_PRIORITY as CorrectionReason[]) {
    const count = breakdown[reason] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      dominant = reason;
    }
  }

  return { dominant, breakdown };
}
