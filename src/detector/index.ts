// DriftLens - Multi-signal detection orchestrator

import type { CorrectionRecord, DetectionResult } from '../shared/schema.js';
import { detectWatchSession } from './watch-session.js';
import { detectManualMarks } from './manual-marks.js';
import { detectCommitTags } from './commit-tags.js';
import { detectCoAuthor } from './co-author.js';
import { detectSessionLogs } from './session-logs.js';

interface DetectOptions {
  cwd: string;
  commitHash: string;
  commitMessage: string;
  commitTimestamp: string;
  minConfidence: number;
  commitTagPatterns: string[];
  sessionLogWindowMinutes: number;
}

/**
 * Confidence combination formula: combined = 1 - ∏(1 - confidence_i)
 */
function combineConfidences(confidences: number[]): number {
  return 1 - confidences.reduce((product, c) => product * (1 - c), 1);
}

export async function detectAISession(opts: DetectOptions): Promise<DetectionResult> {
  const signals: DetectionResult['signals'] = [];

  // 1. Explicit watch session (confidence: 1.0)
  const watchSignal = await detectWatchSession(opts.cwd, opts.commitTimestamp);
  if (watchSignal) signals.push({ method: 'watch', confidence: 1.0, session_id: watchSignal.session_id });

  // 2. Manual marks (confidence: 1.0)
  const manualSignal = await detectManualMarks(opts.cwd, opts.commitHash);
  if (manualSignal) signals.push({ method: 'manual', confidence: 1.0 });

  // 3. Commit tags (confidence: 0.90)
  const tagSignal = detectCommitTags(opts.commitMessage, opts.commitTagPatterns);
  if (tagSignal) signals.push({ method: 'commit_tag', confidence: 0.90, agent: tagSignal.agent });

  // 4. Session log correlation (confidence: 0.85)
  const sessionLogSignal = await detectSessionLogs(
    opts.cwd,
    opts.commitTimestamp,
    opts.sessionLogWindowMinutes
  );
  if (sessionLogSignal) {
    signals.push({
      method: 'session_log',
      confidence: 0.85,
      agent: sessionLogSignal.agent,
      session_id: sessionLogSignal.session_id,
      session_log_source: sessionLogSignal.source,
    });
  }

  // 5. Co-author trailer (confidence: 0.80)
  const coAuthorSignal = detectCoAuthor(opts.commitMessage);
  if (coAuthorSignal) signals.push({ method: 'co_author', confidence: 0.80, agent: coAuthorSignal.agent });

  if (signals.length === 0) {
    return { commit_hash: opts.commitHash, is_ai_assisted: false, combined_confidence: 0, signals: [] };
  }

  const combined = combineConfidences(signals.map((s) => s.confidence));
  const isAssisted = combined >= opts.minConfidence;

  return {
    commit_hash: opts.commitHash,
    is_ai_assisted: isAssisted,
    combined_confidence: combined,
    signals,
  };
}

export function pickPrimarySignal(
  signals: DetectionResult['signals']
): Pick<CorrectionRecord, 'detection_method' | 'detection_confidence' | 'session_id' | 'session_log_source' | 'agent'> {
  const primary = signals.sort((a, b) => b.confidence - a.confidence)[0];
  if (!primary) {
    return {
      detection_method: 'commit_tag',
      detection_confidence: 0,
      session_id: null,
      session_log_source: null,
      agent: 'unknown',
    };
  }

  return {
    detection_method: primary.method,
    detection_confidence: primary.confidence,
    session_id: primary.session_id ?? null,
    session_log_source: primary.session_log_source ?? null,
    agent: (primary.agent as CorrectionRecord['agent']) ?? 'unknown',
  };
}
