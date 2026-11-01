import { randomUUID } from 'node:crypto';

import { correctMapping } from '@tp/contracts';
import { readDatabaseUrl, withJobScope } from '@tp/db';
import { loadPracticeCipher } from '@tp/db/runtime';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { approvePacketVersion, logSubmission, writePacketVersion } from '../packets/services';
import { FIXED_97110, PacketWorld } from '../packets/test-support/packet-world';
import { gatherReport } from './content';

/**
 * The audit report counts, per case, the submissions sent without sign-off (the founder's ruling of 2026-10-20;
 * docs/adr/0061): gathered from the database for the run's report, on the case whose export was logged so and on no
 * other. One practice, one run over February and March: SYNTHETIC CAS-08 (plan FIX-ONE, March) and CAS-15 (plan
 * FIX-ZZ, February) under the fixed 97110 contract open two cases. CAS-08's packet is written, approved and exported;
 * its plan's mapping is then corrected, so its pricing went stale after the export; its submission is logged sent
 * without sign-off with the person's confirmation. The run stays the one in effect, and the report holds that case's
 * count alone.
 */

let w: PacketWorld;

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

describe('the audit report’s count of submissions sent without sign-off', () => {
  it('is gathered on the case whose export was logged so, and absent on the run’s other case', async () => {
    const practice = await w.practice('report-unattested');
    await w.triage.load(practice, 'CAS-08/remit.835');
    await w.triage.load(practice, 'CAS-15/remit.835');
    const contract = await w.triage.fixedContract(practice, FIXED_97110);
    const runId = await w.triage.pricedRun(practice, {
      plans: [
        { key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId },
        { key: 'CE:SYNPLAN-FIX-ZZ', versionId: contract.versionId },
      ],
      from: '2026-02-01',
      to: '2026-03-31',
    });
    const triaged = await w.triage.triage(practice, runId);
    expect(triaged).toMatchObject({ outcome: 'triaged', summary: { casesOpened: 2 } });
    const planId = await w.triage.pricing.planOf(practice, 'CE:SYNPLAN-FIX-ONE');
    const cases = await w.as(practice, practice.manager, async (scope) => (await scope.client.query<{ id: string; plan_id: string }>('SELECT id, plan_id FROM "case" WHERE practice_id = $1', [practice.practiceId])).rows);
    const sent = cases.find((item) => item.plan_id === planId)?.id ?? '';
    const other = cases.find((item) => item.plan_id !== planId)?.id ?? '';
    expect([sent, other].every((id) => id !== '')).toBe(true);

    // CAS-08's packet: written, approved by a second person, exported by the job.
    const version = await w.as(practice, practice.manager, (scope) => writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId: sent, basedOnVersionId: null, promptPayState: null, requestId: 'test-write' }));
    const second = await w.person(practice, 'billing_manager');
    await w.as(practice, second, (scope) => approvePacketVersion(scope, { practiceId: practice.practiceId, versionId: version.versionId, versionSha256: version.contentSha256, requestId: 'test-approve' }));
    expect(await w.export(practice, version.versionId)).toMatchObject({ outcome: 'exported' });

    // Its plan's mapping corrected to another contract: its pricing went stale after the export.
    const mappingId = await w.as(practice, practice.manager, async (scope) => (await scope.client.query<{ id: string }>('SELECT id FROM payer_plan_mapping WHERE practice_id = $1 AND plan_id = $2', [practice.practiceId, planId])).rows[0]?.id ?? '');
    const corrected = await w.triage.fixedContract(practice, { ...FIXED_97110, schedule: [{ code: '97110', amountCents: '2800' }] });
    await w.triage.as(practice, practice.manager, (context) =>
      correctMapping(context, { practiceId: practice.practiceId, planId, kind: 'contract', contractVersionId: corrected.versionId, effectiveFrom: '2026-01-01', supersedesId: mappingId }),
    );

    // The export already went to the payer: logged sent without sign-off, with the person's confirmation.
    const logged = await w.as(practice, practice.manager, (scope) =>
      logSubmission(scope, w.keys, { practiceId: practice.practiceId, versionId: version.versionId, submittedOn: w.today(), channel: 'payer_portal', reference: null, sentWithoutSignOff: true, requestId: 'test-submit' }),
    );
    expect(logged.sent).toEqual({ kind: 'unattested', reason: 'pricing_stale_after_export' });

    // The run's report, gathered as the report job gathers it (its line CSV's arena released unread).
    const content = await withJobScope(w.app, { jobId: randomUUID(), practiceId: practice.practiceId }, async (scope) => {
      const gathered = await gatherReport(scope, { practiceId: practice.practiceId, auditReportId: randomUUID(), pricingRunId: runId, asOf: w.today(), requestId: 'test-gather', cipher: await loadPracticeCipher(scope, w.keys, practice.practiceId) });
      gathered.arena.release();
      return gathered.content;
    });
    const byCase = new Map(content.cases.map((item) => [item.case_id, item]));
    expect(byCase.size).toBe(2);
    expect(byCase.get(sent)?.unattested_submissions).toBe(1);
    expect(byCase.get(other)).toBeDefined();
    expect(byCase.get(other)).not.toHaveProperty('unattested_submissions');
  }, 300_000);
});
