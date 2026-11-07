import { randomUUID } from 'node:crypto';

import { readDatabaseUrl } from '@tp/db';
import { afterAll, describe, expect, it } from 'vitest';

import { reconcilePractice } from './pass';
import { REOPEN_NOTES } from './stages';
import { type Comparison, type Middleware, type Pass, type QueryResult, type SideResult, clone, compare, idsBefore, runSide, template } from './test-support/pass-compare';
import { type BuiltWorld, buildWorld, worldPlan } from './test-support/pass-world';
import { referencePass } from './test-support/per-line';

/**
 * CAS-49.1 (SUITE-CAP-3; design section 7; docs/adr/0087): a reconcile pass writes what the per-line pass wrote. Each run
 * draws a world from a fixed seed (test-support/pass-world.ts: a practice's history and one pass of new evidence, 40 to
 * 400 case lines in two or three cases, two to five checks, every shape section 7 names), builds it once through the
 * job code and clones it: the per-line reference (test-support/per-line.ts) runs on one clone, the shipped pass on
 * another, and the reference again on a third, and each pair's writes are compared (test-support/pass-compare.ts):
 * matches, entries, stage events, payer responses, notifications and audit events in the same order where order is
 * observable, every encrypted note by its decrypted text's hash, every case's state and totals, the summary counts, and
 * the claims whose patient control numbers each side decrypted in the search.
 *
 * The reference against itself is the settle rule's own proof (slice 1): settleMatches' posted entries follow
 * ledgerMatches' order, which within a pass follows random match ids, so a check with two or more allocated check-level
 * postings splits a line's share between them by a cent differently from run to run on the base itself (5.2). The rule
 * (each side replayed against partialShare in its own order, totals per line and stage compared) must absorb that in
 * every run, and the harness counts the runs where a row-for-row comparison would have failed.
 *
 * The proof level is fixed by the run's index (review round 5): even runs at posted, odd runs raised to deposited after
 * the history; after the runs the harness checks that both levels ran, that a posted run moved a line to recovered from
 * a posted entry matched in its pass, and that run 1 holds both move-backs. Run 1 also runs the six self-check mutants,
 * each a fault injected at the shipped pass's statement boundary, each of which must fail the comparison.
 *
 * TP_CAS49_RUNS lowers the number of runs for a local look (CI runs all 25); every identifier is SYNTHETIC.
 */

const RUNS = Number.parseInt(process.env.TP_CAS49_RUNS ?? '25', 10);
/** The fixed CI seeds: run i draws from SEED + i. */
const SEED = 0x0ca549;
const RUN_TIMEOUT_MS = 900_000;

const adminUrl = readDatabaseUrl();
const shipped: Pass = (context, services, practiceId) => reconcilePractice(context, services, practiceId);
const reference: Pass = (context, services, practiceId) => referencePass(context, services, practiceId);

/** What the runs showed, checked once they have all run. */
const facts = {
  levels: new Set<'posted' | 'deposited'>(),
  postedRecoveredInPass: false,
  run1: { proofLevelNote: false, reversalNote: false },
  selfRuns: 0,
  partialCheckRuns: 0,
  strictSettleWouldDiffer: 0,
  mutants: new Map<string, { readonly applied: number; readonly differences: readonly string[] }>(),
};

// ---------------------------------------------------------------------------------------------------------------------
// The six self-check mutants (design section 7): faults at the shipped pass's statement boundary. Each names the
// statement it changes by its text and counts its applications, so a later slice that rewrites the statement fails here
// ("did not apply") until the mutant is aimed at the new code; each must make the comparison fail.
// ---------------------------------------------------------------------------------------------------------------------

interface Mutant {
  readonly name: string;
  readonly middleware: (applied: () => void) => Middleware;
  /** What only this mutant's difference can be, when it can be told apart. */
  readonly differs?: (difference: string) => boolean;
}

const CANDIDATE_SEARCH = /FROM claim c JOIN remittance r ON r\.id = c\.remittance_id\s+WHERE\s+c\.practice_id = \$1 AND r\.status = 'loaded'/;
const BY_PATIENT = /EXISTS \(SELECT 1 FROM service_line s WHERE s\.claim_id = c\.id/;
const BY_CONTROL = /payer_claim_control_number_hash IN \(SELECT k\.payer_claim_control_number_hash/;

const rewrite = (match: RegExp, from: string, to: string) => (applied: () => void) => (next: Parameters<Middleware>[0]) => (text: string, values: readonly unknown[]) => {
  if (match.test(text) && text.includes(from)) {
    applied();
    return next(text.replace(from, to), values);
  }
  return next(text, values);
};

const MUTANTS: readonly Mutant[] = [
  {
    // D1 without 5.1 step 3: every round's reads without the known claims taken off (the round's own candidates come
    // back, so a line whose correction was found by control number never reaches the patient's claim beside it).
    name: 'the rounds read without taking off the known claims',
    middleware: rewrite(CANDIDATE_SEARCH, 'c.id <> ALL ($2::uuid[]) AND ', '($2::uuid[]) IS NOT NULL AND '),
  },
  {
    // The patient search's created_at filter narrowed: a claim loaded in the same transaction as the line's, which
    // pairs with no line (another patient's), is no longer read; only the decrypt equality sees it.
    name: "the patient search's created_at filter narrowed from >= to >",
    middleware: (applied) => (next) => (text, values) => {
      if (CANDIDATE_SEARCH.test(text) && BY_PATIENT.test(text)) {
        applied();
        return next(text.replace('c.created_at >= (SELECT o.created_at', 'c.created_at > (SELECT o.created_at'), values);
      }
      return next(text, values);
    },
    differs: (difference) => difference.startsWith('search decrypts'),
  },
  {
    // D3 writing the events grouped by stage: every payer approved, then every recovered (the same rows, another seq order).
    name: 'the stage events written grouped by stage',
    middleware: (applied) => (next) => {
      const held: { text: string; values: readonly unknown[] }[] = [];
      const rank = (values: readonly unknown[]) => (values[2] === 'payer_approved' ? 0 : values[2] === 'recovered' ? 1 : 2);
      const flush = async () => {
        const ordered = held.splice(0).map((item, index) => ({ ...item, index }));
        ordered.sort((a, b) => rank(a.values) - rank(b.values) || a.index - b.index);
        if (ordered.some((item, index) => item.index !== index)) {
          applied();
        }
        for (const item of ordered) {
          await next(item.text, item.values);
        }
      };
      return async (text, values) => {
        if (/^\s*INSERT INTO line_status\b/.test(text)) {
          held.push({ text, values });
          return { rows: [], rowCount: 1 } satisfies QueryResult;
        }
        if (!text.includes("e.stage = 'reversed'")) {
          await flush();
        }
        return next(text, values);
      };
    },
  },
  {
    // D16's exclusion dropped from both searches: a claim a person unmatched from a line is matched to it again.
    name: "the ledger_match exclusion dropped from both searches",
    middleware: rewrite(CANDIDATE_SEARCH, "AND NOT EXISTS (SELECT 1 FROM ledger_match m WHERE m.kind = 'claim' AND m.claim_id = c.id AND m.service_line_id = $5)", 'AND ($5::uuid) IS NOT NULL'),
  },
  {
    // seen taken off the control-number list before preferredCandidates (review round 3): a control-number candidate
    // that paired with no line no longer stops the search, so the patient's claim beside it is matched. At the base's
    // statement boundary the line's seen control claims are the ones its earlier rounds' control reads returned.
    name: 'seen taken off the control-number list before preferredCandidates',
    middleware: (applied) => (next) => {
      const returned = new Map<string, Set<string>>();
      return async (text, values) => {
        const result = await next(text, values);
        if (!(CANDIDATE_SEARCH.test(text) && BY_CONTROL.test(text))) {
          return result;
        }
        const line = String(values[4]);
        const seen = returned.get(line) ?? new Set<string>();
        const rows = result.rows.filter((row) => !seen.has(String(row.id)));
        if (rows.length !== result.rows.length) {
          applied();
        }
        returned.set(line, new Set([...seen, ...result.rows.map((row) => String(row.id))]));
        return { rows, rowCount: rows.length };
      };
    },
  },
  {
    // moveBackNote always the reversal note (review round 4): the proof-level move-back gets the reversal note; the same
    // rows, stages and seq, and only the decrypted comparison of line_status.reason sees it (a full swap of the two notes
    // is not used: LED-07 already fails it).
    name: 'moveBackNote always the reversal note',
    middleware: (applied) => (next) => async (text, values) => {
      const result = await next(text, values);
      if (text.includes("e.stage = 'reversed'") && text.includes('AS reversed')) {
        applied();
        return { rows: [{ reversed: true }], rowCount: 1 };
      }
      return result;
    },
    differs: (difference) => difference.startsWith('line_status') && difference.includes('reason'),
  },
];

// ---------------------------------------------------------------------------------------------------------------------
// The runs
// ---------------------------------------------------------------------------------------------------------------------

/** The facts a run's reference side shows: its level, a line recovered from a posted entry of its pass, its move-back notes. */
function recordFacts(built: BuiltWorld, side: SideResult, before: ReadonlyMap<string, ReadonlySet<string>>): void {
  facts.levels.add(built.plan.raised ? 'deposited' : 'posted');
  const isNew = (table: string, row: Record<string, unknown>) => !(before.get(table)?.has(String(row.id)) ?? false);
  const stages = (side.after.get('line_status') ?? []).filter((row) => isNew('line_status', row));
  const postedLines = new Set((side.after.get('ledger_entry') ?? []).filter((row) => isNew('ledger_entry', row) && row.stage === 'posted').map((row) => String(row.service_line_id)));
  if (!built.plan.raised && stages.some((row) => row.stage === 'recovered' && postedLines.has(String(row.service_line_id)))) {
    facts.postedRecoveredInPass = true;
  }
  if (built.plan.run === 1) {
    for (const row of stages.filter((item) => item.reopened_from === 'recovered' && typeof item.reason === 'string')) {
      const note = built.practice.cipher.decrypt('line_status.reason', row.reason as string);
      facts.run1.proofLevelNote ||= note === REOPEN_NOTES.proofLevel;
      facts.run1.reversalNote ||= note === REOPEN_NOTES.reversal;
    }
  }
}

/**
 * The shapes every world must hold for its comparison to mean what section 7 says, read from the reference side's own
 * pass: a generator change that lost one fails here, not silently in an equality that no longer bites.
 */
function expectWorldShapes(built: BuiltWorld, side: SideResult, before: ReadonlyMap<string, ReadonlySet<string>>): void {
  const { summary } = side;
  const run = `run ${String(built.plan.run)}`;
  expect(summary.approvedFromResponses, `${run}: a payer response's approval`).toBeGreaterThan(0);
  for (const count of ['approved', 'confirmed', 'decreased', 'noChange', 'recoupments'] as const) {
    expect(summary.remittances[count], `${run}: ${count}`).toBeGreaterThan(0);
  }
  // AMT I and a PLB L6.
  expect(summary.remittances.interest, `${run}: interest`).toBe(2);
  expect(summary.postingsMatched, `${run}: postings`).toBeGreaterThan(0);
  expect(summary.depositsMatched, `${run}: deposits`).toBeGreaterThan(0);
  expect(summary.stages.back, `${run}: a line moved back`).toBeGreaterThan(0);
  expect(summary.notified, `${run}: a recoupment notice`).toBeGreaterThan(0);
  const fresh = (table: string) => (side.after.get(table) ?? []).filter((row) => !(before.get(table)?.has(String(row.id)) ?? false));
  const matches = fresh('ledger_match');
  expect(matches.filter((row) => row.kind === 'posting' && row.level === 'check' && row.allocated === true).length, `${run}: two partial check-level postings`).toBeGreaterThanOrEqual(2);
  expect(matches.some((row) => row.kind === 'posting' && row.level === 'claim'), `${run}: a claim-level posting`).toBe(true);
  expect(matches.some((row) => row.kind === 'deposit' && row.level === 'check'), `${run}: a deposit alone`).toBe(true);
  if (built.plan.checks >= 3) {
    expect(matches.some((row) => row.kind === 'deposit' && row.level === 'batch'), `${run}: a batched deposit`).toBe(true);
  }
  expect(fresh('payer_response').some((row) => row.kind === 'reprocessed_no_change'), `${run}: a no-change response`).toBe(true);
  // A claim of the line's patient, code and date paired after its correction by control number (the second round).
  expect(matches.filter((row) => row.kind === 'claim').length, `${run}: claim matches`).toBeGreaterThan(built.plan.roles.filter((role) => role === 'control').length);
}

async function oneRun(run: number): Promise<void> {
  const plan = worldPlan(run, SEED + run);
  const built = await buildWorld(adminUrl, plan);
  const database = await template(built);
  const clones: { drop: () => Promise<void> }[] = [];
  try {
    const before = await idsBefore(database.url, built.practice.practiceId);
    const jobId = randomUUID();
    const side = async (name: string, pass: Pass, middleware?: Middleware) => {
      const copy = await clone(adminUrl, database);
      clones.push(copy);
      return runSide(name, copy.url, built, jobId, pass, middleware === undefined ? {} : { middleware });
    };
    const ref = await side('reference', reference);
    recordFacts(built, ref, before);
    expectWorldShapes(built, ref, before);
    const shippedSide = await side('shipped', shipped);
    const self = await side('reference again', reference);

    const against: Comparison = compare(ref, shippedSide, before, built.practice);
    expect(against.differences, `run ${String(run)}: the shipped pass against the per-line reference`).toEqual([]);
    const itself = compare(ref, self, before, built.practice);
    expect(itself.differences, `run ${String(run)}: the reference against itself (the settle rule)`).toEqual([]);
    facts.selfRuns += 1;
    facts.partialCheckRuns += itself.partialCheck ? 1 : 0;
    facts.strictSettleWouldDiffer += itself.strictSettleWouldDiffer || against.strictSettleWouldDiffer ? 1 : 0;

    if (run === 1) {
      for (const mutant of MUTANTS) {
        let applied = 0;
        const result = await side(mutant.name, shipped, mutant.middleware(() => (applied += 1)));
        facts.mutants.set(mutant.name, { applied, differences: compare(ref, result, before, built.practice).differences });
      }
    }
  } finally {
    for (const copy of clones) {
      await copy.drop();
    }
    await built.world.triage.pricing.database.drop();
  }
}

describe('a reconcile pass writes what the per-line pass wrote (CAS-49.1)', () => {
  afterAll(() => {
    // Counts only, for the pull request's record.
    process.stdout.write(
      `CAS-49.1: ${String(facts.selfRuns)} runs; partial checks in ${String(facts.partialCheckRuns)}; a row-for-row settle comparison would have failed in ${String(facts.strictSettleWouldDiffer)}\n`,
    );
  });

  for (let run = 0; run < RUNS; run += 1) {
    it(`run ${String(run)} (${run % 2 === 0 ? 'posted' : 'raised to deposited'})`, () => oneRun(run), RUN_TIMEOUT_MS);
  }

  it('ran both proof levels, recovered a line from a posted entry of a posted pass, and wrote both move-backs in run 1', () => {
    expect([...facts.levels].sort()).toEqual(RUNS > 1 ? ['deposited', 'posted'] : ['posted']);
    expect(facts.postedRecoveredInPass).toBe(true);
    if (RUNS > 1) {
      expect(facts.run1).toEqual({ proofLevelNote: true, reversalNote: true });
    }
  });

  it('absorbs the base’s own settle order: the reference against itself in every run, with a partial check in each', () => {
    expect(facts.selfRuns).toBe(RUNS);
    expect(facts.partialCheckRuns).toBe(RUNS);
  });

  it('fails each of the six self-check mutants on run 1', () => {
    if (RUNS < 2) {
      return;
    }
    expect([...facts.mutants.keys()]).toEqual(MUTANTS.map((mutant) => mutant.name));
    for (const mutant of MUTANTS) {
      const result = facts.mutants.get(mutant.name) as { applied: number; differences: readonly string[] };
      expect(result.applied, `${mutant.name}: did not apply (aim it at the code under test)`).toBeGreaterThan(0);
      expect(result.differences.length, `${mutant.name}: the comparison did not fail`).toBeGreaterThan(0);
      if (mutant.differs !== undefined) {
        expect(result.differences.every(mutant.differs), `${mutant.name}: failed for another reason than its own`).toBe(true);
      }
    }
  });
});
