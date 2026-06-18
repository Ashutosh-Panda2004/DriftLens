// DriftLens - Skill file format adapters
// Read/write SKILL.md, CLAUDE.md, .cursorrules, etc.

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import type { PatternRecord } from '../shared/schema.js';

export interface SkillFileContent {
  raw: string;
  sections: Array<{ title: string; content: string; locked: boolean }>;
  learnedRulesSection: number | null; // index into sections array
}

export interface SkillAdapter {
  read(filepath: string): Promise<SkillFileContent>;
  write(filepath: string, pattern: PatternRecord, existingContent: string): Promise<string>;
  findLockedSections(content: string): Array<{ start: number; end: number }>;
  findLearnedRulesSection(content: string): number | null;
}

// ─── Base Markdown Adapter ────────────────────────────────────────────────────

class MarkdownSkillAdapter implements SkillAdapter {
  async read(filepath: string): Promise<SkillFileContent> {
    const raw = existsSync(filepath) ? await readFile(filepath, 'utf8') : '';
    return {
      raw,
      sections: parseMarkdownSections(raw),
      learnedRulesSection: this.findLearnedRulesSection(raw),
    };
  }

  async write(filepath: string, pattern: PatternRecord, existingContent: string): Promise<string> {
    const modified = insertRule(existingContent, pattern);
    await writeFile(filepath, modified, 'utf8');
    return modified;
  }

  findLockedSections(content: string): Array<{ start: number; end: number }> {
    const locked: Array<{ start: number; end: number }> = [];
    const lines = content.split('\n');

    let inLocked = false;
    let start = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      if (line.includes('<!-- LOCKED -->') || line.includes('## DO NOT EDIT')) {
        inLocked = true;
        start = i;
      }
      if (inLocked && line.includes('<!-- /LOCKED -->')) {
        locked.push({ start, end: i });
        inLocked = false;
      }
    }

    return locked;
  }

  findLearnedRulesSection(content: string): number | null {
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/^##\s+Learned Rules/i.test(lines[i] ?? '')) {
        return i;
      }
    }
    return null;
  }
}

// ─── Format-specific adapters ─────────────────────────────────────────────────

class CopilotSkillAdapter extends MarkdownSkillAdapter {
  // SKILL.md with YAML frontmatter - same logic as base markdown
}

class ClaudeAdapter extends MarkdownSkillAdapter {
  // CLAUDE.md - plain markdown
}

class CursorAdapter extends MarkdownSkillAdapter {
  // .cursor/rules/*.mdc - markdown with metadata header
}

class WindsurfAdapter implements SkillAdapter {
  async read(filepath: string): Promise<SkillFileContent> {
    const raw = existsSync(filepath) ? await readFile(filepath, 'utf8') : '';
    return {
      raw,
      sections: [{ title: 'rules', content: raw, locked: false }],
      learnedRulesSection: null,
    };
  }

  async write(filepath: string, pattern: PatternRecord, existingContent: string): Promise<string> {
    const ruleBlock = formatRuleForWindsurf(pattern);
    const modified = existingContent + '\n' + ruleBlock;
    await writeFile(filepath, modified, 'utf8');
    return modified;
  }

  findLockedSections(_content: string): Array<{ start: number; end: number }> {
    return [];
  }

  findLearnedRulesSection(_content: string): null {
    return null;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function getSkillAdapter(format: string): SkillAdapter {
  switch (format) {
    case 'copilot':
      return new CopilotSkillAdapter();
    case 'claude':
    case 'gemini':
    case 'codex':
      return new ClaudeAdapter();
    case 'cursor':
      return new CursorAdapter();
    case 'windsurf':
      return new WindsurfAdapter();
    case 'universal':
    default:
      return new MarkdownSkillAdapter();
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseMarkdownSections(content: string): Array<{ title: string; content: string; locked: boolean }> {
  const sections: Array<{ title: string; content: string; locked: boolean }> = [];
  const lines = content.split('\n');
  let current: { title: string; lines: string[]; locked: boolean } = {
    title: 'preamble',
    lines: [],
    locked: false,
  };

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      sections.push({ title: current.title, content: current.lines.join('\n'), locked: current.locked });
      current = {
        title: line.replace(/^##\s+/, '').trim(),
        lines: [line],
        locked: line.includes('DO NOT EDIT'),
      };
    } else {
      current.lines.push(line);
      if (line.includes('<!-- LOCKED -->')) current.locked = true;
    }
  }

  sections.push({ title: current.title, content: current.lines.join('\n'), locked: current.locked });
  return sections;
}

function insertRule(content: string, pattern: PatternRecord): string {
  const date = new Date().toISOString().split('T')[0];
  const evidenceComment = buildEvidenceComment(pattern, date);
  const ruleText = buildRuleText(pattern);

  // Idempotency: if the exact rule body is already present, leave the file
  // unchanged so re-running `propose` does not append duplicate rules.
  if (content.includes(ruleText.trim())) {
    return content.endsWith('\n') ? content : content + '\n';
  }

  const ruleBlock = `${evidenceComment}\n${ruleText}`;
  const lines = content.split('\n');
  const headingIdx = lines.findIndex((l) => /^##\s+Learned Rules/i.test(l));

  if (headingIdx === -1) {
    // No "Learned Rules" section yet — create one at the end of the file.
    return content.trimEnd() + '\n\n## Learned Rules\n\n' + ruleBlock + '\n';
  }

  // Find the end of the existing section: the next "## " heading, or EOF.
  let sectionEnd = lines.length;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i] ?? '')) {
      sectionEnd = i;
      break;
    }
  }

  // Trim trailing blank lines inside the section so the insert is tidy, then
  // splice the new rule in — preserving any content that follows the section.
  let insertAt = sectionEnd;
  while (insertAt > headingIdx + 1 && (lines[insertAt - 1] ?? '').trim() === '') {
    insertAt--;
  }

  const before = lines.slice(0, insertAt);
  const after = lines.slice(insertAt);
  const merged = [...before, '', ...ruleBlock.split('\n'), '', ...after].join('\n');
  return merged.endsWith('\n') ? merged : merged + '\n';
}

function buildEvidenceComment(pattern: PatternRecord, date: string): string {
  const weeks = Math.max(
    1,
    Math.round(
      (new Date(pattern.last_seen).getTime() - new Date(pattern.first_seen).getTime()) /
        (7 * 86400000)
    )
  );

  const frictionNote =
    pattern.avg_friction_score !== null
      ? ` Avg friction: ${pattern.avg_friction_score.toFixed(1)} turns.`
      : '';

  return `<!-- Added by DriftLens on ${date}. ${pattern.occurrences} corrections across ${weeks} week(s). Confidence: ${pattern.confidence.toFixed(2)}.${frictionNote} -->`;
}

function buildRuleText(pattern: PatternRecord): string {
  if (pattern.constraint_block) {
    return `### ${titleCase(pattern.name)}\n${pattern.constraint_block}`;
  }

  let rule = `- ${pattern.proposed_rule}`;
  if (pattern.example_before || pattern.example_after) {
    rule += '\n';
    if (pattern.example_before) rule += `  ❌ \`${pattern.example_before}\`\n`;
    if (pattern.example_after) rule += `  ✅ \`${pattern.example_after}\`\n`;
  }
  return rule;
}

function formatRuleForWindsurf(pattern: PatternRecord): string {
  return `# ${pattern.name}\n${pattern.proposed_rule}`;
}

function titleCase(str: string): string {
  return str
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
