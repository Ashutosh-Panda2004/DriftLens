import { describe, it, expect } from 'vitest';
import { detectStruggleChains } from '../src/collector/reprompt/struggle-chain.js';
import type { ParsedSession } from '../src/collector/reprompt/index.js';

const makeSession = (messages: Array<{ role: 'developer' | 'ai'; content: string; files?: string[] }>): ParsedSession => ({
  session_id: 'test-session',
  source: '/tmp/test.json',
  agent: 'claude',
  messages: messages.map((m, i) => ({
    role: m.role,
    content: m.content,
    timestamp: new Date(Date.now() + i * 30000).toISOString(),
    files_mentioned: m.files ?? ['src/AuthService.ts'],
    source: 'claude',
  })),
});

describe('detectStruggleChains', () => {
  it('detects chain with 2+ developer corrections', () => {
    const session = makeSession([
      { role: 'developer', content: 'Add login function' },
      { role: 'ai', content: 'Using fetch to call /api/login' },
      { role: 'developer', content: "No, don't use fetch. Use authService" },
      { role: 'ai', content: 'Using new AuthService()' },
      { role: 'developer', content: "Don't use new, it's a singleton" },
      { role: 'ai', content: 'Using authService singleton' },
    ]);

    const chains = detectStruggleChains(session);
    expect(chains).toHaveLength(1);
    expect(chains[0]?.correction_type).toBe('struggle_chain');
    expect(chains[0]?.struggle_chain?.turn_count).toBeGreaterThanOrEqual(2);
  });

  it('does NOT detect chain for single correction', () => {
    const session = makeSession([
      { role: 'developer', content: 'Add login function' },
      { role: 'ai', content: 'Using fetch' },
      { role: 'developer', content: "No, use authService" },
      { role: 'ai', content: 'Updated to use authService' },
    ]);

    const chains = detectStruggleChains(session);
    expect(chains).toHaveLength(0);
  });

  it('extracts rules from developer correction messages', () => {
    const session = makeSession([
      { role: 'developer', content: 'Add login function' },
      { role: 'ai', content: 'Using fetch' },
      { role: 'developer', content: "Don't use fetch, use authService" },
      { role: 'ai', content: 'Using new AuthService()' },
      { role: 'developer', content: "Don't instantiate with new" },
      { role: 'ai', content: 'Fixed' },
    ]);

    const chains = detectStruggleChains(session);
    expect(chains[0]?.struggle_chain?.rules_extracted).toHaveLength(2);
    expect(chains[0]?.struggle_chain?.rules_extracted[0]).toContain('fetch');
  });

  it('computes friction score equal to correction turn count', () => {
    const session = makeSession([
      { role: 'developer', content: 'Initial request' },
      { role: 'ai', content: 'AI response 1' },
      { role: 'developer', content: "No, wrong approach" },
      { role: 'ai', content: 'AI response 2' },
      { role: 'developer', content: "Still wrong, do it this way" },
      { role: 'ai', content: 'AI response 3' },
      { role: 'developer', content: "One more fix needed" },
      { role: 'ai', content: 'Final response' },
    ]);

    const chains = detectStruggleChains(session);
    expect(chains[0]?.struggle_chain?.friction_score).toBe(3);
    expect(chains[0]?.struggle_chain?.turn_count).toBe(3);
  });

  it('separates chains by file context', () => {
    const session = makeSession([
      { role: 'developer', content: 'Fix auth', files: ['AuthService.ts'] },
      { role: 'ai', content: 'Using fetch in auth', files: ['AuthService.ts'] },
      { role: 'developer', content: "Don't use fetch in auth", files: ['AuthService.ts'] },
      { role: 'ai', content: 'Fixed auth', files: ['AuthService.ts'] },
      { role: 'developer', content: "Also wrong in auth", files: ['AuthService.ts'] },
      { role: 'ai', content: 'Fixed again', files: ['AuthService.ts'] },
    ]);

    const chains = detectStruggleChains(session);
    expect(chains.length).toBeGreaterThanOrEqual(1);
  });
});
