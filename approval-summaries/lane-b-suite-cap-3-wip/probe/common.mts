// SUITE-CAP-3 profile: shared helpers. Every repository module is imported by absolute path from TP_REPO (the base
// clone, or a candidate fix's checkout), so nothing is copied into a checkout. Nothing here logs a row: the timeline
// holds statement families, fingerprints (of the SQL text, which is code), row counts, times and heap figures only.
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const REPO = process.env.TP_REPO ?? '';
if (REPO === '') {
  throw new Error('TP_REPO names the checkout to measure');
}

/** Imports a repository module by its path under TP_REPO. */
export const repo = async <T = any>(relative: string): Promise<T> => (await import(pathToFileURL(`${REPO}/${relative}`).href)) as T;

/** A database URL on the admin URL's server with another database name. */
export function dbUrl(adminUrl: string, name: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/** The statement families of a reconcile pass, by the SQL text (first match wins). */
export const FAMILIES: readonly (readonly [string, RegExp])[] = [
  ['scope.begin_end', /^(BEGIN|COMMIT|ROLLBACK)\b/i],
  ['scope.set_config', /set_config\('app\./],
  ['ledger.lock', /pg_advisory_xact_lock\(hashtextextended\('ledger:'/],
  // SUITE-CAP-3's candidate fix (the pass-level candidate search): its own families.
  ['candidates.passControl', /probe \(ix, claim_id\) AS/],
  ['candidates.passPatient', /named \(ix, claim_id\) AS/],
  ['candidates.passLoadedAt', /AS loaded_at FROM claim o WHERE o\.practice_id/],
  ['remit.caseLines', /FROM case_line cl JOIN "case" k ON k\.id = cl\.case_id JOIN service_line l/],
  ['ledger.entries', /FROM ledger_entry e WHERE e\.practice_id = \$1 ORDER BY e\.seq/],
  ['ledger.matches', /FROM ledger_match m WHERE m\.practice_id = \$1 ORDER BY m\.matched_at, m\.id/],
  ['chain.order', /CASE WHEN m\.kind = 'claim' THEN 0 WHEN m\.claim_id IS NOT NULL THEN 1 ELSE 2 END/],
  ['chain.reversals', /v\.claim_status_code = '22' AND v\.reversal_of_claim_id = ANY/],
  ['claimLines', /WITH RECURSIVE named/],
  ['candidates.byControl', /payer_claim_control_number_hash IN \(SELECT k\.payer_claim_control_number_hash/],
  ['candidates.byPatient', /s\.procedure_code = \$6 AND s\.service_date IS NOT DISTINCT FROM \$7/],
  ['candidates.chainOrdered', /^SELECT c\.id FROM claim c JOIN remittance r ON r\.id = c\.remittance_id WHERE c\.id = ANY/],
  ['insert.match', /INSERT INTO ledger_match/],
  ['insert.entry', /INSERT INTO ledger_entry/],
  ['remit.providerAdjustments', /FROM provider_adjustment a JOIN remittance r ON r\.id = a\.remittance_id/],
  ['remit.hashesOf', /payer_claim_control_number_hash AS hash FROM claim WHERE id = ANY/],
  ['remit.claimInterest', /c\.interest_cents > 0/],
  ['remit.entriesOfEvidence', /FROM ledger_entry WHERE practice_id = \$1 AND evidence_id = \$2/],
  ['postings.rows', /FROM posting_row p\s+WHERE p\.practice_id = \$1 AND NOT EXISTS/],
  ['postings.remittancesOf', /r\.trn02 = \$2 AND r\.status = 'loaded'/],
  ['postings.refClaims', /c\.patient_control_number FROM claim c WHERE c\.remittance_id = \$1/],
  ['postings.refLines', /FROM service_line s WHERE s\.claim_id = ANY \(\$1::uuid\[\]\) ORDER BY s\.line_no/],
  ['postings.postedSoFar', /m\.kind = 'posting' AND m\.level = 'check' AND m\.reversed_at IS NULL/],
  ['deposits.rows', /FROM eft_row e\s+WHERE e\.practice_id = \$1 AND NOT EXISTS/],
  ['deposits.deposited', /m\.kind = 'deposit' AND m\.reversed_at IS NULL/],
  ['settle.caseLines', /SELECT cl\.service_line_id, cl\.case_id, l\.claim_id FROM case_line cl/],
  ['settle.amounts', /coalesce\(p\.amount_cents, e\.amount_cents\)::text AS amount_cents/],
  ['stages.select', /ledger_line_stage\(cl\.service_line_id\) AS ledger_stage/],
  ['stages.insert', /INSERT INTO line_status/],
  ['stages.moveBackNote', /e\.stage = 'reversed'\s+AND e\.created_at >=/],
  ['notify.recipients', /practice_notification_recipients\(\)/],
  ['notify.manual', /e\.stage = 'recouped' AND e\.created_by IS NOT NULL/],
  ['notify.insert', /INSERT INTO notification/],
  ['responses', /payer_response|submission/],
  ['exports', /source_document|posting_row|eft_row|export/],
  ['cipher', /data_key_ref/],
];

export function familyOf(sql: string): string {
  for (const [name, pattern] of FAMILIES) {
    if (pattern.test(sql)) {
      return name;
    }
  }
  return 'other';
}

/** A statement's fingerprint: the SHA-256 of its whitespace-collapsed text, 10 hex digits (the text is code, never data). */
export function fingerprintOf(sql: string): { readonly fp: string; readonly text: string } {
  const text = sql.replace(/\s+/g, ' ').trim();
  return { fp: createHash('sha256').update(text).digest('hex').slice(0, 10), text: text.slice(0, 160) };
}

/** The pass's phases, opened by the first statement of a family each step begins with. */
export const PHASE_OPENERS: Readonly<Record<string, string>> = {
  'ledger.lock': 'responses',
  'remit.caseLines': 'remittances',
  'postings.rows': 'postings',
  'deposits.rows': 'deposits',
  'settle.caseLines': 'settle',
  'stages.select': 'stages',
  'notify.manual': 'notify',
  'notify.recipients': 'notify',
};

export const MiB = (bytes: number): number => Math.round((bytes / 1048576) * 10) / 10;
