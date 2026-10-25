import { cents } from '@tp/money';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { roiStatement } from './roi';
import { type CountedStage, type LedgerEntry, LedgerError } from './stages';
import { ROI_CSV_COLUMNS, type StoredStatement, csvField, recomputeStatement, roiStatementCsv } from './statement';
import { entriesById } from './totals';

let counter = 0;
function make(stage: CountedStage | 'reversed', amount: bigint, options: { line?: string | null; on?: string; corrects?: LedgerEntry; caseId?: string; allocated?: boolean } = {}): LedgerEntry {
  counter += 1;
  const evidence = { approved: 'claim', posted: 'posting_row', deposited: 'eft_row', recouped: 'provider_adjustment', interest: 'provider_adjustment', reversed: 'ledger_entry' } as const;
  return {
    id: `${stage}-${String(counter)}`,
    caseId: options.caseId ?? 'case-1',
    serviceLineId: options.line === undefined ? 'line-1' : options.line,
    stage,
    amountCents: cents(amount),
    evidenceKind: evidence[stage],
    evidenceId: options.corrects?.id ?? `evidence-${String(counter)}`,
    allocated: options.allocated ?? false,
    effectiveOn: options.on ?? '2026-06-10',
  };
}

/** The LED-06 ledger: approved 30.00, posted 30.00, deposited 30.00, recouped 18.00, with interest of 4.11. */
function led06(): LedgerEntry[] {
  return [make('approved', 3000n), make('posted', 3000n), make('deposited', 3000n), make('recouped', -1800n, { on: '2026-08-03' }), make('interest', 411n, { allocated: true })];
}

function stored(entries: readonly LedgerEntry[], periodFrom = '2026-04-01', periodTo = '2026-09-30', fees = 0n): StoredStatement {
  const statement = roiStatement({ periodFrom, periodTo, proofLevel: 'deposited', entries, feesCents: cents(fees), pursuitHours: '0.00', openCases: [{ caseId: 'case-9', actionableCents: cents(2500n) }] });
  return {
    periodFrom: statement.periodFrom,
    periodTo: statement.periodTo,
    proofLevel: statement.proofLevel,
    feesCents: statement.feesCents,
    recoveredCents: statement.recoveredCents,
    interestCents: statement.interestCents,
    approvedUnpostedCents: statement.approvedUnpostedCents,
    actionableOpenCents: statement.actionableOpenCents,
    pursuitHours: statement.pursuitHours,
    links: statement.links,
  };
}

describe('recomputing a stored statement from the entries it links (LED-11)', () => {
  it('gives each entry-backed figure again from its linked entries', () => {
    const entries = led06();
    const check = recomputeStatement(stored(entries), entriesById(entries));
    expect(check.matches).toBe(true);
    expect(check.recovered).toMatchObject({ storedCents: 1200n, recomputedCents: 1200n, matches: true });
    expect(check.recovered.entries.map((entry) => entry.stage)).toEqual(['deposited', 'recouped']);
    expect(check.interest).toMatchObject({ storedCents: 411n, recomputedCents: 411n, matches: true });
    expect(check.approvedUnposted).toMatchObject({ storedCents: 0n, recomputedCents: 0n, matches: true, entries: [] });
  });

  it('recomputes approved but not posted per line from its approvals and proof', () => {
    const approved = make('approved', 3000n);
    const deposited = make('deposited', 1800n, { allocated: true });
    const other = make('approved', 900n, { line: null, caseId: 'case-2' });
    const entries = [approved, deposited, other];
    const check = recomputeStatement(stored(entries), entriesById(entries));
    expect(check.approvedUnposted).toMatchObject({ storedCents: 2100n, recomputedCents: 2100n, matches: true });
  });

  it('says so when a stored figure is not what its entries give', () => {
    const entries = led06();
    const altered = { ...stored(entries), recoveredCents: cents(3000n) };
    const check = recomputeStatement(altered, entriesById(entries));
    expect(check.recovered.matches).toBe(false);
    expect(check.matches).toBe(false);
    expect(recomputeStatement({ ...stored(entries), interestCents: cents(1n) }, entriesById(entries)).matches).toBe(false);
    expect(recomputeStatement({ ...stored(entries), approvedUnpostedCents: cents(1n) }, entriesById(entries)).matches).toBe(false);
  });

  it('refuses a statement linking an entry the ledger does not hold', () => {
    const entries = led06();
    const statement = stored(entries);
    expect(() => recomputeStatement({ ...statement, links: { ...statement.links, recovered: ['missing'] } }, entriesById(entries))).toThrow(LedgerError);
  });

  it('matches for every generated statement (property)', () => {
    const entry = fc.record({
      stage: fc.constantFrom<CountedStage>('approved', 'posted', 'deposited', 'recouped', 'interest'),
      amount: fc.bigInt({ min: 1n, max: 500_000n }),
      line: fc.constantFrom('line-1', 'line-2', null),
      day: fc.integer({ min: 1, max: 28 }),
      month: fc.integer({ min: 4, max: 9 }),
    });
    fc.assert(
      fc.property(fc.array(entry, { maxLength: 30 }), (specs) => {
        const entries = specs.map((spec) =>
          make(spec.stage, spec.stage === 'recouped' ? -spec.amount : spec.amount, {
            line: spec.line,
            on: `2026-${String(spec.month).padStart(2, '0')}-${String(spec.day).padStart(2, '0')}`,
          }),
        );
        expect(recomputeStatement(stored(entries, '2026-05-01', '2026-07-31'), entriesById(entries)).matches).toBe(true);
      }),
    );
  });
});

describe('the statement CSV', () => {
  it('lists each figure with its entries beneath it, opaque IDs and codes only', () => {
    const entries = led06();
    const [, , deposited, recouped, interest] = entries as [LedgerEntry, LedgerEntry, LedgerEntry, LedgerEntry, LedgerEntry];
    const csv = roiStatementCsv(stored(entries), entriesById(entries));
    expect(csv.endsWith('\r\n')).toBe(true);
    expect(csv.split('\r\n').slice(0, -1)).toEqual([
      ROI_CSV_COLUMNS.join(','),
      'period_from,total,2026-04-01,date,,,,,',
      'period_to,total,2026-09-30,date,,,,,',
      'proof_level,total,deposited,stage,,,,,',
      'fees_paid,total,0.00,usd,,,,,',
      'recovered,total,12.00,usd,,,,,',
      `recovered,entry,30.00,usd,${deposited.id},case-1,deposited,2026-06-10,false`,
      `recovered,entry,-18.00,usd,${recouped.id},case-1,recouped,2026-08-03,false`,
      'interest,total,4.11,usd,,,,,',
      `interest,entry,4.11,usd,${interest.id},case-1,interest,2026-06-10,true`,
      'approved_unposted,total,0.00,usd,,,,,',
      'actionable_open,total,25.00,usd,,,,,',
      'actionable_open,case,,,,case-9,,,',
      'pursuit_hours,total,0.00,hours,,,,,',
      'recovered_to_fees,total,,ratio,,,,,',
    ]);
  });

  it('gives the ratio of recovered to fees where fees were paid', () => {
    const entries = led06();
    expect(roiStatementCsv(stored(entries, '2026-04-01', '2026-09-30', 600n), entriesById(entries))).toContain('recovered_to_fees,total,2.00,ratio,,,,,\r\n');
  });

  it('quotes a field that holds a comma, a quote or a line break', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "x"')).toBe('"say ""x"""');
    expect(csvField('two\nlines')).toBe('"two\nlines"');
  });
});

describe('the statement CSV beneath approved but not yet posted', () => {
  it('lists the entries of each line still approved and not proved beneath its total', () => {
    const approved = make('approved', 3000n);
    const deposited = make('deposited', 1800n, { allocated: true });
    const entries = [approved, deposited];
    const rows = roiStatementCsv(stored(entries), entriesById(entries)).split('\r\n');
    const at = rows.indexOf('approved_unposted,total,12.00,usd,,,,,');
    expect(at).toBeGreaterThan(0);
    expect(rows.slice(at + 1, at + 3)).toEqual([
      `approved_unposted,entry,30.00,usd,${approved.id},case-1,approved,2026-06-10,false`,
      `approved_unposted,entry,18.00,usd,${deposited.id},case-1,deposited,2026-06-10,true`,
    ]);
  });
});
