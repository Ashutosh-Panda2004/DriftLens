// driftlens init - initialise DriftLens in the current project

import type { Command } from 'commander';
import { mkdir, writeFile, readFile, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { defaultConfig, writeConfig } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import {
  DRIFTLENS_DIR,
  CORRECTIONS_FILE,
  SESSIONS_FILE,
  PATTERNS_FILE,
  FEEDBACK_FILE,
  MARKED_COMMITS_FILE,
  SKILL_FILE_PATTERNS,
} from '../shared/constants.js';
import type { SkillTarget } from '../shared/schema.js';

export function registerInit(program: Command): void {
  program
    .command('init')
    .description('Initialise DriftLens in the current project')
    .option('--skill-dir <path>', 'custom skill directory path')
    .option('--providers <list>', 'comma-separated: llm provider,embedding provider', 'anthropic,voyage')
    .action(async (opts: { skillDir?: string; providers: string }) => {
      await runInit(opts);
    });
}

async function runInit(opts: { skillDir?: string; providers: string }): Promise<void> {
  const cwd = process.cwd();

  logger.heading('DriftLens Init');

  // 1. Create .driftlens/ directory and empty data files
  const driftDir = path.join(cwd, DRIFTLENS_DIR);
  await mkdir(driftDir, { recursive: true });
  await mkdir(path.join(driftDir, 'rules'), { recursive: true });

  const emptyFiles = [CORRECTIONS_FILE, SESSIONS_FILE, MARKED_COMMITS_FILE];
  for (const f of emptyFiles) {
    const fp = path.join(cwd, f);
    if (!existsSync(fp)) await writeFile(fp, '', 'utf8');
  }
  if (!existsSync(path.join(cwd, PATTERNS_FILE))) {
    await writeFile(path.join(cwd, PATTERNS_FILE), '[]', 'utf8');
  }
  if (!existsSync(path.join(cwd, FEEDBACK_FILE))) {
    await writeFile(path.join(cwd, FEEDBACK_FILE), '[]', 'utf8');
  }

  logger.success('Created .driftlens/ directory and data files');

  // 2. Auto-detect AI tools
  const detected = await detectSkillTargets(cwd, opts.skillDir);

  if (detected.length > 0) {
    logger.info('Detected AI tools:');
    for (const t of detected) {
      logger.success(`  ${t.format} → ${t.path}`);
    }
  } else {
    logger.warn('No AI tool skill files detected. Add them manually in .driftlens/config.json');
  }

  // 3. Create config
  const [llmProvider, embProvider] = opts.providers.split(',');
  const config = defaultConfig();
  config.skillTargets = detected;
  if (llmProvider) {
    if (['anthropic', 'openai', 'gemini', 'ollama'].includes(llmProvider)) {
      config.llm.provider = llmProvider as typeof config.llm.provider;
    }
  }
  if (embProvider) {
    if (['voyage', 'openai', 'ollama'].includes(embProvider)) {
      config.embeddings.provider = embProvider as typeof config.embeddings.provider;
    }
  }
  await writeConfig(config, cwd);
  logger.success('Created .driftlens/config.json');

  // 4. Install post-commit hook
  await installHook(cwd);

  // 5. Update .gitignore
  await ensureGitignore(cwd);

  console.log('');
  logger.success('DriftLens initialised! Start capturing corrections with:');
  console.log('  driftlens watch start   - begin an AI-assisted session');
  console.log('  driftlens status        - see captured corrections');
}

async function detectSkillTargets(cwd: string, skillDir?: string): Promise<SkillTarget[]> {
  const targets: SkillTarget[] = [];

  if (skillDir) {
    targets.push({ format: 'universal', path: skillDir });
    return targets;
  }

  for (const [format, patterns] of Object.entries(SKILL_FILE_PATTERNS)) {
    for (const pattern of patterns) {
      if (existsSync(path.join(cwd, pattern))) {
        targets.push({
          format: format as SkillTarget['format'],
          path: pattern,
        });
        break;
      }
    }
  }

  return targets;
}

async function installHook(cwd: string): Promise<void> {
  const gitDir = path.join(cwd, '.git');
  if (!existsSync(gitDir)) {
    logger.warn('No .git directory found - skipping hook installation');
    return;
  }

  const hooksDir = path.join(gitDir, 'hooks');
  await mkdir(hooksDir, { recursive: true });

  const hookPath = path.join(hooksDir, 'post-commit');
  const hookContent = `#!/bin/sh
# DriftLens post-commit hook
# Captures corrections from AI-assisted commits

if ! command -v driftlens >/dev/null 2>&1; then
  exit 0
fi

driftlens collect --hook &
`;

  if (existsSync(hookPath)) {
    // Chain with existing hook
    const existing = await readFile(hookPath, 'utf8');
    if (!existing.includes('driftlens')) {
      await appendFile(hookPath, '\n' + hookContent, 'utf8');
      logger.success('Appended DriftLens to existing post-commit hook');
    } else {
      logger.info('DriftLens already present in post-commit hook');
    }
  } else {
    await writeFile(hookPath, hookContent, 'utf8');
    // Make executable on Unix
    try {
      const { chmodSync } = await import('fs');
      chmodSync(hookPath, 0o755);
    } catch {
      // Windows - chmod not needed
    }
    logger.success('Installed post-commit hook');
  }
}

async function ensureGitignore(cwd: string): Promise<void> {
  const gitignorePath = path.join(cwd, '.gitignore');
  const entry = '.driftlens/';

  if (existsSync(gitignorePath)) {
    const content = await readFile(gitignorePath, 'utf8');
    if (!content.includes(entry)) {
      await appendFile(gitignorePath, '\n' + entry + '\n', 'utf8');
      logger.success('Added .driftlens/ to .gitignore');
    }
  } else {
    await writeFile(gitignorePath, entry + '\n', 'utf8');
    logger.success('Created .gitignore with .driftlens/');
  }
}
