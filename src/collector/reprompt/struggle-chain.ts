// DriftLens - Struggle chain detector

import { v4 as uuidv4 } from 'uuid';
import type { CorrectionRecord, StruggleChain, StruggleChainTurn } from '../../shared/schema.js';
import type { ParsedSession, RawMessage } from './index.js';
import { classifyMessage } from './classifier.js';

/**
 * Parse an ISO timestamp to epoch milliseconds, falling back to "now" when the
 * value is missing or unparseable. This prevents invalid dates from poisoning
 * duration/friction metrics with NaN.
 */
function parseTimestampMs(ts: string | null | undefined): number {
  if (!ts) return Date.now();
  const ms = new Date(ts).getTime();
  return Number.isNaN(ms) ? Date.now() : ms;
}

/**
 * Detect struggle chains in a parsed session.
 * A struggle chain: 2+ developer correction messages about the same file/topic.
 */
export function detectStruggleChains(session: ParsedSession): CorrectionRecord[] {
  const records: CorrectionRecord[] = [];
  const messages = session.messages;

  // Group messages by file context
  const groups = groupByFileContext(messages);

  for (const group of groups) {
    const correctionTurns = group.filter(
      (m) => m.role === 'developer' && classifyMessage(m.content) === 'correction'
    );

    if (correctionTurns.length < 2) continue;

    // Build the struggle chain
    const chain = buildStruggleChain(group, session.agent);
    if (!chain) continue;

    const firstMsg = group[0];
    const lastMsg = group[group.length - 1];
    const filesSet = new Set(group.flatMap((m) => m.files_mentioned));

    const record: CorrectionRecord = {
      id: uuidv4(),
      ts: firstMsg?.timestamp ?? new Date().toISOString(),
      correction_type: 'struggle_chain',
      commit_hash: null,
      skill_active: 'developer',
      file: firstMsg?.files_mentioned[0] ?? 'unknown',
      language: 'unknown',
      ai_wrote: null,
      human_committed: null,
      developer_instruction: chain.initial_request,
      struggle_chain: chain,
      context_before: '',
      context_after: '',
      detection_method: 'session_log',
      detection_confidence: 0.85,
      session_id: session.session_id,
      session_log_source: session.source,
      agent: session.agent as CorrectionRecord['agent'],
      model_used: 'unknown',
      generation_timestamp: null,
      time_to_commit_ms: null,
      estimated_manual_time_ms: 90000,
      model_version: null,
      agent_session_tokens: null,
      pattern_categories: [],
      module_category: 'unknown',
    };

    records.push(record);
  }

  return records;
}

function groupByFileContext(messages: RawMessage[]): RawMessage[][] {
  const groups: RawMessage[][] = [];
  let current: RawMessage[] = [];
  let currentFiles: Set<string> = new Set();

  for (const msg of messages) {
    const msgFiles = new Set(msg.files_mentioned);

    // Check file overlap
    const hasOverlap = msg.files_mentioned.some((f) => currentFiles.has(f));

    if (current.length === 0 || hasOverlap || msg.files_mentioned.length === 0) {
      current.push(msg);
      for (const f of msg.files_mentioned) currentFiles.add(f);
    } else {
      if (current.length > 0) groups.push(current);
      current = [msg];
      currentFiles = msgFiles;
    }
  }

  if (current.length > 0) groups.push(current);
  return groups;
}

function buildStruggleChain(messages: RawMessage[], _agent: string): StruggleChain | null {
  if (messages.length === 0) return null;
  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];

  const firstTs = parseTimestampMs(firstMsg?.timestamp);
  const lastTs = parseTimestampMs(lastMsg?.timestamp);
  const durationSeconds = Math.max(0, Math.round((lastTs - firstTs) / 1000));

  const chain: StruggleChainTurn[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    files_modified: m.files_mentioned,
  }));

  const developerCorrections = messages.filter(
    (m) => m.role === 'developer' && classifyMessage(m.content) === 'correction'
  );

  const turnCount = developerCorrections.length;
  const totalTurns = messages.length;
  const frictionScore = turnCount;

  const rulesExtracted = developerCorrections.map((m) => m.content);
  const initialRequest =
    messages.find((m) => m.role === 'developer')?.content ?? '';

  return {
    turn_count: turnCount,
    total_turns: totalTurns,
    duration_seconds: durationSeconds,
    friction_score: frictionScore,
    chain,
    initial_request: initialRequest,
    final_committed_code: null,
    rules_extracted: rulesExtracted,
  };
}
