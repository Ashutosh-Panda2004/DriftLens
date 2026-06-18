// DriftLens - Cursor session data parser (.cursor/)

import { readdir, readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { ParsedSession, RawMessage } from './index.js';
import { v4 as uuidv4 } from 'uuid';

interface CursorMessage {
  role: 'user' | 'assistant' | 'human' | 'bot';
  content: string;
  timestamp?: string;
  files?: string[];
}

export async function parseCursorSessions(cursorDir: string): Promise<ParsedSession[]> {
  const sessions: ParsedSession[] = [];
  if (!existsSync(cursorDir)) return sessions;

  const entries = await readdir(cursorDir, { recursive: true });

  for (const entry of entries) {
    const entryStr = typeof entry === 'string' ? entry : entry.toString();
    if (!entryStr.endsWith('.json') && !entryStr.endsWith('.jsonl')) continue;

    const fp = path.join(cursorDir, entryStr);
    try {
      const raw = await readFile(fp, 'utf8');
      const data = JSON.parse(raw) as
        | CursorMessage[]
        | { messages?: CursorMessage[]; conversation?: CursorMessage[] };

      const rawMessages = Array.isArray(data)
        ? data
        : (data.messages ?? data.conversation ?? []);

      const messages: RawMessage[] = rawMessages.map((m) => ({
        role: m.role === 'user' || m.role === 'human' ? 'developer' : 'ai',
        content: m.content,
        timestamp: m.timestamp ?? null,
        files_mentioned: m.files ?? extractFilePaths(m.content),
        source: 'cursor',
      }));

      if (messages.length > 0) {
        sessions.push({
          session_id: path.basename(fp, '.json'),
          source: fp,
          agent: 'cursor',
          messages,
        });
      }
    } catch {
      // Skip
    }
  }

  return sessions;
}

function extractFilePaths(text: string): string[] {
  const matches = text.match(/(?:^|\s)([a-zA-Z0-9_\-./]+\.[a-z]{2,5})(?:\s|$)/g) ?? [];
  return [...new Set(matches.map((m) => m.trim()))].filter((f) => !f.startsWith('http'));
}
