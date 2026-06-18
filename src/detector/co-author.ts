// DriftLens - Co-authored-by trailer detection

interface CoAuthorSignal {
  agent: string;
}

const CO_AUTHOR_PATTERNS: Array<{ pattern: RegExp; agent: string }> = [
  { pattern: /co-authored-by:.*github copilot/i, agent: 'copilot' },
  { pattern: /co-authored-by:.*claude/i, agent: 'claude' },
  { pattern: /co-authored-by:.*cursor/i, agent: 'cursor' },
  { pattern: /co-authored-by:.*gemini/i, agent: 'gemini' },
  { pattern: /co-authored-by:.*codex/i, agent: 'codex' },
];

export function detectCoAuthor(commitMessage: string): CoAuthorSignal | null {
  for (const { pattern, agent } of CO_AUTHOR_PATTERNS) {
    if (pattern.test(commitMessage)) {
      return { agent };
    }
  }
  return null;
}
