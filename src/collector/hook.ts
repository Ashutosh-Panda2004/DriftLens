// DriftLens - Git hook installer + post-commit logic entry point

import { readConfig, isInitialised } from '../shared/config.js';
import { collectDelta } from './delta.js';

/**
 * Called by: driftlens collect --hook
 * This runs in the background after each git commit.
 * MUST NOT block. MUST exit silently on any error.
 */
export async function runHook(): Promise<void> {
  const cwd = process.cwd();

  if (!isInitialised(cwd)) return;

  try {
    await readConfig(cwd); // Validate config exists
    await collectDelta(cwd);
  } catch {
    // Silent - never block the developer's workflow
  }
}
