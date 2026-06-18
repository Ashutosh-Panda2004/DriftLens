// DriftLens - Productivity Ledger Engine
// Calculates AI ROI in dollars: time saved vs time lost per developer/team/org

import { existsSync } from 'fs';
import path from 'path';
import { readJsonl } from '../shared/io.js';
import { logger } from '../shared/logger.js';
import { CORRECTIONS_FILE } from '../shared/constants.js';
import type {
  CorrectionRecord,
  ProductivityRecord,
  ProductivityLedger,
  IntelligenceConfig,
} from '../shared/schema.js';

interface LedgerOptions {
  cwd: string;
  period: '7d' | '30d' | '90d' | 'all';
  team: boolean;
  config: IntelligenceConfig;
}

/**
 * Calculate the AI Productivity Ledger - hard financial ROI metrics.
 *
 * Formula:
 *   time_saved = estimated_manual_time - actual_time_to_commit (for non-corrected code)
 *   time_lost = time_to_commit (for corrections only - the struggle time)
 *   net = time_saved - time_lost
 *   dollar_roi = net_hours × hourly_rate
 *   roi_multiplier = net_roi / tool_cost
 */
export async function computeProductivityLedger(opts: LedgerOptions): Promise<ProductivityLedger> {
  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);

  if (!existsSync(corrPath)) {
    return emptyLedger(opts.period);
  }

  let corrections = await readJsonl<CorrectionRecord>(corrPath);

  // Apply period filter
  const cutoff = computeCutoff(opts.period);
  if (cutoff) {
    corrections = corrections.filter((c) => new Date(c.ts) >= cutoff);
  }

  // Group by date + agent
  const grouped = groupByDateAgent(corrections);
  const records: ProductivityRecord[] = [];

  for (const [key, group] of Object.entries(grouped)) {
    const [date, agent] = key.split('|');
    const record = computeDailyRecord(group, date, agent, opts.config);
    records.push(record);
  }

  const summary = computeSummary(records, opts.config);

  return { period: opts.period, records, summary };
}

function computeDailyRecord(
  corrections: CorrectionRecord[],
  date: string,
  agent: string,
  config: IntelligenceConfig
): ProductivityRecord {
  const totalCorrectionTimeMs = corrections.reduce(
    (sum, c) => sum + (c.time_to_commit_ms ?? estimateCorrectionTime(c)),
    0
  );

  // Estimate time saved: each generation without correction saves ~manual coding time
  // Heuristic: avg lines × 2 min/line for manual coding
  const totalTimeSavedMs = corrections.reduce(
    (sum, c) => sum + (c.estimated_manual_time_ms ?? estimateManualTime(c)),
    0
  );

  const netMs = totalTimeSavedMs - totalCorrectionTimeMs;
  const hourlyRate = config.hourlyRate;
  const dollarSaved = (totalTimeSavedMs / 3_600_000) * hourlyRate;
  const dollarLost = (totalCorrectionTimeMs / 3_600_000) * hourlyRate;
  const netRoi = dollarSaved - dollarLost;
  const dailyToolCost = config.toolCostPerMonth / 30;
  const roiMultiplier = dailyToolCost > 0 ? netRoi / dailyToolCost : 0;

  const modelVersions = [...new Set(corrections.map((c) => c.model_version).filter(Boolean))];

  return {
    date,
    developer_id: 'local',
    agent,
    model_version: modelVersions[0] ?? 'unknown',
    total_generation_events: corrections.length,
    total_time_saved_ms: totalTimeSavedMs,
    total_correction_time_ms: totalCorrectionTimeMs,
    net_productivity_ms: netMs,
    hourly_rate: hourlyRate,
    dollar_value_generated: dollarSaved,
    dollar_value_lost: dollarLost,
    net_roi_dollars: netRoi,
    tool_cost_dollars: dailyToolCost,
    roi_multiplier: roiMultiplier,
  };
}

function computeSummary(records: ProductivityRecord[], config: IntelligenceConfig) {
  const totalTimeSaved = records.reduce((s, r) => s + r.total_time_saved_ms, 0);
  const totalTimeLost = records.reduce((s, r) => s + r.total_correction_time_ms, 0);
  const netMs = totalTimeSaved - totalTimeLost;
  const totalDollarValue = records.reduce((s, r) => s + r.dollar_value_generated, 0);
  const totalDollarLost = records.reduce((s, r) => s + r.dollar_value_lost, 0);
  const netRoi = totalDollarValue - totalDollarLost;
  const totalToolCost = records.reduce((s, r) => s + r.tool_cost_dollars, 0);
  const roiMultiplier = totalToolCost > 0 ? netRoi / totalToolCost : 0;

  return {
    total_time_saved_hours: totalTimeSaved / 3_600_000,
    total_time_lost_hours: totalTimeLost / 3_600_000,
    net_hours: netMs / 3_600_000,
    total_dollar_value: totalDollarValue,
    total_dollar_lost: totalDollarLost,
    net_roi: netRoi,
    roi_multiplier: roiMultiplier,
    trend_vs_last_period: 0, // TODO: compare with previous period
  };
}

// ─── Heuristics ───────────────────────────────────────────────────────────────

/**
 * Estimate how long a correction took based on struggle chain or diff size.
 */
function estimateCorrectionTime(c: CorrectionRecord): number {
  if (c.correction_type === 'struggle_chain' && c.struggle_chain) {
    return c.struggle_chain.duration_seconds * 1000;
  }
  // Heuristic: avg 2.5 minutes per correction for simple fixes
  return 150_000;
}

/**
 * Estimate how long the code would have taken to write manually.
 * Based on the size of human_committed code: ~30 seconds per line of code.
 */
function estimateManualTime(c: CorrectionRecord): number {
  const code = c.human_committed ?? c.developer_instruction ?? '';
  const lines = code.split('\n').length;
  return Math.max(lines * 30_000, 60_000); // min 1 minute
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function groupByDateAgent(corrections: CorrectionRecord[]): Record<string, CorrectionRecord[]> {
  const groups: Record<string, CorrectionRecord[]> = {};
  for (const c of corrections) {
    const date = c.ts.split('T')[0];
    const key = `${date}|${c.agent}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(c);
  }
  return groups;
}

function computeCutoff(period: string): Date | null {
  const now = new Date();
  switch (period) {
    case '7d': return new Date(now.getTime() - 7 * 86_400_000);
    case '30d': return new Date(now.getTime() - 30 * 86_400_000);
    case '90d': return new Date(now.getTime() - 90 * 86_400_000);
    default: return null;
  }
}

function emptyLedger(period: string): ProductivityLedger {
  return {
    period,
    records: [],
    summary: {
      total_time_saved_hours: 0,
      total_time_lost_hours: 0,
      net_hours: 0,
      total_dollar_value: 0,
      total_dollar_lost: 0,
      net_roi: 0,
      roi_multiplier: 0,
      trend_vs_last_period: 0,
    },
  };
}
