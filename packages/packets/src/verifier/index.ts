import { createHash } from 'node:crypto';

import type { NarrativeFacts } from '../facts';
import { VERIFIER_FORMAT } from '../format';
import { type Mismatch, findMismatches } from './mismatches';

/**
 * The deterministic verifier, a hard gate (PRD 12: "any figure that is not in the input fails
 * verification, and a failed verification cannot be approved"; PRD 14, draftPacketNarrative; test
 * matrix CAS-08). It has no options and no bypass: every narrative a version stores goes through it,
 * the version stores its result, and the database refuses an approval of a version that did not pass.
 * The check itself is ./mismatches.ts (the rules it fails a narrative on are listed there); this adds
 * the narrative's SHA-256 and the report's format.
 *
 * The report holds codes and positions only, never the narrative's text, so it can be stored and
 * shown beside the (encrypted) narrative without repeating anything a person typed.
 */

export { type CheckedFigure, MISMATCH_CODES, type Mismatch, type MismatchCode, type NarrativeCheck, checkedFigures, findMismatches, identifierForms } from './mismatches';

export interface VerifierReport {
  readonly format: typeof VERIFIER_FORMAT;
  readonly passed: boolean;
  readonly narrative_sha256: string;
  readonly sentences: number;
  /** How many figures, placeholders and markers were checked. */
  readonly checked: number;
  readonly mismatches: readonly Mismatch[];
}

export function narrativeSha256(narrative: string): string {
  return createHash('sha256').update(narrative, 'utf8').digest('hex');
}

/**
 * Verifies a narrative against its version's facts and the case's own identifiers (the schedule rows'
 * patient names, member IDs and claim numbers, read from the canonical records): an identifier the
 * narrative holds fails it, and the report says where, never what.
 */
export function verifyNarrative(narrative: string, facts: NarrativeFacts, identifiers: readonly string[]): VerifierReport {
  const check = findMismatches(narrative, facts, identifiers);
  return {
    format: VERIFIER_FORMAT,
    passed: check.passed,
    narrative_sha256: narrativeSha256(narrative),
    sentences: check.sentences,
    checked: check.checked,
    mismatches: check.mismatches,
  };
}
