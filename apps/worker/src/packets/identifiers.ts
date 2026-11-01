import { type PracticeCipher, type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import type { PacketContent, RowIdentifiers } from '@tp/packets';

/**
 * The identifiers of a version's schedule rows, read from the canonical claim and patient records and
 * decrypted (an audited read of the claims): what the export inserts for each row's placeholders
 * (CAS-11), and what the verifier checks a narrative never holds when a version is written (PRD 12:
 * "the verifier then checks every ... identifier in the text against the canonical record"). Nothing
 * here leaves the request: the verifier's report holds positions only.
 */

interface IdentifierRow {
  readonly service_line_id: string;
  readonly practice_id: string;
  readonly patient_control_number: string;
  readonly payer_claim_control_number: string;
  readonly last_name: string | null;
  readonly first_name: string | null;
  readonly member_id: string | null;
  readonly insured_last_name: string | null;
  readonly insured_first_name: string | null;
  readonly insured_member_id: string | null;
}

export interface ScheduleIdentifiers {
  /** Each schedule row's identifiers, as the export prints them. */
  readonly rows: Map<number, RowIdentifiers>;
  /** Every identifier of the rows (patient and insured names and member IDs, claim numbers): what no narrative may hold. */
  readonly all: readonly string[];
  /** Which of them are names (the patients' and insureds' last and first names): the rest are member IDs and claim numbers. */
  readonly names: readonly string[];
}

export async function scheduleIdentifiers(
  scope: PracticeScope<ScopeClient>,
  cipher: PracticeCipher,
  content: PacketContent,
  audit: { readonly purpose: 'packet_export' | 'packet_verification'; readonly requestId: string },
): Promise<ScheduleIdentifiers> {
  const lineIds = content.lines.map((line) => line.service_line_id);
  const found = await readWithAudit(
    scope,
    { objectType: 'claim', purpose: audit.purpose, requestId: audit.requestId },
    async (client) =>
      (
        await client.query<IdentifierRow>(
          `SELECT sl.id AS service_line_id, c.practice_id, c.patient_control_number, c.payer_claim_control_number, pr.last_name, pr.first_name, pr.member_id,
                  ir.last_name AS insured_last_name, ir.first_name AS insured_first_name, ir.member_id AS insured_member_id
             FROM service_line sl JOIN claim c ON c.id = sl.claim_id JOIN patient_ref pr ON pr.id = c.patient_ref_id LEFT JOIN patient_ref ir ON ir.id = c.insured_ref_id
            WHERE sl.id = ANY ($1::uuid[])`,
          [lineIds],
        )
      ).rows,
    (row) => ({ objectId: row.service_line_id, practiceId: row.practice_id }),
  );
  const byLine = new Map(found.map((row) => [row.service_line_id, row]));
  const decrypt = (column: 'patient_ref.last_name' | 'patient_ref.first_name' | 'patient_ref.member_id', value: string | null) => (value === null ? null : cipher.decrypt(column, value));
  const rows = new Map<number, RowIdentifiers>();
  const all = new Set<string>();
  const names = new Set<string>();
  for (const line of content.lines) {
    const row = byLine.get(line.service_line_id);
    if (row === undefined) {
      continue;
    }
    const last = decrypt('patient_ref.last_name', row.last_name);
    const first = decrypt('patient_ref.first_name', row.first_name);
    const member = decrypt('patient_ref.member_id', row.member_id);
    const insuredMember = decrypt('patient_ref.member_id', row.insured_member_id);
    const insuredLast = decrypt('patient_ref.last_name', row.insured_last_name);
    const insuredFirst = decrypt('patient_ref.first_name', row.insured_first_name);
    const identifiers: RowIdentifiers = {
      claim_control_number: cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number),
      patient_control_number: cipher.decrypt('claim.patient_control_number', row.patient_control_number),
      patient_name: last === null && first === null ? null : [last, first].filter((part) => part !== null).join(', '),
      member_id: member ?? insuredMember,
    };
    rows.set(line.row, identifiers);
    for (const name of [last, first, insuredLast, insuredFirst]) {
      if (name !== null && name.trim() !== '') {
        names.add(name);
      }
    }
    for (const value of [
      identifiers.claim_control_number,
      identifiers.patient_control_number,
      last,
      first,
      member,
      insuredMember,
      insuredLast,
      insuredFirst,
    ]) {
      if (value !== null && value.trim() !== '') {
        all.add(value);
      }
    }
  }
  return { rows, all: [...all], names: [...names] };
}
