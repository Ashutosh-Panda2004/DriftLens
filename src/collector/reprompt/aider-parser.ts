// DriftLens - Aider chat history parser (.aider.chat.history.md)

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { ParsedSession, RawMessage } from './index.js';

/**
 * Parse .aider.chat.history.md
 * Format:
 *   #### user
 *   message content
 *
 *   #### assistant
 *   response content
 */
export async function parseAiderHistory(filepath: string): Promise<ParsedSession[]> {
  if (!existsSync(filepath)) return [];

  const raw = await readFile(filepath, 'utf8');
  const messages = parseAiderMarkdown(raw);

  if (messages.length === 0) return [];

  return [
    {
      session_id: uuidv4(),
      source: filepath,
      agent: 'aider',
      messages,
    },
  ];
}

function parseAiderMarkdown(content: string): RawMessage[] {
  const messages: RawMessage[] = [];
  const blocks = content.split(/^####\s+/m).filter(Boolean);

  for (const block of blocks) {
    const firstNewline = block.indexOf('\n');
    if (firstNewline === -1) continue;

    const roleRaw = block.slice(0, firstNewline).trim().toLowerCase();
    const body = block.slice(firstNewline + 1).trim();

    if (!body) continue;

    const role: RawMessage['role'] = roleRaw === 'user' ? 'developer' : 'ai';

    messages.push({
      role,
      content: body,
      timestamp: null,
      files_mentioned: extractFilePaths(body),
      source: 'aider',
    });
  }

  return messages;
}

function extractFilePaths(text: string): string[] {
  const matches = text.match(/`([a-zA-Z0-9_\-./]+\.[a-z]{2,5})`/g) ?? [];
  return [...new Set(matches.map((m) => m.replace(/`/g, '')))];
}
