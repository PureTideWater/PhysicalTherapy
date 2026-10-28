import type { Practice } from '../../price/test-support/pricing-world';
import type { TriageWorld } from './triage-world';

/**
 * For the tests (CAS-41, SUITE-CAP-1a; docs/adr/0083): the CAS fixtures' runs as triage.db.test.ts and report.db.test.ts
 * set them up, each in a practice of its own, priced and ready for its triage or report on CAS_AS_OF, so the batched
 * triage and the streamed report can be compared with the whole reads through the jobs: cases by pattern (CAS-03), an
 * anomaly (CAS-02), a pattern held below the case materiality that a later run carries across (CAS-04), a line below
 * the line materiality (CAS-05), an overpaid line (PRC-15), windows that passed after an earlier triage opened their
 * case (PRC-14), a per-visit visit (PRC-07), and windows uncited or cited in a rule the product does not compute (D17 a).
 * SYNTHETIC fixtures only.
 */

/** The date every CAS run is triaged and reported on: after PRC-14's windows closed, and never after the day the tests run. */
export const CAS_AS_OF = '2026-10-26';

const FIXED = { schedule: [{ code: '97110', amountCents: '5000' }], effectiveFrom: '2026-01-01', disputeWindowDays: 3650 };

export interface CasRun {
  readonly label: string;
  readonly setup: (world: TriageWorld, label: string) => Promise<{ readonly practice: Practice; readonly runId: string }>;
}

async function twoPlans(world: TriageWorld, label: string, two: Partial<Parameters<TriageWorld['fixedContract']>[1]> = {}): Promise<{ readonly practice: Practice; readonly runId: string }> {
  const practice = await world.practice(label);
  await world.load(practice, 'CAS-03/remit.835');
  const one = await world.fixedContract(practice, FIXED);
  const second = await world.fixedContract(practice, { ...FIXED, schedule: [{ code: '97530', amountCents: '5200' }], ...two });
  const runId = await world.pricedRun(practice, {
    plans: [
      { key: 'CE:SYNPLAN-FIX-ONE', versionId: one.versionId },
      { key: 'CE:SYNPLAN-FIX-TWO', versionId: second.versionId },
    ],
    from: '2026-03-01',
    to: '2026-03-31',
  });
  return { practice, runId };
}

export const CAS_RUNS: readonly CasRun[] = [
  { label: 'CAS-03 two cases', setup: (world, label) => twoPlans(world, label) },
  {
    label: 'CAS-02 an anomaly',
    setup: async (world, label) => {
      const practice = await world.practice(label, { anomaly_threshold_cents: '1000' });
      await world.load(practice, 'CAS-02/remit.835');
      const runId = await world.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-OON-CAS', versionId: null, kind: 'no_agreement' }], from: '2026-04-01', to: '2026-06-30' });
      return { practice, runId };
    },
  },
  {
    label: 'CAS-04 a held pattern carried across',
    setup: async (world, label) => {
      const practice = await world.practice(label);
      await world.load(practice, 'CAS-04/remit.835');
      const contract = await world.fixedContract(practice, FIXED);
      const may = await world.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-05-01', to: '2026-05-31' });
      await world.triage(practice, may, CAS_AS_OF);
      await world.load(practice, 'CAS-03/remit.835');
      const runId = await world.pricedRun(practice, {
        plans: [
          { key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId },
          { key: 'CE:SYNPLAN-FIX-TWO', versionId: null, kind: 'no_agreement' },
        ],
        from: '2026-03-01',
        to: '2026-03-31',
      });
      return { practice, runId };
    },
  },
  {
    label: 'CAS-05 below the line materiality',
    setup: async (world, label) => {
      const practice = await world.practice(label);
      await world.load(practice, 'CAS-05/remit.835');
      const contract = await world.fixedContract(practice, FIXED);
      return { practice, runId: await world.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: contract.versionId }], from: '2026-03-01', to: '2026-03-31' }) };
    },
  },
  {
    label: 'PRC-15 overpaid',
    setup: async (world, label) => {
      const practice = await world.practice(label);
      await world.load(practice, 'CAS-05/remit.835');
      const low = await world.fixedContract(practice, { ...FIXED, schedule: [{ code: '97110', amountCents: '4000' }] });
      return { practice, runId: await world.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-FIX-ONE', versionId: low.versionId }], from: '2026-03-01', to: '2026-03-31' }) };
    },
  },
  {
    label: 'PRC-14 windows passed after their case opened',
    setup: async (world, label) => {
      const run = await twoPlans(world, label, { disputeWindowDays: 30 });
      // Judged on 2026-04-15 both windows are open: two cases; by CAS_AS_OF plan two's have passed.
      await world.triage(run.practice, run.runId, '2026-04-15');
      return run;
    },
  },
  {
    label: 'PRC-07 a visit short',
    setup: async (world, label) => {
      const practice = await world.practice(label, { case_materiality_cents: '1' });
      await world.load(practice, 'PRC-07/remit.835');
      const contract = await world.perVisitContract(practice, { codes: ['97110', '97140', '97530'], amountCents: '20000', effectiveFrom: '2026-01-01', disputeWindowDays: 3650 });
      return { practice, runId: await world.pricedRun(practice, { plans: [{ key: 'CE:SYNPLAN-COMM-VISIT', versionId: contract.versionId }], from: '2026-05-01', to: '2026-05-31' }) };
    },
  },
  { label: 'D17 a window uncited', setup: (world, label) => twoPlans(world, label, { windowCited: false }) },
  { label: 'D17 a window in business days', setup: (world, label) => twoPlans(world, label, { disputeWindowDays: 10, windowRule: { unit: 'business_days', measuredFrom: 'payment_date' } }) },
];
