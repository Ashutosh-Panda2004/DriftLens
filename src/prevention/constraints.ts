// NF-1: Pre-generation constraint injection
//
// The flagship "shift-left" capability: instead of detecting mistakes after the
// AI makes them, we inject the constraints that prevent them *before* generation.
// This module turns a FailurePrediction into a compact, ranked, token-bounded
// constraint payload suitable for dropping into an agent's context window, and
// records a PreventionRecord so we can later measure whether prevention worked.

import { randomUUID } from 'crypto';
import { appendFile } from 'fs/promises';
import path from 'path';
import { PREVENTION_FILE } from '../shared/constants.js';
import type { FailurePrediction, PreventionRecord } from '../shared/schema.js';

export interface ConstraintInjectionOptions {
  // Maximum number of constraints to inject (top-K by rank).
  topK?: number;
  // Minimum probability for a constraint to be worth injecting.
  minProbability?: number;
  // Soft cap on the rendered payload size, in characters (~4 chars/token).
  maxChars?: number;
}

export interface InjectedConstraint {
  pattern_id: string;
  pattern_name: string;
  probability: number;
  rank: number;
  text: string;
}

export interface ConstraintInjection {
  file: string;
  overall_risk: FailurePrediction['overall_risk'];
  recommended_agent: string | null;
  constraints: InjectedConstraint[];
  rendered: string;
  empty: boolean;
}

const RISK_WEIGHT: Record<FailurePrediction['overall_risk'], number> = {
  low: 0.25,
  medium: 0.5,
  high: 0.75,
  critical: 1,
};

const DEFAULTS: Required<ConstraintInjectionOptions> = {
  topK: 8,
  minProbability: 0.4,
  maxChars: 1600, // ~400 tokens
};

/**
 * Build a ranked, token-bounded constraint injection from a failure prediction.
 * Pure and deterministic. Always returns an object - `empty` is true when there
 * is nothing useful to inject, so callers can branch explicitly instead of
 * guessing from an empty string.
 */
export function buildConstraintInjection(
  prediction: FailurePrediction,
  options: ConstraintInjectionOptions = {},
): ConstraintInjection {
  const opts = { ...DEFAULTS, ...options };
  const riskWeight = RISK_WEIGHT[prediction.overall_risk] ?? 0.5;

  const ranked = prediction.predicted_failures
    .filter((f) => f.probability >= opts.minProbability)
    // Rank by probability weighted by overall file risk; tie-break by history.
    .map((f) => ({ f, score: f.probability * (0.5 + 0.5 * riskWeight) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.f.historical_correction_count - a.f.historical_correction_count;
    })
    .slice(0, Math.max(0, opts.topK));

  const constraints: InjectedConstraint[] = [];
  let budget = opts.maxChars;
  let rank = 1;
  for (const { f } of ranked) {
    const text = f.constraint_to_inject.trim();
    if (!text) continue;
    const line = `${rank}. [${Math.round(f.probability * 100)}%] ${text}`;
    if (line.length > budget && constraints.length > 0) break; // respect token budget
    constraints.push({
      pattern_id: f.pattern_id,
      pattern_name: f.pattern_name,
      probability: f.probability,
      rank,
      text,
    });
    budget -= line.length;
    rank++;
  }

  const empty = constraints.length === 0;
  const rendered = empty
    ? `DriftLens: no historical risk constraints for ${prediction.file}. Proceed normally.`
    : [
        `DriftLens Prevention — Risk: ${prediction.overall_risk.toUpperCase()} — ${prediction.file}`,
        prediction.recommended_agent ? `Recommended agent: ${prediction.recommended_agent}` : '',
        '',
        'Follow these constraints to avoid known mistakes in this file:',
        ...constraints.map((c) => `${c.rank}. [${Math.round(c.probability * 100)}%] ${c.text}`),
      ]
        .filter(Boolean)
        .join('\n');

  return {
    file: prediction.file,
    overall_risk: prediction.overall_risk,
    recommended_agent: prediction.recommended_agent,
    constraints,
    rendered,
    empty,
  };
}

/**
 * Persist a PreventionRecord capturing how many constraints were injected for a
 * file. `actual_corrections_after` / `corrections_prevented` are filled in later
 * by the feedback loop; at injection time we only know what we injected.
 */
export async function logPrevention(
  cwd: string,
  injection: ConstraintInjection,
): Promise<PreventionRecord> {
  const record: PreventionRecord = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    file: injection.file,
    predictions_injected: injection.constraints.length,
    actual_corrections_after: 0,
    predictions_accurate: 0,
    corrections_prevented: 0,
  };
  await appendFile(path.join(cwd, PREVENTION_FILE), JSON.stringify(record) + '\n', 'utf8');
  return record;
}
