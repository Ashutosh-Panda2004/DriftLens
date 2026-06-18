// DriftLens - Model Regression Sentinel
// Detects when AI model updates break previously-learned patterns

import { existsSync } from 'fs';
import path from 'path';
import { readJsonl, readJsonFile } from '../shared/io.js';
import { logger } from '../shared/logger.js';
import { CORRECTIONS_FILE, PATTERNS_FILE } from '../shared/constants.js';
import type {
  CorrectionRecord,
  PatternRecord,
  RegressionRecord,
} from '../shared/schema.js';

const REGRESSIONS_FILE = '.driftlens/regressions.json';

interface RegressionOptions {
  cwd: string;
  windowDays: number;
}

/**
 * Detect model update regressions.
 *
 * When an AI provider updates their model (Sonnet 3.5 → 4, GPT-4o → 5),
 * previously-fixed patterns may regress. This function:
 * 1. Identifies model version changes from correction records
 * 2. Compares correction rates before/after the version change
 * 3. Flags patterns with significant correction rate increases
 */
export async function detectRegressions(opts: RegressionOptions): Promise<RegressionRecord[]> {
  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);
  const patternsPath = path.join(opts.cwd, PATTERNS_FILE);

  if (!existsSync(corrPath) || !existsSync(patternsPath)) {
    return [];
  }

  const corrections = await readJsonl<CorrectionRecord>(corrPath);
  const patterns = await readJsonFile<PatternRecord[]>(patternsPath, []);

  // Group corrections by agent
  const byAgent = groupByAgent(corrections);
  const regressions: RegressionRecord[] = [];

  for (const [agent, agentCorrections] of Object.entries(byAgent)) {
    // Identify model version transitions
    const transitions = findModelTransitions(agentCorrections);

    for (const transition of transitions) {
      const regressedPatterns = analyseTransition(
        transition,
        agentCorrections,
        patterns,
        opts.windowDays
      );

      if (regressedPatterns.length > 0) {
        regressions.push({
          id: `reg-${agent}-${transition.newVersion}-${Date.now()}`,
          detected_at: new Date().toISOString(),
          agent,
          old_model_version: transition.oldVersion,
          new_model_version: transition.newVersion,
          regressed_patterns: regressedPatterns,
          total_patterns_checked: patterns.length,
          total_regressed: regressedPatterns.length,
        });
      }
    }
  }

  return regressions;
}

interface ModelTransition {
  oldVersion: string;
  newVersion: string;
  transitionDate: Date;
}

/**
 * Find points where the model version changed for an agent.
 */
function findModelTransitions(corrections: CorrectionRecord[]): ModelTransition[] {
  const sorted = corrections
    .filter((c) => c.model_version)
    .sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());

  const transitions: ModelTransition[] = [];
  let lastVersion: string | null = null;

  for (const c of sorted) {
    if (lastVersion && c.model_version && c.model_version !== lastVersion) {
      transitions.push({
        oldVersion: lastVersion,
        newVersion: c.model_version,
        transitionDate: new Date(c.ts),
      });
    }
    if (c.model_version) lastVersion = c.model_version;
  }

  return transitions;
}

/**
 * For a given model transition, check if any patterns regressed.
 */
function analyseTransition(
  transition: ModelTransition,
  corrections: CorrectionRecord[],
  patterns: PatternRecord[],
  windowDays: number
): RegressionRecord['regressed_patterns'] {
  const windowMs = windowDays * 86_400_000;
  const transitionMs = transition.transitionDate.getTime();

  // Before window: corrections with old model in the N days before transition
  const before = corrections.filter((c) => {
    const ts = new Date(c.ts).getTime();
    return ts >= transitionMs - windowMs && ts < transitionMs;
  });

  // After window: corrections with new model in the N days after transition
  const after = corrections.filter((c) => {
    const ts = new Date(c.ts).getTime();
    return ts >= transitionMs && ts <= transitionMs + windowMs;
  });

  if (before.length === 0 || after.length === 0) return [];

  const regressed: RegressionRecord['regressed_patterns'] = [];

  for (const pattern of patterns) {
    // Only check merged patterns (ones that were "fixed")
    if (pattern.status !== 'merged') continue;

    const beforeHits = before.filter((c) =>
      pattern.source_correction_ids.includes(c.id) || matchesPattern(c, pattern)
    );
    const afterHits = after.filter((c) =>
      matchesPattern(c, pattern)
    );

    // Normalize by window size
    const rateBefore = beforeHits.length / Math.max(before.length, 1);
    const rateAfter = afterHits.length / Math.max(after.length, 1);

    // Regression = significant increase in correction rate for a merged pattern
    if (rateAfter > rateBefore * 1.5 && afterHits.length >= 2) {
      const increasePct = rateBefore > 0
        ? ((rateAfter - rateBefore) / rateBefore) * 100
        : rateAfter * 100;

      const severity: 'critical' | 'moderate' | 'minor' =
        increasePct >= 200 ? 'critical' :
        increasePct >= 100 ? 'moderate' : 'minor';

      regressed.push({
        pattern_id: pattern.pattern_id,
        pattern_name: pattern.name,
        correction_rate_before: rateBefore,
        correction_rate_after: rateAfter,
        increase_pct: increasePct,
        severity,
      });
    }
  }

  return regressed;
}

/**
 * Check if a correction matches a pattern (heuristic: text similarity).
 */
function matchesPattern(c: CorrectionRecord, pattern: PatternRecord): boolean {
  const corrText = (c.developer_instruction ?? '') + (c.human_committed ?? '');
  const patternText = pattern.proposed_rule + pattern.description;

  // Simple keyword overlap heuristic
  const corrWords = new Set(corrText.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const patternWords = patternText.toLowerCase().split(/\W+/).filter((w) => w.length > 3);

  const overlap = patternWords.filter((w) => corrWords.has(w)).length;
  return overlap >= 3;
}

function groupByAgent(corrections: CorrectionRecord[]): Record<string, CorrectionRecord[]> {
  const groups: Record<string, CorrectionRecord[]> = {};
  for (const c of corrections) {
    if (!groups[c.agent]) groups[c.agent] = [];
    const group = groups[c.agent];
    if (group) group.push(c);
  }
  return groups;
}
