import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { repositoryRoot } from '../../content-files';
import { reportOf } from '../test-support';
import { CANARY_TESTS } from './vitest.config';
import { EXPECTED_FILE, type Expected, canaryPassed, judgeCanary, parseExpected, verdictFile, verdictLines } from './verdict';

/**
 * The mutation canary's verdict (tools/stryker/canary/verdict.ts; test matrix CI-15): every mutant of each case's file
 * held to the statuses expected.json allows, with nothing reported that no case expects. The canary itself runs under
 * Stryker as each shard's first step; these tests hold the judgement and expected.json's shape.
 */

const committed = parseExpected(JSON.parse(readFileSync(path.join(repositoryRoot, EXPECTED_FILE), 'utf8')));

/** A report in which every mutant of every case has its first allowed status, or the given one. */
function reportFor(expected: Expected, status: (file: string, index: number) => string | undefined = () => undefined) {
  return reportOf(
    Object.fromEntries(
      expected.cases.map((item) => {
        // The originals one after another, each occurrence written out, so each mutant sits where its key says.
        const counts = new Map<string, number>();
        const parts: string[] = [];
        for (const mutant of item.mutants) {
          while ((counts.get(mutant.original) ?? 0) < mutant.occurrence) {
            parts.push(mutant.original);
            counts.set(mutant.original, (counts.get(mutant.original) ?? 0) + 1);
          }
        }
        return [
          item.file,
          {
            source: parts.join('\n'),
            mutants: item.mutants.map((mutant, index) => ({
              original: mutant.original,
              occurrence: mutant.occurrence,
              mutator: mutant.mutator,
              replacement: mutant.replacement,
              status: (status(item.file, index) ?? mutant.expect[0]) as never,
            })),
          },
        ];
      }),
    ),
  );
}

describe('the canary’s expected statuses', () => {
  it('hold five cases, each with its file, what it proves and every mutant’s allowed statuses', () => {
    expect(committed.cases.map((item) => [item.case, item.file])).toEqual([
      [1, 'tools/stryker/canary/named.ts'],
      [2, 'tools/stryker/canary/load.ts'],
      [3, 'tools/stryker/canary/lib/index.ts'],
      [4, 'tools/stryker/canary/seeded.ts'],
      [5, 'tools/stryker/canary/prefix.ts'],
    ]);
    // Case 2 allows a load failure as an error or a kill, never a survivor; case 5 expects its prefix mutant to survive.
    const load = committed.cases[1]?.mutants ?? [];
    expect(load.filter((mutant) => mutant.expect.includes('RuntimeError')).length).toBeGreaterThan(0);
    for (const mutant of load) expect(mutant.expect).not.toContain('Survived');
    expect(committed.cases[4]?.mutants.find((mutant) => mutant.mutator === 'AssignmentOperator')?.expect).toEqual(['Survived']);
    expect(committed.cases[3]?.mutants.find((mutant) => mutant.replacement === 'false')?.expect).toEqual(['Killed']);
    // Every case has a test file the canary's vitest configuration runs.
    expect(CANARY_TESTS).toEqual(committed.cases.map((item) => (item.case === 3 ? 'tools/stryker/canary/linked.test.ts' : item.file.replace(/\.ts$/, '.test.ts'))));
  });

  it('refuse a file that is not five numbered cases with mutants', () => {
    expect(() => parseExpected({})).toThrow(`${EXPECTED_FILE}: holds no list of cases`);
    expect(() => parseExpected({ cases: committed.cases.slice(0, 4) })).toThrow('holds 4 cases, not 5');
    expect(() => parseExpected({ cases: [...committed.cases.slice(1), committed.cases[0]] })).toThrow('case 1 is numbered 2');
    expect(() => parseExpected({ cases: committed.cases.map((item, index) => (index === 2 ? { ...item, mutants: [] } : item)) })).toThrow('case 3 expects no mutant');
    expect(() => parseExpected({ cases: committed.cases.map((item, index) => (index === 0 ? { ...item, mutants: [{ ...item.mutants[0], expect: ['Dead'] }] } : item)) })).toThrow('case 1 has a mutant without');
  });
});

describe('the verdict', () => {
  it('is 5 of 5 when every mutant has an allowed status', () => {
    const verdict = judgeCanary(reportFor(committed), committed, 'money-ledger');
    expect(verdict.problems).toEqual([]);
    expect(verdict.cases.map((item) => item.asExpected)).toEqual([true, true, true, true, true]);
    expect(verdict).toMatchObject({ format: 'tp-mutation-canary/1', shard: 'money-ledger', total: 5, asExpected: 5 });
    expect(canaryPassed(verdict)).toBe(true);
    expect(verdictLines(verdict).at(-1)).toBe('canary (money-ledger): 5 of 5 cases as expected');
  });

  it('fails a case whose mutant has another status: a load failure survived, a seeded kill missed, a prefix kill made', () => {
    const load = committed.cases[1]?.mutants.findIndex((mutant) => mutant.expect.includes('RuntimeError')) ?? -1;
    const seeded = committed.cases[3]?.mutants.findIndex((mutant) => mutant.replacement === 'false') ?? -1;
    const prefix = committed.cases[4]?.mutants.findIndex((mutant) => mutant.mutator === 'AssignmentOperator') ?? -1;
    const flips: Record<string, [number, string]> = {
      'tools/stryker/canary/load.ts': [load, 'Survived'],
      'tools/stryker/canary/seeded.ts': [seeded, 'Survived'],
      'tools/stryker/canary/prefix.ts': [prefix, 'Killed'],
    };
    const verdict = judgeCanary(
      reportFor(committed, (file, index) => (flips[file]?.[0] === index ? flips[file][1] : undefined)),
      committed,
      'packets-scan',
    );
    expect(verdict.cases.map((item) => item.asExpected)).toEqual([true, false, true, false, false]);
    expect(verdict.asExpected).toBe(2);
    expect(canaryPassed(verdict)).toBe(false);
    expect(verdict.cases[1]?.problems[0]).toMatch(/: Survived, expected RuntimeError or Killed$/);
    expect(verdict.cases[4]?.problems[0]).toMatch(/AssignmentOperator .*: Killed, expected Survived$/);
    expect(verdictLines(verdict)).toContain('canary (packets-scan): 2 of 5 cases as expected');
  });

  it('fails a case with a mutant reported and not expected, or expected and not reported, and a file no case names', () => {
    const report = reportFor(committed);
    const named = report.files['tools/stryker/canary/named.ts'];
    if (named === undefined) throw new Error('no case 1 file');
    const missing = { ...report, files: { ...report.files, 'tools/stryker/canary/named.ts': { ...named, mutants: named.mutants.slice(1) } } };
    expect(judgeCanary(missing, committed).cases[0]?.problems[0]).toMatch(/^expected, not reported: tools\/stryker\/canary\/named\.ts /);
    const extra = { ...report, files: { ...report.files, 'tools/stryker/canary/named.ts': { ...named, mutants: [...named.mutants, { ...named.mutants[0], id: 'extra', replacement: 'other' } as (typeof named.mutants)[number]] } } };
    expect(judgeCanary(extra, committed).cases[0]?.problems[0]).toMatch(/^reported, not expected: /);
    const stray = { ...report, files: { ...report.files, 'tools/stryker/elsewhere.ts': { source: 'x', mutants: [{ ...named.mutants[0], location: { start: { line: 1, column: 1 }, end: { line: 1, column: 2 } } } as (typeof named.mutants)[number]] } } };
    const verdict = judgeCanary(stray, committed);
    expect(verdict.problems).toEqual(['tools/stryker/elsewhere.ts is mutated, but no case names it']);
    expect(verdict.asExpected).toBe(0);
    expect(canaryPassed(verdict)).toBe(false);
  });

  it('is written where the gate reads it', () => {
    expect(verdictFile('money-ledger')).toBe('reports/mutation/money-ledger/canary.json');
    expect(verdictFile(null)).toBe('reports/canary/verdict.json');
  });

  it('names the runtime its shard ran on, as the gate holds the Unicode-bound equivalents to it', () => {
    expect(judgeCanary(reportFor(committed), committed, 'money-ledger').runtime).toEqual({ node: process.version, unicode: process.versions.unicode, icu: process.versions.icu });
    expect(judgeCanary(reportFor(committed), committed, 'money-ledger', { node: 'v24.22.0', unicode: '17.0', icu: '78.3' }).runtime).toEqual({ node: 'v24.22.0', unicode: '17.0', icu: '78.3' });
  });
});
