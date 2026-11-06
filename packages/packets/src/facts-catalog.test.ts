import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { factPackets } from './fact-arbitrary.test-support';
import { type NarrativeFacts, narrativeFacts } from './facts';
import type { PacketContent } from './format';
import { legacyNarrativeFacts } from './legacy-facts.test-support';
import { ROLE_CONTENTS, roleContents } from './test-support';

/**
 * narrativeFacts() rebuilt from the facts' catalog (./fact-catalog.ts; design lane-b-packet-figure-placeholders,
 * section 1) holds a narrative to exactly the facts it held before (./legacy-facts.test-support.ts, the builder as it
 * stood at 7fb3e102): on every SYNTHETIC content of ADR 0086's examples, and on generated patterns of every shape the
 * catalog distinguishes (one or several codes and claims, a code of one line, one line, codes and modifiers of another
 * shape, fractional units, every cited method, interest stated or not, the first level or above it, tp-packet/1).
 */

/** The facts as plain, ordered data: each map's keys sorted, each set's members sorted. */
function plain(facts: NarrativeFacts) {
  const map = (value: ReadonlyMap<string, ReadonlySet<string>>) => [...value].map(([key, roles]) => [key, [...roles].sort()] as const).sort(([a], [b]) => a.localeCompare(b));
  const set = (value: ReadonlySet<string | number>) => [...value].map(String).sort();
  return {
    roles: map(facts.roles),
    scoped: map(facts.scoped),
    businessDays: facts.businessDays,
    codes: set(facts.codes),
    modifiers: set(facts.modifiers),
    identifiers: set(facts.identifiers),
    quotes: facts.quotes,
    rows: facts.rows,
    claims: facts.claims,
    patients: facts.patients,
    markers: set(facts.markers),
  };
}

function sameAsBefore(content: PacketContent): void {
  expect(plain(narrativeFacts(content))).toEqual(plain(legacyNarrativeFacts(content)));
}

describe('narrativeFacts from the catalog', () => {
  it('holds every content of ADR 0086’s examples to the facts it held before', () => {
    const contents = roleContents();
    for (const name of ROLE_CONTENTS) {
      sameAsBefore(contents[name]);
    }
  });

  it('holds every generated pattern to the facts it held before', () => {
    fc.assert(fc.property(factPackets, sameAsBefore), { numRuns: 60 });
  });

  it('holds a version whose stored totals differ from its rows to the facts it held before', () => {
    const count = fc.integer({ min: 1, max: 60 });
    const amount = fc.bigInt({ min: 1n, max: 10n ** 9n }).map(String);
    const tampered = fc.record({ content: factPackets, lines: count, claims: count, patients: count, codeLines: count, units: fc.constantFrom('7', '0.25'), expected: amount, observed: amount, variance: amount, code: fc.constantFrom(null, '97999', 'G0283') });
    fc.assert(
      fc.property(tampered, ({ content, lines, claims, patients, codeLines, units, expected, observed, variance, code }) => {
        const codes = content.pattern.codes.map((summary, index) => (index === 0 ? { ...summary, lines: codeLines, units, expected_cents: expected, observed_cents: observed, variance_cents: variance, procedure_code: code ?? summary.procedure_code } : summary));
        sameAsBefore({ ...content, pattern: { ...content.pattern, lines, claims, patients, units, expected_cents: expected, variance_cents: variance, codes } });
      }),
      { numRuns: 40 },
    );
  });
});
