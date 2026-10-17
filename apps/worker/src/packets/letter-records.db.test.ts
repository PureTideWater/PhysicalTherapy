import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withPracticeScope } from '@tp/db';
import type { PracticeScope, ScopeClient } from '@tp/db/runtime';
import { asOwner } from '@tp/db/testing';
import { identifierCandidates } from '@tp/model-gateway';
import { localGateway, registerOutput, syntheticLetterInput, syntheticLetterOutput } from '@tp/model-gateway/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type Practice, PricingWorld } from '../price/test-support/pricing-world';
import { otherPatientRecords } from './letter-records';

/**
 * The practice's records asked whether a payer letter names another patient (PRD 14, PHI minimization:
 * "never sends more than one patient's material in one call"; the denial-letter reader, v1.5): yes for
 * a member ID or claim number of another patient of the practice however the letter spaces it, no for
 * the letter's own patient and for anything the practice does not hold; the read is audited. Two
 * SYNTHETIC 835s give the practice two patients.
 */

let w: PricingWorld;
let practice: Practice;

interface Patient {
  readonly id: string;
  readonly memberId: string | null;
  readonly claimNumbers: readonly string[];
}

let patients: Patient[] = [];

beforeAll(async () => {
  w = await PricingWorld.open(readDatabaseUrl());
  practice = await w.practice('LETTER RECORDS');
  await w.load(practice, 'CAS-01/remit.835');
  await w.load(practice, 'CAS-08/remit.835');
  const rows = await asOwner(w.owner, [practice.practiceId], async () =>
    (
      await w.owner.query<{ id: string; member_id: string | null; patient_control_number: string; payer_claim_control_number: string }>(
        `SELECT p.id, p.member_id, c.patient_control_number, c.payer_claim_control_number FROM patient_ref p JOIN claim c ON c.patient_ref_id = p.id WHERE p.practice_id = $1 ORDER BY p.id`,
        [practice.practiceId],
      )
    ).rows,
  );
  const byPatient = new Map<string, Patient>();
  for (const row of rows) {
    const known = byPatient.get(row.id) ?? { id: row.id, memberId: row.member_id === null ? null : practice.cipher.decrypt('patient_ref.member_id', row.member_id), claimNumbers: [] };
    byPatient.set(row.id, {
      ...known,
      claimNumbers: [...known.claimNumbers, practice.cipher.decrypt('claim.patient_control_number', row.patient_control_number), practice.cipher.decrypt('claim.payer_claim_control_number', row.payer_claim_control_number)],
    });
  }
  patients = [...byPatient.values()];
}, 120_000);

afterAll(async () => {
  await w.close();
});

const asManager = <T>(run: (scope: PracticeScope<ScopeClient>) => Promise<T>) => withPracticeScope(w.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, run);

describe('another patient of the practice in a letter (the denial-letter reader’s records check)', () => {
  it('answers yes for another patient’s member ID or claim number, however the letter spaces it, and no for the letter’s own patient', async () => {
    expect(patients.length).toBeGreaterThanOrEqual(2);
    const [first, second] = patients as [Patient, Patient];
    expect([first.memberId, second.memberId].every((memberId) => memberId !== null && memberId !== '')).toBe(true);
    const requestId = `test-${randomUUID()}`;
    const answers = await asManager(async (scope) => {
      const check = otherPatientRecords(scope, practice.cipher, { practiceId: practice.practiceId, patientRefIds: [first.id], requestId });
      const spaced = (value: string) => `${value.slice(0, 3)} ${value.slice(3)}`;
      return {
        own: await check.holdsOtherPatient(identifierCandidates(`Claim ${first.claimNumbers.join(' and ')}${first.memberId === null ? '' : `, member ${first.memberId}`}.`)),
        otherClaim: await check.holdsOtherPatient(identifierCandidates(`Also claim ${spaced(second.claimNumbers[1] ?? '')}.`)),
        otherAccount: await check.holdsOtherPatient(identifierCandidates(`Patient account ${second.claimNumbers[0] ?? ''}.`)),
        otherMember: await check.holdsOtherPatient(identifierCandidates(`Member ID ${spaced(second.memberId ?? '')}.`)),
        unknown: await check.holdsOtherPatient(['SYNNOTHELD12345']),
        none: await check.holdsOtherPatient([]),
      };
    });
    expect(answers).toEqual({ own: false, otherClaim: true, otherAccount: true, otherMember: true, unknown: false, none: false });
    // The read is audited, as the person, under its own purpose; nothing of the records is returned.
    const events = await asOwner(w.owner, [practice.practiceId], async () =>
      (await w.owner.query<{ object_type: string; actor_id: string }>("SELECT DISTINCT object_type, actor_id FROM audit_event WHERE request_id = $1 AND purpose = 'letter_screen' ORDER BY object_type", [requestId])).rows,
    );
    expect(events).toEqual([
      { object_type: 'claim', actor_id: practice.manager },
      { object_type: 'patient_ref', actor_id: practice.manager },
    ]);
  });

  it('stops the gateway from sending a letter that lists a second patient of the practice', async () => {
    const [first, second] = patients as [Patient, Patient];
    await asManager(async (scope) => {
      const otherPatients = otherPatientRecords(scope, practice.cipher, { practiceId: practice.practiceId, patientRefIds: [first.id], requestId: `test-${randomUUID()}` });
      const base = syntheticLetterInput({ otherPatients });
      const input = { ...base, text: `${base.text}\nAlso reviewed: claim ${second.claimNumbers[1] ?? ''}.` };
      const { gateway, local, store } = localGateway({ flags: [{ key: 'model.read_denial_letter', scope: 'global', scopeId: null, value: true }], organizations: { [practice.practiceId]: practice.world.organizationId } });
      registerOutput(local, 'readDenialLetter', input, syntheticLetterOutput());
      await expect(gateway.readDenialLetter({ practiceId: practice.practiceId, requestKey: 'letter-records' }, input)).rejects.toMatchObject({ code: 'more_than_one_patient' });
      expect(local.requests).toEqual([]);
      expect(store.calls).toEqual([]);
    });
  });
});
