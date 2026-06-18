// DriftLens - Dashboard API routes

import type { FastifyInstance } from 'fastify';
import path from 'path';
import { readJsonl, readJsonFile } from '../shared/io.js';
import {
  CORRECTIONS_FILE,
  PATTERNS_FILE,
  FEEDBACK_FILE,
  META_PATTERNS_FILE,
  CONTRADICTIONS_FILE,
} from '../shared/constants.js';
import type {
  CorrectionRecord,
  PatternRecord,
  FeedbackRecord,
  OverviewResponse,
  MetaPattern,
  Contradiction,
} from '../shared/schema.js';
import { reasonsForRecord } from '../analyser/reason-classifier.js';

export async function registerApiRoutes(fastify: FastifyInstance, cwd: string): Promise<void> {
  async function loadCorrections(): Promise<CorrectionRecord[]> {
    return readJsonl<CorrectionRecord>(path.join(cwd, CORRECTIONS_FILE));
  }

  async function loadPatterns(): Promise<PatternRecord[]> {
    return readJsonFile<PatternRecord[]>(path.join(cwd, PATTERNS_FILE), []);
  }

  async function loadFeedback(): Promise<FeedbackRecord[]> {
    return readJsonFile<FeedbackRecord[]>(path.join(cwd, FEEDBACK_FILE), []);
  }

  // GET /api/overview
  fastify.get('/api/overview', async () => {
    const [corrections, patterns] = await Promise.all([loadCorrections(), loadPatterns()]);

    const breakdown = { git_delta: 0, reprompt: 0, struggle_chain: 0, churn: 0 };
    for (const c of corrections) {
      breakdown[c.correction_type] = (breakdown[c.correction_type] ?? 0) + 1;
    }

    const chains = corrections.filter((c) => c.correction_type === 'struggle_chain');
    const avgFriction =
      chains.length > 0
        ? chains.reduce((s, c) => s + (c.struggle_chain?.friction_score ?? 0), 0) / chains.length
        : 0;

    const merged = patterns.filter((p) => p.status === 'merged').length;
    const driftScore = patterns.length > 0 ? Math.round((merged / patterns.length) * 100) : 100;

    const overview: OverviewResponse = {
      drift_score: driftScore,
      total_corrections: corrections.length,
      pattern_count: patterns.length,
      correction_breakdown: breakdown,
      avg_friction: Math.round(avgFriction * 10) / 10,
      total_struggle_chains: chains.length,
    };
    return overview;
  });

  // GET /api/corrections?since=&agent=&file=&type=&reason=
  fastify.get<{
    Querystring: { since?: string; agent?: string; file?: string; type?: string; reason?: string };
  }>('/api/corrections', async (req) => {
    let corrections = await loadCorrections();
    const { since, agent, file, type, reason } = req.query;

    if (since) {
      const cutoff = new Date(since);
      if (!Number.isNaN(cutoff.getTime())) {
        corrections = corrections.filter((c) => new Date(c.ts) >= cutoff);
      }
    }
    if (agent) corrections = corrections.filter((c) => c.agent === agent);
    if (file) corrections = corrections.filter((c) => c.file.includes(file));
    if (type) corrections = corrections.filter((c) => c.correction_type === type);
    if (reason) corrections = corrections.filter((c) => reasonsForRecord(c).includes(reason as any));

    return corrections;
  });

  // GET /api/patterns?status=&confidence=&skill=&reason=
  fastify.get<{
    Querystring: { status?: string; confidence?: string; skill?: string; reason?: string };
  }>('/api/patterns', async (req) => {
    let patterns = await loadPatterns();
    const { status, confidence, skill, reason } = req.query;

    if (status) patterns = patterns.filter((p) => p.status === status);
    if (confidence) {
      const minConf = parseFloat(confidence);
      if (!Number.isNaN(minConf)) {
        patterns = patterns.filter((p) => p.confidence >= minConf);
      }
    }
    if (skill) patterns = patterns.filter((p) => p.target_skills.includes(skill));
    if (reason) patterns = patterns.filter((p) => (p.dominant_reason ?? 'other') === reason);

    // Ensure impact-ranked order for the UI even on older patterns files.
    return patterns.sort((a, b) => (b.impact_score ?? 0) - (a.impact_score ?? 0));
  });

  // GET /api/heatmap
  fastify.get('/api/heatmap', async () => {
    const corrections = await loadCorrections();
    const map: Record<string, Record<string, number>> = {};

    for (const c of corrections) {
      const week = getWeekKey(c.ts);
      if (!map[c.file]) map[c.file] = {};
      const weekMap = map[c.file];
      if (weekMap) {
        weekMap[week] = (weekMap[week] ?? 0) + 1;
      }
    }

    return Object.entries(map).flatMap(([file, weeks]) =>
      Object.entries(weeks).map(([week, count]) => ({ file, week, count }))
    );
  });

  // GET /api/drift-score
  fastify.get('/api/drift-score', async () => {
    const patterns = await loadPatterns();
    const skillMap: Record<string, { total: number; merged: number }> = {};

    for (const p of patterns) {
      for (const skill of p.target_skills) {
        if (!skillMap[skill]) skillMap[skill] = { total: 0, merged: 0 };
        skillMap[skill].total++;
        if (p.status === 'merged') skillMap[skill].merged++;
      }
    }

    return Object.entries(skillMap).map(([skill, { total, merged }]) => ({
      skill,
      score: total > 0 ? Math.round((merged / total) * 100) : 100,
      trend: 'stable' as const,
    }));
  });

  // GET /api/feedback
  fastify.get('/api/feedback', async () => {
    return loadFeedback();
  });

  // GET /api/timeline
  fastify.get('/api/timeline', async () => {
    const corrections = await loadCorrections();
    const weekMap: Record<string, number> = {};

    for (const c of corrections) {
      const week = getWeekKey(c.ts);
      weekMap[week] = (weekMap[week] ?? 0) + 1;
    }

    return Object.entries(weekMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, count]) => ({ week, corrections: count, events: [] }));
  });

  // GET /api/agents
  fastify.get('/api/agents', async () => {
    const corrections = await loadCorrections();
    const agentMap: Record<string, { count: number; frictionSum: number }> = {};

    for (const c of corrections) {
      if (!agentMap[c.agent]) agentMap[c.agent] = { count: 0, frictionSum: 0 };
      const agent = agentMap[c.agent];
      if (agent) {
        agent.count++;
        if (c.struggle_chain) {
          agent.frictionSum += c.struggle_chain.friction_score;
        }
      }
    }

    return Object.entries(agentMap).map(([agent, { count, frictionSum }]) => ({
      agent,
      correction_count: count,
      avg_friction: count > 0 ? Math.round((frictionSum / count) * 10) / 10 : 0,
      pct: Math.round((count / corrections.length) * 100),
    }));
  });

  // GET /api/struggles?min_turns=&file=
  fastify.get<{
    Querystring: { min_turns?: string; file?: string };
  }>('/api/struggles', async (req) => {
    let corrections = await loadCorrections();
    corrections = corrections.filter((c) => c.correction_type === 'struggle_chain');

    const { min_turns, file } = req.query;
    if (min_turns) {
      corrections = corrections.filter(
        (c) => (c.struggle_chain?.turn_count ?? 0) >= parseInt(min_turns, 10)
      );
    }
    if (file) corrections = corrections.filter((c) => c.file.includes(file));

    return corrections.sort(
      (a, b) => (b.struggle_chain?.friction_score ?? 0) - (a.struggle_chain?.friction_score ?? 0)
    );
  });

  // GET /api/rules - rule effectiveness ledger (NF-2)
  fastify.get('/api/rules', async () => {
    const { computeRuleLedger } = await import('../intelligence/rule-ledger.js');
    const { readConfig } = await import('../shared/config.js');
    const config = await readConfig(cwd);
    const intelligence = (config as any).intelligence ?? {
      hourlyRate: 85, toolCostPerMonth: 50, sessionsPerDay: 20,
      enablePrediction: true, enableRegression: true, mcpServerPort: 3848,
    };
    return computeRuleLedger({ cwd, config: intelligence });
  });

  // GET /api/agent-quality - per-agent accuracy matrix with recommendations (NF-5)
  fastify.get('/api/agent-quality', async () => {
    const { computeAgentQuality } = await import('../intelligence/agent-quality.js');
    return computeAgentQuality({ cwd });
  });

  // GET /api/meta-patterns - systemic themes (E-A2)
  fastify.get('/api/meta-patterns', async () => {
    return readJsonFile<MetaPattern[]>(path.join(cwd, META_PATTERNS_FILE), []);
  });

  // GET /api/contradictions - conflicting corrections (E-A5)
  fastify.get('/api/contradictions', async () => {
    return readJsonFile<Contradiction[]>(path.join(cwd, CONTRADICTIONS_FILE), []);
  });
}

function getWeekKey(ts: string): string {
  const d = new Date(ts);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().split('T')[0] ?? '';
}
