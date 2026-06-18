// DriftLens - MCP Prevention Server
// Real-time constraint injection via Model Context Protocol
// This MCP server serves file-specific constraints to any MCP-compatible agent,
// preventing predicted failures BEFORE the AI generates code.

import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '../shared/logger.js';
import { predictFailures } from '../intelligence/failure-predictor.js';
import { computeAgentQuality } from '../intelligence/agent-quality.js';
import { buildConstraintInjection, logPrevention } from './constraints.js';
import type { FailurePrediction, AgentRecommendation } from '../shared/schema.js';

interface MCPServerOptions {
  cwd: string;
  port: number;
}

/**
 * MCP Server Tool Definitions for DriftLens Prevention Layer.
 *
 * Exposes three MCP tools:
 * 1. get_constraints(file) - Returns file-specific constraints to inject into context
 * 2. get_recommendation(file) - Recommends best agent for a given file
 * 3. report_generation(file, agent, corrected) - Reports generation outcomes for learning
 *
 * Compatible with: Claude Code MCP, Cursor MCP, Copilot MCP, any MCP host.
 */
export function getMCPToolDefinitions() {
  return [
    {
      name: 'driftlens_get_constraints',
      description:
        'Get file-specific coding constraints based on historical correction patterns. ' +
        'Call this BEFORE generating code for a file to avoid known mistakes. ' +
        'Returns constraints that should be followed when writing code for the specified file.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file: {
            type: 'string',
            description: 'Relative path to the file being edited',
          },
          agent: {
            type: 'string',
            description: 'Name of the calling agent (copilot, claude, cursor, etc.)',
          },
        },
        required: ['file'],
      },
    },
    {
      name: 'driftlens_get_recommendation',
      description:
        'Get agent recommendation for a file based on historical accuracy data. ' +
        'Returns which AI agent performs best for this type of code.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file: {
            type: 'string',
            description: 'Relative path to the file being edited',
          },
        },
        required: ['file'],
      },
    },
    {
      name: 'driftlens_report_outcome',
      description:
        'Report the outcome of a code generation for DriftLens learning. ' +
        'Call this after a generation is accepted or corrected.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          file: {
            type: 'string',
            description: 'File that was generated for',
          },
          agent: {
            type: 'string',
            description: 'Agent that generated the code',
          },
          corrected: {
            type: 'boolean',
            description: 'Whether the generation required correction',
          },
          correction_description: {
            type: 'string',
            description: 'Brief description of what was corrected (if applicable)',
          },
        },
        required: ['file', 'agent', 'corrected'],
      },
    },
  ];
}

/**
 * Handle MCP tool calls.
 */
export async function handleMCPToolCall(
  toolName: string,
  args: Record<string, unknown>,
  cwd: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  switch (toolName) {
    case 'driftlens_get_constraints':
      return handleGetConstraints(args.file as string, args.agent as string | undefined, cwd);
    case 'driftlens_get_recommendation':
      return handleGetRecommendation(args.file as string, cwd);
    case 'driftlens_report_outcome':
      return handleReportOutcome(args as Record<string, unknown>, cwd);
    default:
      return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }] };
  }
}

async function handleGetConstraints(
  file: string,
  agent: string | undefined,
  cwd: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const prediction = await predictFailures({ cwd, targetFile: file, agent });

  // NF-1: build a ranked, token-bounded constraint payload and log it so we can
  // later measure whether injection actually prevented corrections.
  const injection = buildConstraintInjection(prediction);
  await logPrevention(cwd, injection).catch(() => undefined);

  return {
    content: [{ type: 'text', text: injection.rendered }],
  };
}

async function handleGetRecommendation(
  file: string,
  cwd: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const matrix = await computeAgentQuality({ cwd });

  const category = inferFileCategory(file);
  const categoryRecs = matrix.recommendations.filter(
    (r) => r.context_category === category
  );

  if (categoryRecs.length === 0) {
    return {
      content: [{
        type: 'text',
        text: `No recommendation data yet for ${category} files. Use any agent.`,
      }],
    };
  }

  const best = categoryRecs[0];
  if (!best) {
    return {
      content: [{
        type: 'text',
        text: `No agent recommendations available for ${file} in category ${category}.`,
      }],
    };
  }

  return {
    content: [{
      type: 'text',
      text: [
        `Agent Recommendation for ${file} (${category}):`,
        `→ Best: ${best.recommended_agent} (${Math.round(best.accuracy * 100)}% accuracy)`,
        `→ Runner-up: ${best.runner_up_agent} (${Math.round(best.runner_up_accuracy * 100)}% accuracy)`,
        best.potential_time_saved_per_task_ms > 0
          ? `→ Potential time saved: ${Math.round(best.potential_time_saved_per_task_ms / 1000)}s per task`
          : '',
      ].filter(Boolean).join('\n'),
    }],
  };
}

async function handleReportOutcome(
  args: Record<string, unknown>,
  cwd: string
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Record the outcome for future learning
  // This feeds back into the prediction model
  const outcome = {
    file: args.file as string,
    agent: args.agent as string,
    corrected: args.corrected as boolean,
    correction_description: args.correction_description as string | undefined,
    ts: new Date().toISOString(),
  };

  const outcomesPath = path.join(cwd, '.driftlens', 'prevention-outcomes.jsonl');
  const { appendFile } = await import('fs/promises');
  await appendFile(outcomesPath, JSON.stringify(outcome) + '\n', 'utf8');

  return {
    content: [{
      type: 'text',
      text: `Outcome recorded. ${args.corrected ? 'Correction noted - prediction model will update.' : 'Success noted - accuracy confirmed.'}`,
    }],
  };
}

function inferFileCategory(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.includes('test') || lower.includes('spec')) return 'testing';
  if (lower.includes('service')) return 'service-layer';
  if (lower.endsWith('.tsx') || lower.includes('component')) return 'react-component';
  if (lower.includes('controller') || lower.includes('handler')) return 'api-handler';
  if (lower.includes('model') || lower.includes('schema')) return 'data-layer';
  if (lower.includes('graphql') || lower.includes('resolver')) return 'graphql';
  return 'general';
}
