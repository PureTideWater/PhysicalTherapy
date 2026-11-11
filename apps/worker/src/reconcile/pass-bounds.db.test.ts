import { readDatabaseUrl } from '@tp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type StoredMatch, ledgerMatches } from './ledger';
import { reconcilePractice } from './pass';
import { LedgerWorld } from './test-support/ledger-world';
import { FAMILY, type Measured, type Seeded, countOf, isSearch, measuredPass, seedStep7b } from './test-support/pass-at-size';
import { type BuiltWorld, buildWorld, worldPlan } from './test-support/pass-world';

/**
 * CAS-50 (SUITE-CAP-3 D1 to D3, D7, D11, D15 and D16; docs/adr/0087; design section 7): a reconcile pass's reads do
 * not grow per line. A step-7b practice (LED-06's SYNTHETIC segments, as CAS-42.3 seeds them: every line approved and
 * posted in one pass) at SMALL and at LARGE lines, one pass each through reconcilePractice, with a proxy over the job
 * scope's client recording every statement in issue order and a wrapper over PracticeCipher.decrypt counting decrypts:
 *
 * - the candidate statements (the control-number search, one a round; the patient search's (a) and (b), once a pass)
 *   and the search's own claimLines calls (one a round with unread candidates) are at most 2 + 2 x rounds, the same at
 *   both sizes; the pass's other claimLines calls are exactly the three practice-wide ones (matchClaims' and
 *   recoupReversals' chainContext, and the shares' through settleMatches). Every caller issues claimLines' one text, so
 *   the calls are told apart by position (review round 5): each round issues the control search and then, with unread
 *   candidates, claimLines, and the search ends on a round with none, so the search's own calls are exactly those
 *   between the first and the last control search; matchClaims' chainContext comes before the first, the other two
 *   after the last, where a per-line read in reprocessingOf would land too and fail the count. recoupReversals reads
 *   its chainContext only when a standing approved claim match exists (else 2 is correct, on the base as well), so that
 *   precondition is asserted first: a later change of world fails on it, not on correct code;
 * - the patient search's (a) selects no service_line column (its outer select list is parsed: the claim's ID, its
 *   remittance, the payment date, the load time and its patient control number), (b) selects only the pair, and (b)'s
 *   pairs are only those whose decrypted patient control numbers are equal (review rounds 2 and 3);
 * - the stage events are one statement;
 * - each claim's patient control number is decrypted at most once in each phase of the pass (the search, the postings),
 *   besides caseLines' one per case line;
 * - the never-matched posting and EFT rows are two statements each (the EXCEPT and the read by ID), and the EXCEPT
 *   returns exactly the IDs the read takes (D15);
 * - no candidate statement names ledger_match (D16); every table alias of every search statement carries
 *   `practice_id = $1` in its own SELECT level, per binding (D11, parsed from the statement's FROM and JOIN clauses, so
 *   a reused alias name scoped in one level does not cover another); and the patient search's arrays hold only claim
 *   matches of the practice whose claim the line's chain does not know. In the step-7b world no claim match exists
 *   before the pass, so the arrays are empty there; that check bites in a small CAS-49.1 world (test-support/
 *   pass-world.ts, one seed, the proof level posted) measured once besides, whose history holds a person's unmatch
 *   (a reversed claim match) and lines approved in it and still open (standing matches the line's chain knows), and
 *   whose arrays must be non-empty, carry the reversed match and none of the known ones;
 * - one insert per ledger match and per entry written, as today; each remittance's claims read once (D7); the other
 *   per-row posting reads (the row's check, its named claims' lines) one per row, as today.
 *
 * Fails first on the base (the per-line reference, test-support/per-line.ts): two candidate statements per line and
 * round, two claimLines calls per line, a stage insert per event and every claim of a code and date decrypted once per
 * line of it. Counts only are printed; no row, parameter or plaintext.
 */

const SMALL = 200;
const LARGE = 800;
/** The CAS-49.1 world the D16 arrays are checked in: its run (even, so the proof level stays posted) and seed. */
const ARRAYS_RUN = 0;
const ARRAYS_SEED = 50;

let w: LedgerWorld;
let arrays: { readonly built: BuiltWorld; readonly before: readonly StoredMatch[]; readonly measured: Measured } | undefined;
const runs = new Map<number, { readonly seeded: Seeded; readonly before: readonly StoredMatch[]; readonly measured: Measured; readonly after: readonly StoredMatch[] }>();

const matchesOf = (seeded: Seeded) => w.manual(seeded.practice, ({ scope }) => ledgerMatches(scope, seeded.practice.practiceId));

beforeAll(async () => {
  w = await LedgerWorld.open(readDatabaseUrl());
  for (const [tag, lines] of [SMALL, LARGE].entries()) {
    const seeded = await seedStep7b(w, 'R', lines, tag + 1);
    const before = await matchesOf(seeded);
    const measured = await measuredPass(w, seeded.practice, seeded.exportId, (text) => isSearch(text) || FAMILY.neverMatched.test(text) || FAMILY.postingRows.test(text) || FAMILY.eftRows.test(text));
    runs.set(lines, { seeded, before, measured, after: await matchesOf(seeded) });
    process.stdout.write(
      `CAS-50: ${String(lines)} lines; ${String(measured.statements.length)} statements, ${String(countOf(measured, FAMILY.control))} control searches, ${String(countOf(measured, FAMILY.claimLines))} claimLines, ${String(measured.decrypts.length)} decrypts; pass ${(measured.passMs / 1000).toFixed(1)} s\n`,
    );
  }
  // The whole practice's pass, as CAS-49.1 runs it (no document named).
  const built = await buildWorld(readDatabaseUrl(), worldPlan(ARRAYS_RUN, ARRAYS_SEED, { min: 40, max: 60 }));
  const before = await built.world.manual(built.practice, ({ scope }) => ledgerMatches(scope, built.practice.practiceId));
  arrays = { built, before, measured: await measuredPass(built.world, built.practice, '', isSearch, (context, services, practiceId) => reconcilePractice(context, services, practiceId)) };
}, 1_800_000);

afterAll(async () => {
  await w.close();
  await arrays?.built.world.close();
});

const run = (lines: number) => {
  const found = runs.get(lines);
  if (found === undefined) {
    throw new Error('the pass at this size did not run');
  }
  return found;
};

/**
 * The patient search's D16 arrays ($10 claims, $11 line indexes, in both of its statements) set against the matches
 * read before the pass: the pairs, and those that are no claim match of the searched line's service line or whose claim
 * is among the line's known claims ($8, $9), which must be none.
 */
function d16Pairs(statement: Measured['statements'][number], before: readonly StoredMatch[]) {
  const [ixs, serviceLines, knownIx, knownClaims, claims, claimIxs] = [1, 2, 7, 8, 9, 10].map((index) => statement.values[index]) as [number[], string[], number[], string[], string[], number[]];
  const known = new Set(knownIx.map((ix, index) => `${String(ix)} ${knownClaims[index] as string}`));
  const byPair = new Map(before.filter((match) => match.kind === 'claim').map((match) => [`${match.serviceLineId ?? ''} ${match.claimId ?? ''}`, match]));
  const pairs = claims.map((claimId, index) => {
    const ix = claimIxs[index] as number;
    return { known: known.has(`${String(ix)} ${claimId}`), match: byPair.get(`${serviceLines[ixs.indexOf(ix)] as string} ${claimId}`) };
  });
  return { lengths: [claims.length, claimIxs.length], pairs, stray: pairs.filter((pair) => pair.known || pair.match === undefined) };
}

/** Each statement's index in issue order, for the statements of a family. */
const indexesOf = (measured: Measured, family: RegExp) => measured.statements.flatMap((statement, index) => (family.test(statement.text) ? [index] : []));

/** The search's shape: its rounds, its candidate statements, and claimLines' calls inside and outside it (by position). */
function searchOf(measured: Measured) {
  const controls = indexesOf(measured, FAMILY.control);
  const claimLines = indexesOf(measured, FAMILY.claimLines);
  const [first, last] = [controls[0] ?? -1, controls.at(-1) ?? -1];
  const inside = claimLines.filter((index) => index > first && index < last).length;
  return { rounds: controls.length, candidates: measured.statements.filter((statement) => isSearch(statement.text)).length, inside, outside: claimLines.length - inside };
}

/** The top-level items of a select list (split on the commas outside parentheses and quotes). */
function selectItems(list: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quoted = false;
  let current = '';
  for (const character of list) {
    if (character === "'") {
      quoted = !quoted;
    } else if (!quoted && character === '(') {
      depth += 1;
    } else if (!quoted && character === ')') {
      depth -= 1;
    } else if (!quoted && depth === 0 && character === ',') {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += character;
  }
  return [...items, current.trim()].filter((item) => item.length > 0);
}

/** The outer select list of a statement whose CTEs close before it: from `) SELECT` to its first top-level FROM. */
function outerSelect(text: string): string[] {
  const at = text.search(/\)\s*SELECT\s/);
  const rest = text.slice(at).replace(/^\)\s*SELECT\s/, '');
  const from = /\s+FROM\s+(claim|p)\s/.exec(rest);
  return selectItems(from === null ? rest : rest.slice(0, from.index));
}

/**
 * A statement's SELECT levels: the outer statement and each parenthesized subquery or CTE body (a group whose text
 * begins with SELECT or WITH), each with its nested levels blanked out, so a level's text holds only its own FROM, JOIN,
 * ON and WHERE clauses (a UNION's branches share their group's level). Parentheses inside quotes are text.
 */
function levelsOf(text: string): string[] {
  const levels: string[] = [];
  const stack: string[] = [''];
  let quoted = false;
  for (const character of text) {
    if (character === "'") {
      quoted = !quoted;
    }
    if (!quoted && character === '(') {
      stack.push('');
    } else if (!quoted && character === ')' && stack.length > 1) {
      const group = stack.pop() as string;
      const subquery = /^\s*(?:SELECT|WITH)\b/i.test(group);
      if (subquery) {
        levels.push(group);
      }
      stack[stack.length - 1] += subquery ? ' ' : `(${group})`;
    } else {
      stack[stack.length - 1] += character;
    }
  }
  return [...levels, stack.join(' ')];
}

/**
 * A statement's table aliases (FROM or JOIN a table, not a CTE or unnest), one entry per binding, each scoped when its
 * own SELECT level carries at least as many `alias.practice_id = $1` predicates as it binds the alias (D11, per
 * occurrence: a predicate on a reused alias name elsewhere in the statement, as `claim c` inside the control search's
 * `probe` and in its outer query, does not scope another binding of it).
 */
function aliasesOf(text: string): { readonly table: string; readonly alias: string; readonly scoped: boolean }[] {
  const ctes = new Set([...text.matchAll(/(?:WITH|,)\s*(\w+)\s*\([^()]*\)\s*AS\s*\(/g)].map((match) => match[1] as string));
  return levelsOf(text).flatMap((level) => {
    // The alias is read ahead, not consumed, so `FROM l JOIN service_line s` still finds the JOIN after a CTE.
    const bound = [...level.matchAll(/\b(?:FROM|JOIN)\s+("?\w+"?)\s+(?=(\w+)\b)/g)]
      .map((match) => ({ table: (match[1] as string).replaceAll('"', ''), alias: match[2] as string }))
      .filter(({ table }) => !ctes.has(table) && table !== 'unnest');
    const bindings = (alias: string) => bound.filter((item) => item.alias === alias).length;
    const predicates = (alias: string) => [...level.matchAll(new RegExp(`\\b${alias}\\.practice_id = \\$1\\b`, 'g'))].length;
    return bound.map(({ table, alias }) => ({ table, alias, scoped: predicates(alias) >= bindings(alias) }));
  });
}

describe('a reconcile pass’s reads do not grow per line (CAS-50)', () => {
  it('bounds the candidate statements and the search’s claimLines calls by 2 + 2 x rounds, the same at both sizes, and reads claimLines three times besides', () => {
    const [small, large] = [searchOf(run(SMALL).measured), searchOf(run(LARGE).measured)];
    for (const [lines, search] of [[SMALL, small], [LARGE, large]] as const) {
      expect(search.candidates + search.inside, `${String(lines)} lines: candidate statements and the search's claimLines`).toBeLessThanOrEqual(2 + 2 * search.rounds);
      expect(search.rounds, `${String(lines)} lines: rounds`).toBeGreaterThan(0);
      // The precondition of the count of 3: a standing approved claim match when recoupReversals runs (it re-reads the
      // matches after matchClaims; nothing later in the pass reverses a claim match).
      const { after, seeded } = run(lines);
      expect(after.filter((match) => match.kind === 'claim' && match.standing && match.outcome === 'approved'), `${String(lines)} lines: standing approved claim matches`).toHaveLength(seeded.lines);
      expect(search.outside, `${String(lines)} lines: the practice-wide claimLines calls`).toBe(3);
    }
    expect(large).toEqual(small);
  });

  it('selects no service line column in the patient search, and pairs only claims whose patient control numbers are equal', async () => {
    for (const lines of [SMALL, LARGE]) {
      const { measured, seeded } = run(lines);
      const patients = measured.statements.filter((statement) => FAMILY.patient.test(statement.text));
      expect(patients, `${String(lines)} lines: one patient statement (a)`).toHaveLength(1);
      expect(outerSelect((patients[0] as { text: string }).text)).toEqual([
        'c.id',
        'c.remittance_id',
        "to_char(r.bpr16_date, 'YYYY-MM-DD') AS paid_on",
        '(extract(epoch FROM c.created_at) * 1000000)::bigint::text AS loaded_at',
        'c.patient_control_number',
      ]);
      const pairs = measured.statements.filter((statement) => FAMILY.patientPairs.test(statement.text));
      expect(pairs, `${String(lines)} lines: one patientPairs statement (b)`).toHaveLength(1);
      const [statement] = pairs as [(typeof pairs)[number]];
      expect(outerSelect(statement.text)).toEqual(['p.claim_id', 'p.ix']);
      // (b)'s pairs: the claim's and the searched line's claim's patient control numbers, decrypted here in memory and
      // compared, never printed. $2 holds the lines' indexes, $5 their claims; $12 and $13 the pairs.
      const [ixs, lineClaims, pairClaims, pairIxs] = [statement.values[1], statement.values[4], statement.values[11], statement.values[12]] as [number[], string[], string[], number[]];
      expect(pairClaims.length).toBe(pairIxs.length);
      expect(pairClaims.length, `${String(lines)} lines: (b) is sent the patient matches`).toBeGreaterThan(0);
      const ids = [...new Set([...pairClaims, ...lineClaims])];
      const numbers = new Map(
        (await w.rows<{ id: string; patient_control_number: string }>(seeded.practice, 'SELECT id, patient_control_number FROM claim WHERE practice_id = $1 AND id = ANY ($2::uuid[])', [seeded.practice.practiceId, ids])).map((row) => [
          row.id,
          seeded.practice.cipher.decrypt('claim.patient_control_number', row.patient_control_number),
        ]),
      );
      const unequal = pairClaims.filter((claimId, index) => numbers.get(claimId) !== numbers.get(lineClaims[ixs.indexOf(pairIxs[index] as number)] as string));
      expect(unequal, `${String(lines)} lines: pairs whose patient control numbers differ`).toHaveLength(0);
    }
  });

  it('writes the stage events in one statement', () => {
    for (const lines of [SMALL, LARGE]) {
      expect(countOf(run(lines).measured, FAMILY.lineStatus), `${String(lines)} lines`).toBe(1);
      expect(run(lines).measured.summary.stages.forward, `${String(lines)} lines: stage events`).toBe(2 * lines);
    }
  });

  it('decrypts each claim’s patient control number at most once in each phase, besides caseLines’ one per case line', () => {
    for (const lines of [SMALL, LARGE]) {
      const { measured, seeded } = run(lines);
      const caseLinesAt = indexesOf(measured, FAMILY.caseLines);
      expect(caseLinesAt, `${String(lines)} lines: one caseLines read`).toHaveLength(1);
      const at = (caseLinesAt[0] as number) + 1;
      const postingsAt = (indexesOf(measured, FAMILY.postingRows)[0] ?? Number.POSITIVE_INFINITY) + 1;
      const claims = measured.decrypts.filter((decrypt) => decrypt.column === 'claim.patient_control_number');
      expect(claims.filter((decrypt) => decrypt.after === at), `${String(lines)} lines: caseLines' decrypts`).toHaveLength(seeded.lines);
      const phases = new Map<string, Map<string, number>>();
      for (const decrypt of claims.filter((item) => item.after !== at)) {
        const phase = decrypt.after < at ? 'before' : decrypt.after < postingsAt ? 'search' : 'postings';
        const counts = phases.get(phase) ?? new Map<string, number>();
        counts.set(decrypt.ciphertext, (counts.get(decrypt.ciphertext) ?? 0) + 1);
        phases.set(phase, counts);
      }
      for (const [phase, counts] of phases) {
        expect([...counts.values()].filter((count) => count > 1), `${String(lines)} lines, ${phase}: claims decrypted more than once`).toHaveLength(0);
      }
      // The search decrypts each claim the patient search returned, and the postings each claim of the checks they
      // name.
      expect(phases.get('search')?.size ?? 0, `${String(lines)} lines: claims decrypted in the search`).toBeGreaterThan(0);
      expect(phases.get('postings')?.size ?? 0, `${String(lines)} lines: claims decrypted in the postings`).toBeGreaterThan(0);
    }
  });

  it('reads the never-matched posting and EFT rows in two statements each, the EXCEPT returning exactly the IDs the read takes', () => {
    for (const lines of [SMALL, LARGE]) {
      const { measured } = run(lines);
      for (const [column, read] of [
        ['posting_row_id', FAMILY.postingRows],
        ['eft_row_id', FAMILY.eftRows],
      ] as const) {
        const except = indexesOf(measured, FAMILY.neverMatched).filter((index) => (measured.statements[index] as { text: string }).text.includes(`m.${column}`));
        const reads = indexesOf(measured, read);
        expect([except.length, reads.length], `${String(lines)} lines, ${column}`).toEqual([1, 1]);
        const [ids, rows] = [measured.statements[except[0] as number], measured.statements[reads[0] as number]] as [Measured['statements'][number], Measured['statements'][number]];
        expect(reads[0], `${String(lines)} lines, ${column}: the read follows its EXCEPT`).toBe((except[0] as number) + 1);
        expect(rows.values[1], `${String(lines)} lines, ${column}: the read takes the EXCEPT's IDs`).toEqual(ids.rows.map((row) => row.id));
        expect(rows.rowCount, `${String(lines)} lines, ${column}: the EXCEPT returns as many IDs as the read reads rows`).toBe(ids.rowCount);
      }
      expect(measured.statements.find((statement) => FAMILY.postingRows.test(statement.text))?.rowCount, `${String(lines)} lines: posting rows`).toBe(lines);
    }
  });

  it('names ledger_match in no candidate statement, holds every table alias of the search to the practice, and sends only matches the chain does not know', () => {
    for (const lines of [SMALL, LARGE]) {
      const { measured, before, seeded } = run(lines);
      const search = measured.statements.filter((statement) => isSearch(statement.text));
      expect(search.length).toBeGreaterThan(0);
      for (const statement of search) {
        expect(statement.text, `${String(lines)} lines`).not.toMatch(/\bledger_match\b/);
        const aliases = aliasesOf(statement.text);
        expect(aliases.length).toBeGreaterThan(0);
        expect(
          aliases.filter((alias) => !alias.scoped).map((alias) => `${alias.table} ${alias.alias}`),
          `${String(lines)} lines: aliases without practice_id = $1`,
        ).toEqual([]);
      }
      // The patient search's arrays: each pair a claim match of the practice, read before the pass, of the searched
      // line's service line, whose claim is not among the line's known claims (empty here: no claim match predates the
      // step-7b pass; the CAS-49.1 world below gives the check something to bite on).
      for (const statement of search.filter((item) => FAMILY.patient.test(item.text) || FAMILY.patientPairs.test(item.text))) {
        const { lengths, stray } = d16Pairs(statement, before);
        expect(lengths[0]).toBe(lengths[1]);
        expect(stray, `${String(lines)} lines: pairs that are no unknown claim match of the line`).toHaveLength(0);
      }
      // $1, which every alias's predicate names, is the practice the pass runs for.
      expect(new Set(search.map((statement) => statement.values[0]))).toEqual(new Set([seeded.practice.practiceId]));
    }
  });

  it('sends the patient search only claim matches the line’s chain does not know, in a world whose history holds them (D16)', () => {
    if (arrays === undefined) {
      throw new Error('the CAS-49.1 world did not run');
    }
    const { measured, before, built } = arrays;
    // The world's history: a person's unmatch, and claim matches still standing (lines approved and still open).
    expect(before.some((match) => match.kind === 'claim' && !match.standing), 'a reversed claim match before the pass').toBe(true);
    expect(before.some((match) => match.kind === 'claim' && match.standing), 'a standing claim match before the pass').toBe(true);
    const patients = measured.statements.filter((statement) => FAMILY.patient.test(statement.text) || FAMILY.patientPairs.test(statement.text));
    expect(patients.length, 'the patient search ran').toBeGreaterThan(0);
    for (const statement of patients) {
      const { lengths, pairs, stray } = d16Pairs(statement, before);
      expect(lengths[0]).toBe(lengths[1]);
      expect(lengths[0], 'the arrays carry the matches the chains do not know').toBeGreaterThan(0);
      expect(pairs.some((pair) => pair.match?.standing === false), 'the arrays carry a reversed claim match').toBe(true);
      expect(stray.length, 'pairs that are no claim match of the line, or whose claim the line knows').toBe(0);
    }
    // $1 is the world's practice, not its second practice with the same numbers.
    expect(new Set(patients.map((statement) => statement.values[0]))).toEqual(new Set([built.practice.practiceId]));
  });

  it('writes one insert per ledger match and entry, reads each remittance’s claims once and each posting row’s check and named lines once', () => {
    for (const lines of [SMALL, LARGE]) {
      const { measured, before, after, seeded } = run(lines);
      // A claim match and a posting match per line; an approved and a posted entry per line.
      expect(countOf(measured, FAMILY.ledgerMatch), `${String(lines)} lines: ledger_match inserts`).toBe(after.length - before.length);
      expect(after.length - before.length).toBe(2 * seeded.lines);
      expect(countOf(measured, FAMILY.ledgerEntry), `${String(lines)} lines: ledger_entry inserts`).toBe(2 * seeded.lines);
      expect(countOf(measured, FAMILY.remittancesOf), `${String(lines)} lines: each row's check`).toBe(seeded.lines);
      expect(countOf(measured, FAMILY.namedLines), `${String(lines)} lines: each row's named claim's lines`).toBe(seeded.lines);
      const claimReads = measured.statements.filter((statement) => FAMILY.remittanceClaims.test(statement.text)).map((statement) => statement.values[0] as string);
      expect(claimReads.length, `${String(lines)} lines: claim reads`).toBe(new Set(claimReads).size);
      expect(claimReads.length, `${String(lines)} lines: one claim read per check`).toBe(Math.ceil(seeded.lines / 20));
    }
  });
});
