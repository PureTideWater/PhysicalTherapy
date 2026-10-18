import { type PracticeCipher, type PracticeScope, type ScopeClient, readWithAudit } from '@tp/db/runtime';
import { type OtherPatientCheck, compactIdentifier } from '@tp/model-gateway';

/**
 * The practice's records, asked whether a payer letter names another patient (PRD 14, PHI
 * minimization: the gateway "never sends more than one patient's material in one call"). The
 * denial-letter reader (v1.5, behind its own flag) gives the gateway this check with the letter; the
 * gateway asks it, before anything is sent, whether any run of the redacted letter is a member ID or a
 * claim number (patient or payer claim control number) the practice holds for a patient other than the
 * letter's, and refuses the call on a yes.
 *
 * The answer is yes or no. The other patients' identifiers are read once, in the person's or job's own
 * scope (an audited read of the patients and claims, purpose letter_screen), decrypted and compacted in
 * memory (letters and digits, upper case, as the gateway compacts the letter's runs), and never leave
 * the check.
 */

export interface LetterPatient {
  readonly practiceId: string;
  /** The patient_ref rows that are the letter's patient (the patient, and the insured on their claims). */
  readonly patientRefIds: readonly string[];
  readonly requestId: string;
}

interface PatientRow {
  readonly id: string;
  readonly practice_id: string;
  readonly member_id: string;
}

interface ClaimRow {
  readonly id: string;
  readonly practice_id: string;
  readonly patient_control_number: string;
  readonly payer_claim_control_number: string;
}

export function otherPatientRecords(scope: PracticeScope<ScopeClient>, cipher: PracticeCipher, letter: LetterPatient): OtherPatientCheck {
  let known: Promise<ReadonlySet<string>> | undefined;
  const read = async (): Promise<ReadonlySet<string>> => {
    const audit = { purpose: 'letter_screen', requestId: letter.requestId };
    const patients = await readWithAudit(
      scope,
      { objectType: 'patient_ref', ...audit },
      async (client) =>
        (
          await client.query<PatientRow>('SELECT id, practice_id, member_id FROM patient_ref WHERE practice_id = $1 AND member_id IS NOT NULL AND NOT (id = ANY ($2::uuid[]))', [
            letter.practiceId,
            [...letter.patientRefIds],
          ])
        ).rows,
      (row) => ({ objectId: row.id, practiceId: row.practice_id }),
    );
    const claims = await readWithAudit(
      scope,
      { objectType: 'claim', ...audit },
      async (client) =>
        (
          await client.query<ClaimRow>('SELECT id, practice_id, patient_control_number, payer_claim_control_number FROM claim WHERE practice_id = $1 AND NOT (patient_ref_id = ANY ($2::uuid[]))', [
            letter.practiceId,
            [...letter.patientRefIds],
          ])
        ).rows,
      (row) => ({ objectId: row.id, practiceId: row.practice_id }),
    );
    const identifiers = new Set<string>();
    const add = (value: string) => {
      const compact = compactIdentifier(value);
      if (compact.length >= 2) {
        identifiers.add(compact);
      }
    };
    for (const patient of patients) {
      add(cipher.decrypt('patient_ref.member_id', patient.member_id));
    }
    for (const claim of claims) {
      add(cipher.decrypt('claim.patient_control_number', claim.patient_control_number));
      add(cipher.decrypt('claim.payer_claim_control_number', claim.payer_claim_control_number));
    }
    return identifiers;
  };
  return {
    async holdsOtherPatient(candidates) {
      const identifiers = await (known ??= read());
      return candidates.some((candidate) => identifiers.has(compactIdentifier(candidate)));
    },
  };
}
