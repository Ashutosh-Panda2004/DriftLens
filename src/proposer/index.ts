// DriftLens - Proposer orchestrator

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { logger } from '../shared/logger.js';
import { PATTERNS_FILE } from '../shared/constants.js';
import type { PatternRecord } from '../shared/schema.js';
import { readConfig } from '../shared/config.js';
import { readJsonFile } from '../shared/io.js';
import { getSkillAdapter } from '../adapters/skill-formats.js';
import { createProposalLLMAdapter } from '../adapters/llm-providers.js';
import { writeSkillProposal } from './writer.js';
import { openGithubPR } from './github-pr.js';
import { resolveStrategy, selectByStrategy, detectConflict } from './strategy.js';
import { filterRejected, recordDecision } from './provenance.js';

interface ProposalOptions {
  cwd: string;
  dryRun: boolean;
  minConfidence?: number;
  targetFormat?: string;
  allFormats: boolean;
  strategy?: string;
}

export async function runProposal(opts: ProposalOptions): Promise<void> {
  logger.heading('DriftLens Propose');

  const patternsPath = path.join(opts.cwd, PATTERNS_FILE);
  if (!existsSync(patternsPath)) {
    logger.warn('No patterns found. Run driftlens analyse first.');
    return;
  }

  const patterns = await readJsonFile<PatternRecord[]>(patternsPath, []);

  // E-P3: a strategy preset sets coherent confidence/occurrence/impact bars.
  // An explicit --confidence still wins as an override when provided.
  const thresholds = resolveStrategy(opts.strategy);
  const minConfidence = opts.minConfidence ?? thresholds.minConfidence;
  const effectiveThresholds = { ...thresholds, minConfidence };

  const pendingAll = patterns.filter((p) => p.status === 'pending');
  const byStrategy = selectByStrategy(pendingAll, effectiveThresholds);

  // E-P1: never re-propose a rule a human already rejected.
  const { allowed: pending, skipped: rejectedSkips } = await filterRejected(opts.cwd, byStrategy);
  if (rejectedSkips.length > 0) {
    logger.info(`Skipped ${rejectedSkips.length} previously-rejected rule(s).`);
  }

  if (pending.length === 0) {
    logger.warn(`No pending patterns meet the ${opts.strategy ?? 'balanced'} strategy thresholds`);
    logger.info('Try: driftlens propose --strategy aggressive');
    return;
  }

  logger.info(`Processing ${pending.length} pattern(s) for proposal...`);

  const config = await readConfig(opts.cwd);
  const llm = createProposalLLMAdapter(config);

  let targets = config.skillTargets;
  if (opts.targetFormat) {
    targets = targets.filter((t) => t.format === opts.targetFormat);
  }

  const updated: PatternRecord[] = [...patterns];
  const perFileCount = new Map<string, number>();

  for (const pattern of pending) {
    logger.info(`\nPattern: ${pattern.name} (confidence: ${(pattern.confidence * 100).toFixed(0)}%)`);

    for (const target of targets) {
      const targetPath = path.join(opts.cwd, target.path);
      const adapter = getSkillAdapter(target.format);

      const existing = existsSync(targetPath)
        ? await readFile(targetPath, 'utf8')
        : '';

      // E-P2: conflict-aware writing. Skip duplicates; warn on contradictions.
      const conflict = detectConflict(pattern.proposed_rule, existing);
      if (conflict.kind === 'duplicate') {
        logger.info(`  ↳ ${target.path}: equivalent rule already present, skipping.`);
        continue;
      }
      if (conflict.kind === 'contradiction') {
        logger.warn(
          `  ↳ ${target.path}: proposed rule contradicts existing "${conflict.existingLine}". Needs human review; skipping.`,
        );
        continue;
      }

      // E-P3: respect the per-file cap from the active strategy.
      const count = perFileCount.get(target.path) ?? 0;
      if (count >= effectiveThresholds.maxPerFile) {
        logger.info(`  ↳ ${target.path}: reached ${effectiveThresholds.maxPerFile}-rule cap for this run.`);
        continue;
      }

      const proposed = await writeSkillProposal(pattern, existing, llm);

      if (opts.dryRun) {
        logger.info(`\n--- DRY RUN: Would write to ${target.path} ---`);
        console.log(proposed);
        logger.info('--- END DRY RUN ---\n');
        continue;
      }

      // Write the skill file edit
      await adapter.write(targetPath, pattern, existing);
      perFileCount.set(target.path, (perFileCount.get(target.path) ?? 0) + 1);
      logger.success(`Updated ${target.path}`);

      // E-F2: record provenance so this rule is never blindly re-proposed.
      await recordDecision(opts.cwd, pattern, 'proposed', `strategy:${opts.strategy ?? 'balanced'}`);

      // Open GitHub PR
      if (config.git.platform === 'github' && config.git.token !== 'env:GITHUB_TOKEN') {
        try {
          const prUrl = await openGithubPR(pattern, target, config, opts.cwd);
          const idx = updated.findIndex((p) => p.pattern_id === pattern.pattern_id);
          if (idx !== -1) {
            updated[idx] = { ...updated[idx]!, status: 'proposed', pr_url: prUrl };
          }
          logger.success(`Opened draft PR: ${prUrl}`);
        } catch (err) {
          logger.warn(`PR creation failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        const idx = updated.findIndex((p) => p.pattern_id === pattern.pattern_id);
        if (idx !== -1) {
          updated[idx] = { ...updated[idx]!, status: 'proposed' };
        }
      }
    }
  }

  if (!opts.dryRun) {
    await writeFile(patternsPath, JSON.stringify(updated, null, 2) + '\n', 'utf8');
  }
}
