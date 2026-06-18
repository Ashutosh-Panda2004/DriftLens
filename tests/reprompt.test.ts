import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { parseAiderHistory } from '../src/collector/reprompt/aider-parser.js';
import { parseClaudeSessions } from '../src/collector/reprompt/claude-parser.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, 'fixtures');

describe('parseAiderHistory', () => {
  it('parses developer and AI messages', async () => {
    const sessions = await parseAiderHistory(path.join(FIXTURES, 'sample-aider-history.md'));
    expect(sessions).toHaveLength(1);
    const session = sessions[0]!;
    expect(session.agent).toBe('aider');
    expect(session.messages.length).toBeGreaterThan(0);
  });

  it('correctly identifies developer messages', async () => {
    const sessions = await parseAiderHistory(path.join(FIXTURES, 'sample-aider-history.md'));
    const devMessages = sessions[0]?.messages.filter((m) => m.role === 'developer') ?? [];
    expect(devMessages.length).toBeGreaterThan(0);
  });

  it('correctly identifies AI messages', async () => {
    const sessions = await parseAiderHistory(path.join(FIXTURES, 'sample-aider-history.md'));
    const aiMessages = sessions[0]?.messages.filter((m) => m.role === 'ai') ?? [];
    expect(aiMessages.length).toBeGreaterThan(0);
  });

  it('returns empty for non-existent file', async () => {
    const sessions = await parseAiderHistory('/does/not/exist.md');
    expect(sessions).toHaveLength(0);
  });
});

describe('parseClaudeSessions', () => {
  it('parses JSON session file', async () => {
    const sessions = await parseClaudeSessions(FIXTURES);
    // sample-claude-session.json is in fixtures
    const claudeSession = sessions.find((s) => s.source.includes('sample-claude-session'));
    expect(claudeSession).toBeDefined();
    expect(claudeSession?.agent).toBe('claude');
  });

  it('extracts developer and AI messages', async () => {
    const sessions = await parseClaudeSessions(FIXTURES);
    const claudeSession = sessions.find((s) => s.source.includes('sample-claude-session'));
    if (claudeSession) {
      const devMessages = claudeSession.messages.filter((m) => m.role === 'developer');
      expect(devMessages.length).toBeGreaterThan(0);
    }
  });
});
