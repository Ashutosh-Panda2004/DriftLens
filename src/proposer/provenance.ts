// E-F2 / E-P1: Proposal provenance & rejection learning
//
// Every proposal decision is appended to `.driftlens/proposals.jsonl` so the
// system has a durable memory of what it has already suggested and what humans
// rejected. This prevents the single most annoying failure mode of an automated
// proposer: re-proposing a rule a reviewer already said "no" to. Append-only,
// crash-safe, and deterministic via a stable content hash.

import { createHash } from 'crypto';
import { appendFile } from 'fs/promises';
import path from 'path';
import { readJsonl } from '../shared/io.js';
import { PROPOSALS_FILE } from '../shared/constants.js';
import type { ProposalDecisionRecord, PatternRecord } from '../shared/schema.js';

/**
 * Stable hash of the *content* of a rule (not its pattern id), so that two
 * patterns proposing the same normalised rule text collapse to one decision.
 */
export function ruleHash(ruleText: string): string {
  const normalised = ruleText.toLowerCase().replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(normalised).digest('hex').slice(0, 16);
}

export async function readProposalLog(cwd: string): Promise<ProposalDecisionRecord[]> {
  return readJsonl<ProposalDecisionRecord>(path.join(cwd, PROPOSALS_FILE));
}

/**
 * Build the set of rule hashes that a human has explicitly rejected. These must
 * never be re-proposed.
 */
export async function rejectedRuleHashes(cwd: string): Promise<Set<string>> {
  const log = await readProposalLog(cwd);
  const rejected = new Set<string>();
  for (const rec of log) {
    if (rec.decision === 'rejected') rejected.add(rec.rule_hash);
  }
  return rejected;
}

/**
 * Set of rule hashes already proposed or merged, used to avoid duplicate noise
 * within a single skill file run.
 */
export async function knownRuleHashes(cwd: string): Promise<Set<string>> {
  const log = await readProposalLog(cwd);
  const known = new Set<string>();
  for (const rec of log) {
    if (rec.decision === 'proposed' || rec.decision === 'merged') known.add(rec.rule_hash);
  }
  return known;
}

export async function recordDecision(
  cwd: string,
  pattern: Pick<PatternRecord, 'pattern_id' | 'name' | 'proposed_rule'>,
  decision: ProposalDecisionRecord['decision'],
  reason: string | null = null,
): Promise<ProposalDecisionRecord> {
  const record: ProposalDecisionRecord = {
    rule_hash: ruleHash(pattern.proposed_rule || pattern.name),
    pattern_id: pattern.pattern_id,
    name: pattern.name,
    decision,
    reason,
    ts: new Date().toISOString(),
  };
  await appendFile(path.join(cwd, PROPOSALS_FILE), JSON.stringify(record) + '\n', 'utf8');
  return record;
}

/**
 * Filter a list of candidate patterns down to those that have NOT been rejected
 * before. Returns both the allowed patterns and the ones skipped (for logging).
 */
export async function filterRejected<T extends Pick<PatternRecord, 'proposed_rule' | 'name'>>(
  cwd: string,
  candidates: T[],
): Promise<{ allowed: T[]; skipped: T[] }> {
  const rejected = await rejectedRuleHashes(cwd);
  const allowed: T[] = [];
  const skipped: T[] = [];
  for (const c of candidates) {
    const h = ruleHash(c.proposed_rule || c.name);
    if (rejected.has(h)) skipped.push(c);
    else allowed.push(c);
  }
  return { allowed, skipped };
}
