// DriftLens - Git delta computation (post-commit hook logic)

import simpleGit from 'simple-git';
import { appendFile } from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { CORRECTIONS_FILE, LANGUAGE_EXTENSIONS } from '../shared/constants.js';
import type { CorrectionRecord } from '../shared/schema.js';
import { detectAISession, pickPrimarySignal } from '../detector/index.js';
import { readConfig } from '../shared/config.js';
import { classifyReasons } from '../analyser/reason-classifier.js';

export async function collectDelta(cwd: string): Promise<void> {
  const config = await readConfig(cwd);
  const git = simpleGit(cwd);

  // Get the latest commit info
  const log = await git.log({ maxCount: 1 });
  const commit = log.latest;
  if (!commit) return;

  const detection = await detectAISession({
    cwd,
    commitHash: commit.hash,
    commitMessage: commit.message,
    commitTimestamp: commit.date,
    minConfidence: config.detection.minConfidence,
    commitTagPatterns: config.detection.commitTagPatterns,
    sessionLogWindowMinutes: config.detection.sessionLogWindowMinutes,
  });

  if (!detection.is_ai_assisted) return;

  // Get the diff of this commit
  const diff = await git.diff([`${commit.hash}~1`, commit.hash, '--unified=3']);
  const hunks = parseDiff(diff);

  const primarySignal = pickPrimarySignal(detection.signals);
  const corrPath = path.join(cwd, CORRECTIONS_FILE);

  for (const hunk of hunks) {
    const ext = path.extname(hunk.file);
    const language = LANGUAGE_EXTENSIONS[ext] ?? 'unknown';

    // E-C4: capture cost/effort signals so downstream ROI math has real inputs.
    // The AI generation timestamp is not recoverable from a git commit, so we
    // leave it null here; live collectors (MCP/session logs) populate it.
    const changedLines =
      hunk.added.split('\n').filter(Boolean).length +
      hunk.removed.split('\n').filter(Boolean).length;
    // Rough manual-effort estimate: ~30s of human work per changed line.
    const estimatedManualTimeMs = changedLines > 0 ? changedLines * 30_000 : null;

    const record: CorrectionRecord = {
      id: uuidv4(),
      ts: new Date().toISOString(),
      correction_type: 'git_delta',
      commit_hash: commit.hash,
      skill_active: 'developer',
      file: hunk.file,
      language,
      ai_wrote: hunk.removed,
      human_committed: hunk.added,
      developer_instruction: null,
      struggle_chain: null,
      context_before: hunk.contextBefore,
      context_after: hunk.contextAfter,
      ...primarySignal,
      model_used: 'unknown',
      generation_timestamp: null,
      time_to_commit_ms: null,
      estimated_manual_time_ms: estimatedManualTimeMs,
      model_version: null,
      agent_session_tokens: null,
      module_category: inferModuleCategory(hunk.file),
      pattern_categories: [],
    };
    // E-C1: classify the correction reason at capture time so it is available
    // even before any analyse run.
    record.pattern_categories = classifyReasons(record);

    // Atomic append
    await appendFile(corrPath, JSON.stringify(record) + '\n', 'utf8');
  }
}

/**
 * Infer a coarse module category from a file path for blocking / economics.
 */
function inferModuleCategory(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes('test') || lower.includes('spec')) return 'testing';
  if (lower.includes('service')) return 'service-layer';
  if (lower.endsWith('.tsx') || lower.includes('component')) return 'react-component';
  if (lower.includes('controller') || lower.includes('handler') || lower.includes('route'))
    return 'api-handler';
  if (lower.includes('model') || lower.includes('schema') || lower.includes('migration'))
    return 'data-layer';
  if (lower.includes('graphql') || lower.includes('resolver')) return 'graphql';
  return 'general';
}

interface DiffHunk {
  file: string;
  removed: string;
  added: string;
  contextBefore: string;
  contextAfter: string;
}

function parseDiff(diffText: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const fileChunks = diffText.split(/^diff --git /m).filter(Boolean);

  for (const chunk of fileChunks) {
    const fileMatch = /^a\/.+? b\/(.+)$/m.exec(chunk);
    if (!fileMatch) continue;
    const file = fileMatch[1] ?? '';

    const hunkSections = chunk.split(/^@@ /m).slice(1);
    for (const section of hunkSections) {
      const lines = section.split('\n');
      const contextBefore: string[] = [];
      const removed: string[] = [];
      const added: string[] = [];
      const contextAfter: string[] = [];

      let phase: 'before' | 'diff' | 'after' = 'before';
      let diffSeen = false;

      for (const line of lines) {
        if (line.startsWith('-')) {
          removed.push(line.slice(1));
          phase = 'diff';
          diffSeen = true;
        } else if (line.startsWith('+')) {
          added.push(line.slice(1));
          phase = 'diff';
          diffSeen = true;
        } else if (line.startsWith(' ')) {
          if (!diffSeen) {
            contextBefore.push(line.slice(1));
          } else if (phase === 'diff') {
            phase = 'after';
            contextAfter.push(line.slice(1));
          } else {
            contextAfter.push(line.slice(1));
          }
        }
      }

      if (removed.length > 0 || added.length > 0) {
        hunks.push({
          file,
          removed: removed.join('\n'),
          added: added.join('\n'),
          contextBefore: contextBefore.slice(-3).join('\n'),
          contextAfter: contextAfter.slice(0, 3).join('\n'),
        });
      }
    }
  }

  return hunks;
}
