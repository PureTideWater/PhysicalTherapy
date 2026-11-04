import { type KeyProvider, type PracticeScope, type ScopeClient, loadPracticeCipher, readWithAudit } from '@tp/db/runtime';
import { type CheckedFigure, type PacketContent, type VerifierReport, checkedFigures, narrativeFacts, verifyNarrative } from '@tp/packets';

import { scheduleIdentifiers } from './identifiers';

/**
 * The verifier over a stored version now (docs/adr/0086; the review of 2026-11-01, CORR-5). A version stores the
 * verifier's report from when it was written, and the database approves only a version whose stored report passed. The
 * reader of figures changes (ADR 0086 reads each figure in the role its words give it), and the report's format stays
 * tp-packet-verifier/2 until Lane A's migration makes /3 current, so a stored pass may be one the current reading fails.
 * Until then the code runs the verifier again over the stored narrative and content wherever a stored pass would count:
 *
 * - the export job, over exactly what it prints with the identifiers read for it (./export.ts);
 * - the steps before it: a request for approval and an approval (verifyVersionNow(), with today's identifiers, an
 *   audited read as when the version was written), which refuse a version that fails now;
 * - the screens that say whether the verifier passed a version (caseVerifiersNow(): the builder's badge and history,
 *   the case's packet line and timeline), which say "fails now" instead. They read no identifier: the stored report
 *   checked them when the version was written, and each step checks today's.
 *
 * Every one of them asks verifierNow(), so they cannot differ in what a pass is.
 */

/**
 * What the verifier says of a stored version now: `passed` (its stored report passed, and the verifier passes the same
 * narrative now), `failed` (its stored report failed: the database refuses its approval) or `fails_now` (its stored
 * report passed, and the verifier fails the same narrative now, or its report is not of this narrative).
 */
export const VERIFIER_STANDINGS = ['passed', 'failed', 'fails_now'] as const;
export type VerifierStanding = (typeof VERIFIER_STANDINGS)[number];

export interface VerifierNow {
  readonly standing: VerifierStanding;
  /** The report a screen shows and a refusal lists: the stored one when it failed, the verifier's own now otherwise. */
  readonly report: VerifierReport;
  /**
   * When it fails now, its failing figures as the check reads them now (what each was read as and what the records hold
   * it as), so a refusal says each in the role's words, never the narrative's; none otherwise.
   */
  readonly figures: readonly CheckedFigure[];
}

/**
 * The verifier over a stored version's narrative and content now, with `identifiers` the schedule rows' own (the
 * export's and the steps'; a screen passes none). A failed stored report stands as it is, without reading again.
 */
export function verifierNow(narrative: string, content: PacketContent, stored: VerifierReport, identifiers: readonly string[]): VerifierNow {
  if (!stored.passed) {
    return { standing: 'failed', report: stored, figures: [] };
  }
  const facts = narrativeFacts(content);
  const now = verifyNarrative(narrative, facts, identifiers);
  if (now.passed && now.narrative_sha256 === stored.narrative_sha256) {
    return { standing: 'passed', report: now, figures: [] };
  }
  return { standing: 'fails_now', report: now, figures: checkedFigures(narrative, facts).filter((figure) => !figure.passed) };
}

interface StoredRow {
  readonly id: string;
  readonly practice_id: string;
  readonly content: PacketContent;
  readonly narrative: string;
  readonly verifier_report: VerifierReport;
}

/**
 * The verifier over one stored version now, as a step asks it before it acts (a request for approval, an approval): its
 * narrative decrypted (an audited read of the version) and its schedule rows' identifiers read from the canonical
 * records (an audited read of the claims), both under the purpose packet_verification, as when the version was written.
 * Undefined when the version is not in the practice.
 */
export async function verifyVersionNow(
  scope: PracticeScope<ScopeClient>,
  keys: KeyProvider,
  input: { readonly practiceId: string; readonly versionId: string; readonly requestId: string },
): Promise<VerifierNow | undefined> {
  const { rows: stored } = await scope.client.query<{ verifier_report: VerifierReport }>('SELECT verifier_report FROM packet_version WHERE id = $1 AND practice_id = $2', [
    input.versionId,
    input.practiceId,
  ]);
  const report = stored[0]?.verifier_report;
  if (report === undefined) {
    return undefined;
  }
  if (!report.passed) {
    // Nothing to read again: a failed report stands (and the database refuses the step).
    return { standing: 'failed', report, figures: [] };
  }
  const [row] = await readStored(scope, input.practiceId, [input.versionId], input.requestId);
  if (row === undefined) {
    return undefined;
  }
  const cipher = await loadPracticeCipher(scope, keys, input.practiceId);
  const identifiers = await scheduleIdentifiers(scope, cipher, row.content, { purpose: 'packet_verification', requestId: input.requestId });
  return verifierNow(cipher.decrypt('packet_version.narrative', row.narrative), row.content, row.verifier_report, identifiers.all);
}

/**
 * The verifier over every version of a case's packet now, by version ID, as the screens say it: each version whose
 * stored report passed is read again (its narrative decrypted, an audited read under packet_verification), a failed one
 * stands as stored. No identifier is read (the stored report checked them; each step checks today's).
 */
export async function caseVerifiersNow(
  scope: PracticeScope<ScopeClient>,
  keys: KeyProvider,
  input: { readonly practiceId: string; readonly caseId: string; readonly requestId: string },
): Promise<ReadonlyMap<string, VerifierNow>> {
  const { rows: versions } = await scope.client.query<{ id: string; verifier_report: VerifierReport }>(
    'SELECT v.id, v.verifier_report FROM packet_version v JOIN packet p ON p.id = v.packet_id WHERE p.case_id = $1 AND v.practice_id = $2 ORDER BY v.version_no',
    [input.caseId, input.practiceId],
  );
  // A stored pass counts only once read again: until then it is not a pass now.
  const now = new Map<string, VerifierNow>(versions.map((version) => [version.id, { standing: version.verifier_report.passed ? 'fails_now' : 'failed', report: version.verifier_report, figures: [] }]));
  const passed = versions.filter((version) => version.verifier_report.passed).map((version) => version.id);
  if (passed.length === 0) {
    return now;
  }
  const rows = await readStored(scope, input.practiceId, passed, input.requestId);
  const cipher = await loadPracticeCipher(scope, keys, input.practiceId);
  for (const row of rows) {
    now.set(row.id, verifierNow(cipher.decrypt('packet_version.narrative', row.narrative), row.content, row.verifier_report, []));
  }
  return now;
}

/** The stored versions' content, encrypted narrative and report: an audited read of each version, for packet_verification. */
async function readStored(scope: PracticeScope<ScopeClient>, practiceId: string, versionIds: readonly string[], requestId: string): Promise<StoredRow[]> {
  return readWithAudit(
    scope,
    { objectType: 'packet_version', purpose: 'packet_verification', requestId },
    async (client) =>
      (await client.query<StoredRow>('SELECT id, practice_id, content, narrative, verifier_report FROM packet_version WHERE id = ANY ($1::uuid[]) AND practice_id = $2', [versionIds, practiceId])).rows,
    (row) => ({ objectId: row.id, practiceId: row.practice_id }),
  );
}
