import { identifierForms } from '@tp/packets';

/**
 * PHI minimization for a payer letter (PRD 14, PHI minimization: "the gateway sends the minimum text
 * needed, strips names, dates of birth, member IDs and claim numbers by exact match before the call
 * where the task allows it, and never sends more than one patient's material in one call").
 *
 * The patient's names (each whole name and each of its words, as the packet verifier reads them),
 * dates of birth (in the forms a letter writes them), member IDs and the claims' numbers are replaced,
 * wherever they appear as whole words and without regard to case, by placeholders: [PATIENT_NAME],
 * [DATE_OF_BIRTH], [MEMBER_ID], and [CLAIM_1], [CLAIM_2] ... for the claims in the order given. The
 * claim placeholders keep the task possible: the model cites a claim by its placeholder, and code maps
 * it back to the claim. Nothing else of the letter changes.
 */

export interface PatientIdentifiers {
  /** The patient's pseudonym (patient_ref.pseudonym): the one patient the call is about. */
  readonly pseudonym: string;
  /** Names as the records hold them ("SMITH, JANE Q", "JANE SMITH"). */
  readonly names: readonly string[];
  /** Dates of birth as ISO dates. */
  readonly datesOfBirth: readonly string[];
  readonly memberIds: readonly string[];
}

export interface LetterClaim {
  readonly claimId: string;
  /** The patient the claim is for: every claim of a call is the one patient's. */
  readonly patientPseudonym: string;
  /** The claim's numbers (patient and payer claim control numbers) as the records hold them. */
  readonly claimNumbers: readonly string[];
}

export interface Redacted {
  readonly text: string;
  /** Each claim placeholder and the claim it stands for. */
  readonly claims: ReadonlyMap<string, string>;
  /** How many identifiers were replaced (a count, for tests and logs). */
  readonly replaced: number;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The ways a letter writes a date: ISO, month first with and without leading zeros, and in words. */
export function dateForms(iso: string): string[] {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (match === null) {
    return [];
  }
  const [, year = '', month = '', day = ''] = match;
  const m = String(Number.parseInt(month, 10));
  const d = String(Number.parseInt(day, 10));
  const name = MONTHS[Number.parseInt(month, 10) - 1] ?? '';
  return [iso, `${month}/${day}/${year}`, `${m}/${d}/${year}`, `${month}-${day}-${year}`, `${name} ${d}, ${year}`, `${name.slice(0, 3)} ${d}, ${year}`, `${name.slice(0, 3)}. ${d}, ${year}`, `${d} ${name} ${year}`];
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every whole-word occurrence of `form`, without regard to case, replaced. */
function replaceForm(text: string, form: string, placeholder: string): { readonly text: string; readonly count: number } {
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(form).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'giu');
  let count = 0;
  const replaced = text.replace(pattern, () => {
    count += 1;
    return placeholder;
  });
  return { text: replaced, count };
}

/** The identifiers' forms with their placeholders, longest first, so a whole name goes before its parts. */
export function redactionForms(patient: PatientIdentifiers, claims: readonly LetterClaim[]): { readonly form: string; readonly placeholder: string }[] {
  const forms = [
    ...claims.flatMap((claim, index) => claim.claimNumbers.map((form) => ({ form: form.normalize('NFKC').trim(), placeholder: `[CLAIM_${String(index + 1)}]` }))),
    ...patient.memberIds.map((form) => ({ form: form.normalize('NFKC').trim(), placeholder: '[MEMBER_ID]' })),
    ...patient.datesOfBirth.flatMap(dateForms).map((form) => ({ form, placeholder: '[DATE_OF_BIRTH]' })),
    ...identifierForms(patient.names).map((form) => ({ form, placeholder: '[PATIENT_NAME]' })),
  ];
  return forms.filter((entry) => entry.form !== '').sort((a, b) => b.form.length - a.form.length || a.form.localeCompare(b.form));
}

export function redactLetter(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): Redacted {
  let redacted = text.normalize('NFKC');
  let replaced = 0;
  for (const { form, placeholder } of redactionForms(patient, claims)) {
    const result = replaceForm(redacted, form, placeholder);
    redacted = result.text;
    replaced += result.count;
  }
  return { text: redacted, claims: new Map(claims.map((claim, index) => [`[CLAIM_${String(index + 1)}]`, claim.claimId])), replaced };
}

/** Whether any of the identifiers' forms is still in the text (the check after redaction). */
export function holdsIdentifier(text: string, patient: PatientIdentifiers, claims: readonly LetterClaim[]): boolean {
  return redactionForms(patient, claims).some(({ form }) => replaceForm(text, form, '').count > 0);
}
