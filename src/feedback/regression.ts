// DriftLens - Skill regression detection

import type { PatternRecord } from '../shared/schema.js';

/**
 * Detects if a previously merged pattern has regressed
 * (i.e., corrections matching this pattern are rising again post-merge)
 */
export function detectRegression(
  pattern: PatternRecord,
  correctionCountsBeforeMerge: number,
  correctionCountsAfterMerge: number
): boolean {
  if (pattern.status !== 'merged') return false;
  // Regression: corrections increased more than 20% post-merge
  return (
    correctionCountsAfterMerge > correctionCountsBeforeMerge * 1.2 &&
    correctionCountsAfterMerge > 2
  );
}
