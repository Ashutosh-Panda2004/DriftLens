// driftlens propose - propose skill file updates via draft PRs

import type { Command } from 'commander';
import { logger } from '../shared/logger.js';
import { isInitialised } from '../shared/config.js';

export function registerPropose(program: Command): void {
  program
    .command('propose')
    .description('Open draft PRs to update skill files based on discovered patterns')
    .option('--dry-run', 'print the proposed diff without creating a PR')
    .option('--confidence <n>', 'override the strategy minimum confidence threshold')
    .option('--format <name>', 'target a specific skill format (claude, copilot, cursor, etc.)')
    .option('--all-formats', 'propose to all configured skill formats')
    .option('--strategy <name>', 'proposal strategy: conservative | balanced | aggressive', 'balanced')
    .action(async (opts: { dryRun?: boolean; confidence?: string; format?: string; allFormats?: boolean; strategy?: string }) => {
      await runPropose(opts);
    });
}

async function runPropose(opts: {
  dryRun?: boolean;
  confidence?: string;
  format?: string;
  allFormats?: boolean;
  strategy?: string;
}): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  const { runProposal } = await import('../proposer/index.js');
  await runProposal({
    cwd,
    dryRun: opts.dryRun ?? false,
    minConfidence: opts.confidence !== undefined ? parseFloat(opts.confidence) : undefined,
    targetFormat: opts.format,
    allFormats: opts.allFormats ?? false,
    strategy: opts.strategy,
  });
}
