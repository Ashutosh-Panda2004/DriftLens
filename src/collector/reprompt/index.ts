// DriftLens - Re-prompt + struggle chain extraction orchestrator

import path from 'path';
import os from 'os';
import { appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../shared/logger.js';
import { CORRECTIONS_FILE } from '../../shared/constants.js';
import type { CorrectionRecord } from '../../shared/schema.js';
import { parseClaudeSessions } from './claude-parser.js';
import { parseCursorSessions } from './cursor-parser.js';
import { parseAiderHistory } from './aider-parser.js';
import { classifyMessage } from './classifier.js';
import { detectStruggleChains } from './struggle-chain.js';

export interface RawMessage {
  role: 'developer' | 'ai';
  content: string;
  timestamp: string | null;
  files_mentioned: string[];
  source: string;
}

export interface ParsedSession {
  session_id: string;
  source: string;
  agent: string;
  messages: RawMessage[];
}

/**
 * Parse all session logs and extract re-prompt + struggle chain corrections.
 * Called during `driftlens analyse`.
 */
export async function extractRepromptCorrections(cwd: string): Promise<number> {
  const sessions: ParsedSession[] = [];

  // Claude
  const claudeDir = path.join(os.homedir(), '.claude');
  if (existsSync(claudeDir)) {
    const claudeSessions = await parseClaudeSessions(claudeDir);
    sessions.push(...claudeSessions);
    logger.debug(`Claude: ${claudeSessions.length} sessions`);
  }

  // Cursor
  const cursorDir = path.join(cwd, '.cursor');
  if (existsSync(cursorDir)) {
    const cursorSessions = await parseCursorSessions(cursorDir);
    sessions.push(...cursorSessions);
    logger.debug(`Cursor: ${cursorSessions.length} sessions`);
  }

  // Aider
  const aiderHistory = path.join(cwd, '.aider.chat.history.md');
  if (existsSync(aiderHistory)) {
    const aiderSessions = await parseAiderHistory(aiderHistory);
    sessions.push(...aiderSessions);
    logger.debug(`Aider: ${aiderSessions.length} sessions`);
  }

  if (sessions.length === 0) return 0;

  const corrections: CorrectionRecord[] = [];

  for (const session of sessions) {
    // Detect struggle chains first
    const chains = detectStruggleChains(session);
    corrections.push(...chains);

    // Then extract individual re-prompts (not already in a chain)
    const chainIds = new Set(chains.flatMap((c) => c.id));
    const reprompts = extractIndividualReprompts(session, chainIds);
    corrections.push(...reprompts);
  }

  // Write to corrections.jsonl
  const corrPath = path.join(cwd, CORRECTIONS_FILE);
  for (const corr of corrections) {
    await appendFile(corrPath, JSON.stringify(corr) + '\n', 'utf8');
  }

  return corrections.length;
}

function extractIndividualReprompts(
  session: ParsedSession,
  _excludeIds: Set<string>
): CorrectionRecord[] {
  const corrections: CorrectionRecord[] = [];
  for (let i = 1; i < session.messages.length; i++) {
    const msg = session.messages[i];
    if (!msg || msg.role !== 'developer') continue;

    const prev = session.messages[i - 1];
    if (!prev || prev.role !== 'ai') continue;

    const classification = classifyMessage(msg.content, prev.content);
    if (classification !== 'correction') continue;

    const record: CorrectionRecord = {
      id: uuidv4(),
      ts: msg.timestamp ?? new Date().toISOString(),
      correction_type: 'reprompt',
      commit_hash: null,
      skill_active: 'developer',
      file: msg.files_mentioned[0] ?? 'unknown',
      language: 'unknown',
      ai_wrote: prev.content.slice(0, 500),
      human_committed: null,
      developer_instruction: msg.content,
      struggle_chain: null,
      context_before: '',
      context_after: '',
      detection_method: 'session_log',
      detection_confidence: 0.85,
      session_id: session.session_id,
      session_log_source: session.source,
      agent: session.agent as CorrectionRecord['agent'],
      model_used: 'unknown',
    };

    corrections.push(record);
  }

  return corrections;
}
