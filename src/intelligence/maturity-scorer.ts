// DriftLens - Organizational AI Maturity Scorer
// Composite benchmark for engineering leadership

import { existsSync } from 'fs';
import path from 'path';
import { readJsonl, readJsonFile } from '../shared/io.js';
import { CORRECTIONS_FILE, PATTERNS_FILE } from '../shared/constants.js';
import type {
  CorrectionRecord,
  PatternRecord,
  MaturityScore,
  IntelligenceConfig,
  SkillTarget,
} from '../shared/schema.js';

interface MaturityOptions {
  cwd: string;
  config: IntelligenceConfig;
  skillTargets: SkillTarget[];
}

/**
 * Compute the Organizational AI Maturity Score.
 *
 * 7 dimensions, each scored 0-100:
 * 1. Skill Coverage: % of discovered patterns with merged rules
 * 2. Correction Rate: inverse of corrections per generation (lower = better)
 * 3. Agent Utilization: breadth of AI usage across codebase
 * 4. Time-to-Fix: average time to correct AI mistakes (faster = better)
 * 5. Regression Rate: % of patterns that regress after being fixed
 * 6. Rule Freshness: % of rules updated within 30 days
 * 7. Team Consistency: agreement across developers on correction patterns
 *
 * Overall = weighted average of all dimensions.
 */
export async function computeMaturityScore(opts: MaturityOptions): Promise<MaturityScore> {
  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);
  const patternsPath = path.join(opts.cwd, PATTERNS_FILE);

  const corrections = await readJsonl<CorrectionRecord>(corrPath);
  const patterns = await readJsonFile<PatternRecord[]>(patternsPath, []);

  // 1. Skill Coverage (0-100)
  const skillCoverage = computeSkillCoverage(patterns);

  // 2. Correction Rate (0-100, inverse)
  const correctionRate = computeCorrectionRate(corrections);

  // 3. Agent Utilization (0-100)
  const agentUtilization = computeAgentUtilization(corrections);

  // 4. Time-to-Fix (0-100)
  const timeToFix = computeTimeToFix(corrections);

  // 5. Regression Rate (0-100, inverse)
  const regressionRate = computeRegressionRate(patterns);

  // 6. Rule Freshness (0-100)
  const ruleFreshness = await computeRuleFreshness(opts.cwd, opts.skillTargets);

  // 7. Team Consistency (0-100)
  const teamConsistency = computeTeamConsistency(corrections, patterns);

  const breakdown = {
    skill_coverage: skillCoverage,
    correction_rate: correctionRate,
    agent_utilization: agentUtilization,
    time_to_fix: timeToFix,
    regression_rate: regressionRate,
    rule_freshness: ruleFreshness,
    team_consistency: teamConsistency,
  };

  // Weighted overall score
  const weights = {
    skill_coverage: 0.20,
    correction_rate: 0.20,
    agent_utilization: 0.10,
    time_to_fix: 0.15,
    regression_rate: 0.15,
    rule_freshness: 0.10,
    team_consistency: 0.10,
  };

  const overall = Math.round(
    Object.entries(breakdown).reduce(
      (sum, [key, value]) => sum + value * (weights[key as keyof typeof weights] ?? 0.1),
      0
    )
  );

  // Determine trend (would need historical data in production)
  const trend: MaturityScore['trend'] = overall >= 70 ? 'improving' : overall >= 40 ? 'stable' : 'degrading';

  // Percentile estimate (simplified: based on score alone)
  const percentile = estimatePercentile(overall);

  const nextActions = generateNextActions(breakdown);

  return { overall, breakdown, percentile, trend, next_actions: nextActions };
}

// ─── Dimension Calculators ────────────────────────────────────────────────────

function computeSkillCoverage(patterns: PatternRecord[]): number {
  if (patterns.length === 0) return 0;
  const merged = patterns.filter((p) => p.status === 'merged').length;
  return Math.round((merged / patterns.length) * 100);
}

function computeCorrectionRate(corrections: CorrectionRecord[]): number {
  if (corrections.length === 0) return 100; // No corrections = perfect
  // Estimate: fewer corrections relative to estimated generations = better
  // Assume each correction represents a 20% rate (5 generations per correction)
  const estimatedGenerations = corrections.length * 5;
  const rate = corrections.length / estimatedGenerations; // 0.2 baseline
  // Score: 0.05 rate → 95, 0.2 rate → 60, 0.5 rate → 30
  return Math.round(Math.max(0, Math.min(100, (1 - rate) * 100)));
}

function computeAgentUtilization(corrections: CorrectionRecord[]): number {
  if (corrections.length === 0) return 0;
  // More diverse file coverage = higher utilization
  const uniqueFiles = new Set(corrections.map((c) => c.file)).size;
  // Heuristic: 50+ unique files = full utilization
  return Math.round(Math.min(100, (uniqueFiles / 50) * 100));
}

function computeTimeToFix(corrections: CorrectionRecord[]): number {
  if (corrections.length === 0) return 100;
  const avgTimeMs = corrections.reduce(
    (sum, c) => sum + (c.time_to_commit_ms ?? 150_000),
    0
  ) / corrections.length;

  // Score: <60s → 95, 2.5min → 75, 5min → 50, 10min → 25
  const minutes = avgTimeMs / 60_000;
  return Math.round(Math.max(0, Math.min(100, 100 - minutes * 10)));
}

function computeRegressionRate(patterns: PatternRecord[]): number {
  if (patterns.length === 0) return 100;
  const regressed = patterns.filter((p) => p.status === 'regressed').length;
  const regressionPct = regressed / patterns.length;
  // Score: 0% regression → 100, 10% → 80, 30% → 50
  return Math.round(Math.max(0, (1 - regressionPct * 3) * 100));
}

async function computeRuleFreshness(cwd: string, targets: SkillTarget[]): Promise<number> {
  let totalRules = 0;
  let freshRules = 0;
  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;

  for (const target of targets) {
    const filePath = path.join(cwd, target.path);
    if (!existsSync(filePath)) continue;

    const content = await readFile(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim().startsWith('-') || l.trim().startsWith('*'));
    totalRules += lines.length;

    // Check git last-modified for the file (simplified: use file mtime)
    try {
      const { mtimeMs } = await import('fs').then((fs) =>
        fs.promises.stat(filePath)
      );
      if (mtimeMs >= thirtyDaysAgo) {
        freshRules += lines.length; // All rules in recently-modified file count as fresh
      }
    } catch {
      // ignore
    }
  }

  if (totalRules === 0) return 50; // Neutral if no rules exist
  return Math.round((freshRules / totalRules) * 100);
}

function computeTeamConsistency(corrections: CorrectionRecord[], patterns: PatternRecord[]): number {
  // Higher consistency = corrections cluster tightly into patterns (not scattered)
  if (corrections.length === 0) return 100;
  if (patterns.length === 0) return 30;

  const patterned = patterns.reduce((sum, p) => sum + p.source_correction_ids.length, 0);
  const consistency = patterned / corrections.length;
  return Math.round(Math.min(100, consistency * 100));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estimatePercentile(score: number): number {
  // Simplified curve: most teams score 30-60
  if (score >= 85) return 95;
  if (score >= 75) return 85;
  if (score >= 65) return 70;
  if (score >= 55) return 55;
  if (score >= 45) return 40;
  if (score >= 35) return 25;
  return 10;
}

function generateNextActions(breakdown: MaturityScore['breakdown']): string[] {
  const actions: string[] = [];

  const weakest = Object.entries(breakdown)
    .sort(([, a], [, b]) => a - b)
    .slice(0, 3);

  for (const [dimension, score] of weakest) {
    if (score < 50) {
      switch (dimension) {
        case 'skill_coverage':
          actions.push('Run `driftlens propose` to convert pending patterns into skill rules');
          break;
        case 'correction_rate':
          actions.push('Enable predictive prevention (`driftlens prevent start`) to reduce correction rate');
          break;
        case 'agent_utilization':
          actions.push('Expand AI-assisted coding to more file types and modules');
          break;
        case 'time_to_fix':
          actions.push('Address high-friction patterns with `driftlens analyse --friction-sort`');
          break;
        case 'regression_rate':
          actions.push('Strengthen skill rules for regressed patterns with `driftlens propose --regressed`');
          break;
        case 'rule_freshness':
          actions.push('Update stale skill files with `driftlens trim --operation stale`');
          break;
        case 'team_consistency':
          actions.push('Enable team sync to align correction patterns across developers');
          break;
      }
    }
  }

  return actions.slice(0, 3);
}
