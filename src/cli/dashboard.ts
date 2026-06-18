// driftlens dashboard - start the local web dashboard

import type { Command } from 'commander';
import { logger } from '../shared/logger.js';
import { isInitialised, readConfig } from '../shared/config.js';

export function registerDashboard(program: Command): void {
  program
    .command('dashboard')
    .description('Start the local DriftLens web dashboard')
    .option('--port <n>', 'port to listen on', '3847')
    .option('--no-open', 'do not open the browser automatically')
    .action(async (opts: { port: string; open: boolean }) => {
      await runDashboard(opts);
    });
}

async function runDashboard(opts: { port: string; open: boolean }): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  const config = await readConfig(cwd);
  const port = parseInt(opts.port, 10) || config.dashboard.port;
  const openBrowser = opts.open !== false && config.dashboard.openBrowser;

  const { startDashboard } = await import('../dashboard/server.js');
  await startDashboard({ cwd, port, openBrowser });
}
