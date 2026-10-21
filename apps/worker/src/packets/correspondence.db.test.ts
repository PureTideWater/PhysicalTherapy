import { randomUUID } from 'node:crypto';

import { PermissionDeniedError, readDatabaseUrl, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { CORRESPONDENCE_CONTACT_KEY, CorrespondenceContactError, SYNTHETIC_CORRESPONDENCE_CONTACT } from '@tp/packets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { practiceCorrespondenceContact, setCorrespondenceContact } from './correspondence';
import { PacketWorld } from './test-support/packet-world';

/**
 * The practice's correspondence contact against PostgreSQL (audit item #37 part 1, D6, DB4; the founder's ruling of
 * 2026-10-20; docs/adr/0061): the practice administrator sets it in their own name, with one audit event that holds
 * no value; a billing manager is refused by the role check, and the same UPDATE run in their own scope changes no row
 * (the restrictive practice_administrators_update policy); another practice's administrator cannot reach it; every
 * other key of practice.settings is kept; and a value that is not a contact in its stored form reads as malformed.
 * SYNTHETIC contacts only.
 */

let w: PacketWorld;

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const OTHER = { name: 'SYNTHETIC PROVIDER RELATIONS DESK', phone: '(828) 555-0199' };
const LEDGER = { proof_level: 'deposited', posting_export_template: { template: 'synthetic_pm_export_v1' } };

const settingsOf = async (practice: Practice): Promise<Record<string, unknown>> =>
  (await asOwner(w.owner, [practice.practiceId], () => w.owner.query<{ settings: Record<string, unknown> }>('SELECT settings FROM practice WHERE id = $1', [practice.practiceId]))).rows[0]?.settings ?? {};

const set = (practice: Practice, actorId: string, contact: Parameters<typeof setCorrespondenceContact>[1]['contact'], scopeOf: Practice = practice) =>
  w.as(scopeOf, actorId, (scope) => setCorrespondenceContact(scope, { practiceId: practice.practiceId, contact, requestId: `test-${randomUUID()}` }));

async function refusal(attempt: Promise<unknown>): Promise<Error> {
  const error = await attempt.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, 'the step should have been refused').toBeInstanceOf(Error);
  return error as Error;
}

describe('the correspondence contact (DB4)', () => {
  it('is set by the practice administrator in their own name, once per save, with an audit event that holds no value, and every other setting kept', async () => {
    const practice = await w.practice('contact-admin', LEDGER, { contact: false });
    const admin = practice.world.adminUserId;
    expect(await w.as(practice, admin, (scope) => practiceCorrespondenceContact(scope.client, practice.practiceId))).toEqual({ state: 'missing' });
    const before = await settingsOf(practice);
    const stored = await set(practice, admin, { ...OTHER, phone_extension: '', email: '', address: null });
    expect(stored).toEqual({ name: OTHER.name, phone: '8285550199' });
    expect(await w.as(practice, practice.manager, (scope) => practiceCorrespondenceContact(scope.client, practice.practiceId))).toEqual({ state: 'set', contact: stored });
    // Replaced, never cleared: the second save holds the new contact alone.
    await set(practice, admin, SYNTHETIC_CORRESPONDENCE_CONTACT);
    const after = await settingsOf(practice);
    expect(after).toEqual({ ...before, [CORRESPONDENCE_CONTACT_KEY]: SYNTHETIC_CORRESPONDENCE_CONTACT });
    expect(after).toMatchObject({ proof_level: 'deposited', posting_export_template: { template: 'synthetic_pm_export_v1' }, default_rounding: 'HALF_UP_CENT', place_of_service_settings: { '11': 'non_facility' } });
    const { rows } = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<Record<string, unknown>>("SELECT actor_id, action, object_type, object_id, practice_id, purpose FROM audit_event WHERE practice_id = $1 AND action = 'correspondence_contact_set' ORDER BY at, id", [
        practice.practiceId,
      ]),
    );
    expect(rows).toEqual([
      { actor_id: admin, action: 'correspondence_contact_set', object_type: 'practice', object_id: practice.practiceId, practice_id: practice.practiceId, purpose: null },
      { actor_id: admin, action: 'correspondence_contact_set', object_type: 'practice', object_id: practice.practiceId, practice_id: practice.practiceId, purpose: null },
    ]);
    for (const value of [OTHER.name, '8285550199', SYNTHETIC_CORRESPONDENCE_CONTACT.email ?? '', SYNTHETIC_CORRESPONDENCE_CONTACT.name]) {
      expect(JSON.stringify(rows)).not.toContain(value);
    }
  });

  it('refuses a billing manager by role, and Postgres changes no row for the same UPDATE in their scope', async () => {
    const practice = await w.practice('contact-manager', {}, { contact: false });
    expect(await refusal(set(practice, practice.manager, OTHER))).toBeInstanceOf(PermissionDeniedError);
    const { rowCount } = await w.as(practice, practice.manager, (scope) =>
      scope.client.query(`UPDATE practice SET settings = jsonb_set(settings, '{${CORRESPONDENCE_CONTACT_KEY}}', $2::jsonb) WHERE id = $1`, [practice.practiceId, JSON.stringify(SYNTHETIC_CORRESPONDENCE_CONTACT)]),
    );
    expect(rowCount).toBe(0);
    expect(await settingsOf(practice)).not.toHaveProperty(CORRESPONDENCE_CONTACT_KEY);
  });

  it('cannot be reached by another practice’s administrator (cross-tenant)', async () => {
    const practice = await w.practice('contact-tenant', {}, { contact: false });
    const other = await w.practice('contact-other-tenant');
    // The service refuses a practice the person does not reach.
    expect(await refusal(set(practice, other.world.adminUserId, OTHER, other))).toBeInstanceOf(PermissionDeniedError);
    // And Postgres changes no row of it, in the other administrator's own scope or naming this practice.
    for (const practiceIds of [[other.practiceId], [practice.practiceId]]) {
      const { rowCount } = await withPracticeScope(w.app, { actorId: other.world.adminUserId, practiceIds }, (scope) =>
        scope.client.query(`UPDATE practice SET settings = jsonb_set(settings, '{${CORRESPONDENCE_CONTACT_KEY}}', $2::jsonb) WHERE id = $1`, [practice.practiceId, JSON.stringify(OTHER)]),
      );
      expect(rowCount).toBe(0);
    }
    expect(await withPracticeScope(w.app, { actorId: other.world.adminUserId, practiceIds: [other.practiceId] }, (scope) => practiceCorrespondenceContact(scope.client, practice.practiceId))).toEqual({ state: 'missing' });
    expect(await settingsOf(practice)).not.toHaveProperty(CORRESPONDENCE_CONTACT_KEY);
  });

  it('refuses a contact by its field before anything is written, and reads a stored value not in its stored form as malformed', async () => {
    const practice = await w.practice('contact-malformed', {}, { contact: false });
    const admin = practice.world.adminUserId;
    expect(await refusal(set(practice, admin, { name: 'SYNTHETIC OFFICE', phone: '555-0100' }))).toMatchObject({ name: 'CorrespondenceContactError', field: 'phone' });
    expect(await refusal(set(practice, admin, { name: ' ', phone: '9195550100' }))).toBeInstanceOf(CorrespondenceContactError);
    expect(await settingsOf(practice)).not.toHaveProperty(CORRESPONDENCE_CONTACT_KEY);
    await w.superuser(`UPDATE practice SET settings = settings || jsonb_build_object('${CORRESPONDENCE_CONTACT_KEY}', jsonb_build_object('name', 'SYNTHETIC OFFICE', 'phone', '(919) 555-0100')) WHERE id = $1`, [practice.practiceId]);
    expect(await w.as(practice, admin, (scope) => practiceCorrespondenceContact(scope.client, practice.practiceId))).toEqual({ state: 'malformed' });
  });
});
