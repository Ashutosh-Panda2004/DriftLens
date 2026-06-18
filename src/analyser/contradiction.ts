// E-A5: Contradiction detection
//
// When two developers correct the AI in opposite directions on the same file or
// topic, the resulting skill rules will fight each other. This module surfaces
// those contradictions early so a human can adjudicate, rather than letting
// DriftLens propose two conflicting rules. Deterministic and LLM-free.

import { v4 as uuidv4 } from 'uuid';
import type { CorrectionRecord, Contradiction } from '../shared/schema.js';

// Antonym pairs that signal opposing intent in developer instructions.
const OPPOSING_PAIRS: Array<[string, string]> = [
  ['add', 'remove'],
  ['always', 'never'],
  ['use', 'avoid'],
  ['enable', 'disable'],
  ['public', 'private'],
  ['sync', 'async'],
  ['inline', 'extract'],
  ['split', 'merge'],
  ['camelcase', 'snake_case'],
  ['tabs', 'spaces'],
  ['named export', 'default export'],
];

function fileTopic(c: CorrectionRecord): string {
  // Group by file when available, else by language as a coarse topic.
  return (c.file && c.file.trim()) || c.language || 'unknown';
}

function instruction(c: CorrectionRecord): string {
  return (c.developer_instruction ?? '').toLowerCase();
}

function detectOpposition(a: string, b: string): boolean {
  for (const [x, y] of OPPOSING_PAIRS) {
    if ((a.includes(x) && b.includes(y)) || (a.includes(y) && b.includes(x))) {
      // Require they aren't both containing both terms (which would be neutral).
      const aHasBoth = a.includes(x) && a.includes(y);
      const bHasBoth = b.includes(x) && b.includes(y);
      if (!aHasBoth && !bHasBoth) return true;
    }
  }
  return false;
}

/**
 * Find contradictions among corrections grouped by file/topic. Only compares
 * corrections that carry developer instructions, since that is where intent is
 * expressed explicitly.
 */
export function detectContradictions(corrections: CorrectionRecord[]): Contradiction[] {
  const byTopic = new Map<string, CorrectionRecord[]>();
  for (const c of corrections) {
    if (!instruction(c)) continue;
    const topic = fileTopic(c);
    const list = byTopic.get(topic) ?? [];
    list.push(c);
    byTopic.set(topic, list);
  }

  const contradictions: Contradiction[] = [];

  for (const [topic, group] of byTopic) {
    if (group.length < 2) continue;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (!detectOpposition(instruction(a), instruction(b))) continue;

        // Use session id as a proxy for distinct origin (DriftLens does not
        // track human author identity); fall back to agent label.
        const devA = a.session_id ?? a.agent ?? 'unknown';
        const devB = b.session_id ?? b.agent ?? 'unknown';
        const crossDeveloper = devA !== devB && devA !== 'unknown' && devB !== 'unknown';

        contradictions.push({
          contradiction_id: uuidv4(),
          file_or_topic: topic,
          side_a: {
            instruction: a.developer_instruction ?? '',
            correction_ids: [a.id],
            developers: [devA],
          },
          side_b: {
            instruction: b.developer_instruction ?? '',
            correction_ids: [b.id],
            developers: [devB],
          },
          severity: crossDeveloper ? 'high' : 'medium',
          recommendation: crossDeveloper
            ? `Two developers disagree on ${topic}. Align on a single convention before proposing a rule.`
            : `Conflicting guidance on ${topic} over time. Confirm the current intended convention.`,
        });
      }
    }
  }

  return contradictions;
}
