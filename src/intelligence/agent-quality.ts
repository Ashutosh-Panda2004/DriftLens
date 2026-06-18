// DriftLens - Agent Quality Matrix
// Dynamic per-agent, per-context accuracy scoring for YOUR codebase

import { existsSync } from 'fs';
import path from 'path';
import { readJsonl } from '../shared/io.js';
import { logger } from '../shared/logger.js';
import { CORRECTIONS_FILE } from '../shared/constants.js';
import type {
  CorrectionRecord,
  AgentQualityRecord,
  AgentQualityMatrix,
  AgentRecommendation,
} from '../shared/schema.js';

interface QualityOptions {
  cwd: string;
  since?: string;
}

/**
 * Build the Agent Quality Matrix from correction history.
 *
 * For each (agent, context_category) pair, computes:
 * - accuracy_rate = 1 - (corrections / estimated_total_generations)
 * - avg_correction_time
 * - trend (7d vs 30d accuracy)
 * - rank vs other agents in same category
 * - recommended flag (best agent for that category)
 */
export async function computeAgentQuality(opts: QualityOptions): Promise<AgentQualityMatrix> {
  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);

  if (!existsSync(corrPath)) {
    return emptyMatrix();
  }

  const corrections = await readJsonl<CorrectionRecord>(corrPath);

  // Group by agent × context_category
  const grouped: Record<string, CorrectionRecord[]> = {};
  for (const c of corrections) {
    const category = c.module_category ?? inferCategory(c.file, c.language);
    const key = `${c.agent}|${category}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  }

  const agents = [...new Set(corrections.map((c) => c.agent))];
  const categories = [...new Set(
    corrections.map((c) => c.module_category ?? inferCategory(c.file, c.language))
  )];

  const scores: Record<string, Record<string, AgentQualityRecord>> = {};
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86_400_000;
  const thirtyDaysAgo = now - 30 * 86_400_000;

  for (const agent of agents) {
    scores[agent] = {};
    for (const category of categories) {
      const key = `${agent}|${category}`;
      const group = grouped[key] ?? [];

      if (group.length === 0) {
        scores[agent][category] = emptyQualityRecord(agent, category);
        continue;
      }

      // Estimate total generations: corrections are ~15-25% of all generations
      // (conservative: assume 20% correction rate baseline)
      const totalCorrections = group.length;
      const estimatedGenerations = Math.max(totalCorrections * 5, totalCorrections + 1);

      const accuracy = 1 - totalCorrections / estimatedGenerations;
      const avgCorrectionTime = group.reduce(
        (sum, c) => sum + (c.time_to_commit_ms ?? 150_000),
        0
      ) / group.length;

      // Compute trends
      const recent7d = group.filter((c) => new Date(c.ts).getTime() >= sevenDaysAgo);
      const recent30d = group.filter((c) => new Date(c.ts).getTime() >= thirtyDaysAgo);
      const accuracy7d = recent7d.length > 0
        ? 1 - recent7d.length / Math.max(recent7d.length * 5, recent7d.length + 1)
        : accuracy;
      const accuracy30d = recent30d.length > 0
        ? 1 - recent30d.length / Math.max(recent30d.length * 5, recent30d.length + 1)
        : accuracy;

      const trend = accuracy7d > accuracy30d + 0.05
        ? 'improving'
        : accuracy7d < accuracy30d - 0.05
          ? 'degrading'
          : 'stable';

      const modelVersions = [...new Set(group.map((c) => c.model_version).filter(Boolean))];

      scores[agent][category] = {
        agent,
        model_version: modelVersions[0] ?? 'unknown',
        context_category: category,
        total_generations: estimatedGenerations,
        total_corrections: totalCorrections,
        accuracy_rate: accuracy,
        avg_correction_time_ms: avgCorrectionTime,
        accuracy_7d: accuracy7d,
        accuracy_30d: accuracy30d,
        accuracy_trend: trend,
        rank_in_category: 0, // computed below
        recommended: false,  // computed below
      };
    }
  }

  // Compute ranks and recommendations per category
  const recommendations: AgentRecommendation[] = [];

  for (const category of categories) {
    const agentScores = agents
      .map((a) => scores[a]?.[category])
      .filter((s): s is AgentQualityRecord => !!s && s.total_corrections > 0)
      .sort((a, b) => b.accuracy_rate - a.accuracy_rate);

    agentScores.forEach((s, i) => {
      s.rank_in_category = i + 1;
      if (i === 0) s.recommended = true;
    });

    if (agentScores.length >= 2) {
      const best = agentScores[0];
      const runnerUp = agentScores[1];

      if (!best || !runnerUp) continue;

      // NF-5: sample-size suppression. Recommendations are advisory only and
      // must not be made on thin evidence, where accuracy estimates are noise.
      const MIN_SAMPLE = 5;
      if (best.total_generations < MIN_SAMPLE || runnerUp.total_generations < MIN_SAMPLE) {
        continue;
      }

      const timeDiff = runnerUp.avg_correction_time_ms - best.avg_correction_time_ms;

      recommendations.push({
        context_category: category,
        recommended_agent: best.agent,
        accuracy: best.accuracy_rate,
        runner_up_agent: runnerUp.agent,
        runner_up_accuracy: runnerUp.accuracy_rate,
        potential_time_saved_per_task_ms: Math.max(0, timeDiff),
      });
    }
  }

  return { agents, categories, scores, recommendations };
}

/**
 * Infer context category from file path and language.
 */
function inferCategory(filePath: string, language: string): string {
  const lower = filePath.toLowerCase();

  if (lower.includes('test') || lower.includes('spec')) return 'testing';
  if (lower.includes('service') || lower.includes('svc')) return 'service-layer';
  if (lower.includes('component') || lower.includes('.tsx')) return 'react-component';
  if (lower.includes('controller') || lower.includes('handler')) return 'api-handler';
  if (lower.includes('model') || lower.includes('schema') || lower.includes('migration'))
    return 'data-layer';
  if (lower.includes('util') || lower.includes('helper') || lower.includes('lib'))
    return 'utility';
  if (lower.includes('config') || lower.includes('env')) return 'configuration';
  if (lower.includes('graphql') || lower.includes('resolver')) return 'graphql';
  if (lower.includes('hook') || lower.includes('use')) return 'react-hook';
  if (lower.includes('style') || lower.includes('.css') || lower.includes('.scss'))
    return 'styling';
  if (lower.includes('ci') || lower.includes('deploy') || lower.includes('docker'))
    return 'devops';

  return language || 'general';
}

function emptyMatrix(): AgentQualityMatrix {
  return { agents: [], categories: [], scores: {}, recommendations: [] };
}

function emptyQualityRecord(agent: string, category: string): AgentQualityRecord {
  return {
    agent,
    model_version: 'unknown',
    context_category: category,
    total_generations: 0,
    total_corrections: 0,
    accuracy_rate: 1,
    avg_correction_time_ms: 0,
    accuracy_7d: 1,
    accuracy_30d: 1,
    accuracy_trend: 'stable',
    rank_in_category: 0,
    recommended: false,
  };
}
