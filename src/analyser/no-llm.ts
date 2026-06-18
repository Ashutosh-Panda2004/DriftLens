// DriftLens - Rule-based pattern analysis (no LLM, --no-llm mode)
// Uses Levenshtein distance + token overlap to find patterns without API calls.

import { v4 as uuidv4 } from 'uuid';
import type { PatternRecord } from '../shared/schema.js';
import type { CorrectionRecord } from '../shared/schema.js';
import { aggregateReasons } from './reason-classifier.js';

export interface TextCluster {
  corrections: CorrectionRecord[];
  representative: string;
}

export async function analyseWithoutLLM(
  clusters: TextCluster[]
): Promise<PatternRecord[]> {
  const now = new Date().toISOString();
  const patterns: PatternRecord[] = [];

  for (const cluster of clusters) {
    const timestamps = cluster.corrections.map((c) => c.ts).sort();
    const name = derivePatternName(cluster.representative);
    const { dominant, breakdown } = aggregateReasons(cluster.corrections);

    patterns.push({
      pattern_id: uuidv4(),
      name,
      description: `Recurring correction: ${cluster.representative.slice(0, 80)}`,
      occurrences: cluster.corrections.length,
      confidence: Math.min(0.5 + cluster.corrections.length * 0.05, 0.8),
      proposed_rule: cluster.representative,
      example_before: cluster.corrections.find((c) => c.ai_wrote)?.ai_wrote ?? '',
      example_after: cluster.corrections.find((c) => c.human_committed)?.human_committed ?? '',
      target_skills: ['developer'],
      target_formats: ['copilot', 'claude', 'cursor'],
      source_correction_ids: cluster.corrections.map((c) => c.id),
      first_seen: timestamps[0] ?? now,
      last_seen: timestamps[timestamps.length - 1] ?? now,
      status: 'pending',
      pr_url: null,
      drift_score_impact: cluster.corrections.length / 100,
      avg_friction_score: null,
      total_prompt_turns_saved: null,
      constraint_block: null,
      dominant_reason: dominant,
      reason_breakdown: breakdown,
    });
  }

  return patterns;
}

function derivePatternName(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 4)
    .join('-')
    .slice(0, 50) || 'unnamed-pattern';
}

/** Levenshtein distance (for small strings in rule-based mode) */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (__, j) => (i === 0 ? j : j === 0 ? i : 0))
  );

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }

  return dp[m]![n]!;
}
