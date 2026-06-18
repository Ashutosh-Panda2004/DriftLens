// DriftLens - Safe file I/O helpers for JSON and JSONL data files.
//
// All DriftLens state lives in .driftlens/ as either JSON (patterns, feedback,
// config) or append-only JSONL (corrections, sessions, marked-commits). A single
// malformed line — caused by a crash mid-append, a manual edit, or a partial
// disk write — must never crash the whole pipeline. These helpers degrade
// gracefully: bad JSONL lines are skipped (with a warning) and a corrupt JSON
// document falls back to a caller-supplied default.

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { logger } from './logger.js';

/**
 * Read a newline-delimited JSON (JSONL) file, skipping blank and malformed
 * lines. Returns an empty array if the file does not exist.
 *
 * This preserves the append-only resilience guarantee: a corrupted tail line
 * (e.g. from a process killed mid-write) does not invalidate every earlier
 * record.
 */
export async function readJsonl<T>(filepath: string): Promise<T[]> {
  if (!existsSync(filepath)) return [];

  const raw = await readFile(filepath, 'utf8');
  const records: T[] = [];
  let lineNo = 0;
  let skipped = 0;

  for (const line of raw.split('\n')) {
    lineNo++;
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed) as T);
    } catch {
      skipped++;
      logger.debug(`Skipping malformed JSONL line ${String(lineNo)} in ${filepath}`);
    }
  }

  if (skipped > 0) {
    logger.warn(`Skipped ${String(skipped)} malformed line(s) while reading ${filepath}`);
  }

  return records;
}

/**
 * Read and parse a JSON document. Returns `fallback` if the file is missing or
 * contains invalid JSON (logging a warning in the latter case).
 */
export async function readJsonFile<T>(filepath: string, fallback: T): Promise<T> {
  if (!existsSync(filepath)) return fallback;

  try {
    return JSON.parse(await readFile(filepath, 'utf8')) as T;
  } catch (err) {
    logger.warn(
      `Failed to parse ${filepath}: ${err instanceof Error ? err.message : String(err)}. Using fallback.`
    );
    return fallback;
  }
}
