import { describe, it, expect } from 'vitest';
import { detectCommitTags } from '../src/detector/commit-tags.js';
import { detectCoAuthor } from '../src/detector/co-author.js';

describe('detectCommitTags', () => {
  it('detects [ai] tag', () => {
    const result = detectCommitTags('[ai] add user service', ['[ai]', '[copilot]']);
    expect(result).not.toBeNull();
    expect(result?.agent).toBe('unknown');
  });

  it('detects [copilot] tag case-insensitively', () => {
    const result = detectCommitTags('[Copilot] fix auth bug', ['[ai]', '[copilot]']);
    expect(result).not.toBeNull();
    expect(result?.agent).toBe('copilot');
  });

  it('detects [claude] tag', () => {
    const result = detectCommitTags('[claude] refactor service layer', ['[ai]', '[claude]']);
    expect(result).not.toBeNull();
    expect(result?.agent).toBe('claude');
  });

  it('returns null for untagged commits', () => {
    const result = detectCommitTags('fix: correct typo in README', ['[ai]', '[copilot]']);
    expect(result).toBeNull();
  });

  it('returns null for empty message', () => {
    const result = detectCommitTags('', ['[ai]', '[copilot]']);
    expect(result).toBeNull();
  });
});

describe('detectCoAuthor', () => {
  it('detects GitHub Copilot co-author', () => {
    const result = detectCoAuthor('Add feature\n\nCo-authored-by: GitHub Copilot <copilot@github.com>');
    expect(result).not.toBeNull();
    expect(result?.agent).toBe('copilot');
  });

  it('detects Claude co-author', () => {
    const result = detectCoAuthor('Fix bug\n\nCo-authored-by: Claude <claude@anthropic.com>');
    expect(result).not.toBeNull();
    expect(result?.agent).toBe('claude');
  });

  it('returns null with no co-author', () => {
    const result = detectCoAuthor('Regular commit message');
    expect(result).toBeNull();
  });
});

describe('confidence combination', () => {
  it('combines two signals correctly', () => {
    // 1 - (1 - 0.90) * (1 - 0.85) = 1 - 0.10 * 0.15 = 0.985
    const combined = 1 - (1 - 0.90) * (1 - 0.85);
    expect(combined).toBeCloseTo(0.985);
  });

  it('single signal returns its own confidence', () => {
    const combined = 1 - (1 - 0.90);
    expect(combined).toBeCloseTo(0.90);
  });

  it('no signals returns 0', () => {
    const combined = [].reduce((p: number, c: number) => p * (1 - c), 1);
    expect(1 - combined).toBe(0);
  });
});
