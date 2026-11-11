import { randomUUID } from 'node:crypto';

import { openPool, readDatabaseUrl, withJobScope, withPracticeScope, workerDevLoginUrl } from '@tp/db';
import { endPool } from '@tp/db/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Scope } from './ledger';
import { reconcilePractice } from './pass';
import { claimLines } from './remittances';
import { REOPEN_NOTES, type StageEvent, insertStages } from './stages';
import { type Comparison, type Middleware, type Pass, type Query, type SideResult, clone, compare, idsBefore, runSide, template } from './test-support/pass-compare';
import { type BuiltWorld, buildWorld, worldPlan } from './test-support/pass-world';
import { referencePass } from './test-support/per-line';
import { type StageTrio, type StageWorld, buildStageWorld } from './test-support/stage-world';

/**
 * CAS-49.1 (SUITE-CAP-3; design section 7; docs/adr/0087): a reconcile pass writes what the per-line pass wrote. Each run
 * draws a world from a fixed seed (test-support/pass-world.ts: a practice's history and one pass of new evidence, 40 to
 * 400 case lines in two or three cases, two to five payments, every shape section 7 names), builds it once through the
 * job code and clones it: the per-line reference (test-support/per-line.ts) runs on one clone, the shipped pass on
 * another, and the reference again on a third, and each pair's writes are compared (test-support/pass-compare.ts):
 * matches, entries, stage events, payer responses, notifications and audit events in the same order where order is
 * observable, every encrypted note by its decrypted text's hash, every case's state and totals, the summary counts, and
 * the claims whose patient control numbers each side decrypted in the search.
 *
 * The reference against itself is the settle rule's own proof (slice 1): settleMatches' posted entries follow
 * ledgerMatches' order. When slice 1 was written that order followed random match ids within a pass, so a check with two
 * or more allocated check-level postings split a line's share between them by a cent differently from run to run on the
 * base itself (5.2), and the rule (each side replayed against partialShare in its own order, totals per line and stage
 * compared) absorbed it. Since the interest fix the order is ledger_match.seq (docs/adr/0084), the order the pass wrote
 * its matches in, the same on both sides: the rule stays, the harness counts the runs where a row-for-row comparison
 * would have failed, and that count is held at zero below.
 *
 * The proof level is fixed by the run's index (review round 5): even runs at posted, odd runs raised to deposited after
 * the history; after the runs the harness checks that both levels ran, that a posted run moved a line to recovered from
 * a posted entry matched in its pass, and that run 1 holds both move-backs. Run 1 also runs the twenty-three self-check
 * mutants, each a fault injected at the shipped pass's statement boundary, each of which must fail the comparison, or,
 * where the fault makes the pass write a row a database guard refuses, be stopped by that guard and no other.
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
// The self-check mutants (design section 7's six, a seventh for a line with no service date, an eighth for D16's
// parameter arrays, a ninth and a tenth for D16's exclusion in each search alone, an eleventh for the chain order's
// load key, the twelfth to the fifteenth for the per-line filters the new statements restate, the sixteenth and
// seventeenth for D15's never-matched reads, the eighteenth and nineteenth for the patient search's second statement
// alone, and the twentieth to the twenty-third for the loaded and reversal filters of each search): faults at the
// shipped pass's statement boundary. Each names the statement it changes by its text and counts its applications, so a
// later slice that rewrites the statement fails here ("did not apply") until the mutant is aimed at the new code; each
// must make the comparison fail.
// ---------------------------------------------------------------------------------------------------------------------

interface Mutant {
  readonly name: string;
  readonly middleware: (applied: () => void) => Middleware;
  /** What only this mutant's difference can be, when it can be told apart. */
  readonly differs?: (difference: string) => boolean;
  /**
   * The database guard that stops this mutant's pass, by its message (a fixed sentence, no identifier): the fault makes
   * the pass write a row no pass may write, so the pass is refused before there is anything to compare. Asserted, so
   * the mutant is caught on purpose: another error, or a guard on a mutant that names none, fails the run.
   */
  readonly refusedBy?: string;
}

/** ledger_match_rules()' refusals: of a match to a remittance that is not loaded, and of a claim match to a reversal. */
const LOADED_GUARD = 'a match is to a loaded remittance of its practice';
const CLAIM_MATCH_GUARD = 'a claim match is of a claim of its remittance, never a reversal';
const refused = (message: string) => `refused: ${message}`;

/** The pass-level search's statements (slice 3, D1): the control search by rounds, the patient search's (a) and (b). */
const CONTROL_SEARCH = /\bprobe \(ix, claim_id\) AS\b/;
const PATIENT_CLAIMS = /\bnamed \(ix, claim_id\) AS\b/;
const PATIENT_PAIRS = /\bp \(claim_id, ix\) AS\b/;
const SEARCH = { test: (text: string) => CONTROL_SEARCH.test(text) || PATIENT_CLAIMS.test(text) || PATIENT_PAIRS.test(text) };
const PATIENT_SEARCH = { test: (text: string) => PATIENT_CLAIMS.test(text) || PATIENT_PAIRS.test(text) };
/** ledgerMatches' read: the first one after caseLines is matchClaims' chain context, from which D16's matched set is built. */
const LEDGER_MATCHES = /FROM ledger_match m WHERE m\.practice_id = \$1 ORDER BY m\.seq/;
const CASE_LINES = /FROM case_line cl JOIN "case" k/;
/** insertStages' one statement (D3): the pass's stage events as arrays, in order. */
const STAGE_EVENTS = /^\s*INSERT INTO line_status\b[\s\S]*\bunnest\(/;
/** neverMatched's one statement (D15, slice 4): the practice's posting (or EFT) rows less every row a match was ever made for. */
const NEVER_MATCHED = /\bEXCEPT SELECT m\.(posting_row_id|eft_row_id) FROM ledger_match m\b/;

/** Rewrites every occurrence of each `from` in the statements `match` names; applied when any was there. */
const rewrite =
  (match: { readonly test: (text: string) => boolean }, ...pairs: readonly (readonly [string, string])[]) =>
  (applied: () => void) =>
  (next: Parameters<Middleware>[0]) =>
  (text: string, values: readonly unknown[]) => {
    if (!match.test(text) || !pairs.some(([from]) => text.includes(from))) {
      return next(text, values);
    }
    applied();
    return next(
      pairs.reduce((out, [from, to]) => out.replaceAll(from, to), text),
      values,
    );
  };

/**
 * The pass's chain context read (the first ledgerMatches read after caseLines, from which D16's matched set is built)
 * without its reversed claim matches; `dropped` collects each one taken out, by service line.
 */
function withoutReversedClaimMatches(applied: () => void, dropped: Map<string, Set<string>>, next: Query): Query {
  let caseLinesRead = false;
  let contextRead = false;
  return async (text, values) => {
    const result = await next(text, values);
    caseLinesRead ||= CASE_LINES.test(text);
    if (!caseLinesRead || contextRead || !LEDGER_MATCHES.test(text)) {
      return result;
    }
    contextRead = true;
    const rows = result.rows.filter((row) => {
      if (row.kind !== 'claim' || row.standing !== false) {
        return true;
      }
      const serviceLine = String(row.service_line_id);
      dropped.set(serviceLine, (dropped.get(serviceLine) ?? new Set<string>()).add(String(row.claim_id)));
      return false;
    });
    if (rows.length !== result.rows.length) {
      applied();
    }
    return { rows, rowCount: rows.length };
  };
}

/** A search statement's searched lines, index to service line ($2 and $3 of the control and the patient statements). */
const searchedLinesOf = (values: readonly unknown[]): Map<number, string> => {
  const serviceLines = values[2] as readonly string[];
  return new Map((values[1] as readonly number[]).map((ix, at) => [ix, serviceLines[at] as string]));
};

const MUTANTS: readonly Mutant[] = [
  {
    // The known claims' exclusion (CANDIDATE_FILTERS' `c.id <> ALL (known)`) taken out of every search statement, the
    // control search's and both patient statements'. It fails through the control search: each round's control read
    // returns the round before's own candidates, so a line whose correction was found by control number never reaches
    // the patient's claim beside it. What the patient statements then also return, a chain's own claims, passCandidates
    // takes off by the known and seen sets, so 5.1 step 3 (the one patient read, its known claims taken off a round at a
    // time) is held there, not by a statement, and this mutant does not aim at it.
    name: 'the rounds read without taking off the known claims',
    middleware: rewrite(SEARCH, ['NOT EXISTS (SELECT 1 FROM k WHERE k.ix = l.ix AND k.claim_id = c.id)', 'TRUE']),
  },
  {
    // The patient search's created_at filter narrowed: a claim loaded in the same transaction as the line's, which
    // pairs with no line (another patient's), is no longer read; only the decrypt equality sees it.
    name: "the patient search's created_at filter narrowed from >= to >",
    middleware: rewrite(PATIENT_SEARCH, ['c.created_at >= (SELECT o.created_at', 'c.created_at > (SELECT o.created_at']),
    differs: (difference) => difference.startsWith('search decrypts'),
  },
  {
    // D3 writing the events grouped by stage: every payer approved, then every recovered (the same rows, another seq
    // order). Aimed at insertStages' one statement (slice 2): its event arrays permuted, stably, by stage.
    name: 'the stage events written grouped by stage',
    middleware: (applied) => (next) => (text, values) => {
      if (!STAGE_EVENTS.test(text)) {
        return next(text, values);
      }
      const [practiceId, setBy, lines, stages, reasons, from] = values as [unknown, unknown, readonly unknown[], readonly unknown[], readonly unknown[], readonly unknown[]];
      const rank = (stage: unknown) => (stage === 'payer_approved' ? 0 : stage === 'recovered' ? 1 : 2);
      const order = stages.map((_stage, index) => index).sort((a, b) => rank(stages[a]) - rank(stages[b]) || a - b);
      if (order.some((at, index) => at !== index)) {
        applied();
      }
      const permuted = (list: readonly unknown[]) => order.map((index) => list[index]);
      return next(text, [practiceId, setBy, permuted(lines), permuted(stages), permuted(reasons), permuted(from)]);
    },
  },
  {
    // D16's exclusion dropped from both searches: a claim a person unmatched from a line is matched to it again. No
    // search statement reads ledger_match (D16): both take the exclusion from the pass's matched set, built from the
    // chain context's matches, so the mutant reads that context without its reversed claim matches.
    name: 'the ledger_match exclusion dropped from both searches',
    middleware: (applied) => (next) => withoutReversedClaimMatches(applied, new Map(), next),
  },
  {
    // seen taken off the control-number list before preferredCandidates (review round 3): a control-number candidate
    // that paired with no line no longer stops the search, so the patient's claim beside it is matched. At the
    // statement boundary a line's seen control claims are the ones its earlier rounds' control reads returned for its
    // index (one control statement a round for every line still searching, each row carrying the line's index).
    name: 'seen taken off the control-number list before preferredCandidates',
    middleware: (applied) => (next) => {
      const returned = new Map<string, Set<string>>();
      return async (text, values) => {
        const result = await next(text, values);
        if (!CONTROL_SEARCH.test(text)) {
          return result;
        }
        const seenBefore = new Map([...returned].map(([line, ids]) => [line, new Set(ids)]));
        const rows = result.rows.filter((row) => !(seenBefore.get(String(row.ix))?.has(String(row.id)) ?? false));
        if (rows.length !== result.rows.length) {
          applied();
        }
        for (const row of result.rows) {
          returned.set(String(row.ix), (returned.get(String(row.ix)) ?? new Set<string>()).add(String(row.id)));
        }
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
  {
    // A seventh, beside section 7's six (slice 1's verification): the patient search comparing service dates with =
    // where it has IS NOT DISTINCT FROM, so a case line with no service date never finds its claim (the world's noDate
    // line, whose claim and candidate carry the date on the claim only).
    name: "the patient search's service date compared with = (a line with no service date)",
    middleware: rewrite(PATIENT_SEARCH, ['s.service_date IS NULL AND l.service_date IS NULL', 'FALSE'], ['s.service_date IS NOT DISTINCT FROM l.service_date', 's.service_date = l.service_date']),
  },
  {
    // An eighth (slice 3, D16): the patient search's parameter arrays of matched pairs emptied, so the exclusion is left
    // to the TypeScript drop alone, which the security review rejected: the statements then return, and the worker
    // decrypts, a claim no line's own query returned (the world's unmatched claim, on a date no other line has). The
    // same writes; only the decrypt equality sees it.
    name: "the patient search's matched pairs left to TypeScript alone",
    middleware: (applied) => (next) => (text, values) => {
      const [claims, lines] = [values[9], values[10]] as [readonly unknown[] | undefined, readonly unknown[] | undefined];
      if (!PATIENT_SEARCH.test(text) || claims === undefined || lines === undefined || claims.length === 0) {
        return next(text, values);
      }
      applied();
      return next(text, values.map((value, index) => (index === 9 || index === 10 ? [] : value)));
    },
    differs: (difference) => difference.startsWith('search decrypts'),
  },
  {
    // A ninth (slice 3's verification): D16's exclusion dropped from the control search alone, which since slice 3
    // holds it in TypeScript (the base held it in the one SQL predicate both searches shared). The context is read as
    // the fourth reads it, and the pairs it lost are given back to the patient statements' arrays, so those are issued
    // as unmutated: the world's correction a person unmatched from its line by control number is matched again, and
    // only the writes differ (the control search decrypts nothing).
    name: 'the ledger_match exclusion dropped from the control search alone',
    middleware: (applied) => (next) => {
      const dropped = new Map<string, Set<string>>();
      const query = withoutReversedClaimMatches(applied, dropped, next);
      return (text, values) => {
        if (!PATIENT_SEARCH.test(text) || dropped.size === 0) {
          return query(text, values);
        }
        const claims = [...(values[9] as readonly string[])];
        const lines = [...(values[10] as readonly number[])];
        for (const [ix, serviceLine] of searchedLinesOf(values)) {
          for (const claimId of dropped.get(serviceLine) ?? []) {
            claims.push(claimId);
            lines.push(ix);
          }
        }
        return query(text, values.map((value, index) => (index === 9 ? claims : index === 10 ? lines : value)));
      };
    },
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  {
    // A tenth (slice 3's verification): D16's exclusion dropped from the patient search alone. The context is read as the
    // fourth reads it, and the control statement's rows of the pairs it lost are taken off as the control search's own
    // drop would have: the world's claim a person unmatched from its line by patient control number is matched again.
    name: 'the ledger_match exclusion dropped from the patient search alone',
    middleware: (applied) => (next) => {
      const dropped = new Map<string, Set<string>>();
      const query = withoutReversedClaimMatches(applied, dropped, next);
      return async (text, values) => {
        const result = await query(text, values);
        if (!CONTROL_SEARCH.test(text) || dropped.size === 0) {
          return result;
        }
        const lines = searchedLinesOf(values);
        const rows = result.rows.filter((row) => !(dropped.get(lines.get(Number(row.ix)) ?? '')?.has(String(row.id)) ?? false));
        return { rows, rowCount: rows.length };
      };
    },
  },
  {
    // An eleventh (slice 3's verification): the chain order's middle key lost, so a line's candidates of one payment date
    // loaded in different transactions fall to the ID order (CHAIN_ORDER is payment date, load, then ID; the base took it
    // from SQL, slice 3 from inChainOrder). The world's two claims of one line and date, loaded apart in an order their
    // IDs do not follow, are then matched in the wrong order.
    name: "the candidates' load times lost from the chain order",
    middleware: (applied) => (next) => async (text, values) => {
      const result = await next(text, values);
      if (!(CONTROL_SEARCH.test(text) || PATIENT_CLAIMS.test(text)) || result.rows.length === 0) {
        return result;
      }
      applied();
      const rows = result.rows.map((row) => ({ ...row, loaded_at: '0' }));
      return { rows, rowCount: rows.length };
    },
  },
  // The twelfth to the fifteenth (slice 3's second verification): CANDIDATE_FILTERS restated per line in the new
  // statements, each taken out of one statement alone (D12: the pass-level search kept equal to the per-line definition
  // CAS-49 holds). The world reaches each claim such a filter keeps out only in the pass (pass-world.ts: through a
  // correction the pass brings, or a case line triaged after the history), so the same fault made in the code, which
  // also runs in the world's history reconcile, is not absorbed by the history both sides start from.
  {
    name: "the control search's own-remittance filter dropped",
    middleware: rewrite(CONTROL_SEARCH, [' AND c.remittance_id <> l.remittance_id', '']),
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  {
    name: "the control search's created_at filter dropped",
    middleware: rewrite(CONTROL_SEARCH, ['c.created_at >= (SELECT o.created_at FROM claim o WHERE o.practice_id = $1 AND o.id = l.claim_id)', 'TRUE']),
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  {
    name: "the control search's case-line filter dropped",
    middleware: rewrite(CONTROL_SEARCH, ['AND xl.claim_id = c.id)', 'AND xl.claim_id = c.id AND FALSE)']),
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  {
    name: "the patient search's case-line filter dropped",
    middleware: rewrite(PATIENT_CLAIMS, ['AND xl.claim_id = c.id)', 'AND xl.claim_id = c.id AND FALSE)']),
  },
  // The sixteenth and seventeenth (slice 4, D15): the never-matched read taking off only the rows of standing matches,
  // where the base's NOT EXISTS took off every row a match was ever made for. A row whose match a person reversed is then
  // matched again in the pass (the world's posting a person reversed in the history; and, in a raised run such as run 1,
  // the deposit a person reversed while its posting stood), which section 7 and the module's doc forbid.
  {
    name: "the never-matched posting rows read without a person's reversed matches",
    middleware: rewrite(NEVER_MATCHED, ['m.posting_row_id IS NOT NULL', 'm.posting_row_id IS NOT NULL AND m.reversed_at IS NULL']),
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  {
    name: "the never-matched EFT rows read without a person's reversed matches",
    middleware: rewrite(NEVER_MATCHED, ['m.eft_row_id IS NOT NULL', 'm.eft_row_id IS NOT NULL AND m.reversed_at IS NULL']),
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  // The eighteenth and nineteenth (the pull request's review, finding 2.1): the patient search's second statement, (b),
  // alone. (a) returns a claim when any searched line's own predicate holds for it, and the worker pairs it with every
  // searched line of its patient control number; (b) then decides each pair by that line's predicate. So (b) alone
  // keeps a claim from a line that shares its patient, code and date with a line that may take it: the world's claim in
  // the later sibling's own remittance, and its claim loaded between the two siblings' claims. Each is matched to the
  // later sibling too once (b) loses the clause.
  //
  // (b)'s other clauses have no mutant, each being equivalent at this boundary: passCandidates takes a line's known
  // claims and its D16 pairs off the patient list again in TypeScript, and a pair whose claim has no line of the line's
  // code and date is seen once, pairs with nothing and is never matched (caseLinePair), so no write, decrypt or summary
  // count can differ.
  {
    name: "the patient search's own-remittance filter dropped from its second statement alone",
    middleware: rewrite(PATIENT_PAIRS, ['c.remittance_id <> l.remittance_id AND ', '']),
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  {
    name: "the patient search's created_at filter dropped from its second statement alone",
    middleware: rewrite(PATIENT_PAIRS, ['c.created_at >= (SELECT o.created_at FROM claim o WHERE o.practice_id = $1 AND o.id = l.claim_id)', 'TRUE']),
    differs: (difference) => !difference.startsWith('search decrypts'),
  },
  // The twentieth to the twenty-third (finding 2.2): the loaded and the reversal filters the new statements restate,
  // each taken out of one statement alone. The world's held 835 carries a claim of a line's patient, and another
  // patient's claim under the line's own control number, and the pass's reversals carry their lines' control numbers
  // and patients, so each search reaches such a claim once its filter is gone, and pairs it. The match it then writes is
  // one ledger_match_rules() refuses, so the pass stops there: each is caught by its guard, by name.
  {
    name: "the control search's loaded filter dropped",
    middleware: rewrite(CONTROL_SEARCH, ["r.status = 'loaded'", 'TRUE']),
    refusedBy: LOADED_GUARD,
  },
  {
    name: "the control search's reversal filter dropped",
    middleware: rewrite(CONTROL_SEARCH, ["c.claim_status_code <> '22'", 'TRUE']),
    refusedBy: CLAIM_MATCH_GUARD,
  },
  {
    name: "the patient search's loaded filter dropped from its first statement",
    middleware: rewrite(PATIENT_CLAIMS, ["r.status = 'loaded'", 'TRUE']),
    refusedBy: LOADED_GUARD,
  },
  {
    name: "the patient search's reversal filter dropped from its first statement",
    middleware: rewrite(PATIENT_CLAIMS, ["c.claim_status_code <> '22'", 'TRUE']),
    refusedBy: CLAIM_MATCH_GUARD,
  },
];

/**
 * What the patient search's second statement, (b), did on the shipped side (finding 2.1): the (claim, line) pairs it
 * was given ($12, $13) and the ones it kept, by claim. Read at the statement boundary, changing nothing.
 */
function watchPatientPairs(seen: { shared: number }): Middleware {
  return (next) => async (text, values) => {
    const result = await next(text, values);
    if (!PATIENT_PAIRS.test(text)) {
      return result;
    }
    const given = new Map<string, number>();
    for (const claimId of values[11] as readonly string[]) {
      given.set(claimId, (given.get(claimId) ?? 0) + 1);
    }
    const kept = new Map<string, number>();
    for (const row of result.rows) {
      kept.set(String(row.claim_id), (kept.get(String(row.claim_id)) ?? 0) + 1);
    }
    // A claim paired with two or more searched lines (they share its patient control number), kept for one and not another.
    seen.shared += [...given].filter(([claimId, n]) => n >= 2 && (kept.get(claimId) ?? 0) >= 1 && (kept.get(claimId) ?? 0) < n).length;
    return result;
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// The runs
// ---------------------------------------------------------------------------------------------------------------------

/** The facts a run's reference side shows: its level, a line recovered from a posted entry of its pass, its move-back notes. */
function recordFacts(built: BuiltWorld, side: SideResult, before: ReadonlyMap<string, ReadonlySet<string>>): void {
  facts.levels.add(built.plan.raised ? 'deposited' : 'posted');
  const isNew = (table: string, row: Record<string, unknown>) => !(before.get(table)?.has(String(row.id)) ?? false);
  const stages = (side.after.get('line_status') ?? []).filter((row) => isNew('line_status', row));
  // A posted entry of a posting matched in this pass (a new ledger_match), not only a new entry of an older match.
  const newMatches = new Set((side.after.get('ledger_match') ?? []).filter((row) => isNew('ledger_match', row)).map((row) => String(row.id)));
  const postedLines = new Set(
    (side.after.get('ledger_entry') ?? []).filter((row) => isNew('ledger_entry', row) && row.stage === 'posted' && newMatches.has(String(row.match_id))).map((row) => String(row.service_line_id)),
  );
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
  // The PLB L6 alone: a claim's AMT I credits nothing since the interest fix (docs/adr/0084), on either side.
  expect(summary.remittances.interest, `${run}: interest`).toBe(1);
  expect(summary.remittances.interestTakenBack, `${run}: interest taken back`).toBe(0);
  expect((side.after.get('ledger_entry') ?? []).filter((row) => row.stage === 'interest').map((row) => row.evidence_kind), `${run}: interest from the PLB L6 alone`).toEqual(['provider_adjustment']);
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
  // A case line with no service date (its claim's statement dates carry it, as PRICEABLE_LINE's coalesce reads them),
  // matched in the pass to a claim whose line has none either: the patient search's IS NOT DISTINCT FROM branch.
  const serviceLines = side.after.get('service_line') ?? [];
  const claims = new Map((side.after.get('claim') ?? []).map((row) => [String(row.id), row]));
  const dateless = new Set(serviceLines.filter((row) => row.service_date === null).map((row) => String(row.id)));
  const datelessCaseLines = (side.after.get('case_line') ?? []).filter((row) => {
    const serviceLine = serviceLines.find((item) => item.id === row.service_line_id);
    return dateless.has(String(row.service_line_id)) && claims.get(String(serviceLine?.claim_id))?.service_from !== null;
  });
  expect(datelessCaseLines.length, `${run}: a case line with no service date`).toBeGreaterThan(0);
  const datelessClaims = new Set(serviceLines.filter((row) => dateless.has(String(row.id))).map((row) => String(row.claim_id)));
  expect(
    matches.some((row) => row.kind === 'claim' && datelessCaseLines.some((item) => item.service_line_id === row.service_line_id) && datelessClaims.has(String(row.claim_id))),
    `${run}: a line with no service date matched by patient control number`,
  ).toBe(true);
  // Claims of more than one line matched in the pass (finding 2.1): the two-code claim's correction to its case line,
  // and the claim with one code twice to both of its patient's sibling lines, which share a claim.
  const linesOfClaim = new Map<string, number>();
  for (const row of serviceLines) {
    linesOfClaim.set(String(row.claim_id), (linesOfClaim.get(String(row.claim_id)) ?? 0) + 1);
  }
  const multiLine = matches.filter((row) => row.kind === 'claim' && (linesOfClaim.get(String(row.claim_id)) ?? 0) >= 2);
  expect(multiLine.length, `${run}: claim matches to claims of two lines`).toBeGreaterThanOrEqual(3);
  expect(new Set(multiLine.map((row) => String(row.claim_id))).size, `${run}: a claim of two lines matched to two case lines`).toBeLessThan(multiLine.length);
  // A claim of the line's patient, code and date paired after its correction by control number (the second round).
  expect(matches.filter((row) => row.kind === 'claim').length, `${run}: claim matches`).toBeGreaterThan(built.plan.roles.filter((role) => role === 'control').length);
}

/**
 * D2's ground (the pull request's review, finding 1.2): a claim's lines as claimLines gives them depend only on the
 * claim's own correction chain, so reading it among other claims gives what reading it alone gives, and the pass's one
 * map equals each line's fresh read. Held here on a world as its pass finds it (the pass writes none of the rows read), for every claim of the practice at once
 * against a sample read one by one (chains of three, claims of two lines with a claim-level share kept among them).
 */
async function expectClaimLinesIndependent(url: string, built: BuiltWorld, side: SideResult): Promise<void> {
  const claimIds = (side.after.get('claim') ?? []).map((row) => String(row.id)).sort();
  const matched = new Set((side.after.get('ledger_match') ?? []).filter((row) => row.kind === 'claim').map((row) => String(row.claim_id)));
  // Every matched claim (the chains), and every seventh of the rest.
  const sample = claimIds.filter((claimId, index) => matched.has(claimId) || index % 7 === 0);
  const pool = openPool(workerDevLoginUrl(url), 2);
  try {
    await withJobScope(pool, { jobId: randomUUID(), practiceId: built.practice.practiceId }, async (scope) => {
      const together = await claimLines(scope, claimIds);
      expect(sample.length).toBeGreaterThan(40);
      for (const claimId of sample) {
        const alone = await claimLines(scope, [claimId]);
        // Compared as text and asserted as a yes or no, so a failure names the run and never prints a line's values.
        const text = (lines: unknown) => JSON.stringify(lines, (_key, value: unknown) => (typeof value === 'bigint' ? String(value) : value));
        expect(text(alone.get(claimId)) === text(together.get(claimId)), `run ${String(built.plan.run)}: a claim's lines read alone against read among every claim`).toBe(true);
      }
    });
  } finally {
    await endPool(pool);
  }
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
    const pairs = { shared: 0 };
    const shippedSide = await side('shipped', shipped, watchPatientPairs(pairs));
    // Two claims at least (the one in a sibling's own remittance, the one loaded between the siblings' claims) that
    // (b) kept for one line of their patient and refused for another: without them (b)'s own clauses decide nothing.
    expect(pairs.shared, `run ${String(run)}: claims the patient search's second statement kept for one line of a patient and refused for another`).toBeGreaterThanOrEqual(2);
    const self = await side('reference again', reference);

    const against: Comparison = compare(ref, shippedSide, before, built.practice);
    expect(against.differences, `run ${String(run)}: the shipped pass against the per-line reference`).toEqual([]);
    const itself = compare(ref, self, before, built.practice, { postingsDecryptOnce: false });
    expect(itself.differences, `run ${String(run)}: the reference against itself (the settle rule)`).toEqual([]);
    facts.selfRuns += 1;
    facts.partialCheckRuns += itself.partialCheck ? 1 : 0;
    facts.strictSettleWouldDiffer += itself.strictSettleWouldDiffer || against.strictSettleWouldDiffer ? 1 : 0;

    if (run === 0) {
      const copy = await clone(adminUrl, database);
      clones.push(copy);
      await expectClaimLinesIndependent(copy.url, built, ref);
    }
    if (run === 1) {
      for (const mutant of MUTANTS) {
        let applied = 0;
        const differences = await side(mutant.name, shipped, mutant.middleware(() => (applied += 1))).then(
          (result) => compare(ref, result, before, built.practice).differences,
          (error: unknown) => {
            // Only the guard the mutant names, by its fixed message (never a row's value): anything else fails the run.
            const { code, message } = error as { readonly code?: string; readonly message?: string };
            if (mutant.refusedBy === undefined || code !== '23514' || message !== mutant.refusedBy) {
              throw error;
            }
            return [refused(message)];
          },
        );
        facts.mutants.set(mutant.name, { applied, differences });
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

  // ledgerMatches reads in ledger_match.seq order (docs/adr/0084), which both sides write alike: no run's settle entries differ row for row.
  it('finds no run whose settle entries would differ row for row', () => {
    expect(facts.strictSettleWouldDiffer).toBe(0);
  });

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

  it('fails each of the twenty-three self-check mutants on run 1', () => {
    if (RUNS < 2) {
      return;
    }
    expect([...facts.mutants.keys()]).toEqual(MUTANTS.map((mutant) => mutant.name));
    // Soft, so one run names every mutant that survived, not only the first.
    for (const mutant of MUTANTS) {
      const result = facts.mutants.get(mutant.name) as { applied: number; differences: readonly string[] };
      expect.soft(result.applied, `${mutant.name}: did not apply (aim it at the code under test)`).toBeGreaterThan(0);
      expect.soft(result.differences.length, `${mutant.name}: the comparison did not fail`).toBeGreaterThan(0);
      if (mutant.differs !== undefined) {
        expect.soft(result.differences.every(mutant.differs), `${mutant.name}: failed for another reason than its own`).toBe(true);
      }
      if (mutant.refusedBy !== undefined) {
        expect.soft(result.differences, `${mutant.name}: not stopped by its guard`).toEqual([refused(mutant.refusedBy)]);
      } else {
        expect.soft(result.differences.some((difference) => difference.startsWith('refused: ')), `${mutant.name}: stopped by a guard, not by the comparison`).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// CAS-49.3: stage events in one statement
// ---------------------------------------------------------------------------------------------------------------------

/** line_status_rules()' refusal of a stage set again or an earlier one without a reopen, word for word as today. */
const FORWARD_ONLY = 'line stages move forward only; setting a stage again or an earlier one is an explicit reopen with a reason';

/**
 * CAS-49.3 (SUITE-CAP-3 D3; design section 7): insertStages writes a pass's stage events in one statement, in the order
 * given, under the base's line_status_rules() (SUITE-CAP-1b's head-row body; the pre-1b body is gone from the base, so
 * there is one body to hold, 12.1). Each row draws its seq as it is formed and its BEFORE triggers see the rows before
 * it, so a line's payer approved and then its recovered are written with ascending seq and both pass their checks, the
 * head row holds the last, another line's event between them changes nothing, and a recovered line's move back carries
 * its note; the same events given recovered first are refused with today's message, the statement issued once (only a
 * deadlock is retried; stages.test.ts proves the retry's bounds), and nothing is written. Once as the reconcile job (in
 * no one's name) and once as a person (the manual actions' finish()). Synthetic data only.
 */
describe('stage events in one statement (CAS-49.3)', () => {
  let stage: StageWorld | undefined;

  beforeAll(async () => {
    stage = await buildStageWorld(adminUrl);
  }, 600_000);

  afterAll(async () => {
    await stage?.world.close();
  });

  const eventsOf = async (built: StageWorld, trio: StageTrio) =>
    built.world.rows<{ service_line_id: string; stage: string; reopened_from: string | null; set_by: string | null; reason: string | null; seq: string }>(
      built.practice,
      // Ordered by the column, not the text alias (which would sort "32" before "4").
      'SELECT s.service_line_id, s.stage, s.reopened_from, s.set_by, s.reason, s.seq::text AS seq FROM line_status s WHERE s.service_line_id = ANY ($1::uuid[]) ORDER BY s.seq',
      [[trio.p, trio.q, trio.r]],
    );
  const headsOf = async (built: StageWorld, trio: StageTrio) =>
    new Map(
      (
        await built.world.rows<{ service_line_id: string; stage: string; seq: string }>(built.practice, 'SELECT service_line_id, stage, seq::text FROM line_status_head WHERE service_line_id = ANY ($1::uuid[])', [
          [trio.p, trio.q, trio.r],
        ])
      ).map((row) => [row.service_line_id, `${row.stage}@${row.seq}`]),
    );

  for (const writer of ['job', 'person'] as const) {
    it(`writes a line's payer approved then recovered, another line's event and a move back in one statement, in order (${writer === 'job' ? 'the reconcile job' : 'a person'})`, async () => {
      const built = stage as StageWorld;
      const { practice } = built;
      const trio = built[writer];
      const setBy = writer === 'job' ? null : practice.manager;
      // Every statement insertStages issues, recorded in issue order (the stage write as one word).
      let statements: string[] = [];
      const recorded = (scope: Scope): Scope => ({
        ...scope,
        client: {
          query: (text: string, values?: unknown[]) => {
            statements.push(/^\s*INSERT INTO line_status\b/.test(text) ? 'write' : text);
            return scope.client.query(text, values);
          },
          release: (destroy) => scope.client.release(destroy),
        },
      });
      const write = (events: readonly StageEvent[]) => {
        statements = [];
        return writer === 'job'
          ? withJobScope(built.world.app, { jobId: randomUUID(), practiceId: practice.practiceId }, (scope) => insertStages(recorded(scope as Scope), practice.practiceId, events, null))
          : withPracticeScope(built.world.app, { actorId: practice.manager, practiceIds: [practice.practiceId] }, (scope) =>
              insertStages(recorded(scope as Scope), practice.practiceId, events, practice.manager),
            );
      };
      const before = await eventsOf(built, trio);
      const headsBefore = await headsOf(built, trio);

      // Given recovered first, the line's payer approved is a step back: refused with today's message, nothing written.
      await expect(
        write([
          { serviceLineId: trio.p, stage: 'recovered' },
          { serviceLineId: trio.p, stage: 'payer_approved' },
        ]),
      ).rejects.toMatchObject({ code: '23514', message: FORWARD_ONLY });
      // Issued once and left to stand: only a deadlock is retried under the savepoint (section 4).
      expect(statements).toEqual(['SAVEPOINT stage_events', 'write']);
      expect(await eventsOf(built, trio)).toEqual(before);
      expect(await headsOf(built, trio)).toEqual(headsBefore);

      // In order, with q's event between p's two and r's move back last: every row written as given, seq ascending.
      const note = practice.cipher.encrypt('line_status.reason', REOPEN_NOTES.proofLevel);
      await write([
        { serviceLineId: trio.p, stage: 'payer_approved' },
        { serviceLineId: trio.q, stage: 'payer_approved' },
        { serviceLineId: trio.p, stage: 'recovered' },
        { serviceLineId: trio.r, stage: 'payer_approved', reopen: { from: 'recovered', reason: note } },
      ]);
      expect(statements).toEqual(['SAVEPOINT stage_events', 'write', 'RELEASE SAVEPOINT stage_events']);
      const after = await eventsOf(built, trio);
      expect(after.slice(0, before.length)).toEqual(before);
      const written = after.slice(before.length);
      const name = new Map([
        [trio.p, 'p'],
        [trio.q, 'q'],
        [trio.r, 'r'],
      ]);
      expect(written.map((row) => [name.get(row.service_line_id), row.stage, row.reopened_from, row.set_by])).toEqual([
        ['p', 'payer_approved', null, setBy],
        ['q', 'payer_approved', null, setBy],
        ['p', 'recovered', null, setBy],
        ['r', 'payer_approved', 'recovered', setBy],
      ]);
      expect(written.every((row, index) => index === 0 || BigInt(row.seq) > BigInt((written[index - 1] as { seq: string }).seq))).toBe(true);
      // The move back's note, by its decrypted text (never logged).
      expect(practice.cipher.decrypt('line_status.reason', (written[3] as { reason: string }).reason)).toBe(REOPEN_NOTES.proofLevel);
      // Each line's head row holds its last event.
      const heads = await headsOf(built, trio);
      const last = (line: string) => [...written].reverse().find((row) => row.service_line_id === line) as { stage: string; seq: string };
      for (const line of [trio.p, trio.q, trio.r]) {
        expect(heads.get(line)).toBe(`${last(line).stage}@${last(line).seq}`);
      }
    }, 120_000);
  }
});
