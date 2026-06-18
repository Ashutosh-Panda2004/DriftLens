// DriftLens - PR status tracker

import type { FeedbackRecord } from '../shared/schema.js';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { FEEDBACK_FILE } from '../shared/constants.js';

export async function updateFeedbackRecord(
  record: FeedbackRecord,
  cwd: string
): Promise<void> {
  const feedbackPath = path.join(cwd, FEEDBACK_FILE);
  let records: FeedbackRecord[] = [];
  try {
    records = JSON.parse(await readFile(feedbackPath, 'utf8')) as FeedbackRecord[];
  } catch {
    records = [];
  }

  const idx = records.findIndex((r) => r.pattern_id === record.pattern_id);
  if (idx !== -1) {
    records[idx] = record;
  } else {
    records.push(record);
  }

  await writeFile(feedbackPath, JSON.stringify(records, null, 2) + '\n', 'utf8');
}
