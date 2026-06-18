// DriftLens - Commit message convention detection

interface TagSignal {
  agent: string;
}

const TAG_TO_AGENT: Record<string, string> = {
  '[copilot]': 'copilot',
  '[claude]': 'claude',
  '[cursor]': 'cursor',
  '[gemini]': 'gemini',
  '[codex]': 'codex',
  '[aider]': 'aider',
  '[ai]': 'unknown',
  '[agent]': 'unknown',
};

export function detectCommitTags(
  commitMessage: string,
  patterns: string[]
): TagSignal | null {
  const lower = commitMessage.toLowerCase();

  for (const pattern of patterns) {
    if (lower.includes(pattern.toLowerCase())) {
      const agent = TAG_TO_AGENT[pattern.toLowerCase()] ?? 'unknown';
      return { agent };
    }
  }

  return null;
}
