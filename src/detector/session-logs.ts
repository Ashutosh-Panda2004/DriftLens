// DriftLens - Session log correlation detection

import { readdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import os from 'os';

interface SessionLogSignal {
  agent: string;
  session_id: string;
  source: string;
}

export async function detectSessionLogs(
  cwd: string,
  commitTimestamp: string,
  windowMinutes: number
): Promise<SessionLogSignal | null> {
  const commitTime = new Date(commitTimestamp).getTime();
  if (Number.isNaN(commitTime)) return null;
  const windowMs = windowMinutes * 60 * 1000;

  // Check Claude session logs (~/.claude/)
  const claudeDir = path.join(os.homedir(), '.claude');
  if (existsSync(claudeDir)) {
    const signal = await checkDirectoryForRecentFile(claudeDir, commitTime, windowMs, 'claude');
    if (signal) return signal;
  }

  // Check Cursor session data
  const cursorDir = path.join(cwd, '.cursor');
  if (existsSync(cursorDir)) {
    const signal = await checkDirectoryForRecentFile(cursorDir, commitTime, windowMs, 'cursor');
    if (signal) return signal;
  }

  return null;
}

async function checkDirectoryForRecentFile(
  dir: string,
  commitTime: number,
  windowMs: number,
  agent: string
): Promise<SessionLogSignal | null> {
  try {
    const entries = await readdir(dir);
    for (const entry of entries) {
      const fp = path.join(dir, entry);
      const s = await stat(fp);
      const mtime = s.mtime.getTime();
      if (Math.abs(mtime - commitTime) <= windowMs) {
        return {
          agent,
          session_id: entry.replace(/\.[^.]+$/, ''),
          source: fp,
        };
      }
    }
  } catch {
    // Directory not accessible
  }
  return null;
}
