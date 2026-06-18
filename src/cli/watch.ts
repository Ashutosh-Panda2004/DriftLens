// driftlens watch start/stop - explicit session bracketing

import type { Command } from 'commander';
import { appendFile, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../shared/logger.js';
import { SESSIONS_FILE } from '../shared/constants.js';
import { isInitialised } from '../shared/config.js';
import type { SessionRecord } from '../shared/schema.js';

export function registerWatch(program: Command): void {
  const watch = program.command('watch').description('Manage AI-assisted coding sessions');

  watch
    .command('start')
    .description('Start tracking an AI-assisted coding session')
    .option('--source <name>', 'source identifier (for hooks)', 'manual')
    .option('--agent <name>', 'agent name (copilot, claude, cursor, etc.)', 'unknown')
    .action(async (opts: { source: string; agent: string }) => {
      await watchStart(opts);
    });

  watch
    .command('stop')
    .description('Stop tracking the current AI-assisted coding session')
    .action(async () => {
      await watchStop();
    });
}

async function watchStart(opts: { source: string; agent: string }): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  const session: SessionRecord = {
    session_id: uuidv4(),
    start_ts: new Date().toISOString(),
    end_ts: null,
    source: opts.source === 'copilot_hook' ? 'copilot_hook' : 'watch',
    agent: opts.agent,
  };

  await appendToSessionsFile(cwd, session);
  logger.success(`Session started (${session.session_id.slice(0, 8)})`);
  logger.info('Use driftlens watch stop when you finish your AI-assisted session.');
}

async function watchStop(): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  const sessionsPath = path.join(cwd, SESSIONS_FILE);
  if (!existsSync(sessionsPath)) {
    logger.warn('No sessions file found. Have you run driftlens watch start?');
    return;
  }

  const lines = (await readFile(sessionsPath, 'utf8'))
    .split('\n')
    .filter((l) => l.trim());

  const sessions = lines.map((l) => JSON.parse(l) as SessionRecord);
  const openIdx = sessions.findLastIndex((s) => s.end_ts === null);

  if (openIdx === -1) {
    logger.warn('No open session found. Run driftlens watch start first.');
    return;
  }

  const open = sessions[openIdx];
  if (!open) {
    logger.error('Session record is undefined.');
    return;
  }
  const now = new Date().toISOString();
  open.end_ts = now;

  const start = new Date(open.start_ts);
  const end = new Date(now);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);

  sessions[openIdx] = open;

  const updated = sessions.map((s) => JSON.stringify(s)).join('\n') + '\n';
  await writeFile(sessionsPath, updated, 'utf8');

  logger.success(`Session stopped. Duration: ${durationMin} minute(s)`);
  logger.info(`Session ID: ${open.session_id.slice(0, 8)}`);
}

async function appendToSessionsFile(cwd: string, session: SessionRecord): Promise<void> {
  const fp = path.join(cwd, SESSIONS_FILE);
  await appendFile(fp, JSON.stringify(session) + '\n', 'utf8');
}
