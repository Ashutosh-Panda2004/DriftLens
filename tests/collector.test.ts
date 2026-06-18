import { describe, it, expect } from 'vitest';
// Collector tests - parseDiff is internal; we test the observable output
// by verifying CorrectionRecord types from fixture data

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { CorrectionRecord } from '../src/shared/schema.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('corrections.jsonl fixture', () => {
  it('loads and parses fixture corrections', () => {
    const raw = readFileSync(
      path.join(__dirname, 'fixtures/sample-corrections.jsonl'),
      'utf8'
    );
    const lines = raw.split('\n').filter((l) => l.trim());
    expect(lines.length).toBeGreaterThan(0);

    const corrections = lines.map((l) => JSON.parse(l) as CorrectionRecord);
    expect(corrections.length).toBe(10);
  });

  it('all corrections have required fields', () => {
    const raw = readFileSync(
      path.join(__dirname, 'fixtures/sample-corrections.jsonl'),
      'utf8'
    );
    const corrections = raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as CorrectionRecord);

    for (const c of corrections) {
      expect(c.id).toBeTruthy();
      expect(c.ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(['git_delta', 'reprompt', 'struggle_chain', 'churn']).toContain(c.correction_type);
      expect(c.file).toBeTruthy();
      expect(c.language).toBeTruthy();
    }
  });

  it('struggle_chain corrections have struggle_chain field', () => {
    const raw = readFileSync(
      path.join(__dirname, 'fixtures/sample-corrections.jsonl'),
      'utf8'
    );
    const corrections = raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as CorrectionRecord);

    const chains = corrections.filter((c) => c.correction_type === 'struggle_chain');
    expect(chains.length).toBeGreaterThan(0);

    for (const chain of chains) {
      expect(chain.struggle_chain).not.toBeNull();
      expect(chain.struggle_chain?.turn_count).toBeGreaterThanOrEqual(2);
    }
  });

  it('git_delta corrections have ai_wrote and human_committed', () => {
    const raw = readFileSync(
      path.join(__dirname, 'fixtures/sample-corrections.jsonl'),
      'utf8'
    );
    const corrections = raw
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as CorrectionRecord);

    const deltas = corrections.filter((c) => c.correction_type === 'git_delta');
    expect(deltas.length).toBeGreaterThan(0);

    for (const delta of deltas) {
      expect(delta.ai_wrote).toBeTruthy();
      expect(delta.human_committed).toBeTruthy();
    }
  });
});
