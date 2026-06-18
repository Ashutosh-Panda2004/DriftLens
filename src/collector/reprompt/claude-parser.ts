// DriftLens - Claude Code session log parser (~/.claude/)

import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ParsedSession, RawMessage } from './index.js';
import { v4 as uuidv4 } from 'uuid';

interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string }>;
  timestamp?: string;
}

interface ClaudeSessionFile {
  session_id?: string;
  messages?: ClaudeMessage[];
  conversation?: ClaudeMessage[];
}

export async function parseClaudeSessions(claudeDir: string): Promise<ParsedSession[]> {
  const sessions: ParsedSession[] = [];

  if (!existsSync(claudeDir)) return sessions;

  const entries = await readdir(claudeDir, { recursive: true });

  for (const entry of entries) {
    const entryStr: string = typeof entry === 'string' ? entry : String(entry);
    if (!entryStr.endsWith('.json') && !entryStr.endsWith('.jsonl')) continue;

    const fp = path.join(claudeDir, entryStr);
    try {
      const raw = await readFile(fp, 'utf8');
      const parsed = tryParseClaudeFile(raw, fp);
      if (parsed) sessions.push(parsed);
    } catch {
      // Skip unreadable files
    }
  }

  return sessions;
}

function tryParseClaudeFile(raw: string, filepath: string): ParsedSession | null {
  // Try JSONL format (one message per line)
  const lines = raw.split('\n').filter((l) => l.trim());

  if (lines.length > 1) {
    try {
      const messages: RawMessage[] = [];
      for (const line of lines) {
        const msg = JSON.parse(line) as Partial<ClaudeMessage>;
        if (!msg.role || !msg.content) continue;
        messages.push(convertClaudeMessage(msg as ClaudeMessage));
      }
      if (messages.length > 0) {
        return {
          session_id: path.basename(filepath, '.jsonl'),
          source: filepath,
          agent: 'claude',
          messages,
        };
      }
    } catch {
      // Not JSONL
    }
  }

  // Try JSON object format
  try {
    const data = JSON.parse(raw) as ClaudeSessionFile;
    const rawMessages = data.messages ?? data.conversation ?? [];
    const messages = rawMessages.map(convertClaudeMessage);

    if (messages.length > 0) {
      return {
        session_id: data.session_id ?? uuidv4(),
        source: filepath,
        agent: 'claude',
        messages,
      };
    }
  } catch {
    // Not JSON
  }

  return null;
}

function convertClaudeMessage(msg: ClaudeMessage): RawMessage {
  let content: string;
  if (typeof msg.content === 'string') {
    content = msg.content;
  } else {
    content = msg.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('\n');
  }

  const files = extractFilePaths(content);

  return {
    role: msg.role === 'user' ? 'developer' : 'ai',
    content,
    timestamp: msg.timestamp ?? null,
    files_mentioned: files,
    source: 'claude',
  };
}

function extractFilePaths(text: string): string[] {
  const matches = text.match(/(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-z]{2,5})(?:\s|$)/g) ?? [];
  return [...new Set(matches.map((m) => m.trim()))].filter((f) => !f.startsWith('http'));
}
