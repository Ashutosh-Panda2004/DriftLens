// DriftLens - Config reader/writer for .driftlens/config.json

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import type { DriftLensConfig, SkillTarget } from './schema.js';
import {
  CONFIG_FILE,
  DRIFTLENS_DIR,
  DEFAULT_DETECTION_CONFIG,
  DEFAULT_ANALYSIS_CONFIG,
  DEFAULT_DASHBOARD_CONFIG,
  VERSION,
} from './constants.js';

export function defaultConfig(): DriftLensConfig {
  return {
    version: VERSION,
    skillTargets: [],
    detection: {
      ...DEFAULT_DETECTION_CONFIG,
      methods: [...DEFAULT_DETECTION_CONFIG.methods],
      commitTagPatterns: [...DEFAULT_DETECTION_CONFIG.commitTagPatterns],
    },
    analysis: { ...DEFAULT_ANALYSIS_CONFIG },
    llm: {
      provider: 'anthropic',
      analysisModel: 'claude-sonnet-4-6',
      proposalModel: 'claude-opus-4-6',
      apiKey: 'env:ANTHROPIC_API_KEY',
    },
    embeddings: {
      provider: 'voyage',
      model: 'voyage-code-3',
      apiKey: 'env:VOYAGE_API_KEY',
    },
    git: {
      platform: 'github',
      token: 'env:GITHUB_TOKEN',
    },
    dashboard: { ...DEFAULT_DASHBOARD_CONFIG },
  };
}

/**
 * Resolve an API key value - supports "env:VAR_NAME" format.
 */
export function resolveApiKey(value: string): string {
  if (value.startsWith('env:')) {
    const varName = value.slice(4);
    const resolved = process.env[varName];
    if (!resolved) {
      throw new Error(`Environment variable ${varName} is not set`);
    }
    return resolved;
  }
  return value;
}

/**
 * Read config from .driftlens/config.json relative to cwd.
 * Throws if .driftlens/ does not exist (not initialised).
 */
export async function readConfig(cwd: string = process.cwd()): Promise<DriftLensConfig> {
  const configPath = path.join(cwd, CONFIG_FILE);
  if (!existsSync(configPath)) {
    throw new Error(
      `DriftLens is not initialised in this directory. Run 'driftlens init' first.`
    );
  }
  const raw = await readFile(configPath, 'utf8');
  try {
    return JSON.parse(raw) as DriftLensConfig;
  } catch (err) {
    throw new Error(
      `Failed to parse ${CONFIG_FILE}: ${err instanceof Error ? err.message : String(err)}. ` +
        `The file may be corrupted — restore it or re-run 'driftlens init'.`
    );
  }
}

/**
 * Write config to .driftlens/config.json.
 */
export async function writeConfig(config: DriftLensConfig, cwd: string = process.cwd()): Promise<void> {
  const dir = path.join(cwd, DRIFTLENS_DIR);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  const configPath = path.join(cwd, CONFIG_FILE);
  await writeFile(configPath, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

/**
 * Update (merge) config fields and write.
 */
export async function updateConfig(
  updates: Partial<DriftLensConfig>,
  cwd: string = process.cwd()
): Promise<DriftLensConfig> {
  const current = await readConfig(cwd);
  const updated: DriftLensConfig = { ...current, ...updates };
  await writeConfig(updated, cwd);
  return updated;
}

/**
 * Add skill target (deduplicates by path).
 */
export async function addSkillTarget(
  target: SkillTarget,
  cwd: string = process.cwd()
): Promise<void> {
  const config = await readConfig(cwd);
  const exists = config.skillTargets.some((t) => t.path === target.path);
  if (!exists) {
    config.skillTargets.push(target);
    await writeConfig(config, cwd);
  }
}

/**
 * Check whether .driftlens/ has been initialised.
 */
export function isInitialised(cwd: string = process.cwd()): boolean {
  return existsSync(path.join(cwd, CONFIG_FILE));
}
