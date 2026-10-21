import { type PracticeScope, type ScopeClient, recordAuditEvent, requirePracticePermission, requireRole } from '@tp/db/runtime';
import {
  CORRESPONDENCE_CONTACT_KEY,
  type CorrespondenceContact,
  type CorrespondenceContactInput,
  type CorrespondenceContactState,
  correspondenceContactOf,
  correspondenceContactSetting,
} from '@tp/packets';

/**
 * The practice's correspondence contact (audit item #37 part 1, D6; the founder's ruling of 2026-10-20, Q1 (a);
 * docs/adr/0061), which the payer's copy of every packet prints and without which no packet is exported (the
 * export's coded refusal contact_missing, ./readiness.ts). It lives in practice.settings beside the proof level, the
 * posting template and the pricing and triage settings (every other key is kept).
 *
 * The practice administrator sets it, exactly as setLedgerSettings() sets the proof level: practice.open and the role
 * practice_admin are checked here, and the database's restrictive policy practice_administrators_update admits the
 * UPDATE only for the practice's administrators (app_actor_admin_practice_ids()), so a statement of anyone else
 * changes no row and is refused. It cannot be cleared, only replaced. It is staff contact data, not PHI, and never
 * logged: the audit event carries the practice's ID only.
 */

/** The contact was not set: the person may not set it, or the practice is not theirs (fixed words). */
export class CorrespondenceContactRefused extends Error {
  override readonly name = 'CorrespondenceContactRefused';
}

/**
 * Sets the practice's correspondence contact, replacing the one before (a CorrespondenceContactError names a field the
 * contact is refused by). Returns the contact as stored. A packet already exported keeps the contact it was printed
 * with: its PDF and SHA-256 are the record of what was printed.
 */
export async function setCorrespondenceContact(
  scope: PracticeScope<ScopeClient>,
  input: { readonly practiceId: string; readonly contact: CorrespondenceContactInput; readonly requestId: string },
): Promise<CorrespondenceContact> {
  const access = requirePracticePermission(scope, input.practiceId, 'practice.open');
  requireRole(access.roles, ['practice_admin'], 'practice.open');
  const contact = correspondenceContactSetting(input.contact);
  const { rowCount } = await scope.client.query(`UPDATE practice SET settings = jsonb_set(settings, '{${CORRESPONDENCE_CONTACT_KEY}}', $2::jsonb) WHERE id = $1`, [
    input.practiceId,
    JSON.stringify(contact),
  ]);
  if (rowCount !== 1) {
    throw new CorrespondenceContactRefused('the practice’s correspondence contact is its administrators’ to set');
  }
  await recordAuditEvent(scope, { action: 'correspondence_contact_set', objectType: 'practice', objectId: input.practiceId, practiceId: input.practiceId, requestId: input.requestId });
  return contact;
}

/** What a practice row's settings hold of the contact: whether the key is there, and its value. */
export function contactStateOf(present: boolean, value: unknown): CorrespondenceContactState {
  return correspondenceContactOf(present ? { [CORRESPONDENCE_CONTACT_KEY]: value } : {});
}

/** The practice's contact as its settings hold it now, in the caller's scope (missing when the caller cannot see the practice). */
export async function practiceCorrespondenceContact(client: ScopeClient, practiceId: string): Promise<CorrespondenceContactState> {
  const { rows } = await client.query<{ present: boolean; contact: unknown }>(
    `SELECT settings ? '${CORRESPONDENCE_CONTACT_KEY}' AS present, settings -> '${CORRESPONDENCE_CONTACT_KEY}' AS contact FROM practice WHERE id = $1`,
    [practiceId],
  );
  const row = rows[0];
  return row === undefined ? { state: 'missing' } : contactStateOf(row.present, row.contact);
}
