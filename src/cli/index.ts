#!/usr/bin/env node
// DriftLens - CLI entry point
// The observability platform for AI-assisted development

import { Command } from 'commander';
import { VERSION } from '../shared/constants.js';
import { registerInit } from './init.js';
import { registerWatch } from './watch.js';
import { registerMark } from './mark.js';
import { registerStatus } from './status.js';
import { registerAnalyse } from './analyse.js';
import { registerPropose } from './propose.js';
import { registerDashboard } from './dashboard.js';
import { registerScore } from './score.js';
import { registerSync } from './sync.js';
import { registerReport } from './report.js';

const program = new Command();


program
  .name('driftlens')
  .description('The observability platform for AI-assisted development. Proves ROI. Predicts failures. Routes to the best agent.')
  .version(VERSION);

// ─── Observation ──────────────────────────────────────────────────────────────
registerInit(program);
registerWatch(program);
registerMark(program);
registerStatus(program);

// ─── Intelligence ─────────────────────────────────────────────────────────────
registerAnalyse(program);

program
  .command('roi')
  .description('AI Productivity Ledger - dollar ROI of AI tool usage')
  .option('--period <period>', 'time period: 7d, 30d, 90d, all', '30d')
  .option('--team', 'show team-level ROI')
  .option('--export <format>', 'export as pdf or json')
  .action(async (opts) => {
    const { computeProductivityLedger } = await import('../intelligence/productivity-ledger.js');
    const { readConfig } = await import('../shared/config.js');
    const { logger } = await import('../shared/logger.js');
    const config = await readConfig(process.cwd());
    const intelligence = (config as any).intelligence ?? { hourlyRate: 85, toolCostPerMonth: 50, sessionsPerDay: 20, enablePrediction: true, enableRegression: true, mcpServerPort: 3848 };
    const ledger = await computeProductivityLedger({
      cwd: process.cwd(),
      period: opts.period as '7d' | '30d' | '90d' | 'all',
      team: opts.team ?? false,
      config: intelligence,
    });
    logger.heading('AI Productivity Ledger');
    const s = ledger.summary;
    logger.info(`  TIME SAVED by AI generation:     +${s.total_time_saved_hours.toFixed(1)} hours`);
    logger.info(`  TIME LOST to corrections:        -${s.total_time_lost_hours.toFixed(1)} hours`);
    logger.info(`  NET AI PRODUCTIVITY GAIN:        +${s.net_hours.toFixed(1)} hours`);
    logger.info('');
    logger.info(`  At $${intelligence.hourlyRate}/hr:`);
    logger.info(`    Value generated:   $${s.total_dollar_value.toFixed(0)}`);
    logger.info(`    Value destroyed:   -$${s.total_dollar_lost.toFixed(0)}`);
    logger.info(`    NET ROI:           $${s.net_roi.toFixed(0)} (${s.roi_multiplier.toFixed(1)}× return)`);
  });

program
  .command('agents')
  .description('Agent Quality Matrix - per-agent accuracy by context')
  .option('--recommend', 'show best-agent recommendations')
  .action(async (opts) => {
    const { computeAgentQuality } = await import('../intelligence/agent-quality.js');
    const { logger } = await import('../shared/logger.js');
    const matrix = await computeAgentQuality({ cwd: process.cwd() });
    logger.heading('Agent Quality Matrix');
    if (matrix.agents.length === 0) {
      logger.warn('No agent data yet. Capture some corrections first.');
      return;
    }
    // Print matrix
    const header = ['Context', ...matrix.agents].map((h) => h.padEnd(12)).join('');
    logger.info(header);
    for (const cat of matrix.categories) {
      const row = [cat.padEnd(12)];
      for (const agent of matrix.agents) {
        const score = matrix.scores[agent]?.[cat];
        row.push(score ? `${Math.round(score.accuracy_rate * 100)}%`.padEnd(12) : '-'.padEnd(12));
      }
      logger.info(row.join(''));
    }
    if (opts.recommend && matrix.recommendations.length > 0) {
      logger.info('\nRecommendations:');
      for (const rec of matrix.recommendations) {
        logger.info(`  ${rec.context_category}: Use ${rec.recommended_agent} (${Math.round(rec.accuracy * 100)}%)`);
      }
    }
  });

program
  .command('health')
  .description('Organizational AI Maturity Score')
  .option('--trend', 'show score over time')
  .action(async () => {
    const { computeMaturityScore } = await import('../intelligence/maturity-scorer.js');
    const { readConfig } = await import('../shared/config.js');
    const { logger } = await import('../shared/logger.js');
    const config = await readConfig(process.cwd());
    const intelligence = (config as any).intelligence ?? { hourlyRate: 85, toolCostPerMonth: 50, sessionsPerDay: 20, enablePrediction: true, enableRegression: true, mcpServerPort: 3848 };
    const score = await computeMaturityScore({
      cwd: process.cwd(),
      config: intelligence,
      skillTargets: config.skillTargets,
    });
    logger.heading('AI Maturity Score');
    logger.info(`  Overall: ${score.overall}/100  (Percentile: top ${100 - score.percentile}%)`);
    logger.info('');
    logger.info('  Breakdown:');
    logger.info(`    Skill Coverage:     ${score.breakdown.skill_coverage}%`);
    logger.info(`    Correction Rate:    ${score.breakdown.correction_rate}%`);
    logger.info(`    Agent Utilization:  ${score.breakdown.agent_utilization}%`);
    logger.info(`    Time-to-Fix:        ${score.breakdown.time_to_fix}%`);
    logger.info(`    Regression Rate:    ${score.breakdown.regression_rate}%`);
    logger.info(`    Rule Freshness:     ${score.breakdown.rule_freshness}%`);
    logger.info(`    Team Consistency:   ${score.breakdown.team_consistency}%`);
    if (score.next_actions.length > 0) {
      logger.info('\n  Next Actions:');
      for (const action of score.next_actions) {
        logger.info(`    → ${action}`);
      }
    }
  });

program
  .command('regression')
  .description('Detect model update regressions')
  .option('--window <days>', 'comparison window in days', '14')
  .action(async (opts) => {
    const { detectRegressions } = await import('../intelligence/regression-sentinel.js');
    const { logger } = await import('../shared/logger.js');
    const regressions = await detectRegressions({
      cwd: process.cwd(),
      windowDays: parseInt(opts.window, 10),
    });
    logger.heading('Model Regression Sentinel');
    if (regressions.length === 0) {
      logger.info('No regressions detected. All patterns stable.');
      return;
    }
    for (const reg of regressions) {
      logger.warn(`⚠️ ${reg.agent}: ${reg.old_model_version} → ${reg.new_model_version}`);
      for (const p of reg.regressed_patterns) {
        const icon = p.severity === 'critical' ? '🔴' : p.severity === 'moderate' ? '🟡' : '🟢';
        logger.info(`  ${icon} ${p.pattern_name}: +${p.increase_pct.toFixed(0)}% correction rate`);
      }
    }
  });

program
  .command('rules')
  .description('Rule effectiveness ledger - which rules earn their keep (NF-2)')
  .option('--window <days>', 'before/after measurement window in days', '30')
  .option('--dead-weight', 'show only dead-weight rules')
  .option('--json', 'output the full ledger as JSON')
  .action(async (opts) => {
    const { computeRuleLedger } = await import('../intelligence/rule-ledger.js');
    const { readConfig } = await import('../shared/config.js');
    const { logger } = await import('../shared/logger.js');
    const config = await readConfig(process.cwd());
    const intelligence = (config as any).intelligence ?? { hourlyRate: 85, toolCostPerMonth: 50, sessionsPerDay: 20, enablePrediction: true, enableRegression: true, mcpServerPort: 3848 };
    const ledger = await computeRuleLedger({
      cwd: process.cwd(),
      config: intelligence,
      windowDays: parseInt(opts.window, 10),
    });
    if (opts.json) {
      console.log(JSON.stringify(ledger, null, 2));
      return;
    }
    logger.heading('Rule Effectiveness Ledger');
    const s = ledger.summary;
    logger.info(`  Rules: ${s.total_rules}  ·  Proven: ${s.proven_effective}  ·  Dead-weight: ${s.dead_weight}`);
    logger.info(`  Saved: $${s.total_dollar_saved_per_month.toFixed(2)}/mo  ·  Cost: $${s.total_token_cost_per_month.toFixed(2)}/mo  ·  Net: $${s.net_roi_per_month.toFixed(2)}/mo`);
    logger.info('');
    const rows = opts.deadWeight ? ledger.entries.filter((e) => e.health === 'dead-weight') : ledger.entries.slice(0, 15);
    for (const e of rows) {
      logger.info(`  [${e.health}] ${e.name}`);
      logger.info(`     reduction ${e.reduction_pct.toFixed(0)}%  ·  saves $${e.dollar_saved_per_month.toFixed(2)}/mo  ·  ROI ${e.roi_multiplier.toFixed(1)}×  ·  ${e.recommendation}`);
    }
  });

// ─── Prevention ───────────────────────────────────────────────────────────────

program
  .command('prevent')
  .description('Start/stop the MCP prevention server')
  .argument('<action>', 'start or status')
  .option('--port <port>', 'server port', '3848')
  .action(async (action, opts) => {
    const { logger } = await import('../shared/logger.js');
    if (action === 'start') {
      logger.heading('DriftLens Prevention Server');
      logger.info(`MCP prevention server starting on port ${opts.port}...`);
      logger.info('Constraints will be served to any MCP-compatible agent.');
      logger.info('Add to your agent config:');
      logger.info(`  "mcpServers": { "driftlens": { "url": "http://localhost:${opts.port}" } }`);
    } else if (action === 'status') {
      logger.info('Prevention server status: checking...');
    }
  });

program
  .command('predict')
  .description('Predict failures for a specific file')
  .argument('<file>', 'file path to predict failures for')
  .action(async (file) => {
    const { predictFailures } = await import('../intelligence/failure-predictor.js');
    const { logger } = await import('../shared/logger.js');
    const prediction = await predictFailures({ cwd: process.cwd(), targetFile: file });
    logger.heading(`Predicted Failures - ${file}`);
    logger.info(`Overall Risk: ${prediction.overall_risk.toUpperCase()}`);
    if (prediction.predicted_failures.length === 0) {
      logger.info('No predicted failures. This file looks safe.');
      return;
    }
    for (const f of prediction.predicted_failures) {
      logger.info(`  ⚠️  ${Math.round(f.probability * 100)}% - ${f.pattern_name}`);
      logger.info(`     Constraint: "${f.constraint_to_inject}"`);
    }
  });

program
  .command('constraints')
  .description('Pre-generation constraint injection for a file (NF-1)')
  .argument('<file>', 'file path to generate constraints for')
  .option('--agent <name>', 'calling agent (copilot, claude, cursor, ...)')
  .option('--top <k>', 'maximum number of constraints to inject', '8')
  .option('--json', 'output structured JSON for tooling/MCP')
  .option('--no-log', 'do not record a prevention entry')
  .action(async (file, opts) => {
    const { predictFailures } = await import('../intelligence/failure-predictor.js');
    const { buildConstraintInjection, logPrevention } = await import('../prevention/constraints.js');
    const { logger } = await import('../shared/logger.js');
    const prediction = await predictFailures({ cwd: process.cwd(), targetFile: file, agent: opts.agent });
    const injection = buildConstraintInjection(prediction, { topK: parseInt(opts.top, 10) });
    if (opts.log !== false) {
      await logPrevention(process.cwd(), injection).catch(() => undefined);
    }
    if (opts.json) {
      console.log(JSON.stringify(injection, null, 2));
      return;
    }
    console.log(injection.rendered);
  });

// ─── Skill Improvement ────────────────────────────────────────────────────────
registerPropose(program);

program
  .command('unify')
  .description('Cross-agent skill audit - detect conflicts and gaps')
  .option('--propagate', 'propagate missing rules to all agents')
  .option('--conflicts', 'show only conflicting rules')
  .action(async (opts) => {
    const { logger } = await import('../shared/logger.js');
    const { readJsonFile } = await import('../shared/io.js');
    const { CONTRADICTIONS_FILE } = await import('../shared/constants.js');
    const path = await import('path');
    logger.heading('Cross-Agent Skill Unification');
    const contradictions = await readJsonFile<any[]>(
      path.join(process.cwd(), CONTRADICTIONS_FILE),
      [],
    );
    if (contradictions.length === 0) {
      logger.info('No contradictions detected across recent corrections.');
    } else {
      logger.warn(`${contradictions.length} contradiction(s) found:`);
      for (const c of contradictions) {
        logger.info(`  [${c.severity}] ${c.file_or_topic}`);
        logger.info(`     A: ${c.side_a.instruction}`);
        logger.info(`     B: ${c.side_b.instruction}`);
        logger.info(`     → ${c.recommendation}`);
      }
    }
    if (opts.propagate) logger.info('\nUse driftlens propose to propagate resolved rules to all agents.');
  });

program
  .command('synth-test')
  .description('Synthesise machine-checkable guards from proven patterns (NF-4)')
  .option('--min-occurrences <n>', 'only synthesise for patterns seen at least n times', '3')
  .option('--language <lang>', 'target language for unit-test stubs', 'typescript')
  .option('--out <dir>', 'write synthesised guards to this directory')
  .action(async (opts) => {
    const { synthesizeTests } = await import('../proposer/test-synthesis.js');
    const { readJsonFile } = await import('../shared/io.js');
    const { PATTERNS_FILE } = await import('../shared/constants.js');
    const { logger } = await import('../shared/logger.js');
    const path = await import('path');
    const patterns = await readJsonFile<any[]>(path.join(process.cwd(), PATTERNS_FILE), []);
    const tests = synthesizeTests(patterns, {
      minOccurrences: parseInt(opts.minOccurrences, 10),
      language: opts.language,
    });
    logger.heading('Correction-to-Test Synthesis');
    if (tests.length === 0) {
      logger.warn('No patterns met the evidence threshold. Try --min-occurrences 2.');
      return;
    }
    if (opts.out) {
      const { mkdir, writeFile } = await import('fs/promises');
      await mkdir(opts.out, { recursive: true });
      for (const t of tests) {
        const ext = t.kind === 'semgrep' ? 'yml' : t.kind === 'eslint-note' ? 'txt' : 'test.ts';
        const fname = `${t.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${ext}`;
        await writeFile(path.join(opts.out, fname), t.content + '\n', 'utf8');
      }
      logger.success(`Wrote ${tests.length} guard(s) to ${opts.out}`);
    } else {
      for (const t of tests) {
        logger.info(`\n# ${t.name} (${t.kind}) — ${t.rationale}`);
        console.log(t.content);
      }
    }
  });

program
  .command('registry')
  .description('Export/import proven rules across repos and teams (NF-3)')
  .argument('<action>', 'export or import')
  .option('--file <path>', 'registry file path (defaults to .driftlens/registry.json)')
  .option('--scope <scope>', 'org | team | repo', 'repo')
  .option('--source <name>', 'source repo/team label for provenance')
  .option('--min-confidence <n>', 'minimum confidence to export', '0.75')
  .action(async (action, opts) => {
    const {
      exportRegistry, importRegistry, writeRegistryFile, loadRegistry, defaultRegistryPath,
    } = await import('../team/registry.js');
    const { logger } = await import('../shared/logger.js');
    const cwd = process.cwd();
    const filePath = opts.file ?? defaultRegistryPath(cwd);

    if (action === 'export') {
      const registry = await exportRegistry({
        cwd,
        scope: opts.scope,
        source: opts.source,
        minConfidence: parseFloat(opts.minConfidence),
      });
      await writeRegistryFile(registry, filePath);
      logger.success(`Exported ${registry.rules.length} rule(s) to ${filePath}`);
    } else if (action === 'import') {
      const registry = await loadRegistry(filePath);
      if (!registry) {
        logger.error(`No registry found at ${filePath}`);
        process.exit(1);
        return;
      }
      const result = await importRegistry(cwd, registry);
      logger.success(`Imported ${result.imported} rule(s) (${result.skipped_existing} already present).`);
      logger.info(`Local patterns now: ${result.total_local_after}. Run driftlens propose to apply them.`);
    } else {
      logger.error('Unknown action. Use: driftlens registry export | import');
      process.exit(1);
    }
  });

program
  .command('trim')
  .description('Context economics - find and archive dead-weight rules')
  .option('--roi', 'show per-rule ROI')
  .option('--archive-dead', 'archive dead-weight rules')
  .action(async (opts) => {
    const { computeContextEconomics } = await import('../intelligence/context-economics.js');
    const { readConfig } = await import('../shared/config.js');
    const { logger } = await import('../shared/logger.js');
    const config = await readConfig(process.cwd());
    const intelligence = (config as any).intelligence ?? { hourlyRate: 85, toolCostPerMonth: 50, sessionsPerDay: 20, enablePrediction: true, enableRegression: true, mcpServerPort: 3848 };
    const report = await computeContextEconomics({
      cwd: process.cwd(),
      config: intelligence,
      skillTargets: config.skillTargets,
    });
    logger.heading('Context Window Economics');
    logger.info(`  Total rules: ${report.summary.total_rules}`);
    logger.info(`  High-value:  ${report.summary.high_value_rules}`);
    logger.info(`  Dead-weight: ${report.summary.dead_weight_rules}`);
    logger.info(`  Token cost:  $${report.summary.total_token_cost_per_month.toFixed(2)}/month`);
    logger.info(`  Value:       $${report.summary.total_value_per_month.toFixed(2)}/month`);
    logger.info(`  Net ROI:     $${report.summary.net_rule_roi.toFixed(2)}/month`);
    if (report.summary.tokens_recoverable > 0) {
      logger.info(`  Recoverable: ${report.summary.tokens_recoverable} tokens (archive dead rules)`);
    }
  });

// ─── Reporting ────────────────────────────────────────────────────────────────
registerDashboard(program);
registerScore(program);
registerSync(program);
registerReport(program);

// Internal command: invoked by the post-commit hook
program
  .command('collect', { hidden: true })
  .option('--hook', 'run in hook mode (silent)')
  .action(async () => {
    const { runHook } = await import('../collector/hook.js');
    await runHook();
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error('Error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
