// DriftLens - LLM-based skill file proposal writer

import type { PatternRecord, LLMAdapter } from '../shared/schema.js';

const SKILL_EDIT_PROMPT = `You are writing a minimal edit to an AI agent's skill file. You must add a new learned rule based on evidence from real developer corrections.

Current skill file content:
---
{current_skill_file_content}
---

Pattern to add:
- Name: {pattern_name}
- Description: {pattern_description}
- Proposed rule: {proposed_rule}
- Evidence: {occurrences} corrections across {weeks} weeks. Confidence: {confidence}.
{constraint_block_section}

Instructions:
1. Find or create a "## Learned Rules" section at the end of the file.
2. Add the new rule under that section.
3. If this pattern includes a constraint_block, write the full block as a numbered sub-section.
4. Include an HTML comment with the evidence metadata.
5. NEVER modify any content above the "## Learned Rules" section.
6. NEVER modify sections marked with <!-- LOCKED --> or "## DO NOT EDIT".
7. Include before/after code examples using ❌ and ✅ emoji.
8. Output the COMPLETE modified file content.`;

export async function writeSkillProposal(
  pattern: PatternRecord,
  existingContent: string,
  llm: LLMAdapter
): Promise<string> {
  const weeks = Math.max(
    1,
    Math.round(
      (new Date(pattern.last_seen).getTime() - new Date(pattern.first_seen).getTime()) /
        (7 * 86400000)
    )
  );

  const constraintSection = pattern.constraint_block
    ? `- Constraint block:\n${pattern.constraint_block}`
    : '';

  const prompt = SKILL_EDIT_PROMPT.replace('{current_skill_file_content}', existingContent || '(empty file)')
    .replace('{pattern_name}', pattern.name)
    .replace('{pattern_description}', pattern.description)
    .replace('{proposed_rule}', pattern.proposed_rule)
    .replace('{occurrences}', String(pattern.occurrences))
    .replace('{weeks}', String(weeks))
    .replace('{confidence}', pattern.confidence.toFixed(2))
    .replace('{constraint_block_section}', constraintSection);

  return llm.complete(prompt, { temperature: 0.1, maxTokens: 2048 });
}
