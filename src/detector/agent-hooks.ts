// DriftLens - Copilot Agent Hooks integration stub

export interface AgentHookSignal {
  session_id: string;
  agent: 'copilot';
}

/**
 * Reads Copilot agent hook metadata if present.
 * The hook writes session info to .github/hooks/.copilot-session.json
 */
export async function detectAgentHooks(_cwd: string): Promise<AgentHookSignal | null> {
  // Stub - Copilot Agent Hooks integration reads session metadata
  // when sessionStart/End hooks invoke driftlens watch start/stop
  return null;
}
