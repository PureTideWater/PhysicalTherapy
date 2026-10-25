import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../content-files';
import {
  type EquivalentEntry,
  type GateInput,
  aboveThreshold,
  expectedShardsOption,
  isLoadFailure,
  judge,
  parseExpectedShards,
  readEquivalentFiles,
  readEquivalents,
  readReportDirectory,
  readShardResults,
  readUnicodeFile,
  shardView,
  summaryMarkdown,
} from './gate';
import { keyOf } from './mutants';
import { TEST_SHARDS, canaryOf, equivalentOf, reportOf, scoredFile, shardResult } from './test-support';

/**
 * The mutation gate (tools/stryker/gate.ts; docs/adr/0066, Part 4; test matrix CI-16), on synthetic shard results: each
 * rule of the design's section 3.4.1 fails the gate alone, and the passing cases pass.
 */

const MONEY = 'packages/money/src/a.ts';
const LEDGER = 'packages/ledger/src/b.ts';
const PRICING_ONE = 'packages/pricing/src/c.ts';
const PRICING_TWO = 'packages/pricing/src/d.ts';

/** money and ledger fully run, each every mutant killed; the other packages not run. */
function moneyLedger(money = reportOf({ [MONEY]: scoredFile(4, 4) }), ledger = reportOf({ [LEDGER]: scoredFile(4, 4) })) {
  return shardResult('money-ledger', { money, ledger });
}

const input = (ran: GateInput['ran'], rest: Partial<GateInput> = {}): GateInput => ({ shards: TEST_SHARDS, ran, equivalents: {}, ...rest });

describe('the threshold: above 85%, strictly, per fully-run package', () => {
  it('fails 85.00% and passes 85.01%, compared in integers', () => {
    const at = (count: number, detected: number) => {
      const equivalents = { money: Array.from({ length: count - detected }, (_, index) => equivalentOf(MONEY, detected + index + 1)) };
      return judge(input(new Map([['money-ledger', moneyLedger(reportOf({ [MONEY]: scoredFile(count, detected) }))]]), { equivalents }));
    };
    const exactly = at(100, 85);
    expect(exactly.passed).toBe(false);
    expect(exactly.failures).toEqual(['money scores 85.00% (85 of 100), not above 85%']);
    const above = at(10_000, 8_501);
    expect(above.failures).toEqual([]);
    expect(above.passed).toBe(true);
    expect(above.packages.find((item) => item.pkg === 'money')?.scoreBasisPoints).toBe(8501);
    expect(aboveThreshold(17, 20)).toBe(false);
    expect(aboveThreshold(1, 0)).toBe(false);
  });

  it('leaves load failures out of the score, as Stryker does, and counts NoCoverage and Timeout as it does', () => {
    const report = reportOf({
      [MONEY]: {
        source: 'a b c d e f g h',
        mutants: [
          { original: 'a', status: 'Killed' },
          { original: 'b', status: 'Timeout' },
          { original: 'c', status: 'NoCoverage' },
          { original: 'd', status: 'RuntimeError', statusReason: 'An error occurred outside of a test run: /sandbox/packages/money/src/cents.test.ts: cents are built from a bigint' },
          ...['e', 'f', 'g', 'h'].map((original) => ({ original, status: 'Killed' as const })),
        ],
      },
    });
    const equivalents = { money: [{ ...equivalentOf(MONEY, 1), original: 'c' }] };
    const result = judge(input(new Map([['money-ledger', moneyLedger(report)]]), { equivalents }));
    expect(result.failures).toEqual([]);
    expect(result.packages.find((item) => item.pkg === 'money')).toMatchObject({ detected: 6, undetected: 1, errors: 1, scoreBasisPoints: 8571 });
  });

  it('fails a fully-run package with no valid mutant', () => {
    const report = reportOf({ [MONEY]: { source: 'a', mutants: [{ original: 'a', status: 'RuntimeError', statusReason: 'An error occurred outside of a test run: /s/x.test.ts: boom' }] } });
    expect(judge(input(new Map([['money-ledger', moneyLedger(report)]]))).failures).toEqual(['money: no valid mutant to score']);
  });
});

describe('survivors', () => {
  it('fails an unexplained Survived or NoCoverage mutant, naming its file, mutator, text, occurrence and replacement', () => {
    const report = reportOf({
      [MONEY]: {
        source: "const a = 'x';\nconst b = 'x';\n",
        mutants: [
          { original: "'x'", occurrence: 2, status: 'Survived', coveredBy: ['cents > reads a'] },
          { original: "'x'", occurrence: 1, status: 'Killed' },
        ],
      },
    });
    const ledger = reportOf({ [LEDGER]: { source: 'if (a) b();', mutants: [{ original: 'a', mutator: 'ConditionalExpression', replacement: 'true', status: 'NoCoverage' }] } });
    const result = judge(input(new Map([['money-ledger', moneyLedger(report, ledger)]])));
    expect(result.passed).toBe(false);
    expect(result.failures).toEqual([
      `money: unexplained Survived ${MONEY}:2:11 StringLiteral "'x'" #2 -> "\\"\\""; kill it with a test, or record it in tools/stryker/equivalent/money.json only if no input can tell it apart`,
      'money scores 50.00% (1 of 2), not above 85%',
      `ledger: unexplained NoCoverage ${LEDGER}:1:5 ConditionalExpression "a" #1 -> "true"; kill it with a test, or record it in tools/stryker/equivalent/ledger.json only if no input can tell it apart`,
      'ledger scores 0.00% (0 of 1), not above 85%',
    ]);
    // The log names the survivor's covering tests.
    expect(result.lines).toContain('      covered by: cents > reads a');
  });

  it('passes a survivor recorded as equivalent, and recording it leaves the score unchanged', () => {
    const report = reportOf({ [MONEY]: scoredFile(20, 19) });
    const without = judge(input(new Map([['money-ledger', moneyLedger(report)]])));
    const recorded = judge(input(new Map([['money-ledger', moneyLedger(report)]]), { equivalents: { money: [equivalentOf(MONEY, 20)] } }));
    expect(without.failures).toEqual([`money: unexplained Survived ${MONEY}:20:1 StringLiteral "x" #20 -> "\\"\\""; kill it with a test, or record it in tools/stryker/equivalent/money.json only if no input can tell it apart`]);
    expect(recorded.failures).toEqual([]);
    const score = (result: typeof without) => result.packages.find((item) => item.pkg === 'money');
    expect(score(recorded)?.scoreBasisPoints).toBe(9500);
    expect(score(recorded)?.scoreBasisPoints).toBe(score(without)?.scoreBasisPoints);
    expect(score(recorded)).toMatchObject({ detected: 19, undetected: 1 });
    expect(recorded.lines).toContain(`  equivalent Survived ${MONEY}:20:1 StringLiteral "x" #20 -> "\\"\\""`);
  });

  it('fails an equivalent that a test detects, or that breaks a load: it is not equivalent', () => {
    const report = reportOf({ [MONEY]: { source: 'x y z', mutants: [{ original: 'x', status: 'Killed' }, { original: 'y', status: 'RuntimeError', statusReason: 'An error occurred outside of a test run: /s/a.test.ts: no' }, { original: 'z', status: 'Killed' }] } });
    const equivalents = { money: [equivalentOf(MONEY, 1), { ...equivalentOf(MONEY, 1), original: 'y' }] };
    expect(judge(input(new Map([['money-ledger', moneyLedger(report)]]), { equivalents })).failures).toEqual([
      `tools/stryker/equivalent/money.json records ${MONEY}:1:1 StringLiteral "x" #1 -> "\\"\\"" as equivalent, but it is Killed: a test tells it apart, so it is not equivalent`,
      `tools/stryker/equivalent/money.json records ${MONEY}:1:3 StringLiteral "y" #1 -> "\\"\\"" as equivalent, but it breaks a test file's load`,
    ]);
  });
});

describe('runtime errors', () => {
  const withError = (reason: string | undefined) =>
    judge(input(new Map([['money-ledger', moneyLedger(reportOf({ [MONEY]: { source: 'a b c d e f g', mutants: [{ original: 'a', status: 'RuntimeError', ...(reason === undefined ? {} : { statusReason: reason }) }, ...['b', 'c', 'd', 'e', 'f', 'g'].map((original) => ({ original, status: 'Killed' as const }))] } }))]])));

  it('passes a test file’s load failure, as Stryker 10.1.1 reports it', () => {
    const reason =
      'An error occurred outside of a test run: /home/runner/work/x/.stryker-tmp/sandbox-yWdyc2/packages/pricing/src/properties.test.ts: cents are built from a bigint, never a number\n/home/runner/work/x/.stryker-tmp/sandbox-yWdyc2/packages/money/src/cents.test.ts: cents are built from a bigint, never a number';
    expect(isLoadFailure(reason)).toBe(true);
    expect(withError(reason).failures).toEqual([]);
  });

  it('fails any other error: an unhandled one, a non-test file, or none given', () => {
    for (const reason of ['An error occurred outside of a test run: Error: unhandled rejection', 'An error occurred outside of a test run: /s/packages/money/src/cents.ts: boom', 'Something else: /s/a.test.ts: boom', undefined]) {
      expect(isLoadFailure(reason), String(reason)).toBe(false);
      const result = withError(reason);
      expect(result.passed, String(reason)).toBe(false);
      expect(result.failures[0], String(reason)).toMatch(/^money: RuntimeError that is not a test file's load failure: /);
    }
  });

  it('fails a mutant ignored in the source, a compile error or a pending one', () => {
    for (const status of ['Ignored', 'CompileError', 'Pending'] as const) {
      const result = judge(input(new Map([['money-ledger', moneyLedger(reportOf({ [MONEY]: { source: 'a b c d e f g', mutants: [{ original: 'a', status }, ...['b', 'c', 'd', 'e', 'f', 'g'].map((original) => ({ original, status: 'Killed' as const }))] } }))]])));
      expect(result.failures, status).toHaveLength(1);
      expect(result.failures[0], status).toMatch(new RegExp(`^money: ${status} ${MONEY}:1:1 `));
    }
  });
});

describe('equivalents', () => {
  const files = new Set([MONEY]);

  it('fails a stale equivalent of a fully-run package', () => {
    const result = judge(input(new Map([['money-ledger', moneyLedger()]]), { equivalents: { money: [equivalentOf(MONEY, 9)] } }));
    expect(result.failures).toEqual([`tools/stryker/equivalent/money.json records ${MONEY} StringLiteral "x" #9 -> "\\"\\"", which no longer exists (stale): remove it`]);
  });

  it('passes a stale or unreviewed equivalent of a package that did not run', () => {
    const result = judge(input(new Map([['money-ledger', moneyLedger()]]), { equivalents: { pricing: [equivalentOf(PRICING_ONE, 3, { reviewedBy: '', reviewedOn: '' })] } }));
    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('requires a reviewer and a real date on every entry of a fully-run package', () => {
    const report = reportOf({ [MONEY]: scoredFile(20, 18) });
    for (const [overrides, why] of [
      [{ reviewedBy: '', reviewedOn: '' }, 'is not reviewed: reviewedBy and reviewedOn are empty'],
      [{ reviewedBy: 'the integrator', reviewedOn: '' }, 'is not reviewed: reviewedBy and reviewedOn are empty'],
      [{ reviewedOn: '2026-02-30' }, 'has reviewedOn "2026-02-30", not a YYYY-MM-DD date'],
      [{ reviewedOn: '25 October 2026' }, 'has reviewedOn "25 October 2026", not a YYYY-MM-DD date'],
    ] as const) {
      const equivalents = { money: [equivalentOf(MONEY, 19, overrides), equivalentOf(MONEY, 20)] };
      expect(judge(input(new Map([['money-ledger', moneyLedger(report)]]), { equivalents })).failures, why).toEqual([`tools/stryker/equivalent/money.json ${MONEY} StringLiteral "x" #19 -> "\\"\\"" ${why}`]);
    }
  });

  it('reads exactly the brief’s form: the nine keys in order, sorted by file, original and occurrence, no duplicate', () => {
    const ok = readEquivalents('money', [equivalentOf(MONEY, 1), equivalentOf(MONEY, 2), { ...equivalentOf(MONEY, 1), original: 'y' }], files);
    expect(ok.problems).toEqual([]);
    expect(readEquivalents('money', undefined, files)).toEqual({ entries: [], problems: [] });
    expect(readEquivalents('money', {}, files).problems).toEqual(['tools/stryker/equivalent/money.json: not a JSON array']);
    expect(readEquivalents('money', [equivalentOf(MONEY, 2), equivalentOf(MONEY, 1)], files).problems).toEqual([
      `tools/stryker/equivalent/money.json entry 2 (${MONEY} StringLiteral "x" #1 -> "\\"\\"") comes before entry 1: sort by file, then original, then occurrence`,
    ]);
    expect(readEquivalents('money', [equivalentOf(MONEY, 1), equivalentOf(MONEY, 1, { reason: 'again' })], files).problems).toEqual([
      `tools/stryker/equivalent/money.json entry 2 records ${MONEY} StringLiteral "x" #1 -> "\\"\\"" a second time`,
    ]);
    const { reason: _reason, ...withoutReason } = equivalentOf(MONEY, 1);
    expect(readEquivalents('money', [withoutReason], files).problems[0]).toMatch(/^tools\/stryker\/equivalent\/money\.json entry 1: its keys are file, mutator, original, occurrence, replacement, proposedBy, reviewedBy, reviewedOn; they must be exactly /);
    expect(readEquivalents('money', [{ ...equivalentOf(MONEY, 1), extra: 1 }], files).problems).toHaveLength(1);
    expect(readEquivalents('money', [equivalentOf(MONEY, 0)], files).problems).toEqual(['tools/stryker/equivalent/money.json entry 1: occurrence is not a whole number from 1']);
    expect(readEquivalents('money', [equivalentOf(MONEY, 1, { reason: '', proposedBy: '' })], files).problems).toEqual([
      'tools/stryker/equivalent/money.json entry 1: reason is empty',
      'tools/stryker/equivalent/money.json entry 1: proposedBy is empty',
    ]);
    expect(readEquivalents('money', [equivalentOf(LEDGER, 1)], files).problems).toEqual([`tools/stryker/equivalent/money.json entry 1: ${LEDGER} is not a file the money package's mutation run mutates`]);
    // A malformed file fails the gate whether or not its package ran.
    expect(judge(input(new Map(), { equivalents: { pricing: 'not a list' } })).failures).toEqual(['tools/stryker/equivalent/pricing.json: not a JSON array']);
  });
});

describe('which shards ran', () => {
  it('passes an empty run with its message', () => {
    const result = judge(input(new Map(), { expected: [] }));
    expect(result.passed).toBe(true);
    expect(result.packages.map((item) => item.state)).toEqual(['not affected', 'not affected', 'not affected', 'not affected']);
    expect(result.lines).toContain('No money path changed: no mutation run, nothing to judge.');
    expect(result.lines.at(-1)).toBe('mutation gate: passed');
  });

  it('fails a shard without its canary verdict, with one not 5 of 5, or with another shard’s', () => {
    for (const [canary, failure] of [
      [undefined, 'shard money-ledger ran with no canary verdict (canary.json), so its runner is unproved'],
      [canaryOf('money-ledger', [4]), "shard money-ledger's canary is 4 of 5 cases as expected, not 5 of 5"],
      [canaryOf('pricing-one'), "shard money-ledger's canary verdict is shard pricing-one's"],
      [{ ...canaryOf('money-ledger'), format: 'tp-mutation-canary/0' }, "shard money-ledger's canary verdict is not tp-mutation-canary/1"],
      [{ ...canaryOf('money-ledger'), cases: canaryOf('money-ledger').cases.slice(0, 4) }, "shard money-ledger's canary is 5 of 5 cases as expected, not 5 of 5"],
    ] as const) {
      const result = judge(input(new Map([['money-ledger', { ...moneyLedger(), canary }]])));
      expect(result.failures, failure).toEqual([failure]);
    }
  });

  it('calls a package whose shards did not run "not affected", and fails one that ran in some of its shards', () => {
    const pricingOne = shardResult('pricing-one', { pricing: reportOf({ [PRICING_ONE]: scoredFile(4, 4) }) });
    const pricingTwo = shardResult('pricing-two', { pricing: reportOf({ [PRICING_TWO]: scoredFile(4, 4) }) });
    const none = judge(input(new Map([['money-ledger', moneyLedger()]])));
    expect(none.passed).toBe(true);
    expect(none.packages.find((item) => item.pkg === 'pricing')?.state).toBe('not affected');
    const some = judge(input(new Map([['pricing-one', pricingOne]])));
    expect(some.failures).toEqual(['pricing ran in pricing-one but not in pricing-two: a package\'s shards run all or none']);
    expect(some.packages.find((item) => item.pkg === 'pricing')?.state).toBe('partly run');
    const all = judge(input(new Map([['pricing-one', pricingOne], ['pricing-two', pricingTwo]])));
    expect(all.passed).toBe(true);
    expect(all.packages.find((item) => item.pkg === 'pricing')).toMatchObject({ state: 'fully run', detected: 8, scoreBasisPoints: 10_000 });
  });

  it('fails a shard the changes job selected that reported nothing, and one that reported unselected', () => {
    expect(judge(input(new Map([['money-ledger', moneyLedger()]]), { expected: ['money-ledger', 'packets-all'] })).failures).toEqual(['the changes job selected shard packets-all, which reported nothing']);
    expect(judge(input(new Map([['money-ledger', moneyLedger()]]), { expected: [] })).failures).toEqual(['shard money-ledger reported, but the changes job did not select it']);
    expect(judge(input(new Map(), { expected: ['nowhere'] })).failures).toEqual(['the changes job selected nowhere, which is not a shard of stryker/shards.json']);
    expect(judge(input(new Map([['money-ledger', moneyLedger()]]), { expected: ['money-ledger'] })).passed).toBe(true);
  });

  it('fails a shard missing one of its packages’ reports, a directory that is no shard’s, and a report of a file its shard does not hold', () => {
    expect(judge(input(new Map([['money-ledger', shardResult('money-ledger', { money: reportOf({ [MONEY]: scoredFile(4, 4) }) })]]))).failures).toEqual([
      'shard money-ledger ran without its ledger report (ledger.json)',
      'ledger: no valid mutant to score',
    ]);
    expect(judge(input(new Map([['money-ledger', moneyLedger()], ['elsewhere', shardResult('elsewhere', {})]]))).failures).toEqual(['elsewhere is not a shard of stryker/shards.json']);
    expect(judge(input(new Map([['money-ledger', moneyLedger(reportOf({ [LEDGER]: scoredFile(4, 4) }))]]))).failures).toEqual([
      `shard money-ledger's money report mutates ${LEDGER}, which the shard does not hold`,
      'money: no valid mutant to score',
    ]);
    expect(judge(input(new Map([['money-ledger', { ...moneyLedger(), stray: ['notes.txt'] }]]))).failures).toEqual(['shard money-ledger left notes.txt, which no shard writes']);
  });
});

describe('reading the shards’ results and printing them', () => {
  it('reads <dir>/<shard>/ (canary.json, <package>.json; the HTML reports left alone) and passes them to the gate', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tp-gate-'));
    try {
      mkdirSync(path.join(dir, 'money-ledger'));
      writeFileSync(path.join(dir, 'money-ledger', 'canary.json'), JSON.stringify(canaryOf('money-ledger')));
      writeFileSync(path.join(dir, 'money-ledger', 'money.json'), JSON.stringify(reportOf({ [MONEY]: scoredFile(4, 4) })));
      writeFileSync(path.join(dir, 'money-ledger', 'ledger.json'), JSON.stringify(reportOf({ [LEDGER]: scoredFile(4, 4) })));
      writeFileSync(path.join(dir, 'money-ledger', 'money.html'), '<html></html>');
      writeFileSync(path.join(dir, 'ignored-top-level.json'), '{}');
      const ran = readShardResults(dir);
      expect([...ran.keys()]).toEqual(['money-ledger']);
      expect([...(ran.get('money-ledger')?.reports.keys() ?? [])].sort()).toEqual(['ledger', 'money']);
      expect(ran.get('money-ledger')?.stray).toEqual([]);
      const result = judge(input(ran, { expected: parseExpectedShards('["money-ledger"]') }));
      expect(result.passed).toBe(true);
      expect(result.lines).toContain('money: 100.00% (4 detected of 4; 0 undetected, 0 of them recorded equivalents; 0 load failures left out)');
      expect(result.lines).toContain(`  ${MONEY}: 100.00% (4/4, 0 load failures)`);
      expect(summaryMarkdown(result)).toContain('| money | 100.00% | 4 | 0 | 0 | 0 |');
      expect(summaryMarkdown(result)).toContain('| pricing | not affected | 0 | 0 | 0 | 0 |');
      expect(readShardResults(path.join(dir, 'missing')).size).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('takes the selected shards as a JSON array or a comma-separated list', () => {
    expect(parseExpectedShards('["money-ledger","packets-scan"]')).toEqual(['money-ledger', 'packets-scan']);
    expect(parseExpectedShards('money-ledger, packets-scan')).toEqual(['money-ledger', 'packets-scan']);
    expect(parseExpectedShards('  ')).toEqual([]);
    expect(parseExpectedShards('[]')).toEqual([]);
    expect(() => parseExpectedShards('[1]')).toThrow('--expected: not a JSON array of shard names');
  });

  it('lists a failed gate’s problems in its summary, and one shard’s scores and survivors for its own log', () => {
    const report = reportOf({ [MONEY]: scoredFile(4, 3) });
    const result = judge(input(new Map([['money-ledger', moneyLedger(report)]])));
    expect(summaryMarkdown(result)).toContain('**Failed:**');
    expect(result.lines.at(-1)).toBe('mutation gate: failed (2 problems)');
    const shard = TEST_SHARDS[0];
    if (shard === undefined) throw new Error('no shard');
    expect(shardView(shard, moneyLedger(report), { money: [equivalentOf(MONEY, 4)] })).toEqual([
      `money-ledger money ${MONEY}: 75.00% (3/4, 0 load failures)`,
      `  equivalent Survived ${MONEY}:4:1 StringLiteral "x" #4 -> "\\"\\""`,
      `money-ledger ledger ${LEDGER}: 100.00% (4/4, 0 load failures)`,
      "(money-ledger's view: the mutation job judges every package once all its shards have run)",
    ]);
  });
});

describe('every file a shard holds, in its report', () => {
  const INDEX = 'packages/money/src/index.ts';
  const shards = [{ name: 'money-ledger', mutate: { money: [MONEY, INDEX], ledger: [LEDGER] } }, ...TEST_SHARDS.slice(1)];

  it('fails a fully-run package whose shard’s report leaves out a file the shard holds', () => {
    expect(judge(input(new Map([['money-ledger', moneyLedger()]]), { shards })).failures).toEqual([
      `shard money-ledger's money report has no ${INDEX}, which the shard mutates: a shard runs all its files (stryker/shards.json's noMutants lists those Stryker finds no mutant in)`,
    ]);
    const pricingOne = shardResult('pricing-one', { pricing: reportOf({ [PRICING_ONE]: scoredFile(4, 4) }) });
    const pricingTwo = shardResult('pricing-two', { pricing: reportOf({}) });
    expect(judge(input(new Map([['pricing-one', pricingOne], ['pricing-two', pricingTwo]]))).failures).toEqual([
      `shard pricing-two's pricing report has no ${PRICING_TWO}, which the shard mutates: a shard runs all its files (stryker/shards.json's noMutants lists those Stryker finds no mutant in)`,
    ]);
  });

  it('passes a file stryker/shards.json lists as holding no mutant, and judges a package that did not run by nothing', () => {
    expect(judge(input(new Map([['money-ledger', moneyLedger()]]), { shards, noMutants: [INDEX] })).failures).toEqual([]);
    expect(judge(input(new Map(), { shards })).failures).toEqual([]);
  });
});

describe('an equivalent’s review: independent, and not after the run', () => {
  const report = reportOf({ [MONEY]: scoredFile(20, 19) });
  const judgeWith = (overrides: Parameters<typeof equivalentOf>[2], today = '2026-10-25') => judge(input(new Map([['money-ledger', moneyLedger(report)]]), { equivalents: { money: [equivalentOf(MONEY, 20, overrides)] }, today })).failures;

  it('refuses a review by the entry’s proposer, whatever its case or spacing', () => {
    for (const reviewedBy of ['M3', 'm3', ' M3 ']) {
      expect(judgeWith({ reviewedBy }), reviewedBy).toEqual([`tools/stryker/equivalent/money.json ${MONEY} StringLiteral "x" #20 -> "\\"\\"" is reviewed by its proposer, M3: only an independent reviewer signs an equivalent`]);
    }
  });

  it('refuses a review dated after the run’s UTC date, and takes one on that date or before', () => {
    expect(judgeWith({ reviewedOn: '2026-10-26' })).toEqual([`tools/stryker/equivalent/money.json ${MONEY} StringLiteral "x" #20 -> "\\"\\"" has reviewedOn "2026-10-26", after the run's date, 2026-10-25`]);
    expect(judgeWith({ reviewedOn: '2099-12-31' })).toHaveLength(1);
    expect(judgeWith({ reviewedOn: '2026-10-25' })).toEqual([]);
    expect(judgeWith({ reviewedOn: '2026-10-24' })).toEqual([]);
  });
});

describe('stray reports', () => {
  it('fails a package report in a shard that does not hold that package', () => {
    const result = shardResult('packets-all', { packets: reportOf({ 'packages/packets/src/e.ts': scoredFile(4, 4) }), money: reportOf({ [MONEY]: scoredFile(4, 4) }) });
    expect(judge(input(new Map([['packets-all', result]]))).failures).toEqual(["shard packets-all left money.json, a report of money, which the shard does not hold"]);
  });

  it('fails a file at the top of the reports directory, which no shard writes', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tp-gate-'));
    try {
      mkdirSync(path.join(dir, 'money-ledger'));
      writeFileSync(path.join(dir, 'money-ledger', 'canary.json'), JSON.stringify(canaryOf('money-ledger')));
      writeFileSync(path.join(dir, 'money-ledger', 'money.json'), JSON.stringify(reportOf({ [MONEY]: scoredFile(4, 4) })));
      writeFileSync(path.join(dir, 'money-ledger', 'ledger.json'), JSON.stringify(reportOf({ [LEDGER]: scoredFile(4, 4) })));
      writeFileSync(path.join(dir, 'money.json'), '{}');
      writeFileSync(path.join(dir, 'money.html'), '<html></html>');
      const read = readReportDirectory(dir);
      expect([...read.ran.keys()]).toEqual(['money-ledger']);
      expect(read.stray).toEqual(['money.html', 'money.json']);
      expect(judge(input(read.ran, { stray: read.stray })).failures).toEqual([
        'the reports directory holds money.html at its top, where no shard writes: the gate judges only <shard>/ directories',
        'the reports directory holds money.json at its top, where no shard writes: the gate judges only <shard>/ directories',
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('the runtime the Unicode-bound equivalents rest on', () => {
  const report = reportOf({ [MONEY]: scoredFile(20, 19) });
  const recorded = equivalentOf(MONEY, 20);
  const { reason: _reason, proposedBy: _proposedBy, reviewedBy: _reviewedBy, reviewedOn: _reviewedOn, ...key } = recorded;
  const unicode = { checkedOn: { node: '24.22.0', unicode: '17.0', icu: '78.3' }, records: [key] };
  const run = (runtime: unknown, listing: unknown = unicode) =>
    judge(input(new Map([['money-ledger', { ...moneyLedger(report), canary: { ...canaryOf('money-ledger'), runtime } }]]), { equivalents: { money: [recorded] }, unicode: listing })).failures;

  it('fails a shard whose canary verdict does not name the Node that ran it', () => {
    expect(run(undefined)).toEqual(["shard money-ledger's canary verdict names no runtime (node, unicode and icu, from process.versions)"]);
    expect(run({ node: 'v24.22.0', unicode: 17 })).toEqual(["shard money-ledger's canary verdict names no runtime (node, unicode and icu, from process.versions)"]);
  });

  it('passes the equivalents on the Unicode data they were checked on, and fails them, naming each, on other data', () => {
    expect(run({ node: 'v24.22.0', unicode: '17.0', icu: '78.3' })).toEqual([]);
    // Another Node with the same data is the same data.
    expect(run({ node: 'v24.23.0', unicode: '17.0', icu: '78.3' })).toEqual([]);
    expect(run({ node: 'v26.1.0', unicode: '18.0', icu: '79.1' })).toEqual([
      `money: 1 recorded equivalent rests on the engine's Unicode data as Node 24.22.0 has it (Unicode 17.0, ICU 78.3), and shard money-ledger ran on Node v26.1.0 (Unicode 18.0, ICU 79.1): check it again over every code point on that Node, then record that Node in tools/stryker/unicode.json: ${MONEY} StringLiteral "x" #20 -> "\\"\\""`,
    ]);
    expect(run({ node: 'v24.22.0', unicode: '17.0', icu: '78.4' })).toHaveLength(1);
  });

  it('fails a listing no equivalent records, and a malformed listing', () => {
    expect(run({ node: 'v24.22.0', unicode: '17.0', icu: '78.3' }, { ...unicode, records: [key, { ...key, occurrence: 19 }] })).toEqual([
      `tools/stryker/unicode.json lists ${MONEY} StringLiteral "x" #19 -> "\\"\\"", which tools/stryker/equivalent/money.json does not record`,
    ]);
    expect(run({ node: 'v24.22.0', unicode: '17.0', icu: '78.3' }, { records: [key] })).toEqual(['tools/stryker/unicode.json: checkedOn is not { node, unicode, icu }, each a string']);
    expect(run({ node: 'v24.22.0', unicode: '17.0', icu: '78.3' }, { ...unicode, records: [{ ...key, extra: 1 }] })).toEqual([
      'tools/stryker/unicode.json record 1: its keys must be exactly file, mutator, original, occurrence, replacement',
    ]);
  });

  it('lists only equivalents the repository records (tools/test/workflows.test.ts holds its Node to mutation.yml’s pin)', () => {
    const listing = readUnicodeFile(repositoryRoot) as { checkedOn: { node: string }; records: { file: string }[] };
    const equivalents = readEquivalentFiles(repositoryRoot);
    expect(listing.records.length).toBeGreaterThan(0);
    for (const record of listing.records) {
      const pkg = (['money', 'pricing', 'ledger', 'packets'] as const).find((name) => record.file.startsWith(`packages/${name}/`));
      const entries = (pkg === undefined ? [] : (equivalents[pkg] as EquivalentEntry[])).map((entry) => keyOf(entry));
      expect(entries, JSON.stringify(record)).toContain(keyOf(record as unknown as EquivalentEntry));
    }
  });
});

describe('the selected shards, as the workflow passes them', () => {
  it('refuses an empty --expected, which only a changes job that wrote no output leaves', () => {
    expect(() => expectedShardsOption('')).toThrow('--expected is empty: the changes job gave no shards, so what was selected is unknown');
    expect(() => expectedShardsOption('  ')).toThrow('--expected is empty');
    expect(() => expectedShardsOption('[money-ledger]')).toThrow('--expected: not a JSON array of shard names');
    expect(expectedShardsOption(undefined)).toBeUndefined();
    expect(expectedShardsOption('["money-ledger"]')).toEqual(['money-ledger']);
    expect(expectedShardsOption('[]')).toEqual([]);
  });
});
