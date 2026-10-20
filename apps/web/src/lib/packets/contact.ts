import type { PracticeAccess, PracticeScope, ScopeClient } from '@tp/db/runtime';
import { correspondenceText } from '@tp/packets';
import { practiceCorrespondenceContact } from '@tp/worker/packets';

/**
 * The practice's correspondence contact as the web shows it (audit item #37 part 1, D6 and D7; the founder's ruling of
 * 2026-10-20, Q1 (a); docs/adr/0061): its state and, once set, the words the payer's copy prints, for the packet page's
 * Export card, the review page's Payer's copy card and the settings preview. Who may set it is one rule, the setter's
 * and Postgres's: the practice administrator, reached by ownership of the practice.
 */

export interface ContactNow {
  readonly state: 'set' | 'missing' | 'malformed';
  /** The payer copy's words, when set. */
  readonly text: string | null;
}

/** The practice's correspondence contact now, in the caller's scope. */
export async function contactNow(scope: PracticeScope<ScopeClient>, practiceId: string): Promise<ContactNow> {
  const contact = await practiceCorrespondenceContact(scope.client, practiceId);
  return contact.state === 'set' ? { state: 'set', text: correspondenceText(contact.contact) } : { state: contact.state, text: null };
}

/**
 * Whether the viewer may set the correspondence contact: the role practice_admin, reached by ownership (never under a
 * grant), exactly what setCorrespondenceContact() and the database's practice_administrators_update policy admit, so
 * no one sees a form whose save is refused.
 */
export function canSetCorrespondence(access: Pick<PracticeAccess, 'roles' | 'via'>): boolean {
  return access.roles.includes('practice_admin') && access.via === 'ownership';
}

/** Where the contact is set. */
export const correspondenceSettingsPath = (practiceId: string) => `/p/${practiceId}/settings/correspondence`;

/** What the exported files are, on the packet page's Export card. */
export const PAYER_COPY_TEXT =
  'The PDF and the CSV are the payer’s copy: the practice’s letter with its figures, citations and evidence, closed by the approval line with the packet’s reference and your correspondence contact. They carry no login, record ID, SHA-256 or internal note; those stay on the reviewer’s review page.';

/** What a missing contact means, beside a disabled Export button. */
export const CONTACT_MISSING_TEXT = 'Your practice administrator sets the correspondence contact under Settings, Correspondence; the export prints it.';

/** A contact stored in a form the payer's copy cannot print (never replaced by a default). */
export const CONTACT_MALFORMED_TEXT = 'The correspondence contact on file is not in a form the payer’s copy can print. Your practice administrator sets it again under Settings, Correspondence.';
