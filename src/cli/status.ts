// driftlens status - show what has been captured

import type { Command } from 'commander';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '../shared/logger.js';
import { CORRECTIONS_FILE } from '../shared/constants.js';
import { isInitialised } from '../shared/config.js';
import type { CorrectionRecord } from '../shared/schema.js';

export function registerStatus(program: Command): void {
  program
    .command('status')
    .description('Show what corrections have been captured')
    .action(async () => {
      await runStatus();
    });
}

async function runStatus(): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  const corrPath = path.join(cwd, CORRECTIONS_FILE);
  if (!existsSync(corrPath)) {
    logger.info('No corrections captured yet. Start a session with: driftlens watch start');
    return;
  }

  const lines = (await readFile(corrPath, 'utf8')).split('\n').filter((l) => l.trim());
  if (lines.length === 0) {
    logger.info('No corrections captured yet. Start a session with: driftlens watch start');
    return;
  }

  const corrections = lines.map((l) => JSON.parse(l) as CorrectionRecord);

  logger.heading('DriftLens Status');

  // Breakdown by type
  const byType: Record<string, number> = { git_delta: 0, reprompt: 0, struggle_chain: 0, churn: 0 };
  for (const c of corrections) {
    byType[c.correction_type] = (byType[c.correction_type] ?? 0) + 1;
  }

  logger.info(`Total corrections captured: ${corrections.length}`);
  logger.info(`  git_delta:     ${byType['git_delta'] ?? 0}`);
  logger.info(`  reprompt:      ${byType['reprompt'] ?? 0}`);
  logger.info(`  struggle_chain: ${byType['struggle_chain'] ?? 0}`);
  logger.info(`  churn:         ${byType['churn'] ?? 0}`);

  // Date range
  const timestamps = corrections.map((c) => new Date(c.ts).getTime()).sort();
  const first = new Date(timestamps[0] ?? 0).toISOString().split('T')[0];
  const last = new Date(timestamps[timestamps.length - 1] ?? 0).toISOString().split('T')[0];
  logger.info(`\nDate range: ${first} → ${last}`);

  // Top files
  const fileCounts: Record<string, number> = {};
  for (const c of corrections) {
    fileCounts[c.file] = (fileCounts[c.file] ?? 0) + 1;
  }
  const topFiles = Object.entries(fileCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  logger.info('\nTop files by correction count:');
  for (const [file, count] of topFiles) {
    logger.info(`  ${count.toString().padStart(3)}  ${file}`);
  }

  // Detection methods
  const methodCounts: Record<string, number> = {};
  for (const c of corrections) {
    methodCounts[c.detection_method] = (methodCounts[c.detection_method] ?? 0) + 1;
  }
  logger.info('\nDetection methods:');
  for (const [method, count] of Object.entries(methodCounts)) {
    const pct = Math.round((count / corrections.length) * 100);
    logger.info(`  ${method.padEnd(14)} ${count} (${pct}%)`);
  }

  // Agent breakdown
  const agentCounts: Record<string, number> = {};
  for (const c of corrections) {
    agentCounts[c.agent] = (agentCounts[c.agent] ?? 0) + 1;
  }
  logger.info('\nAgent breakdown:');
  for (const [agent, count] of Object.entries(agentCounts)) {
    const pct = Math.round((count / corrections.length) * 100);
    logger.info(`  ${agent.padEnd(12)} ${count} (${pct}%)`);
  }

  // Struggle chain stats
  const chains = corrections.filter((c) => c.correction_type === 'struggle_chain');
  if (chains.length > 0) {
    const totalTurns = chains.reduce((sum, c) => sum + (c.struggle_chain?.turn_count ?? 0), 0);
    const avgTurns = (totalTurns / chains.length).toFixed(1);
    const frictionScores = chains.map((c) => c.struggle_chain?.friction_score ?? 0);
    const avgFriction = (frictionScores.reduce((a, b) => a + b, 0) / frictionScores.length).toFixed(1);

    logger.info(`\nStruggle chains: ${chains.length}`);
    logger.info(`  Average turns per chain: ${avgTurns}`);
    logger.info(`  Average friction score:  ${avgFriction}`);
  }
}
