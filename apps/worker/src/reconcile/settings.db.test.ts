import { randomUUID } from 'node:crypto';

import { PermissionDeniedError, readDatabaseUrl, withPracticeScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { LedgerSettingsError, type PostingTemplate, SYNTHETIC_PM_EXPORT_V1 } from '@tp/ledger';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { type Scope, practiceLedgerSettings } from './ledger';
import { setPostingTemplate } from './settings';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * The posting-export template, mapped once at onboarding (PRD 20; PRD 13, Matching step 2;
 * docs/adr/0043), against PostgreSQL: a person who reconciles postings maps it in their own name, and
 * the database's function changes the posting_export_template key alone; the proof level stays the
 * practice administrator's. Synthetic data only.
 */

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

const OWN: PostingTemplate = {
  id: 'practice',
  system: 'SYNTHETIC PM SYSTEM B',
  columns: { posted_on: 'Posted', check_or_trace: 'Check', amount: 'Paid', payer: 'Insurer' },
  dateFormat: 'YYYY-MM-DD',
};

async function templateless(label: string): Promise<Practice> {
  const practice = await w.practice(`${label} ${randomUUID().slice(0, 8)}`, ledSettings('posted'));
  await asOwner(w.owner, [practice.practiceId], () => w.owner.query("UPDATE practice SET settings = settings - 'posting_export_template' WHERE id = $1", [practice.practiceId]));
  return practice;
}

const as = <T>(practice: Practice, actorId: string, run: (scope: Scope) => Promise<T>) => withPracticeScope(w.app, { actorId, practiceIds: [practice.practiceId] }, (scope) => run(scope as Scope));

describe('mapping the posting-export template (PRD 20)', () => {
  it('maps a built-in template or the practice’s own in the person’s name, changing nothing else, and names the exports waiting for it', async () => {
    const practice = await templateless('template');
    const waiting = await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export');
    await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export');
    const mapped = await as(practice, practice.manager, (scope) => setPostingTemplate(scope, { practiceId: practice.practiceId, template: SYNTHETIC_PM_EXPORT_V1, requestId: `test-${randomUUID()}` }));
    expect(mapped).toEqual({ waiting: [waiting] });
    expect(await as(practice, practice.manager, (scope) => practiceLedgerSettings(scope, practice.practiceId))).toEqual({ proofLevel: 'posted', postingTemplate: SYNTHETIC_PM_EXPORT_V1 });
    await as(practice, practice.manager, (scope) => setPostingTemplate(scope, { practiceId: practice.practiceId, template: OWN, requestId: `test-${randomUUID()}` }));
    const [row] = await w.rows<{ settings: Record<string, unknown> }>(practice, 'SELECT settings FROM practice WHERE id = $1', [practice.practiceId]);
    expect(row?.settings).toMatchObject({
      proof_level: 'posted',
      case_materiality_cents: '1000',
      posting_export_template: { system: 'SYNTHETIC PM SYSTEM B', columns: OWN.columns, date_format: 'YYYY-MM-DD' },
    });
    const audited = await asOwner(w.owner, [practice.practiceId], () =>
      w.owner.query<{ actor_id: string }>("SELECT actor_id FROM audit_event WHERE practice_id = $1 AND action = 'posting_template_mapped'", [practice.practiceId]),
    );
    expect(audited.rows).toEqual([{ actor_id: practice.manager }, { actor_id: practice.manager }]);
  });

  it('refuses one who does not reconcile postings, in the application and in the database, and a template the ledger cannot read back', async () => {
    const practice = await templateless('template refused');
    const admin = practice.world.adminUserId;
    await expect(as(practice, admin, (scope) => setPostingTemplate(scope, { practiceId: practice.practiceId, template: SYNTHETIC_PM_EXPORT_V1, requestId: 'test' }))).rejects.toThrow(PermissionDeniedError);
    await expect(as(practice, admin, (scope) => scope.client.query("SELECT set_practice_posting_template($1, '{\"template\":\"synthetic_pm_export_v1\"}')", [practice.practiceId]))).rejects.toMatchObject({
      code: '42501',
    });
    await expect(as(practice, practice.manager, (scope) => scope.client.query("SELECT set_practice_posting_template($1, '\"text\"')", [practice.practiceId]))).rejects.toMatchObject({ code: '23514' });
    const broken: PostingTemplate = { ...OWN, columns: { posted_on: 'Posted', amount: 'Paid' } };
    await expect(as(practice, practice.manager, (scope) => setPostingTemplate(scope, { practiceId: practice.practiceId, template: broken, requestId: 'test' }))).rejects.toThrow(LedgerSettingsError);
    // A job maps nothing: the template is a person's decision.
    await expect(
      w.triage.pricing.jobContext(practice.practiceId).transaction((scope) => scope.client.query("SELECT set_practice_posting_template($1, '{\"template\":\"synthetic_pm_export_v1\"}')", [practice.practiceId])),
    ).rejects.toMatchObject({ code: '42501' });
    expect(await as(practice, practice.manager, (scope) => practiceLedgerSettings(scope, practice.practiceId))).toEqual({ proofLevel: 'posted', postingTemplate: null });
  });
});
