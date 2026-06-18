// NF-3: Organizational rule registry
//
// Lets a high-performing repo *export* its proven rules and other repos/teams
// *import* them, so hard-won knowledge propagates across an organisation instead
// of every project re-learning the same lessons. The registry is a portable
// JSON document containing only rule text + provenance metadata - never source
// code - so it is safe to share across team boundaries.

import { randomUUID } from 'crypto';
import path from 'path';
import { writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { readJsonFile } from '../shared/io.js';
import { PATTERNS_FILE, REGISTRY_FILE } from '../shared/constants.js';
import type {
  PatternRecord,
  RuleRegistry,
  RegistryRule,
} from '../shared/schema.js';

const REGISTRY_VERSION = '1';

export interface ExportOptions {
  cwd: string;
  scope?: RuleRegistry['scope'];
  source?: string;
  minConfidence?: number;
  // Only export rules that have reached at least this status.
  includeStatuses?: PatternRecord['status'][];
}

/**
 * Export proven local patterns to a portable rule registry document.
 */
export async function exportRegistry(opts: ExportOptions): Promise<RuleRegistry> {
  const minConfidence = opts.minConfidence ?? 0.75;
  const statuses = opts.includeStatuses ?? ['merged', 'proposed'];
  const patterns = await readJsonFile<PatternRecord[]>(
    path.join(opts.cwd, PATTERNS_FILE),
    [],
  );

  const rules: RegistryRule[] = patterns
    .filter((p) => p.confidence >= minConfidence && statuses.includes(p.status))
    .map((p) => ({
      rule_id: p.pattern_id,
      name: p.name,
      rule_text: p.proposed_rule || p.description,
      reason: p.dominant_reason ?? null,
      confidence: p.confidence,
      occurrences: p.occurrences,
      scope: opts.scope ?? 'repo',
      version: REGISTRY_VERSION,
      provenance: {
        source_repo: opts.source ?? null,
        first_seen: p.first_seen,
        last_seen: p.last_seen,
        evidence_correction_count: p.source_correction_ids.length,
      },
    }));

  return {
    registry_version: REGISTRY_VERSION,
    exported_at: new Date().toISOString(),
    source: opts.source ?? 'local',
    scope: opts.scope ?? 'repo',
    rules,
  };
}

export async function writeRegistryFile(
  registry: RuleRegistry,
  filePath: string,
): Promise<void> {
  await writeFile(filePath, JSON.stringify(registry, null, 2) + '\n', 'utf8');
}

export interface ImportResult {
  imported: number;
  skipped_existing: number;
  total_local_after: number;
}

function ruleSignature(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Import an external registry and merge its rules into the local patterns store
 * as inherited, pending patterns. Rules whose text already exists locally are
 * skipped so imports are idempotent.
 */
export async function importRegistry(
  cwd: string,
  registry: RuleRegistry,
): Promise<ImportResult> {
  const patternsPath = path.join(cwd, PATTERNS_FILE);
  const local = await readJsonFile<PatternRecord[]>(patternsPath, []);

  const existingSignatures = new Set(
    local.map((p) => ruleSignature(p.proposed_rule || p.name)),
  );

  let imported = 0;
  let skipped = 0;
  const now = new Date().toISOString();

  for (const rule of registry.rules) {
    const sig = ruleSignature(rule.rule_text);
    if (existingSignatures.has(sig)) {
      skipped++;
      continue;
    }
    existingSignatures.add(sig);
    imported++;

    local.push({
      pattern_id: randomUUID(),
      name: rule.name,
      description: `Inherited from ${registry.source} (${rule.scope}): ${rule.name}`,
      occurrences: rule.occurrences,
      confidence: rule.confidence,
      proposed_rule: rule.rule_text,
      example_before: '',
      example_after: '',
      target_skills: ['developer'],
      target_formats: ['copilot', 'claude', 'cursor'],
      source_correction_ids: [],
      first_seen: rule.provenance.first_seen,
      last_seen: now,
      status: 'pending',
      pr_url: null,
      drift_score_impact: 0,
      avg_friction_score: null,
      total_prompt_turns_saved: null,
      constraint_block: null,
      dominant_reason: rule.reason ?? 'other',
    });
  }

  await writeFile(patternsPath, JSON.stringify(local, null, 2) + '\n', 'utf8');

  return {
    imported,
    skipped_existing: skipped,
    total_local_after: local.length,
  };
}

/**
 * Load a registry document from disk (defaults to the well-known registry path).
 */
export async function loadRegistry(filePath: string): Promise<RuleRegistry | null> {
  if (!existsSync(filePath)) return null;
  const fallback: RuleRegistry = {
    registry_version: REGISTRY_VERSION,
    exported_at: '',
    source: '',
    scope: 'repo',
    rules: [],
  };
  return readJsonFile<RuleRegistry>(filePath, fallback);
}

export function defaultRegistryPath(cwd: string): string {
  return path.join(cwd, REGISTRY_FILE);
}
