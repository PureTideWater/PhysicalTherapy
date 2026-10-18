import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decimal } from '@tp/money';

import { dollarForms, percentForms, syntheticMarkers, typedValues } from './guards';
import { buildManifest, compareManifest } from './manifest';
import { parseDelimited } from './parsers/delimited';
import { canonicalJson, containsNumber, decodeSourceText, diffTranscriptions, recordLabel, sha256, windowsOverlap } from './records';
import { parseRuleRecord } from './schema';
import { exampleRecord } from './testing';

/**
 * Property tests on the pure functions of the rules package (PRD section 18: property tests on
 * every pure function). Each property states what must hold for every input fast-check generates.
 */

describe('parseDelimited (property)', () => {
  /** Field text drawn from characters that exercise quoting: the delimiters, quotes and line feeds. */
  const field = fc.string({ unit: fc.constantFrom('a', 'Z', '7', ' ', ',', '\t', '"', '\n', '.', '$') });
  const rows = fc.array(fc.array(field, { minLength: 1, maxLength: 6 }), { minLength: 1, maxLength: 8 });

  /** Writes rows the way a spreadsheet exports them: a field is quoted when it must be. */
  function serialize(table: readonly (readonly string[])[], delimiter: ',' | '\t', lineEnd: '\n' | '\r\n'): { text: string; lines: string[] } {
    const lines = table.map((row) =>
      row.map((cell) => (cell.includes(delimiter) || cell.includes('"') || cell.includes('\n') ? `"${cell.replaceAll('"', '""')}"` : cell)).join(delimiter),
    );
    return { text: lines.join(lineEnd), lines };
  }

  it.each([
    [',', '\n'],
    [',', '\r\n'],
    ['\t', '\n'],
  ] as const)('reads back every row and field written with %j and %j, with each row raw as written', (delimiter, lineEnd) => {
    fc.assert(
      fc.property(
        rows.filter((table) => !(table.length > 0 && table.at(-1)?.length === 1 && table.at(-1)?.[0] === '')),
        (table) => {
          const { text, lines } = serialize(table, delimiter, lineEnd);
          const parsed = parseDelimited(text, delimiter);
          expect(parsed.map((row) => row.cells)).toEqual(table);
          expect(parsed.map((row) => row.raw)).toEqual(lines);
        },
      ),
    );
  });
});

describe('decodeSourceText (property)', () => {
  /** The WHATWG windows-1252 index for 0x80 to 0x9F; every other byte is its own code point. */
  const HIGH = [
    0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
    0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
  ];
  const expected = (bytes: Uint8Array) => String.fromCodePoint(...[...bytes].map((byte) => (byte >= 0x80 && byte <= 0x9f ? (HIGH[byte - 0x80] ?? byte) : byte)));

  it('decodes text that is not UTF-8 as windows-1252, byte for character', () => {
    // 0xFF never appears in UTF-8, so these inputs always take the windows-1252 path.
    const bytes = fc.uint8Array({ maxLength: 64 }).map((array) => Uint8Array.from([0xff, ...array]));
    fc.assert(
      fc.property(bytes, (input) => {
        expect(decodeSourceText(input)).toBe(expected(input));
      }),
    );
  });

  it('decodes UTF-8 text as UTF-8 and drops one leading byte-order mark', () => {
    fc.assert(
      fc.property(fc.string(), (text) => {
        const utf8 = new TextEncoder().encode(text);
        const withMark = Uint8Array.from([0xef, 0xbb, 0xbf, ...utf8]);
        expect(decodeSourceText(utf8)).toBe(text.startsWith('﻿') ? text.slice(1) : text);
        expect(decodeSourceText(withMark)).toBe(text);
      }),
    );
  });
});

describe('manifests (property)', () => {
  const path = fc.stringMatching(/^[a-z]{1,8}(\/[a-z]{1,8}){0,2}\.json$/);
  const hashes = fc.uniqueArray(fc.tuple(path, fc.string()), { minLength: 1, maxLength: 10, selector: ([file]) => file }).map(
    (entries) => new Map(entries.map(([file, text]) => [file, sha256(text)])),
  );

  it('built from the files present, compares clean against them; any change, loss or addition is named', () => {
    fc.assert(
      fc.property(hashes, path, (present, extra) => {
        const manifest = buildManifest(3, present);
        expect(compareManifest(manifest, present)).toEqual([]);
        const [first] = present.keys();
        const changed = new Map(present).set(first ?? '', sha256('changed'));
        expect(compareManifest(manifest, changed)).toEqual([`${first ?? ''} does not match its SHA-256 in MANIFEST.json`]);
        const lost = new Map(present);
        lost.delete(first ?? '');
        expect(compareManifest(manifest, lost)).toEqual([`${first ?? ''} is listed in MANIFEST.json but missing`]);
        if (!present.has(extra)) {
          expect(compareManifest(manifest, new Map(present).set(extra, sha256('x')))).toEqual([`${extra} is not listed in MANIFEST.json`]);
        }
      }),
    );
  });
});

describe('diffTranscriptions (property)', () => {
  const cents = fc.integer({ min: 1, max: 10_000_000 }).map(String);
  const record = fc.record({ kx: cents, review: cents, discipline: fc.constantFrom('PT_SLP', 'OT') }).map(({ kx, review, discipline }) =>
    exampleRecord('therapy_threshold', { key: { discipline }, value: { kx_threshold_cents: kx, medical_review_threshold_cents: review } }),
  );
  const records = fc.uniqueArray(record, { maxLength: 2, selector: (item) => recordLabel(item) });

  it('finds no difference between a transcription and itself, and finds a changed value', () => {
    fc.assert(
      fc.property(records, cents, (first, other) => {
        expect(diffTranscriptions(first, first)).toEqual([]);
        const [head, ...rest] = first;
        if (head !== undefined && head.record_type === 'therapy_threshold' && other !== head.value.kx_threshold_cents) {
          const second = [{ ...head, value: { ...head.value, kx_threshold_cents: other } }, ...rest];
          expect(diffTranscriptions(first, second)).toEqual([expect.stringContaining(`${recordLabel(head)}: value differs`)]);
        }
      }),
    );
  });
});

describe('canonicalJson and windowsOverlap (property)', () => {
  it('writes the same text for objects that differ only in key order', () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.oneof(fc.string(), fc.boolean(), fc.integer(), fc.constant(null))), (object) => {
        const reversed = Object.fromEntries(Object.entries(object).reverse());
        expect(canonicalJson(reversed)).toBe(canonicalJson(object));
        expect(JSON.parse(canonicalJson(object))).toEqual(object);
      }),
    );
  });

  it('is symmetric, and true exactly when the windows share a day', () => {
    const day = fc.integer({ min: 0, max: 400 });
    const isoDay = (offset: number) => new Date(Date.UTC(2026, 0, 1 + offset)).toISOString().slice(0, 10);
    const window = fc.tuple(day, fc.option(day, { nil: null })).map(([start, length]) => ({
      start,
      end: length === null ? null : start + length,
    }));
    fc.assert(
      fc.property(window, window, (a, b) => {
        const asDates = (w: { start: number; end: number | null }) => ({ effective_from: isoDay(w.start), effective_to: w.end === null ? null : isoDay(w.end) });
        const shared = Math.max(a.start, b.start) <= Math.min(a.end ?? Infinity, b.end ?? Infinity);
        expect(windowsOverlap(asDates(a), asDates(b))).toBe(shared);
        expect(windowsOverlap(asDates(b), asDates(a))).toBe(shared);
      }),
    );
  });
});

describe('numeric ranges in the schema (property)', () => {
  /** Decimal text with up to six places and up to five integer digits, as a file might carry it. */
  const text = fc
    .tuple(fc.integer({ min: 0, max: 99_999 }), fc.option(fc.integer({ min: 0, max: 999_999 }), { nil: null }), fc.integer({ min: 1, max: 6 }))
    .map(([whole, fraction, places]) => (fraction === null ? String(whole) : `${String(whole)}.${String(fraction).padStart(6, '0').slice(0, places)}`));

  it('accepts a work RVU exactly when it has at most four places and lies in 0 to 9999, as decimal comparison says', () => {
    fc.assert(
      fc.property(text, (value) => {
        const record = exampleRecord('pfs_rvu');
        const parsed = parseRuleRecord({ ...record, value: { ...record.value, work_rvu: value } });
        const places = (value.split('.')[1] ?? '').length;
        const inRange = decimal(value).lessThanOrEqualTo(decimal('9999'));
        expect(parsed.ok).toBe(places <= 4 && inRange);
      }),
    );
  });

  it('accepts a GPCI exactly when it is above 0 and at most 5', () => {
    fc.assert(
      fc.property(text, (value) => {
        const record = exampleRecord('pfs_gpci');
        const parsed = parseRuleRecord({ ...record, value: { ...record.value, pe_gpci: value } });
        const places = (value.split('.')[1] ?? '').length;
        const amount = decimal(value);
        expect(parsed.ok).toBe(places <= 4 && amount.greaterThan(decimal('0')) && amount.lessThanOrEqualTo(decimal('5')));
      }),
    );
  });
});

describe('the value-in-quote guards (property)', () => {
  it('finds a number set off by words or punctuation, and never inside a longer number', () => {
    const number = fc.oneof(fc.integer({ min: 0, max: 99_999 }).map(String), fc.tuple(fc.nat(9999), fc.nat(99)).map(([a, b]) => `${String(a)}.${String(b).padStart(2, '0')}`));
    const before = fc.constantFrom('', 'is ', '(', 'at ', '$', ': ');
    const after = fc.constantFrom('', ' days', '%', ').', ', and', ' percent');
    fc.assert(
      fc.property(number, before, after, fc.integer({ min: 1, max: 9 }), (value, prefix, suffix, digit) => {
        expect(containsNumber(`${prefix}${value}${suffix}`, value)).toBe(true);
        expect(containsNumber(`${prefix}${String(digit)}${value}${suffix}`, value)).toBe(false);
        expect(containsNumber(`${prefix}${value}${String(digit)}${suffix}`, value)).toBe(false);
      }),
    );
  });

  it('writes cents as the dollar text a source prints, which reads back to the same cents', () => {
    fc.assert(
      fc.property(fc.bigInt({ min: 0n, max: 10n ** 12n }), (amount) => {
        for (const form of dollarForms(amount.toString())) {
          const [whole = '', fraction = '00'] = form.slice(1).replaceAll(',', '').split('.');
          expect(BigInt(whole) * 100n + BigInt(fraction)).toBe(amount);
        }
        expect(percentForms('85')).toEqual(['85%', '85 percent']);
      }),
    );
  });

  it('finds every money, percentage and count field of a hand-typed record', () => {
    const record = exampleRecord('state_prompt_pay');
    expect(typedValues(record.value).map((typed) => typed.field)).toEqual(['value.days_to_pay', 'value.interest.annual_rate_percent']);
  });

  it('marks only the reserved SYNTHETIC identifiers', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^\d{5}$/), fc.stringMatching(/^[A-Z]{2}$/), (code, state) => {
        const markers = syntheticMarkers({ zip: code, carrier: code }, { state });
        const expectedCount = (code.startsWith('000') ? 1 : 0) + (code === '99999' ? 1 : 0) + (state === 'ZZ' ? 1 : 0);
        expect(markers).toHaveLength(expectedCount);
      }),
    );
  });
});
