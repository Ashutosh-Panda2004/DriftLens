// E-A2: Meta-pattern detection
//
// Individual patterns often share a deeper systemic theme - e.g. several
// distinct "wrong API" patterns may all stem from the AI not knowing the
// project's data-access layer. This module groups related patterns into
// meta-patterns by reason + token similarity so teams can address root causes
// instead of symptoms. Fully deterministic and LLM-free.

import { v4 as uuidv4 } from 'uuid';
import type { PatternRecord, MetaPattern, CorrectionReason } from '../shared/schema.js';

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'should', 'must',
  'use', 'using', 'when', 'code', 'rule', 'avoid', 'always', 'never', 'recurring',
  'correction', 'pattern',
]);

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3 && !STOPWORDS.has(w)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const union = a.size + b.size - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Group patterns into meta-patterns. Two patterns join the same meta-pattern
 * when they share the dominant reason and have token similarity above the
 * threshold across name + description + proposed rule.
 */
export function detectMetaPatterns(
  patterns: PatternRecord[],
  similarityThreshold = 0.25,
): MetaPattern[] {
  const tokenSets = patterns.map((p) =>
    tokens(`${p.name} ${p.description} ${p.proposed_rule}`),
  );
  const used = new Set<number>();
  const metas: MetaPattern[] = [];

  for (let i = 0; i < patterns.length; i++) {
    if (used.has(i)) continue;
    const members = [i];
    used.add(i);

    for (let j = i + 1; j < patterns.length; j++) {
      if (used.has(j)) continue;
      const sameReason =
        (patterns[i]!.dominant_reason ?? 'other') === (patterns[j]!.dominant_reason ?? 'other');
      if (!sameReason) continue;
      if (jaccard(tokenSets[i]!, tokenSets[j]!) >= similarityThreshold) {
        members.push(j);
        used.add(j);
      }
    }

    // Only emit meta-patterns that actually unify 2+ distinct patterns.
    if (members.length < 2) continue;

    const memberPatterns = members.map((idx) => patterns[idx]!);
    const totalOccurrences = memberPatterns.reduce((s, p) => s + p.occurrences, 0);
    const reason: CorrectionReason = patterns[i]!.dominant_reason ?? 'other';
    const sharedTokens = [...tokenSets[i]!].slice(0, 4).join(' ');

    metas.push({
      meta_id: uuidv4(),
      theme: sharedTokens || reason,
      description: `${members.length} patterns share a "${reason}" theme${
        sharedTokens ? ` around ${sharedTokens}` : ''
      }.`,
      member_pattern_ids: memberPatterns.map((p) => p.pattern_id),
      total_occurrences: totalOccurrences,
      dominant_reason: reason,
      // Systemic score grows with both breadth (number of patterns) and depth
      // (total occurrences), saturating to keep it in [0, 1].
      systemic_score: Math.min(
        1,
        (members.length / (members.length + 2)) * 0.6 +
          (totalOccurrences / (totalOccurrences + 10)) * 0.4,
      ),
    });
  }

  return metas.sort((a, b) => b.systemic_score - a.systemic_score);
}
