// DriftLens - Struggle chain analyser

import type { LLMAdapter, PatternRecord } from '../shared/schema.js';
import type { CorrectionRecord } from '../shared/schema.js';

/**
 * Analyse struggle chain corrections and produce enhanced PatternRecords.
 * This is called separately from the main pattern analysis when struggle chains are present.
 */
export async function analyseStruggleChains(
  corrections: CorrectionRecord[],
  llm: LLMAdapter
): Promise<Partial<PatternRecord>[]> {
  const chains = corrections.filter(
    (c) => c.correction_type === 'struggle_chain' && c.struggle_chain
  );

  if (chains.length === 0) return [];

  const enhancements: Partial<PatternRecord>[] = [];

  for (const correction of chains) {
    const chain = correction.struggle_chain;
    if (!chain) continue;

    const avgFriction = chain.friction_score;
    const turnsSaved = chain.turn_count;

    enhancements.push({
      avg_friction_score: avgFriction,
      total_prompt_turns_saved: turnsSaved,
      constraint_block: chain.rules_extracted.join('\n'),
    });
  }

  return enhancements;
}
