// DriftLens Analyser - orchestrates embedding, clustering, and pattern extraction

import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { readJsonl } from '../shared/io.js';
import { logger } from '../shared/logger.js';
import { CORRECTIONS_FILE, PATTERNS_FILE, META_PATTERNS_FILE, CONTRADICTIONS_FILE } from '../shared/constants.js';
import type { CorrectionRecord, PatternRecord } from '../shared/schema.js';
import { readConfig } from '../shared/config.js';
import { clusterCorrections } from './clustering.js';
import { analyseWithLLM } from './patterns.js';
import { analyseWithoutLLM } from './no-llm.js';
import { rankPatterns } from './ranking.js';
import { detectMetaPatterns } from './meta-patterns.js';
import { detectContradictions } from './contradiction.js';

interface AnalysisOptions {
  cwd: string;
  minOccurrences: number;
  since?: string;
  noLlm: boolean;
  agentFilter?: string;
}

export async function runAnalysis(opts: AnalysisOptions): Promise<void> {
  logger.heading('DriftLens Analyse');

  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);
  if (!existsSync(corrPath)) {
    logger.warn('No corrections found. Capture some corrections first.');
    return;
  }

  let corrections = await readJsonl<CorrectionRecord>(corrPath);

  if (corrections.length === 0) {
    logger.warn('No corrections captured yet. Start with: driftlens watch start');
    return;
  }

  // Apply since filter
  if (opts.since) {
    const cutoff = parseSinceDate(opts.since);
    corrections = corrections.filter((c) => new Date(c.ts) >= cutoff);
    logger.info(`Filtered to corrections since ${cutoff.toISOString().split('T')[0]}`);
  }

  // Apply agent filter
  if (opts.agentFilter) {
    corrections = corrections.filter((c) => c.agent === opts.agentFilter);
    logger.info(`Filtered to agent: ${opts.agentFilter}`);
  }

  logger.info(`Analysing ${corrections.length} corrections...`);

  // Extract text signals for embedding
  const signals = corrections.map((c) => extractSignal(c));

  let patterns: PatternRecord[];

  if (opts.noLlm) {
    logger.info('Using rule-based analysis (--no-llm mode)');
    const clusters = clusterWithTextSimilarity(signals, corrections, opts.minOccurrences);
    patterns = await analyseWithoutLLM(clusters);
  } else {
    // Embed + cluster
    const config = await readConfig(opts.cwd);
    logger.info('Embedding corrections...');
    const { createEmbeddingAdapter } = await import('../adapters/embedding-providers.js');
    const embAdapter = createEmbeddingAdapter(config);
    let embeddings: number[][];
    try {
      embeddings = await embAdapter.embed(signals);
    } catch (err) {
      logger.warn(`Embedding failed: ${err instanceof Error ? err.message : String(err)}`);
      logger.warn('Falling back to rule-based analysis...');
      const clusters = clusterWithTextSimilarity(signals, corrections, opts.minOccurrences);
      patterns = await analyseWithoutLLM(clusters);
      return await saveAndReport(patterns, corrections, opts.cwd);
    }

    // Guard against partial/misaligned embedding results: a one-to-one
    // correspondence with corrections is required for clustering to be correct.
    if (embeddings.length !== corrections.length) {
      logger.warn(
        `Embedding count mismatch (${embeddings.length} embeddings vs ${corrections.length} corrections). Falling back to rule-based analysis...`
      );
      const clusters = clusterWithTextSimilarity(signals, corrections, opts.minOccurrences);
      patterns = await analyseWithoutLLM(clusters);
      return await saveAndReport(patterns, corrections, opts.cwd);
    }

    logger.info('Clustering by semantic similarity...');
    const clusters = clusterCorrections(
      embeddings,
      corrections,
      config.analysis.clusteringThreshold,
      opts.minOccurrences
    );

    logger.info(`Found ${clusters.length} cluster(s) with ≥${opts.minOccurrences} occurrences`);

    if (clusters.length === 0) {
      logger.warn('No patterns found with the current threshold. Try --min-occurrences 2');
      return;
    }

    logger.info('Analysing patterns with LLM...');
    const { createLLMAdapter } = await import('../adapters/llm-providers.js');
    const llmAdapter = createLLMAdapter(config);
    patterns = await analyseWithLLM(clusters, llmAdapter);
  }

  await saveAndReport(patterns, corrections, opts.cwd);
}

function extractSignal(c: CorrectionRecord): string {
  if (c.correction_type === 'struggle_chain' && c.struggle_chain) {
    return c.struggle_chain.rules_extracted.join(' ');
  }
  if (c.correction_type === 'reprompt' && c.developer_instruction) {
    return c.developer_instruction;
  }
  if (c.correction_type === 'git_delta' && c.ai_wrote && c.human_committed) {
    return `before: ${c.ai_wrote} after: ${c.human_committed}`;
  }
  return c.developer_instruction ?? c.ai_wrote ?? c.file;
}

function parseSinceDate(since: string): Date {
  const now = new Date();
  const match = /^(\d+)(d|w|m)$/.exec(since);
  if (!match) return new Date(since);
  const [, num, unit] = match;
  const n = parseInt(num ?? '0', 10);
  if (unit === 'd') return new Date(now.getTime() - n * 86400000);
  if (unit === 'w') return new Date(now.getTime() - n * 7 * 86400000);
  if (unit === 'm') {
    const d = new Date(now);
    d.setMonth(d.getMonth() - n);
    return d;
  }
  return now;
}

function clusterWithTextSimilarity(
  signals: string[],
  corrections: CorrectionRecord[],
  minOccurrences: number
): Array<{ corrections: CorrectionRecord[]; representative: string }> {
  // Simple text overlap clustering for --no-llm mode
  const used = new Set<number>();
  const clusters: Array<{ corrections: CorrectionRecord[]; representative: string }> = [];

  for (let i = 0; i < signals.length; i++) {
    if (used.has(i)) continue;
    const cluster = [corrections[i]!];
    used.add(i);

    for (let j = i + 1; j < signals.length; j++) {
      if (used.has(j)) continue;
      if (tokenOverlap(signals[i] ?? '', signals[j] ?? '') > 0.4) {
        cluster.push(corrections[j]!);
        used.add(j);
      }
    }

    if (cluster.length >= minOccurrences) {
      clusters.push({ corrections: cluster, representative: signals[i] ?? '' });
    }
  }

  return clusters;
}

function tokenOverlap(a: string, b: string): number {
  const tokA = new Set(a.toLowerCase().split(/\W+/).filter(Boolean));
  const tokB = new Set(b.toLowerCase().split(/\W+/).filter(Boolean));
  let overlap = 0;
  for (const t of tokA) {
    if (tokB.has(t)) overlap++;
  }
  return overlap / Math.max(tokA.size, tokB.size, 1);
}

async function saveAndReport(
  patterns: PatternRecord[],
  corrections: CorrectionRecord[],
  cwd: string,
): Promise<void> {
  // E-A3: rank patterns by impact before persisting so the most valuable
  // patterns surface first everywhere downstream (propose, dashboard, report).
  const ranked = rankPatterns(patterns);
  await writeFile(path.join(cwd, PATTERNS_FILE), JSON.stringify(ranked, null, 2) + '\n', 'utf8');

  // E-A2: derive systemic meta-patterns and E-A5: surface contradictions.
  const metaPatterns = detectMetaPatterns(ranked);
  const contradictions = detectContradictions(corrections);
  await writeFile(
    path.join(cwd, META_PATTERNS_FILE),
    JSON.stringify(metaPatterns, null, 2) + '\n',
    'utf8',
  );
  await writeFile(
    path.join(cwd, CONTRADICTIONS_FILE),
    JSON.stringify(contradictions, null, 2) + '\n',
    'utf8',
  );

  logger.success(`\nFound ${ranked.length} pattern(s) and saved to patterns.json`);
  const top = ranked.slice(0, 3);
  for (const p of top) {
    const impact = ((p.impact_score ?? 0) * 100).toFixed(0);
    const reason = p.dominant_reason ?? 'other';
    logger.info(`  [impact ${impact}% · ${reason}] ${p.name} - ${p.occurrences} corrections`);
  }
  if (metaPatterns.length > 0) {
    logger.info(`\nDetected ${metaPatterns.length} systemic meta-pattern(s).`);
  }
  if (contradictions.length > 0) {
    logger.warn(`${contradictions.length} contradiction(s) found - review before proposing.`);
  }
  logger.info('\nRun: driftlens propose --dry-run  to preview skill updates');
}
