import { describe, expect, it } from 'vitest';

import { describeMutant, keyOf, keyedMutants, occurrenceAt, offsetOf, repositoryPath, sourceIndex } from './mutants';
import { reportOf } from './test-support';

/**
 * How the mutation tooling names a mutant (tools/stryker/mutants.ts): the report's 1-based positions, end exclusive,
 * read back to the source text Stryker replaced, and that text's occurrence counted at every start position, so a record
 * of a mutant does not move when an unrelated line does.
 */
describe('a mutant’s key', () => {
  it('reads the report’s positions: lines and columns from 1, the end exclusive', () => {
    const source = "const a = 1;\nconst b = 'x' + 'x';\n";
    expect(offsetOf(source, { line: 1, column: 1 })).toBe(0);
    expect(offsetOf(source, { line: 2, column: 11 })).toBe(23);
    expect(source.slice(offsetOf(source, { line: 2, column: 11 }), offsetOf(source, { line: 2, column: 14 }))).toBe("'x'");
    expect(() => offsetOf(source, { line: 9, column: 1 })).toThrow('line 9 is past the end of the source');
  });

  it('counts an occurrence at every start position, overlapping ones included', () => {
    expect(occurrenceAt('aaa', 'aa', 0)).toBe(1);
    expect(occurrenceAt('aaa', 'aa', 1)).toBe(2);
    expect(occurrenceAt("'x' + 'x'", "'x'", 6)).toBe(2);
    expect(() => occurrenceAt('abc', 'b', 0)).toThrow('the original text is not at its start');
  });

  it('keys every mutant of a report by file, mutator, original, occurrence and replacement, with its status and covering tests', () => {
    const report = reportOf({
      'packages/money/src/a.ts': {
        source: "const a = 'x';\nconst b = 'x';\n",
        mutants: [
          { original: "'x'", occurrence: 2, status: 'Survived', coveredBy: ['a > reads b'] },
          { original: 'a', mutator: 'Identifier', replacement: 'z', status: 'Killed' },
        ],
      },
    });
    const [second, first] = keyedMutants(report);
    expect(second).toMatchObject({ file: 'packages/money/src/a.ts', mutator: 'StringLiteral', original: "'x'", occurrence: 2, replacement: '""', status: 'Survived', line: 2, column: 11, coveredBy: ['a > reads b'] });
    expect(first).toMatchObject({ original: 'a', occurrence: 1, line: 1, column: 7 });
    expect(keyOf(second ?? first ?? { file: '', mutator: '', original: '', occurrence: 0, replacement: '' })).toBe('["packages/money/src/a.ts","StringLiteral","\'x\'",2,"\\"\\""]');
    expect(describeMutant({ file: 'f.ts', mutator: 'M', original: 'a'.repeat(100), occurrence: 1, replacement: 'b', line: 3, column: 4 })).toBe(`f.ts:3:4 M "${'a'.repeat(77)}..." #1 -> "b"`);
  });

  it('reads a source once for all its mutants, with offsetOf’s and occurrenceAt’s answers at every position', () => {
    const source = "aaa\n'x' + 'x' + aa\n\nconst aaa = 'x';\nlast";
    const index = sourceIndex(source);
    const lines = source.split('\n');
    lines.forEach((text, line) => {
      for (let column = 1; column <= text.length + 1; column += 1) {
        expect(index.offset({ line: line + 1, column })).toBe(offsetOf(source, { line: line + 1, column }));
      }
    });
    expect(() => index.offset({ line: lines.length + 1, column: 1 })).toThrow(`line ${String(lines.length + 1)} is past the end of the source`);
    for (const original of ['a', 'aa', 'aaa', "'x'", 'x', '\n', 'last']) {
      for (let start = source.indexOf(original); start !== -1; start = source.indexOf(original, start + 1)) {
        expect(index.occurrence(original, start), `${original} at ${String(start)}`).toBe(occurrenceAt(source, original, start));
      }
    }
    expect(() => index.occurrence('aa', 3)).toThrow('the original text is not at its start');
    // Ten thousand mutants of one file are read at once, as the gate reads a large report.
    const large = reportOf({ 'packages/money/src/a.ts': { source: 'x\n'.repeat(10_000), mutants: Array.from({ length: 10_000 }, (_, at) => ({ original: 'x', occurrence: at + 1, status: 'Killed' as const })) } });
    expect(keyedMutants(large).map((mutant) => [mutant.occurrence, mutant.line])).toEqual(Array.from({ length: 10_000 }, (_, at) => [at + 1, at + 1]));
  });

  it('takes a report’s path as the repository’s', () => {
    expect(repositoryPath('./packages/money/src/a.ts')).toBe('packages/money/src/a.ts');
    expect(repositoryPath('packages\\money\\src\\a.ts')).toBe('packages/money/src/a.ts');
  });
});
