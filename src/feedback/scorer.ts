// DriftLens - Drift score computation

import { existsSync } from 'fs';
import path from 'path';
import { logger } from '../shared/logger.js';
import { readJsonl, readJsonFile } from '../shared/io.js';
import { PATTERNS_FILE, CORRECTIONS_FILE } from '../shared/constants.js';
import type { PatternRecord, CorrectionRecord } from '../shared/schema.js';

interface ScoreOptions {
  cwd: string;
  detail: boolean;
  skillFilter?: string;
}

export async function computeScore(opts: ScoreOptions): Promise<void> {
  logger.heading('DriftLens Score');

  const patternsPath = path.join(opts.cwd, PATTERNS_FILE);
  if (!existsSync(patternsPath)) {
    logger.warn('No patterns found. Run driftlens analyse first.');
    return;
  }

  const patterns = await readJsonFile<PatternRecord[]>(patternsPath, []);

  let filtered = patterns;
  if (opts.skillFilter) {
    filtered = patterns.filter((p) => p.target_skills.includes(opts.skillFilter!));
  }

  const total = filtered.length;
  if (total === 0) {
    logger.info('No patterns found.');
    return;
  }

  const merged = filtered.filter((p) => p.status === 'merged').length;
  const pending = filtered.filter((p) => p.status === 'pending').length;
  const proposed = filtered.filter((p) => p.status === 'proposed').length;
  const regressed = filtered.filter((p) => p.status === 'regressed').length;

  const driftScore = total > 0 ? Math.round((merged / total) * 100) : 100;

  logger.info(`Drift Score: ${driftScore}%`);
  logger.info(`  Merged:   ${merged} patterns ✅`);
  logger.info(`  Proposed: ${proposed} patterns ⚠️`);
  logger.info(`  Pending:  ${pending} patterns ⏳`);
  logger.info(`  Regressed: ${regressed} patterns 🔴`);

  // Friction score
  const corrPath = path.join(opts.cwd, CORRECTIONS_FILE);
  if (existsSync(corrPath)) {
    const corrections = await readJsonl<CorrectionRecord>(corrPath);
    const chains = corrections.filter((c) => c.correction_type === 'struggle_chain');

    const unresolvedPatternIds = new Set(
      filtered.filter((p) => p.status !== 'merged').map((p) => p.pattern_id)
    );

    const unresolvedChains = chains.filter((c) =>
      c.struggle_chain?.rules_extracted.some((r) =>
        [...unresolvedPatternIds].some((id) =>
          patterns.find((p) => p.pattern_id === id)?.proposed_rule.includes(r.slice(0, 20))
        )
      )
    );

    const totalFrictionTurns = unresolvedChains.reduce(
      (sum, c) => sum + (c.struggle_chain?.turn_count ?? 0),
      0
    );

    if (chains.length > 0) {
      logger.info(`\nFriction Score: ${totalFrictionTurns} wasted prompt-turns from unresolved patterns`);
    }
  }

  if (opts.detail) {
    logger.info('\nPattern Breakdown:');
    for (const p of filtered) {
      const icon = p.status === 'merged' ? '✅' : p.status === 'proposed' ? '⚠️' : p.status === 'regressed' ? '🔴' : '⏳';
      logger.info(`  ${icon} ${p.name} (${(p.confidence * 100).toFixed(0)}% confidence, ${p.occurrences} corrections)`);
    }
  }
}
