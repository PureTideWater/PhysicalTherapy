import { randomUUID } from 'node:crypto';

import { readDatabaseUrl } from '@tp/db';
import { cents } from '@tp/money';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import type { Scope } from './ledger';
import { adjustEntry, matchClaimByHand, matchDepositByHand, matchPostingByHand, reverseMatch } from './manual';
import { setLedgerSettings } from './settings';
import type * as Postings from './postings';
import type * as Remittances from './remittances';
import type * as Stages from './stages';
import type * as PerLine from './test-support/per-line';
import { LedgerWorld, ledSettings } from './test-support/ledger-world';
import { type ManualOutcome, type ManualStep, type SideResult, clone, compare, idsBefore, runManualSide, template } from './test-support/pass-compare';

/**
 * CAS-49.4 (SUITE-CAP-3 D3, D5 to D7; docs/adr/0087; design section 7, completeness check): a person's manual actions.
 * manual.ts is unchanged but calls changed code: finish() and adjustEntry call syncLineStages (D3), matchPostingByHand
 * calls postingDecision (D7) and, with matchDepositByHand, settleMatches (D6), and matchClaimByHand calls lineChain
 * (D5) and reprocessingOf (D2's optional argument, none passed). Each world below is built once and frozen as a
 * template; each of its sequences of actions runs twice, on a clone each, in the person's request scope on the app's
 * login (as the web's Reconciliation routes run them through @tp/worker/ledger): once as shipped, and once with
 * ./stages, ./postings and ./remittances' changed exports swapped for test-support/per-line.ts' copies (vi.mock is per
 * file, so this file holds the swap). The writes are compared as CAS-49.1 compares them (every row by its insertion
 * order, the person as set_by and created_by, the audit events with their actor, ledger_entry.reason,
 * ledger_match.reversal_reason and every stage note by the hash of their decrypted text), and so are the refusals
 * (ReconciliationError's codes) for the same bad inputs.
 *
 * - LED-07's world (the proof level posted): a posting row with a typo, matched by hand to a remittance that is none
 *   (refused) and to its own; matched again (refused); its claim match's reversal refused while the posting proves it;
 *   the posting reversed (the line back to payer approved with the reversal note); the approval adjusted by the
 *   specialist; the claim match reversed; reversed again (refused).
 * - LED-02's world (the proof level deposited): EFT rows with a typo, one off by a cent (refused) and one matched by
 *   hand (the line recovered); the claim match's reversal refused while the deposit proves it; the deposit and then the
 *   claim match reversed (a person's unmatch); the same claim matched again by hand (lineChain over the reversed match)
 *   and again (refused); a claim that is no claim (refused); the new approval adjusted, and adjusted by nothing
 *   (refused).
 * - LED-02's line twice in one practice (two claims, two lines): one line proved by a posting row alone while the proof
 *   level was deposited, the other by a deposit; the level then lowered to posted, which no event follows until a
 *   person's next action; the deposit reversed by a person. That action's one stage sync moves the first line forward
 *   to recovered and the second back to payer approved, and the line the posting proves is the one whose service line
 *   sorts first, so today's order (by service line) and an order grouped by stage part: D3's order is held.
 *
 * Fails first with D3 grouping a person's events by stage (every payer approved, then every recovered). Synthetic data
 * only; a difference names its table, ordinal and column, never a value.
 */

/** Whether the per-line copies serve manual.ts' imports (the reference side), and the copies themselves once loaded. */
const swap = vi.hoisted(() => ({ reference: false, perLine: undefined as undefined | typeof PerLine }));
const perLine = () => {
  if (swap.perLine === undefined) {
    throw new Error('the per-line copies are not loaded');
  }
  return swap.perLine;
};

vi.mock('./stages', async (importOriginal) => {
  const shipped = await importOriginal<typeof Stages>();
  return { ...shipped, syncLineStages: (...args: Parameters<typeof shipped.syncLineStages>) => (swap.reference ? perLine().syncLineStages(...args) : shipped.syncLineStages(...args)) };
});
vi.mock('./postings', async (importOriginal) => {
  const shipped = await importOriginal<typeof Postings>();
  return {
    ...shipped,
    // The per-line copy takes no pass's claims (D7's last argument), which a person's match never passes.
    postingDecision: (...args: Parameters<typeof shipped.postingDecision>) => (swap.reference ? perLine().postingDecision(args[0], args[1], args[2], args[3], args[4]) : shipped.postingDecision(...args)),
    settleMatches: (...args: Parameters<typeof shipped.settleMatches>) => (swap.reference ? perLine().settleMatches(...args) : shipped.settleMatches(...args)),
  };
});
vi.mock('./remittances', async (importOriginal) => {
  const shipped = await importOriginal<typeof Remittances>();
  return {
    ...shipped,
    lineChain: (...args: Parameters<typeof shipped.lineChain>) => (swap.reference ? perLine().lineChain(...args) : shipped.lineChain(...args)),
    // The per-line copy takes no pass's claim lines (D2's last argument), which a person's match never passes.
    reprocessingOf: (...args: Parameters<typeof shipped.reprocessingOf>) => (swap.reference ? perLine().reprocessingOf(args[0], args[1], args[2], args[3]) : shipped.reprocessingOf(...args)),
  };
});

const adminUrl = readDatabaseUrl();
let w: LedgerWorld;
let database: { readonly name: string; readonly url: string } | undefined;
const clones: { drop: () => Promise<void> }[] = [];

/** A world's practice and the sequence of actions a person takes in it, each step's inputs read from the side's own rows. */
interface Sequence {
  readonly practice: Practice;
  readonly steps: readonly ManualStep[];
}
const sequences = new Map<string, Sequence>();

/** A row's ID read in the step's own scope (the side's clone), by a fixed query naming no input. */
async function idOf(scope: Scope, sql: string, values: unknown[] = []): Promise<string> {
  const { rows } = await scope.client.query<{ id: string }>(sql, values);
  const [row] = rows;
  if (row === undefined) {
    throw new Error('the world holds no such row');
  }
  return row.id;
}

/** A practice's LED case open and the fixture's adjusted remittance reconciled (ledger.db.test.ts' scenario). */
async function scenario(id: string, proofLevel: 'posted' | 'deposited'): Promise<Practice> {
  const practice = await w.practice(`CAS-49.4 ${id} ${randomUUID().slice(0, 8)}`, ledSettings(proofLevel));
  await w.caseFor(practice, `${id}/original.835`);
  await w.load(practice, `${id}/adjusted.835`);
  await w.reconcile(practice);
  return practice;
}

/** A fixed UUID no row holds, the same on both sides (so a refusal's inputs are the same). */
const NO_ROW = '00000000-0000-4000-8000-000000000049';

const CLAIM_MATCH = "SELECT id FROM ledger_match WHERE kind = 'claim' AND reversed_at IS NULL ORDER BY seq";

async function led07(): Promise<Sequence> {
  const practice = await scenario('LED-07', 'posted');
  await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-07/posting-export.csv', 'posting_export') });
  const { practiceId, manager } = practice;
  const row = (scope: Scope) => idOf(scope, 'SELECT id FROM posting_row');
  const adjusted = (scope: Scope) => idOf(scope, "SELECT remittance_id AS id FROM ledger_match WHERE kind = 'claim'");
  const steps: ManualStep[] = [
    { actorId: manager, run: async (c) => matchPostingByHand(c, { practiceId, postingRowId: await row(c.scope), remittanceId: NO_ROW }) },
    { actorId: manager, run: async (c) => matchPostingByHand(c, { practiceId, postingRowId: await row(c.scope), remittanceId: await adjusted(c.scope) }) },
    { actorId: manager, run: async (c) => matchPostingByHand(c, { practiceId, postingRowId: await row(c.scope), remittanceId: await adjusted(c.scope) }) },
    { actorId: manager, run: async (c) => reverseMatch(c, { practiceId, matchId: await idOf(c.scope, CLAIM_MATCH), reason: 'SYNTHETIC not this claim' }) },
    { actorId: manager, run: async (c) => reverseMatch(c, { practiceId, matchId: await idOf(c.scope, "SELECT id FROM ledger_match WHERE kind = 'posting' AND reversed_at IS NULL"), reason: 'SYNTHETIC wrong check' }) },
    { actorId: w.specialist, run: async (c) => adjustEntry(c, { practiceId, entryId: await idOf(c.scope, "SELECT id FROM ledger_entry WHERE stage = 'approved'"), amountCents: cents(-1000n), reason: 'SYNTHETIC review' }) },
    { actorId: manager, run: async (c) => reverseMatch(c, { practiceId, matchId: await idOf(c.scope, CLAIM_MATCH), reason: 'SYNTHETIC not this claim' }) },
    { actorId: manager, run: async (c) => reverseMatch(c, { practiceId, matchId: await idOf(c.scope, "SELECT id FROM ledger_match WHERE kind = 'claim' ORDER BY seq LIMIT 1"), reason: 'again' }) },
  ];
  return { practice, steps };
}

async function led02(): Promise<Sequence> {
  const practice = await scenario('LED-02', 'deposited');
  const bytes = Buffer.from('Date,Description,Trace Number,Amount,Batch Reference\r\n2026-06-09,SYNTHETIC PAYER L HCCLAIMPMT,SYNTYPO,30.00,\r\n2026-06-10,SYNTHETIC PAYER L HCCLAIMPMT,SYNTYPO2,29.99,\r\n');
  await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export', bytes) });
  const { practiceId, manager } = practice;
  const eft = (scope: Scope, amount: string) => idOf(scope, 'SELECT id FROM eft_row WHERE amount_cents = $1', [amount]);
  const adjusted = (scope: Scope) => idOf(scope, "SELECT remittance_id AS id FROM ledger_match WHERE kind = 'claim' ORDER BY seq LIMIT 1");
  const correction = (scope: Scope) => idOf(scope, "SELECT claim_id AS id FROM ledger_match WHERE kind = 'claim' ORDER BY seq LIMIT 1");
  const line = (scope: Scope) => idOf(scope, 'SELECT service_line_id AS id FROM case_line');
  const steps: ManualStep[] = [
    { actorId: manager, run: async (c) => matchDepositByHand(c, { practiceId, eftRowId: await eft(c.scope, '2999'), remittanceId: await adjusted(c.scope) }) },
    { actorId: manager, run: async (c) => matchDepositByHand(c, { practiceId, eftRowId: await eft(c.scope, '3000'), remittanceId: await adjusted(c.scope) }) },
    { actorId: manager, run: async (c) => matchDepositByHand(c, { practiceId, eftRowId: await eft(c.scope, '3000'), remittanceId: await adjusted(c.scope) }) },
    { actorId: manager, run: async (c) => reverseMatch(c, { practiceId, matchId: await idOf(c.scope, CLAIM_MATCH), reason: 'SYNTHETIC not this claim' }) },
    { actorId: manager, run: async (c) => reverseMatch(c, { practiceId, matchId: await idOf(c.scope, "SELECT id FROM ledger_match WHERE kind = 'deposit' AND reversed_at IS NULL"), reason: 'SYNTHETIC wrong deposit' }) },
    { actorId: manager, run: async (c) => reverseMatch(c, { practiceId, matchId: await idOf(c.scope, CLAIM_MATCH), reason: 'SYNTHETIC unmatched by a person' }) },
    { actorId: manager, run: async (c) => matchClaimByHand(c, { practiceId, claimId: await correction(c.scope), serviceLineId: await line(c.scope) }) },
    { actorId: manager, run: async (c) => matchClaimByHand(c, { practiceId, claimId: await correction(c.scope), serviceLineId: await line(c.scope) }) },
    { actorId: manager, run: async (c) => matchClaimByHand(c, { practiceId, claimId: NO_ROW, serviceLineId: await line(c.scope) }) },
    { actorId: w.specialist, run: async (c) => adjustEntry(c, { practiceId, entryId: await idOf(c.scope, "SELECT e.id FROM ledger_entry e JOIN ledger_match m ON m.id = e.match_id WHERE e.stage = 'approved' AND m.reversed_at IS NULL"), amountCents: cents(-500n), reason: 'SYNTHETIC review' }) },
    { actorId: w.specialist, run: async (c) => adjustEntry(c, { practiceId, entryId: await idOf(c.scope, "SELECT e.id FROM ledger_entry e JOIN ledger_match m ON m.id = e.match_id WHERE e.stage = 'approved' AND m.reversed_at IS NULL"), amountCents: cents(0n), reason: 'SYNTHETIC nothing' }) },
  ];
  return { practice, steps };
}


/** LED-02's line twice in one practice: the original, the adjusted remittance and their copies under other numbers. */
async function twoLines(): Promise<Sequence> {
  const practice = await w.practice(`CAS-49.4 two lines ${randomUUID().slice(0, 8)}`, ledSettings('deposited'));
  // Its numbers, trace and control numbers (ISA13, IEA02, GS06 and GE02 all hold the group's number) replaced.
  const copy = (control: string): (readonly [string, string])[] => [
    ['SYNPCNLED02001', 'SYNPCNLED02X01'],
    ['SYNCCNLED020001', 'SYNCCNLED02X001'],
    ['SYNCCNLED020002', 'SYNCCNLED02X002'],
    ['SYNEFTLED02001', 'SYNEFTLED02X01'],
    ['SYNEFTLED02002', 'SYNEFTLED02X02'],
    [control, `${control.slice(0, -2)}91`],
  ];
  await w.caseFor(practice, 'LED-02/original.835');
  await w.triage.pricing.loadVariant(practice, 'LED-02/original.835', copy('60020001'));
  const runId = await w.triage.pricedRun(practice, { plans: [], from: '2026-03-01', to: '2026-03-31' });
  await w.triage.triage(practice, runId);
  await w.load(practice, 'LED-02/adjusted.835');
  await w.triage.pricing.loadVariant(practice, 'LED-02/adjusted.835', copy('60020002'));
  await w.reconcile(practice);
  const lines = await w.rows<{ service_line_id: string; trace: string }>(
    practice,
    `SELECT m.service_line_id, r.trn02 AS trace FROM ledger_match m JOIN remittance r ON r.id = m.remittance_id
      WHERE m.kind = 'claim' AND m.reversed_at IS NULL ORDER BY m.service_line_id`,
  );
  expect(lines).toHaveLength(2);
  // The line whose service line sorts first is proved by a posting row alone (payer approved at deposited); the other
  // by a deposit (recovered).
  const [first, second] = lines as [(typeof lines)[number], (typeof lines)[number]];
  const posting = Buffer.from(`Post Date,Check/EFT #,Payer,Claim Ref,CPT,DOS,Paid Amount,Batch,Payee ID\r\n06/10/2026,${first.trace},SYNTHETIC PAYER L,,,,30.00,SYNBATCH-0249,SYNTHSENDER\r\n`);
  await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-04/posting-export.csv', 'posting_export', posting) });
  const deposit = Buffer.from(`Date,Description,Trace Number,Amount,Batch Reference\r\n2026-06-09,SYNTHETIC PAYER L HCCLAIMPMT,${second.trace},30.00,\r\n`);
  await w.reconcile(practice, { documentId: await w.stageExport(practice, 'LED-05/eft-export.csv', 'eft_export', deposit) });
  expect([await w.lineStage(practice, first.service_line_id), await w.lineStage(practice, second.service_line_id)]).toEqual(['payer_approved', 'recovered']);
  // The level lowered to posted: no stage event follows until the next sync.
  await w.manual(practice, ({ scope }) => setLedgerSettings(scope, { practiceId: practice.practiceId, proofLevel: 'posted', requestId: `test-${randomUUID()}` }), practice.world.adminUserId);
  expect(await w.lineStage(practice, first.service_line_id)).toBe('payer_approved');
  const steps: ManualStep[] = [{ actorId: practice.manager, run: async (c) => reverseMatch(c, { practiceId: practice.practiceId, matchId: await idOf(c.scope, "SELECT id FROM ledger_match WHERE kind = 'deposit'"), reason: 'SYNTHETIC wrong deposit' }) }];
  return { practice, steps };
}

beforeAll(async () => {
  swap.perLine = await import('./test-support/per-line');
  w = await LedgerWorld.open(adminUrl);
  sequences.set('LED-07', await led07());
  sequences.set('LED-02', await led02());
  sequences.set('two lines', await twoLines());
  database = await template({ world: w, practice: (sequences.get('LED-07') as Sequence).practice });
}, 600_000);

afterAll(async () => {
  for (const copy of clones) {
    await copy.drop();
  }
  // A world frozen as a template has closed its own connections; one whose building failed still holds them.
  if (database === undefined) {
    await w.close();
  } else {
    await w.triage.pricing.database.drop();
  }
});

/** Runs a sequence on two clones, shipped and per-line, and returns both sides and the IDs the template held. */
async function bothSides(sequence: Sequence): Promise<{ readonly shipped: SideResult<readonly ManualOutcome[]>; readonly reference: SideResult<readonly ManualOutcome[]>; readonly before: Map<string, Set<string>> }> {
  const built = { world: w, practice: sequence.practice };
  const frozen = database;
  if (frozen === undefined) {
    throw new Error('the worlds were not built');
  }
  const before = await idsBefore(frozen.url, sequence.practice.practiceId);
  const run = async (name: string, reference: boolean) => {
    const copy = await clone(adminUrl, frozen);
    clones.push(copy);
    swap.reference = reference;
    try {
      return await runManualSide(name, copy.url, built, sequence.steps);
    } finally {
      swap.reference = false;
    }
  };
  return { reference: await run('reference', true), shipped: await run('shipped', false), before };
}

/** The stage writes a side issued: the per-line copies' one-row inserts, or the shipped one statement. */
const stageWrites = (side: SideResult<unknown>) => side.statements.filter((statement) => /^\s*INSERT INTO line_status\b/.test(statement.text)).map((statement) => (/unnest\(/.test(statement.text) ? 'one statement' : 'one row'));

describe('a person’s manual actions write what the per-line code wrote (CAS-49.4)', () => {
  it.each(['LED-07', 'LED-02', 'two lines'])('%s: the same writes in the same order, the same notes and the same refusals', async (name) => {
    const sequence = sequences.get(name) as Sequence;
    const { shipped, reference, before } = await bothSides(sequence);
    // The swap took: the reference side's stage writes are the per-line copy's one-row inserts.
    expect(stageWrites(reference).length).toBeGreaterThan(0);
    expect(new Set(stageWrites(reference))).toEqual(new Set(['one row']));
    expect(new Set(stageWrites(shipped))).toEqual(new Set(['one statement']));
    expect(compare(reference, shipped, before, sequence.practice, { passDecrypts: false }).differences).toEqual([]);
    const outcomes = shipped.summary.map((outcome) => ('refused' in outcome ? outcome.refused : 'failed' in outcome ? `failed: ${outcome.failed}` : 'done'));
    expect(outcomes).toEqual(
      name === 'LED-07'
        ? ['not_found', 'done', 'already_matched', 'reverse_postings_first', 'done', 'done', 'done', 'not_standing']
        : name === 'LED-02'
          ? ['amount_mismatch', 'done', 'already_matched', 'reverse_postings_first', 'done', 'done', 'done', 'already_matched', 'not_found', 'done', 'no_change_in_amount']
          : ['done'],
    );
    if (name === 'two lines') {
      // The person's one sync: the first line forward to recovered, then the second back to payer approved, both in
      // the person's name; grouped by stage, payer approved would come first.
      const events = (shipped.after.get('line_status') ?? [])
        .filter((row) => !(before.get('line_status')?.has(String(row.id)) ?? false))
        .sort((a, b) => Number(BigInt(String(a.seq)) - BigInt(String(b.seq))));
      expect(events.map((row) => [row.stage, row.set_by === sequence.practice.manager])).toEqual([
        ['recovered', true],
        ['payer_approved', true],
      ]);
    }
  });
});
