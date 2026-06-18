// NF-2: Rule effectiveness ledger with decay
//
// A single, decision-ready ledger that answers "which rules are pulling their
// weight?" It fuses causal effectiveness (did corrections drop after merge?)
// with context-window economics (token cost vs dollars saved) and a recency
// decay signal (when did this rule last fire?). Rules that are expensive,
// ineffective, and stale are flagged as dead-weight so teams can prune them.

import path from 'path';
import { readJsonl, readJsonFile } from '../shared/io.js';
import {
  CORRECTIONS_FILE,
  PATTERNS_FILE,
  FEEDBACK_FILE,
} from '../shared/constants.js';
import type {
  CorrectionRecord,
  PatternRecord,
  FeedbackRecord,
  IntelligenceConfig,
  RuleLedger,
  RuleLedgerEntry,
  RuleHealth,
} from '../shared/schema.js';
import { computeEffectiveness, type EffectivenessResult } from '../feedback/effectiveness.js';

const PRICE_PER_TOKEN = 0.000003; // ~$3/MTok input pricing
const DAY_MS = 86_400_000;
const STALE_DAYS = 60;

function estimateTokens(text: string): number {
  // Coarse heuristic consistent with context-economics (≈4 chars/token).
  return Math.ceil(text.length / 4);
}

function decayFactor(lastFired: string | null, now: number): number {
  if (!lastFired) return 0.5;
  const t = Date.parse(lastFired);
  if (Number.isNaN(t)) return 0.5;
  const ageDays = Math.max(0, (now - t) / DAY_MS);
  // Exponential decay; a rule unused for STALE_DAYS counts as ~half-relevant.
  return Math.pow(0.5, ageDays / STALE_DAYS);
}

function avgCorrectionHours(pattern: PatternRecord, corrections: CorrectionRecord[]): number {
  const related = corrections.filter((c) => pattern.source_correction_ids.includes(c.id));
  const ms =
    related.length > 0
      ? related.reduce((s, c) => s + (c.time_to_commit_ms ?? 150_000), 0) / related.length
      : 150_000;
  return ms / 3_600_000;
}

function classifyHealth(
  roi: number,
  reductionPct: number,
  lowConfidence: boolean,
): { health: RuleHealth; recommendation: RuleLedgerEntry['recommendation'] } {
  if (lowConfidence) return { health: 'unproven', recommendation: 'monitor' };
  if (reductionPct <= 0 && roi < 1) return { health: 'dead-weight', recommendation: 'archive' };
  if (roi >= 100 && reductionPct >= 50) return { health: 'high-value', recommendation: 'keep' };
  if (roi >= 1) return { health: 'positive', recommendation: 'keep' };
  return { health: 'marginal', recommendation: 'strengthen' };
}

export interface LedgerOptions {
  cwd: string;
  config: IntelligenceConfig;
  windowDays?: number;
}

export async function computeRuleLedger(opts: LedgerOptions): Promise<RuleLedger> {
  const windowDays = opts.windowDays ?? 30;
  const now = Date.now();

  const corrections = await readJsonl<CorrectionRecord>(
    path.join(opts.cwd, CORRECTIONS_FILE),
  );
  const patterns = await readJsonFile<PatternRecord[]>(
    path.join(opts.cwd, PATTERNS_FILE),
    [],
  );
  const feedback = await readJsonFile<FeedbackRecord[]>(
    path.join(opts.cwd, FEEDBACK_FILE),
    [],
  );

  const effectiveness = computeEffectiveness(patterns, corrections, feedback, windowDays);
  const effByPattern = new Map<string, EffectivenessResult>();
  for (const e of effectiveness) effByPattern.set(e.pattern_id, e);

  const sessionsPerMonth = Math.max(1, opts.config.sessionsPerDay) * 22;

  const entries: RuleLedgerEntry[] = patterns.map((p) => {
    const eff = effByPattern.get(p.pattern_id);
    const tokenCount = estimateTokens(p.proposed_rule || p.name);
    const tokenCostPerMonth = tokenCount * sessionsPerMonth * PRICE_PER_TOKEN;

    // Prevented-per-month: scale the observed before/after reduction to a
    // monthly rate, dampened by the recency decay so stale wins don't inflate.
    const reductionPct = eff?.reduction_pct ?? 0;
    const before = eff?.corrections_before ?? 0;
    const preventedRaw = before * Math.max(0, reductionPct) / 100;
    const monthlyScale = windowDays > 0 ? 30 / windowDays : 1;
    const decay = decayFactor(eff?.last_fired ?? p.last_seen, now);
    const preventedPerMonth = preventedRaw * monthlyScale * decay;

    const dollarSavedPerMonth = preventedPerMonth * avgCorrectionHours(p, corrections) * opts.config.hourlyRate;
    const roi = tokenCostPerMonth > 0 ? dollarSavedPerMonth / tokenCostPerMonth : 0;

    const { health, recommendation } = classifyHealth(
      roi,
      reductionPct,
      eff?.low_confidence ?? true,
    );

    return {
      pattern_id: p.pattern_id,
      name: p.name,
      status: p.status,
      dominant_reason: p.dominant_reason ?? null,
      merged_at: eff?.merged_at ?? null,
      window_days: windowDays,
      corrections_before: before,
      corrections_after: eff?.corrections_after ?? 0,
      reduction_pct: reductionPct,
      low_confidence: eff?.low_confidence ?? true,
      token_cost_per_month: round2(tokenCostPerMonth),
      prevented_per_month: round2(preventedPerMonth),
      dollar_saved_per_month: round2(dollarSavedPerMonth),
      roi_multiplier: round2(roi),
      health,
      recommendation,
      last_fired: eff?.last_fired ?? null,
    };
  });

  // Sort dead-weight last, high-value first by dollars saved.
  entries.sort((a, b) => b.dollar_saved_per_month - a.dollar_saved_per_month);

  const totalSaved = entries.reduce((s, e) => s + e.dollar_saved_per_month, 0);
  const totalCost = entries.reduce((s, e) => s + e.token_cost_per_month, 0);

  return {
    generated_at: new Date(now).toISOString(),
    window_days: windowDays,
    entries,
    summary: {
      total_rules: entries.length,
      proven_effective: entries.filter((e) => e.health === 'high-value' || e.health === 'positive')
        .length,
      dead_weight: entries.filter((e) => e.health === 'dead-weight').length,
      total_dollar_saved_per_month: round2(totalSaved),
      total_token_cost_per_month: round2(totalCost),
      net_roi_per_month: round2(totalSaved - totalCost),
    },
  };
}

function round2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
