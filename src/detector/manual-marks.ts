// DriftLens - Manual commit mark detection

import { existsSync } from 'fs';
import path from 'path';
import { readJsonl } from '../shared/io.js';
import { MARKED_COMMITS_FILE } from '../shared/constants.js';
import type { MarkedCommitRecord } from '../shared/schema.js';

export async function detectManualMarks(
  cwd: string,
  commitHash: string
): Promise<{ found: true } | null> {
  const fp = path.join(cwd, MARKED_COMMITS_FILE);
  if (!existsSync(fp)) return null;

  const marks = await readJsonl<MarkedCommitRecord>(fp);

  for (const mark of marks) {
    if (mark.commit_hash === commitHash || commitHash.startsWith(mark.commit_hash)) {
      return { found: true };
    }
  }

  return null;
}
