// DriftLens - Message classifier
// Classifies developer messages in AI coding sessions.

import {
  CORRECTION_KEYWORDS,
  APPROVAL_KEYWORDS,
  CLARIFICATION_KEYWORDS,
} from '../../shared/constants.js';

export type MessageClassification = 'correction' | 'new_request' | 'clarification' | 'approval';

/**
 * Classify a developer message in the context of an AI coding session.
 * Uses rule-based classification (no LLM by default).
 */
export function classifyMessage(
  developerMessage: string,
  _prevAiContent: string = ''
): MessageClassification {
  const lower = developerMessage.toLowerCase().trim();

  // Approval
  if (APPROVAL_KEYWORDS.some((k) => lower.includes(k))) return 'approval';

  // Clarification
  if (CLARIFICATION_KEYWORDS.some((k) => lower.includes(k))) {
    // But if it also has correction keywords, it's a correction
    if (!CORRECTION_KEYWORDS.some((k) => lower.includes(k))) return 'clarification';
  }

  // Correction - check for correction keywords + negation patterns
  const hasCorrectionKeyword = CORRECTION_KEYWORDS.some((k) =>
    new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)
  );
  const hasNegation = /\b(no|don'?t|not|never|wrong|incorrect|bad|avoid)\b/.test(lower);
  const hasInstruction = /\b(use|should|must|instead|replace|fix|change|make)\b/.test(lower);

  if (hasCorrectionKeyword || (hasNegation && hasInstruction)) return 'correction';

  // "Can you fix" patterns - still corrections
  if (/can you (fix|change|update|use|make)/i.test(lower)) return 'correction';

  // Default to new_request for directive sentences
  if (/^(add|create|generate|implement|build|write|make)\b/i.test(lower)) return 'new_request';

  // Default - if it looks like a correction
  if (hasNegation) return 'correction';

  return 'new_request';
}
