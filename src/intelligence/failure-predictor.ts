// DriftLens - Predictive Failure Prevention Engine
// Predicts which mistakes an AI agent will make for a specific file,
// and generates constraints to inject BEFORE generation.

import { existsSync } from 'fs';
import path from 'path';
import { readJsonl, readJsonFile } from '../shared/io.js';
import { CORRECTIONS_FILE, PATTERNS_FILE } from '../shared/constants.js';
import type {
  CorrectionRecord,
  PatternRecord,
  FailurePrediction,
} from '../shared/schema.js';

interface PredictionOptions {
  cwd: string;
  targetFile: string;
  agent?: string;
}

/**
 * Predict which AI failures are likely for a given file.
 *
 * Uses historical correction data to build a per-file failure probability model:
 * - How often has this file been corrected?
 * - Which patterns have occurred in this file or similar files?
 * - What's the agent-specific accuracy for this file category?
 *
 * Output: ranked list of predicted failures with injectable constraints.
 */
export async function predictFailures(opts: PredictionOptions): Promise<FailurePrediction> {
  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);
  const patternsPath = path.join(opts.cwd, PATTERNS_FILE);

  if (!existsSync(corrPath)) {
    return emptyPrediction(opts.targetFile);
  }

  const corrections = await readJsonl<CorrectionRecord>(corrPath);
  const patterns = await readJsonFile<PatternRecord[]>(patternsPath, []);

  // Find corrections relevant to this file
  const fileCorrections = corrections.filter((c) => isRelevantToFile(c, opts.targetFile));
  const dirCorrections = corrections.filter((c) => isInSameDirectory(c, opts.targetFile));
  const categoryCorrections = corrections.filter((c) =>
    isSameCategory(c, opts.targetFile)
  );

  // Calculate failure probabilities per pattern
  const predictedFailures: FailurePrediction['predicted_failures'] = [];

  for (const pattern of patterns) {
    if (pattern.status === 'merged') continue; // Already fixed

    const patternCorrections = corrections.filter((c) =>
      pattern.source_correction_ids.includes(c.id)
    );

    // File-specific probability
    const fileHits = patternCorrections.filter((c) => isRelevantToFile(c, opts.targetFile));
    const dirHits = patternCorrections.filter((c) => isInSameDirectory(c, opts.targetFile));
    const catHits = patternCorrections.filter((c) => isSameCategory(c, opts.targetFile));

    // Weighted probability: direct file match > same dir > same category
    const probability = calculateProbability(
      fileHits.length,
      dirHits.length,
      catHits.length,
      patternCorrections.length,
      corrections.length
    );

    if (probability >= 0.3) {
      const lastOccurrence = patternCorrections
        .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())[0];

      predictedFailures.push({
        pattern_id: pattern.pattern_id,
        pattern_name: pattern.name,
        probability,
        constraint_to_inject: buildConstraint(pattern),
        historical_correction_count: patternCorrections.length,
        last_occurred: lastOccurrence?.ts ?? 'unknown',
      });
    }
  }

  // Also check for file-specific corrections without named patterns
  const unpatternedCorrections = fileCorrections.filter((c) =>
    !patterns.some((p) => p.source_correction_ids.includes(c.id))
  );

  if (unpatternedCorrections.length >= 2) {
    // Group by developer_instruction or ai_wrote content
    const groups = groupByContent(unpatternedCorrections);
    for (const [, group] of Object.entries(groups)) {
      if (group.length >= 2) {
        predictedFailures.push({
          pattern_id: 'unnamed-' + group[0].id,
          pattern_name: 'Recurring file-specific correction',
          probability: Math.min(0.5 + group.length * 0.1, 0.95),
          constraint_to_inject: buildConstraintFromCorrections(group),
          historical_correction_count: group.length,
          last_occurred: group[group.length - 1].ts,
        });
      }
    }
  }

  // Sort by probability descending
  predictedFailures.sort((a, b) => b.probability - a.probability);

  const overallRisk = calculateOverallRisk(predictedFailures);

  return {
    file: opts.targetFile,
    predicted_failures: predictedFailures,
    overall_risk: overallRisk,
    recommended_agent: null, // Filled by agent-router
  };
}

/**
 * Build a natural-language constraint from a pattern for context injection.
 */
function buildConstraint(pattern: PatternRecord): string {
  if (pattern.constraint_block) return pattern.constraint_block;
  return `CONSTRAINT: ${pattern.proposed_rule}`;
}

function buildConstraintFromCorrections(corrections: CorrectionRecord[]): string {
  const instructions = corrections
    .map((c) => c.developer_instruction)
    .filter(Boolean)
    .slice(0, 3);

  if (instructions.length > 0) {
    return `CONSTRAINT: ${instructions.join('; ')}`;
  }

  // Fall back to inferring from ai_wrote → human_committed diff
  const first = corrections[0];
  if (first.ai_wrote && first.human_committed) {
    return `CONSTRAINT: Do not write "${first.ai_wrote.slice(0, 50)}..." - use "${first.human_committed.slice(0, 50)}..." instead.`;
  }

  return 'CONSTRAINT: Review historical corrections for this file before generating.';
}

// ─── Probability Calculation ──────────────────────────────────────────────────

function calculateProbability(
  fileHits: number,
  dirHits: number,
  catHits: number,
  patternTotal: number,
  totalCorrections: number
): number {
  // Weighted score: direct file hits are strongest signal
  const fileWeight = 0.5;
  const dirWeight = 0.3;
  const catWeight = 0.2;

  const fileScore = fileHits > 0 ? Math.min(fileHits / 3, 1) : 0;
  const dirScore = dirHits > 0 ? Math.min(dirHits / 5, 1) : 0;
  const catScore = catHits > 0 ? Math.min(catHits / 8, 1) : 0;

  const baseProb = fileScore * fileWeight + dirScore * dirWeight + catScore * catWeight;

  // Boost by pattern frequency relative to total corrections
  const frequencyBoost = Math.min(patternTotal / totalCorrections, 0.3);

  return Math.min(baseProb + frequencyBoost, 0.99);
}

function calculateOverallRisk(
  predictions: FailurePrediction['predicted_failures']
): FailurePrediction['overall_risk'] {
  if (predictions.length === 0) return 'low';
  const maxProb = predictions[0]?.probability ?? 0;
  if (maxProb >= 0.8) return 'critical';
  if (maxProb >= 0.6) return 'high';
  if (maxProb >= 0.4) return 'medium';
  return 'low';
}

// ─── File Matching Utilities ──────────────────────────────────────────────────

function isRelevantToFile(c: CorrectionRecord, targetFile: string): boolean {
  return c.file === targetFile || path.basename(c.file) === path.basename(targetFile);
}

function isInSameDirectory(c: CorrectionRecord, targetFile: string): boolean {
  return path.dirname(c.file) === path.dirname(targetFile);
}

function isSameCategory(c: CorrectionRecord, targetFile: string): boolean {
  const catA = inferSimpleCategory(c.file);
  const catB = inferSimpleCategory(targetFile);
  return catA === catB && catA !== 'general';
}

function inferSimpleCategory(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes('test') || lower.includes('spec')) return 'test';
  if (lower.includes('service')) return 'service';
  if (lower.includes('component') || lower.endsWith('.tsx')) return 'component';
  if (lower.includes('controller') || lower.includes('handler')) return 'handler';
  if (lower.includes('model') || lower.includes('schema')) return 'data';
  return 'general';
}

function groupByContent(corrections: CorrectionRecord[]): Record<string, CorrectionRecord[]> {
  const groups: Record<string, CorrectionRecord[]> = {};
  for (const c of corrections) {
    const key = (c.developer_instruction ?? c.ai_wrote ?? 'unknown').slice(0, 50);
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return groups;
}

function emptyPrediction(file: string): FailurePrediction {
  return { file, predicted_failures: [], overall_risk: 'low', recommended_agent: null };
}
