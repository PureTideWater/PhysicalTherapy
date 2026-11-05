import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decimal } from '@tp/money';

import { type DateSpan, type FactValue, canonicalFactId, factCatalog, lookupFact, summedValue } from './fact-catalog';
import { factPackets } from './fact-arbitrary.test-support';
import { type SetMeasure, factWords } from './fact-words';
import type { PacketContent, ScheduleLine } from './format';
import { factPlaceholder } from './placeholders';
import { renderFact, renderFacts } from './render';

/**
 * Properties of the facts' catalog and renderer (design lane-b-packet-figure-placeholders, sections 1, 5 and 8; test
 * matrix CAS-55, the render half), over SYNTHETIC patterns of every shape the catalog tells apart
 * (./fact-arbitrary.test-support.ts). The oracle sums the content's rows itself, in bigint and in decimal, and reads
 * each figure at its path in the content: it never calls the catalog's own sum. Each property's run count is pinned;
 * its seed is the repo's convention (docs/adr/0066): fast-check's own in a unit run, MUTATION_SEED in a mutation run.
 */

const AMOUNT_FIELD: Partial<Record<SetMeasure, (line: ScheduleLine) => string | null>> = {
  expected: (line) => line.expected_cents,
  allowed: (line) => line.observed_cents,
  paid: (line) => line.paid_cents,
  variance: (line) => line.variance_cents,
  patient_share: (line) => ('calculation' in line ? (line.calculation as { patient_share_cents: string | null }).patient_share_cents : null),
};

/** The oracle's sum of a measure over rows: bigint cents, decimal units, the count, the first and last date. */
function oracle(content: PacketContent, rows: readonly number[], measure: SetMeasure): FactValue | null {
  const lines = content.lines.filter((line) => rows.includes(line.row));
  if (measure === 'lines') return lines.length;
  if (measure === 'units') return lines.reduce((total, line) => total.plus(decimal(line.units)), decimal(0n)).toString();
  if (measure === 'service_dates') {
    const dates = lines.map((line) => line.service_date).sort();
    return { from: dates[0] as string, to: dates.at(-1) as string };
  }
  const read = AMOUNT_FIELD[measure] as (line: ScheduleLine) => string | null;
  const amounts = lines.map(read);
  return amounts.every((amount) => amount !== null) ? String(amounts.reduce((total, amount) => total + BigInt(amount), 0n)) : null;
}

/** The value at a path in the content, each `#` the given row's line. */
function at(content: PacketContent, path: readonly (string | number)[], row: number): unknown {
  let value: unknown = content;
  for (const key of path) {
    const step = key === '#' ? content.lines.findIndex((line) => line.row === row) : key;
    value = (value as Record<string | number, unknown>)[step];
  }
  return value;
}

const withRows = factPackets.chain((content) =>
  fc.record({
    content: fc.constant(content),
    rows: fc.subarray(content.lines.map((line) => line.row), { minLength: 1 }),
    other: fc.subarray(content.lines.map((line) => line.row), { minLength: 1 }),
    measure: fc.constantFrom(...factWords().setMeasures),
  }),
);

describe('the facts’ catalog, over generated patterns', () => {
  it('sums a code’s rows and every row to the stored code and pattern totals, for every amount and for units', () => {
    fc.assert(
      fc.property(factPackets, (content) => {
        for (const measure of ['expected', 'allowed', 'variance'] as const) {
          const field = { expected: 'expected_cents', allowed: 'observed_cents', variance: 'variance_cents' }[measure];
          expect(summedValue(content, content.lines.map((line) => line.row), measure)).toBe((content.pattern as unknown as Record<string, string>)[field]);
          for (const code of content.pattern.codes) {
            const rows = content.lines.filter((line) => line.procedure_code === code.procedure_code).map((line) => line.row);
            expect(summedValue(content, rows, measure)).toBe((code as unknown as Record<string, string>)[field]);
          }
        }
        expect(summedValue(content, content.lines.map((line) => line.row), 'units')).toBe(decimal(content.pattern.units).toString());
        for (const code of content.pattern.codes) {
          const rows = content.lines.filter((line) => line.procedure_code === code.procedure_code).map((line) => line.row);
          expect(summedValue(content, rows, 'units')).toBe(decimal(code.units).toString());
          expect(summedValue(content, rows, 'lines')).toBe(code.lines);
        }
      }),
      { numRuns: 25 },
    );
  });

  it('states any set of rows by one canonical id, whose value is the sum of its rows and which names that set alone', () => {
    fc.assert(
      fc.property(withRows, ({ content, rows, other, measure }) => {
        const catalog = factCatalog(content);
        const id = canonicalFactId(catalog, rows, measure);
        const set = [...new Set(rows)].sort((a, b) => a - b);
        if (id === null) {
          // No fact: a count of an explicit set of rows, or a value code cannot state exactly.
          expect(measure === 'lines' || oracle(content, set, measure) === null).toBe(true);
          return;
        }
        const found = lookupFact(catalog, id);
        expect('found' in found).toBe(true);
        const entry = 'found' in found ? found.found : null;
        expect(entry?.rows).toEqual(set);
        // Idempotent: the id's own set names the id again, in any order and with repeats.
        expect(canonicalFactId(catalog, [...set].reverse().concat(set), measure)).toBe(id);
        // A stored total is the stored value; every value equals the oracle's sum of the set's rows.
        const expected = oracle(content, set, measure);
        expect(entry?.value).toEqual(measure === 'service_dates' && set.length === 1 && id.startsWith('line.') ? (expected as DateSpan).from : expected);
        // Unique: another set names another id.
        const otherSet = [...new Set(other)].sort((a, b) => a - b);
        const otherId = canonicalFactId(catalog, other, measure);
        if (otherId !== null && JSON.stringify(otherSet) !== JSON.stringify(set)) {
          expect(otherId).not.toBe(id);
        }
      }),
      { numRuns: 60 },
    );
  });

  it('names a set by a lower subject or out of order only as not canonical, pointing at the id that names it', () => {
    fc.assert(
      fc.property(withRows, ({ content, rows, measure }) => {
        const catalog = factCatalog(content);
        const id = canonicalFactId(catalog, rows, measure);
        if (id === null || measure === 'lines' || rows.length < 2) return;
        const shuffled = [...rows].reverse();
        const written = `lines.${shuffled.join('+')}.${measure}`;
        const found = lookupFact(catalog, written);
        if (written === id) {
          expect(found).toMatchObject({ found: { id } });
        } else {
          expect(found).toEqual({ problem: 'fact_not_canonical', canonical: id });
        }
      }),
      { numRuns: 40 },
    );
  });

  it('renders every fact it lists, each figure the value its content holds at its path', () => {
    fc.assert(
      fc.property(factPackets, (content) => {
        const catalog = factCatalog(content);
        for (const entry of catalog.entries) {
          const result = renderFacts(factPlaceholder(entry.id), catalog);
          expect(result.ok, entry.id).toBe(true);
          for (const segment of renderFact(content, entry)) {
            if ('figure' in segment && segment.source.path.join('.') !== 'lines') {
              const rows = segment.source.rows ?? [];
              const values = rows.length === 0 ? [at(content, segment.source.path, 0)] : rows.map((row) => at(content, segment.source.path, row));
              // Each value the figure is read from is in the content; a stored or one-row figure prints that value.
              expect(values.every((item) => item !== undefined), entry.id).toBe(true);
              if (!entry.summed && rows.length <= 1 && entry.kind !== 'amount' && entry.kind !== 'count' && entry.kind !== 'days') {
                expect(segment.figure, entry.id).toBe(String(values[0]));
              }
            }
          }
        }
      }),
      { numRuns: 25 },
    );
  });

  it('renders a template, and its rendered text again, to the same text, with every piece in the span map', () => {
    const template = factPackets.chain((content) => {
      const ids = factCatalog(content).entries.map((entry) => entry.id);
      const piece = fc.oneof(
        fc.constantFrom(...ids).map(factPlaceholder),
        fc.constantFrom(' the payer ', ', and ', ' [1]. ', 'For {{patient_name:1}}: ', ' {{claim_control_number:1}} ', ' a { b } c '),
      );
      return fc.record({ content: fc.constant(content), pieces: fc.array(piece, { minLength: 1, maxLength: 8 }) });
    });
    fc.assert(
      fc.property(template, ({ content, pieces }) => {
        const text = pieces.join('');
        const first = renderFacts(text, content);
        expect(first.ok).toBe(true);
        if (!first.ok) return;
        const again = renderFacts(first.text, content);
        expect(again).toMatchObject({ ok: true, text: first.text, facts: [] });
        let template = 0;
        let rendered = 0;
        for (const span of first.spans) {
          expect(span.template[0]).toBe(template);
          expect(span.rendered[0]).toBe(rendered);
          const piece = text.slice(...span.template);
          expect(span.fact === null ? first.text.slice(...span.rendered) : factPlaceholder(span.fact)).toBe(piece);
          template = span.template[1];
          rendered = span.rendered[1];
        }
        expect([template, rendered]).toEqual([text.length, first.text.length]);
      }),
      { numRuns: 25 },
    );
  });
});
