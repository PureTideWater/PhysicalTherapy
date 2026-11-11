import { createHash } from 'node:crypto';

import { factCatalog } from '../fact-catalog';
import { type NarrativeFacts, narrativeFacts } from '../facts';
import { type PacketContent, VERIFIER_FORMAT, VERIFIER_FORMAT_V3, type VerifierFormat } from '../format';
import { type CaseIdentifiers, identifierReader } from './identifiers';
import { type Mismatch, findMismatches } from './mismatches';
import { readTemplate } from './template';

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

export { type CaseIdentifiers, NO_CASE_IDENTIFIERS, identifierReader } from './identifiers';
export { type CheckedFigure, type FigureNeeds, type IdentifierReader, type IdentifierSkip, MISMATCH_CODES, type Mismatch, type MismatchCode, type NarrativeCheck, checkedFigures, findMismatches, identifierForms, readsNoIdentifier } from './mismatches';

interface ReportFields {
  readonly passed: boolean;
  readonly narrative_sha256: string;
  readonly sentences: number;
  /** How many figures, placeholders and markers were checked. */
  readonly checked: number;
  readonly mismatches: readonly Mismatch[];
}

/** A report of format /2: the narrative's figures read in the roles their words give them (docs/adr/0086). */
export interface VerifierReportV2 extends ReportFields {
  readonly format: typeof VERIFIER_FORMAT;
}

/**
 * A report of format /3 (docs/adr/0089): /2's keys, narrative_sha256 still the stored template's hash, and
 * rendered_sha256, the SHA-256 of the template rendered with identifier placeholders left unfilled (no identifier is
 * hashed), or of no text when a token renders nothing (such a report fails).
 */
export interface VerifierReportV3 extends ReportFields {
  readonly format: typeof VERIFIER_FORMAT_V3;
  readonly rendered_sha256: string;
}

/** A stored or computed verifier report, of either format. */
export type VerifierReport = VerifierReportV2 | VerifierReportV3;

export { type TemplateReading, readTemplate, templateSentenceSpans } from './template';

export function narrativeSha256(narrative: string): string {
  return createHash('sha256').update(narrative, 'utf8').digest('hex');
}

/**
 * Verifies a narrative against its version's facts and the case's own identifiers (the schedule rows'
 * patient names, member IDs and claim numbers, read from the canonical records): an identifier the
 * narrative holds, in any form ./identifiers.ts reads, fails it, and the report says where, never what.
 */
export function verifyNarrative(narrative: string, facts: NarrativeFacts, identifiers: CaseIdentifiers): VerifierReportV2 {
  const check = findMismatches(narrative, facts, identifierReader(identifiers));
  return {
    format: VERIFIER_FORMAT,
    passed: check.passed,
    narrative_sha256: narrativeSha256(narrative),
    sentences: check.sentences,
    checked: check.checked,
    mismatches: check.mismatches,
  };
}

/**
 * Verifies a template at format /3 against its version's content (the facts' catalog) and the case's own identifiers:
 * ./template.ts's check, with the template's hash and its rendered text's.
 */
export function verifyTemplate(template: string, content: PacketContent, identifiers: CaseIdentifiers): VerifierReportV3 {
  const { check, rendered } = readTemplate(template, factCatalog(content), identifierReader(identifiers));
  return {
    format: VERIFIER_FORMAT_V3,
    passed: check.passed,
    narrative_sha256: narrativeSha256(template),
    rendered_sha256: narrativeSha256(rendered?.text ?? ''),
    sentences: check.sentences,
    checked: check.checked,
    mismatches: check.mismatches,
  };
}

/**
 * Verifies a narrative at the format asked for, over its version's content: /2 is verifyNarrative over the content's
 * facts, exactly as every caller does today; /3 is verifyTemplate. Nothing chooses /3 but this argument.
 */
export function verifyAtFormat(format: typeof VERIFIER_FORMAT, narrative: string, content: PacketContent, identifiers: CaseIdentifiers): VerifierReportV2;
export function verifyAtFormat(format: typeof VERIFIER_FORMAT_V3, narrative: string, content: PacketContent, identifiers: CaseIdentifiers): VerifierReportV3;
export function verifyAtFormat(format: VerifierFormat, narrative: string, content: PacketContent, identifiers: CaseIdentifiers): VerifierReport;
export function verifyAtFormat(format: VerifierFormat, narrative: string, content: PacketContent, identifiers: CaseIdentifiers): VerifierReport {
  return format === VERIFIER_FORMAT_V3 ? verifyTemplate(narrative, content, identifiers) : verifyNarrative(narrative, narrativeFacts(content), identifiers);
}
