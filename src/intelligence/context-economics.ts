// DriftLens - Context Window Economics Engine
// Quantifies the ROI of every rule in every skill file

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { readJsonl, readJsonFile } from '../shared/io.js';
import { logger } from '../shared/logger.js';
import { CORRECTIONS_FILE, PATTERNS_FILE } from '../shared/constants.js';
import type {
  CorrectionRecord,
  PatternRecord,
  RuleEconomics,
  IntelligenceConfig,
  SkillTarget,
} from '../shared/schema.js';

interface EconomicsOptions {
  cwd: string;
  config: IntelligenceConfig;
  skillTargets: SkillTarget[];
}

interface EconomicsReport {
  rules: RuleEconomics[];
  summary: {
    total_rules: number;
    high_value_rules: number;
    dead_weight_rules: number;
    total_token_cost_per_month: number;
    total_value_per_month: number;
    net_rule_roi: number;
    tokens_recoverable: number;
  };
}

/**
 * Analyse every rule across all skill files for ROI.
 *
 * Per rule:
 *   cost = token_count × sessions_per_month × price_per_token
 *   value = corrections_prevented × avg_correction_time × hourly_rate
 *   roi = value / cost
 *
 * Status:
 *   roi > 100:  high-value (keep)
 *   roi > 1:    positive (keep)
 *   roi > 0:    marginal (consider rewriting for fewer tokens)
 *   roi = 0:    dead-weight (archive)
 */
export async function computeContextEconomics(
  opts: EconomicsOptions
): Promise<EconomicsReport> {
  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);
  const patternsPath = path.join(opts.cwd, PATTERNS_FILE);

  const corrections = await readJsonl<CorrectionRecord>(corrPath);
  const patterns = await readJsonFile<PatternRecord[]>(patternsPath, []);

  const rules: RuleEconomics[] = [];

  for (const target of opts.skillTargets) {
    const skillPath = path.join(opts.cwd, target.path);
    if (!existsSync(skillPath)) continue;

    const content = await readFile(skillPath, 'utf8');
    const extractedRules = extractRulesFromSkillFile(content);

    for (const rule of extractedRules) {
      const economics = analyseRule(rule, corrections, patterns, opts.config, target.path);
      rules.push(economics);
    }
  }

  const summary = computeEconomicsSummary(rules);
  return { rules, summary };
}

interface ExtractedRule {
  text: string;
  tokenCount: number;
}

/**
 * Extract individual rules from a skill file.
 * Splits on common delimiters: bullet points, numbered lists, headings, blank lines.
 */
function extractRulesFromSkillFile(content: string): ExtractedRule[] {
  const rules: ExtractedRule[] = [];
  const lines = content.split('\n');
  let currentRule = '';

  for (const line of lines) {
    const trimmed = line.trim();

    // Rule delimiters
    if (
      trimmed.startsWith('- ') ||
      trimmed.startsWith('* ') ||
      /^\d+\.\s/.test(trimmed) ||
      trimmed.startsWith('## ') ||
      trimmed.startsWith('### ')
    ) {
      if (currentRule.trim()) {
        rules.push({
          text: currentRule.trim(),
          tokenCount: estimateTokens(currentRule.trim()),
        });
      }
      currentRule = trimmed;
    } else if (trimmed === '') {
      if (currentRule.trim()) {
        rules.push({
          text: currentRule.trim(),
          tokenCount: estimateTokens(currentRule.trim()),
        });
      }
      currentRule = '';
    } else {
      currentRule += ' ' + trimmed;
    }
  }

  if (currentRule.trim()) {
    rules.push({
      text: currentRule.trim(),
      tokenCount: estimateTokens(currentRule.trim()),
    });
  }

  return rules.filter((r) => r.tokenCount >= 5); // Ignore trivial fragments
}

/**
 * Analyse a single rule for ROI.
 */
function analyseRule(
  rule: ExtractedRule,
  corrections: CorrectionRecord[],
  patterns: PatternRecord[],
  config: IntelligenceConfig,
  sourceFile: string
): RuleEconomics {
  const sessionsPerMonth = config.sessionsPerDay * 22; // ~22 working days/month

  // Cost: tokens consumed per month
  const tokensPerMonth = rule.tokenCount * sessionsPerMonth;
  // Approximate pricing: $3/MTok (Claude Sonnet input)
  const pricePerToken = 0.000003;
  const dollarCostPerMonth = tokensPerMonth * pricePerToken;

  // Value: how many corrections does this rule prevent?
  const matchedPattern = findMatchingPattern(rule.text, patterns);
  let correctionsPrevented = 0;
  let avgCorrectionTimeMs = 150_000;

  if (matchedPattern && matchedPattern.status === 'merged') {
    // After merge, count reduction in corrections for this pattern
    const patternCorrections = corrections.filter((c) =>
      matchedPattern.source_correction_ids.includes(c.id)
    );
    // Assume merged rule prevents ~80% of future occurrences
    correctionsPrevented = Math.round(patternCorrections.length * 0.8 / 3); // per month estimate
    avgCorrectionTimeMs = patternCorrections.reduce(
      (sum, c) => sum + (c.time_to_commit_ms ?? 150_000),
      0
    ) / Math.max(patternCorrections.length, 1);
  } else {
    // Heuristic: check if rule keywords appear in recent corrections (prevented)
    const ruleWords = rule.text.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const recentCorrections = corrections.filter((c) => {
      const corrText = ((c.developer_instruction ?? '') + (c.human_committed ?? '')).toLowerCase();
      return ruleWords.some((w) => corrText.includes(w));
    });
    correctionsPrevented = Math.max(0, recentCorrections.length - 2); // conservative
  }

  const dollarValuePerMonth =
    (correctionsPrevented * avgCorrectionTimeMs / 3_600_000) * config.hourlyRate;

  const roiMultiplier = dollarCostPerMonth > 0 ? dollarValuePerMonth / dollarCostPerMonth : 0;

  const status: RuleEconomics['status'] =
    roiMultiplier >= 100 ? 'high-value' :
    roiMultiplier >= 1 ? 'positive' :
    roiMultiplier > 0 ? 'marginal' :
    'dead-weight';

  const recommendation: RuleEconomics['recommendation'] =
    status === 'high-value' ? 'keep' :
    status === 'positive' ? 'keep' :
    status === 'marginal' ? 'rewrite' :
    'archive';

  return {
    rule_id: `rule-${hashString(rule.text)}`,
    rule_text: rule.text,
    source_file: sourceFile,
    token_count: rule.tokenCount,
    sessions_per_month: sessionsPerMonth,
    tokens_consumed_per_month: tokensPerMonth,
    dollar_cost_per_month: dollarCostPerMonth,
    corrections_prevented_per_month: correctionsPrevented,
    avg_correction_time_ms: avgCorrectionTimeMs,
    dollar_value_per_month: dollarValuePerMonth,
    roi_multiplier: roiMultiplier,
    status,
    recommendation,
  };
}

function findMatchingPattern(ruleText: string, patterns: PatternRecord[]): PatternRecord | null {
  const ruleWords = new Set(ruleText.toLowerCase().split(/\W+/).filter((w) => w.length > 4));

  for (const pattern of patterns) {
    const patternWords = pattern.proposed_rule.toLowerCase().split(/\W+/).filter((w) => w.length > 4);
    const overlap = patternWords.filter((w) => ruleWords.has(w)).length;
    if (overlap >= 3) return pattern;
  }

  return null;
}

function computeEconomicsSummary(rules: RuleEconomics[]) {
  return {
    total_rules: rules.length,
    high_value_rules: rules.filter((r) => r.status === 'high-value').length,
    dead_weight_rules: rules.filter((r) => r.status === 'dead-weight').length,
    total_token_cost_per_month: rules.reduce((s, r) => s + r.dollar_cost_per_month, 0),
    total_value_per_month: rules.reduce((s, r) => s + r.dollar_value_per_month, 0),
    net_rule_roi: rules.reduce((s, r) => s + r.dollar_value_per_month - r.dollar_cost_per_month, 0),
    tokens_recoverable: rules
      .filter((r) => r.status === 'dead-weight')
      .reduce((s, r) => s + r.token_count, 0),
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  // Rough estimate: ~4 characters per token for English text
  return Math.ceil(text.length / 4);
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}
