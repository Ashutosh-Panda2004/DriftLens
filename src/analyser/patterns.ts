// DriftLens - LLM-based pattern analysis

import { v4 as uuidv4 } from 'uuid';
import type { LLMAdapter, PatternRecord } from '../shared/schema.js';
import type { Cluster } from './clustering.js';
import { aggregateReasons } from './reason-classifier.js';

const PATTERN_ANALYSIS_PROMPT = `You are analyzing a cluster of code corrections that developers made to AI-generated code.
Each correction represents a time when an AI agent wrote code that a developer had to fix.

Here are the corrections in this cluster:
{corrections_json}

Based on these corrections, identify the single recurring pattern and output a JSON object:
{
  "name": "kebab-case-pattern-name",
  "description": "One sentence describing what the AI keeps getting wrong.",
  "proposed_rule": "A specific, actionable rule that should be added to the AI agent's skill file to prevent this mistake. Be precise - reference specific files, directories, naming conventions, or architectural patterns from the corrections.",
  "example_before": "The most representative example of what the AI wrote (wrong)",
  "example_after": "What the developer changed it to (correct)",
  "confidence": 0.0,
  "target_skills": ["developer"]
}

Output ONLY the JSON object. No explanation.`;

const STRUGGLE_ANALYSIS_PROMPT = `You are analyzing a multi-turn conversation where a developer had to repeatedly correct an AI coding agent. The AI failed to produce correct code on the first attempt, and the developer had to guide it through multiple corrections until the code was right.

Here is the full struggle chain:
{struggle_chain_json}

The developer had to send {turn_count} correction messages over {duration_seconds} seconds.

Analyze this conversation and output a JSON object:
{
  "name": "kebab-case-pattern-name",
  "description": "One sentence describing the architectural concept the AI fundamentally misunderstood.",
  "constraint_block": "A multi-line, numbered list of ALL constraints the AI needs to follow. Extract EVERY rule from the developer's messages. Do not omit any. Format as a markdown numbered list.",
  "proposed_rule": "The single most important rule from the constraint block.",
  "root_cause": "What fundamental knowledge gap caused the AI to fail repeatedly?",
  "confidence": 0.0,
  "estimated_turns_saved": 0
}

Output ONLY the JSON object. No explanation.`;

export async function analyseWithLLM(
  clusters: Cluster[],
  llm: LLMAdapter
): Promise<PatternRecord[]> {
  const patterns: PatternRecord[] = [];
  const now = new Date().toISOString();

  for (const cluster of clusters) {
    const hasStruggle = cluster.corrections.some((c) => c.correction_type === 'struggle_chain');

    try {
      let raw: string;

      if (hasStruggle) {
        const chains = cluster.corrections
          .filter((c) => c.correction_type === 'struggle_chain' && c.struggle_chain)
          .map((c) => c.struggle_chain);

        const avgTurns =
          chains.reduce((s, ch) => s + (ch?.turn_count ?? 0), 0) / Math.max(chains.length, 1);
        const avgDuration =
          chains.reduce((s, ch) => s + (ch?.duration_seconds ?? 0), 0) / Math.max(chains.length, 1);

        const prompt = STRUGGLE_ANALYSIS_PROMPT.replace(
          '{struggle_chain_json}',
          JSON.stringify(chains, null, 2)
        )
          .replace('{turn_count}', String(Math.round(avgTurns)))
          .replace('{duration_seconds}', String(Math.round(avgDuration)));

        raw = await llm.complete(prompt, { temperature: 0.2, maxTokens: 1024 });
      } else {
        const corrSummary = cluster.corrections.slice(0, 10).map((c) => ({
          type: c.correction_type,
          file: c.file,
          language: c.language,
          ai_wrote: c.ai_wrote?.slice(0, 200),
          human_committed: c.human_committed?.slice(0, 200),
          developer_instruction: c.developer_instruction?.slice(0, 200),
        }));

        const prompt = PATTERN_ANALYSIS_PROMPT.replace(
          '{corrections_json}',
          JSON.stringify(corrSummary, null, 2)
        );

        raw = await llm.complete(prompt, { temperature: 0.2, maxTokens: 512 });
      }

      const parsed = extractJSON(raw);
      if (!parsed) continue;

      const timestamps = cluster.corrections.map((c) => c.ts).sort();
      const struggleCorrections = cluster.corrections.filter(
        (c) => c.correction_type === 'struggle_chain' && c.struggle_chain
      );
      const avgFriction =
        struggleCorrections.length > 0
          ? struggleCorrections.reduce((s, c) => s + (c.struggle_chain?.friction_score ?? 0), 0) /
            struggleCorrections.length
          : null;

      const { dominant, breakdown } = aggregateReasons(cluster.corrections);

      patterns.push({
        pattern_id: uuidv4(),
        name: (parsed['name'] as string) ?? 'unnamed-pattern',
        description: (parsed['description'] as string) ?? '',
        occurrences: cluster.corrections.length,
        confidence: (parsed['confidence'] as number) ?? 0.7,
        proposed_rule: (parsed['proposed_rule'] as string) ?? '',
        example_before: (parsed['example_before'] as string) ?? '',
        example_after: (parsed['example_after'] as string) ?? '',
        target_skills: (parsed['target_skills'] as string[]) ?? ['developer'],
        target_formats: ['copilot', 'claude', 'cursor'],
        source_correction_ids: cluster.corrections.map((c) => c.id),
        first_seen: timestamps[0] ?? now,
        last_seen: timestamps[timestamps.length - 1] ?? now,
        status: 'pending',
        pr_url: null,
        drift_score_impact: cluster.corrections.length / 100,
        avg_friction_score: avgFriction,
        total_prompt_turns_saved: parsed['estimated_turns_saved'] as number | null ?? null,
        constraint_block: parsed['constraint_block'] as string | null ?? null,
        dominant_reason: dominant,
        reason_breakdown: breakdown,
      });
    } catch (err) {
      console.error(`Failed to analyse cluster: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return patterns;
}

function extractJSON(text: string): Record<string, unknown> | null {
  // Try direct parse
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    // Try to find JSON block
    const match = /\{[\s\S]*\}/.exec(trimmed);
    if (match) {
      try {
        return JSON.parse(match[0]) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}
