// DriftLens - Watch session detection

import { existsSync } from 'fs';
import path from 'path';
import { readJsonl } from '../shared/io.js';
import { SESSIONS_FILE } from '../shared/constants.js';
import type { SessionRecord } from '../shared/schema.js';

interface WatchSignal {
  session_id: string;
}

export async function detectWatchSession(
  cwd: string,
  commitTimestamp: string
): Promise<WatchSignal | null> {
  const fp = path.join(cwd, SESSIONS_FILE);
  if (!existsSync(fp)) return null;

  const sessions = await readJsonl<SessionRecord>(fp);
  const commitTime = new Date(commitTimestamp).getTime();
  if (Number.isNaN(commitTime)) return null;

  for (const session of sessions) {
    const start = new Date(session.start_ts).getTime();
    const end = session.end_ts ? new Date(session.end_ts).getTime() : Date.now();
    if (commitTime >= start && commitTime <= end) {
      return { session_id: session.session_id };
    }
  }

  return null;
}
