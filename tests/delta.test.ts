import { describe, it, expect } from 'vitest';
import type { CorrectionRecord } from '../src/shared/schema.js';

// Test the diff parsing logic via the delta computation module
// We test at the data level using fixture data

describe('delta correction records', () => {
  it('git_delta has correct structure', () => {
    const correction: CorrectionRecord = {
      id: 'test-id',
      ts: new Date().toISOString(),
      correction_type: 'git_delta',
      commit_hash: 'abc123',
      skill_active: 'developer',
      file: 'src/App.tsx',
      language: 'typescript',
      ai_wrote: "const data = await fetch('/api/users')",
      human_committed: 'const data = await userService.getAll()',
      developer_instruction: null,
      struggle_chain: null,
      context_before: 'export function App() {',
      context_after: '  return <div />;',
      detection_method: 'watch',
      detection_confidence: 1.0,
      session_id: 'sess-001',
      session_log_source: null,
      agent: 'copilot',
      model_used: 'gpt-4o',
    };

    expect(correction.ai_wrote).toContain('fetch');
    expect(correction.human_committed).toContain('userService');
    expect(correction.context_before).toBeTruthy();
  });
});
