// driftlens report - generate monthly drift report (stretch)

import type { Command } from 'commander';
import { logger } from '../shared/logger.js';

export function registerReport(program: Command): void {
  program
    .command('report')
    .description('Generate a monthly drift report')
    .option('--format <type>', 'output format: md or pdf', 'md')
    .action(async (_opts: { format: string }) => {
      logger.warn('Report generation is not yet implemented (stretch feature).');
      logger.info('This feature will generate a monthly drift analysis in Markdown or PDF format.');
    });
}
