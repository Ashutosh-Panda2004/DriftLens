// driftlens analyse - find patterns in captured corrections

import type { Command } from 'commander';
import { logger } from '../shared/logger.js';
import { isInitialised } from '../shared/config.js';

export function registerAnalyse(program: Command): void {
  program
    .command('analyse')
    .description('Analyse captured corrections and find recurring patterns')
    .option('--min-occurrences <n>', 'minimum occurrences to surface a pattern', '3')
    .option('--since <period>', 'only analyse corrections in the last period (e.g. 30d, 2w)')
    .option('--no-llm', 'use rule-based fallback (no API calls)')
    .option('--agent <name>', 'filter by agent name')
    .action(async (opts: { minOccurrences: string; since?: string; noLlm?: boolean; agent?: string }) => {
      await runAnalyse(opts);
    });
}

async function runAnalyse(opts: {
  minOccurrences: string;
  since?: string;
  noLlm?: boolean;
  agent?: string;
}): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  // Dynamic import to keep startup fast
  const { runAnalysis } = await import('../analyser/index.js');
  await runAnalysis({
    cwd,
    minOccurrences: parseInt(opts.minOccurrences, 10),
    since: opts.since,
    noLlm: opts.noLlm ?? false,
    agentFilter: opts.agent,
  });
}
