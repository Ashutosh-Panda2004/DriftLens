// driftlens score - compute and display drift score

import type { Command } from 'commander';
import { logger } from '../shared/logger.js';
import { isInitialised } from '../shared/config.js';

export function registerScore(program: Command): void {
  program
    .command('score')
    .description('Compute the drift score for all skill files')
    .option('--detail', 'show per-pattern breakdown')
    .option('--skill <name>', 'filter to a specific skill')
    .action(async (opts: { detail?: boolean; skill?: string }) => {
      await runScore(opts);
    });
}

async function runScore(opts: { detail?: boolean; skill?: string }): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  const { computeScore } = await import('../feedback/scorer.js');
  await computeScore({ cwd, detail: opts.detail ?? false, skillFilter: opts.skill });
}
