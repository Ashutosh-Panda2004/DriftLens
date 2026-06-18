// DriftLens - VS Code Copilot chat history parser

import type { ParsedSession } from './index.js';

/**
 * Parse VS Code Copilot chat history.
 * The chat history format is not publicly documented - this is a best-effort implementation.
 * Copilot chat logs are stored in VS Code's globalStorage directory.
 */
export async function parseCopilotSessions(_vscodeStorageDir: string): Promise<ParsedSession[]> {
  // Stub - Copilot chat history is not currently accessible via a stable API.
  // Detection via watch sessions and agent hooks is the recommended approach for Copilot.
  return [];
}
