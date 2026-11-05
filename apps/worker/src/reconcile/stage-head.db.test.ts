import { randomUUID } from 'node:crypto';

import { readDatabaseUrl, withJobScope } from '@tp/db';
import { asOwner } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';

/**
 * CAS-40.6 (SUITE-CAP-1b; migration 20261109090000; docs/adr/0083): a line's head row follows its stage events through
 * the ledger's stages. One case line of the SYNTHETIC LED-06 scenario goes to payer approved by the ledger's approval,
 * to recovered once its posting and deposit are matched, and back to actionable when a recoupment takes the money back
 * (rule 4's one admitted reopen in no one's name). The ledger's own refusals stand, and after every step the line's head
 * row equals its latest event by seq. The rules are a guard (they hold today); the head-row assertions fail before the
 * migration, which has no table to read. Synthetic data only.
 */

const NOT_RECOVERED = 'the ledger holds no entries that put the line at recovered: nothing counts as recovered without a posted or deposited entry';
const LEDGER_BACK = 'the ledger moves a line back only to the stage its entries leave it at';
const REASON = 'enc:v1:U1lOVEhFVElDLVJFQVNPTg';

let w: LedgerWorld;

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

/** A stage event written as a job of the practice (in no one's name), settled to its outcome. */
async function asJob(practice: Practice, serviceLineId: string, stage: string, reopenedFrom: string | null = null): Promise<'accepted' | { code: string; message: string }> {
  try {
    await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) =>
      scope.client.query('INSERT INTO line_status (practice_id, service_line_id, stage, reason, reopened_from) VALUES ($1, $2, $3, $4, $5)', [
        practice.practiceId,
        serviceLineId,
        stage,
        reopenedFrom === null ? null : REASON,
        reopenedFrom,
      ]),
    );
    return 'accepted';
  } catch (error) {
    const { code, message } = error as { code?: string; message?: string };
    return { code: code ?? 'error', message: message ?? '' };
  }
}

/** The line's head row and its latest event by seq, each as stage@seq, read as the owner in the practice's scope. */
async function headAndLatest(practice: Practice, serviceLineId: string): Promise<{ head: string | null; latest: string | null }> {
  const { rows } = await asOwner(w.owner, [practice.practiceId], () =>
    w.owner.query(
      `SELECT (SELECT h.stage || '@' || h.seq FROM line_status_head h WHERE h.service_line_id = $1) AS head,
              (SELECT s.stage || '@' || s.seq FROM line_status s WHERE s.service_line_id = $1 ORDER BY s.seq DESC LIMIT 1) AS latest`,
      [serviceLineId],
    ),
  );
  return rows[0] as { head: string | null; latest: string | null };
}

async function expectHeadAt(practice: Practice, serviceLineId: string, stage: string): Promise<void> {
  const { head, latest } = await headAndLatest(practice, serviceLineId);
  expect(head).toBe(latest);
  expect(head?.split('@')[0]).toBe(stage);
}

describe('the head row through the ledger’s stages (CAS-40.6)', () => {
  it('follows payer approved, recovered and the ledger’s reopen, and the ledger’s refusals stand', async () => {
    const practice = await w.practice(`CAS-40.6 ${randomUUID().slice(0, 8)}`, ledSettings());
    const { serviceLineId } = await w.caseFor(practice, 'LED-06/original.835');
    await expectHeadAt(practice, serviceLineId, 'actionable');

    // The adjusted remittance approves more: the ledger's entry puts the line at payer approved, and the reconcile job
    // writes the stage event, which the trigger accepts.
    await w.load(practice, 'LED-06/adjusted.835');
    await w.reconcile(practice);
    await expectHeadAt(practice, serviceLineId, 'payer_approved');

    // Recovered is refused until a posted or deposited entry stands behind it.
    expect(await asJob(practice, serviceLineId, 'recovered')).toEqual({ code: '23514', message: NOT_RECOVERED });
    await expectHeadAt(practice, serviceLineId, 'payer_approved');
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/posting-export.csv', 'posting_export') });
    await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-06/eft-export.csv', 'eft_export') });
    await expectHeadAt(practice, serviceLineId, 'recovered');

    // While the entries leave the line at recovered, no reopen in no one's name moves it anywhere.
    for (const stage of ['actionable', 'payer_approved', 'validated', 'flagged']) {
      expect(await asJob(practice, serviceLineId, stage, 'recovered'), stage).toEqual({ code: '23514', message: LEDGER_BACK });
      await expectHeadAt(practice, serviceLineId, 'recovered');
    }

    // The recoupment leaves the ledger at actionable: the ledger's reopen from recovered back to actionable is accepted.
    await w.load(practice, 'LED-06/recoupment.835');
    await w.reconcile(practice);
    await expectHeadAt(practice, serviceLineId, 'actionable');
    const [reopen] = await w.rows<{ reopened_from: string; set_by: string | null }>(
      practice,
      'SELECT reopened_from, set_by FROM line_status WHERE service_line_id = $1 ORDER BY seq DESC LIMIT 1',
      [serviceLineId],
    );
    expect(reopen).toEqual({ reopened_from: 'recovered', set_by: null });

    // Moving it forward again without new entries is refused, and the head row stays.
    expect(await asJob(practice, serviceLineId, 'payer_approved')).toMatchObject({ code: '23514' });
    await expectHeadAt(practice, serviceLineId, 'actionable');
  }, 300_000);
});
