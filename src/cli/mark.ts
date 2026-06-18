// driftlens mark <commit> - retroactively tag commits as AI-assisted

import type { Command } from 'commander';
import { appendFile } from 'fs/promises';
import path from 'path';
import { logger } from '../shared/logger.js';
import { MARKED_COMMITS_FILE } from '../shared/constants.js';
import { isInitialised } from '../shared/config.js';
import type { MarkedCommitRecord } from '../shared/schema.js';
import simpleGit from 'simple-git';

export function registerMark(program: Command): void {
  program
    .command('mark <commit>')
    .description('Mark a commit (or range) as AI-assisted')
    .action(async (commit: string) => {
      await runMark(commit);
    });
}

async function runMark(commitArg: string): Promise<void> {
  const cwd = process.cwd();
  if (!isInitialised(cwd)) {
    logger.error('DriftLens not initialised. Run driftlens init first.');
    process.exit(1);
  }

  const git = simpleGit(cwd);
  const hashes = await resolveCommitHashes(git, commitArg);

  if (hashes.length === 0) {
    logger.error(`Could not resolve commit(s): ${commitArg}`);
    process.exit(1);
  }

  for (const hash of hashes) {
    const record: MarkedCommitRecord = {
      commit_hash: hash,
      marked_at: new Date().toISOString(),
      method: 'manual',
    };
    await appendFile(
      path.join(cwd, MARKED_COMMITS_FILE),
      JSON.stringify(record) + '\n',
      'utf8'
    );
  }

  logger.success(`Marked ${hashes.length} commit(s) as AI-assisted:`);
  for (const h of hashes) {
    logger.info(`  ${h.slice(0, 12)}`);
  }

  logger.info('Run driftlens analyse to process the marked commits.');
}

async function resolveCommitHashes(git: ReturnType<typeof simpleGit>, arg: string): Promise<string[]> {
  // Range: HEAD~3..HEAD
  if (arg.includes('..')) {
    const log = await git.log({ from: arg.split('..')[0], to: arg.split('..')[1] });
    return log.all.map((c) => c.hash);
  }

  // HEAD or specific SHA
  try {
    const result = await git.revparse([arg]);
    return [result.trim()];
  } catch {
    return [];
  }
}
