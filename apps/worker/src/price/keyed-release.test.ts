import { MA_NONCONTRACTED_TERMS } from '@tp/contracts';
import { cents } from '@tp/money';
import { type ClaimFacts, type LineFacts, indexRelease, price } from '@tp/pricing';
import { SYNTHETIC_PLACES, readRuleRelease } from '@tp/pricing/testing';
import { type RuleRecord, recordSha256 } from '@tp/rules';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { SCREENING_MAPPING } from '../screening/adapter';
import {
  KEYED_RECORD_TYPES,
  type KeyedRecordType,
  ReleaseReadOutsideFetch,
  type RequestedKeys,
  claimsRequestedKeys,
  isKeyedRecordType,
  keyIdentity,
  keyedRelease,
  requestedKeys,
  screeningRequestedKeys,
  unionKeys,
} from './keyed-release';
import { type StoredRecordRow, indexStoredRelease, memoryReleaseSource } from './release';

/**
 * The release read by key (audit #53 part 2; docs/adr/0062, "The release read"): shared types from the shared index,
 * keyed types only by the keys the run fetched, and a lookup outside them never a silent "not found": it sets a sticky
 * violation (type and field names only) and throws. SYNTHETIC release 900006 only (release 900001 with a second
 * locality and the ZIP+4 file of the ZIP 00012, so the sixth keyed type, locality_map_plus_four, has a record; PR 6b,
 * docs/adr/0064).
 */

const RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900006';
const RELEASE = readRuleRelease(RELEASE_DIR);
const HEADER = { releaseNo: RELEASE.releaseNo, manifestSha256: RELEASE.manifestSha256 };

/** A record as rule_record stores it, with a stored hash that differs from the computed one (so the test sees which is named). */
function stored(record: RuleRecord, tag = 'stored'): StoredRecordRow {
  return {
    record_type: record.record_type,
    key: record.key as Record<string, string>,
    value: record.value,
    effective_from: record.effective_from,
    effective_to: record.effective_to,
    sha256: `${tag}:${recordSha256(record)}`,
  };
}

const SHARED_ROWS = RELEASE.records.filter((record) => !isKeyedRecordType(record.record_type)).map((record) => stored(record));
const KEYED_ROWS = RELEASE.records.filter((record) => isKeyedRecordType(record.record_type)).map((record) => stored(record, 'run'));
const SHARED = indexStoredRelease(HEADER, SHARED_ROWS);
const RECORDS = indexStoredRelease(HEADER, KEYED_ROWS);

/** One key of each keyed type that the release holds a record for. */
const PRESENT: Readonly<Record<KeyedRecordType, Readonly<Record<string, string>>>> = {
  pfs_rvu: { hcpcs: '97110', modifier: '' },
  ncci_mue: { hcpcs: '97110' },
  mppr_rate: { hcpcs: '97110', modifier: '' },
  ncci_ptp: { column1: '97140', column2: '97530' },
  locality_map: { zip: '00011' },
  locality_map_plus_four: { zip: '00012' },
};

describe('keyedRelease', () => {
  it('serves the six keyed types by the keys fetched, and every other type from the shared index', () => {
    expect([...KEYED_RECORD_TYPES]).toEqual(['pfs_rvu', 'ncci_mue', 'mppr_rate', 'ncci_ptp', 'locality_map', 'locality_map_plus_four']);
    const view = keyedRelease({ shared: SHARED, records: RECORDS, requested: requestedKeys(Object.fromEntries(KEYED_RECORD_TYPES.map((type) => [type, [PRESENT[type]]]))) });
    for (const type of KEYED_RECORD_TYPES) {
      const found = view.inForce(type, PRESENT[type], '2026-02-01');
      expect(found, type).not.toBeNull();
      // Named by the run's stored hash, as indexStoredRelease names it. (RuleRecordOf over a union of types is not
      // RuleRecord's union of each type, so the record found is named as the view's ref takes it.)
      expect(found === null ? null : view.ref(found as RuleRecord).sha256.startsWith('run:'), type).toBe(true);
      expect(view.latestInYear(type, PRESENT[type], 2026), type).not.toBeNull();
    }
    const factor = view.inForce('conversion_factor', { applicability: 'non_qualifying_apm' }, '2026-02-01');
    expect(factor === null ? null : view.ref(factor).sha256.startsWith('stored:')).toBe(true);
    expect(view.inForce('pfs_gpci', { carrier: '99999', locality: '01' }, '2026-02-01')).not.toBeNull();
    expect(view.latestInYear('sequestration', { program: 'medicare' }, 2026)).not.toBeNull();
    expect(view.violation).toBeNull();
    expect([view.releaseNo, view.manifestSha256]).toEqual([HEADER.releaseNo, HEADER.manifestSha256]);
  });

  it('answers null with no violation for a key fetched that the release has no record of', () => {
    const absent: Readonly<Record<KeyedRecordType, Readonly<Record<string, string>>>> = {
      pfs_rvu: { hcpcs: '99999', modifier: '' },
      ncci_mue: { hcpcs: '99999' },
      mppr_rate: { hcpcs: '97161', modifier: '' },
      ncci_ptp: { column1: '97110', column2: '97110' },
      locality_map: { zip: '99999' },
      // A ZIP whose locality needs no ZIP+4 has no record in the ZIP+4 file.
      locality_map_plus_four: { zip: '00011' },
    };
    const view = keyedRelease({ shared: SHARED, records: RECORDS, requested: requestedKeys(Object.fromEntries(KEYED_RECORD_TYPES.map((type) => [type, [absent[type]]]))) });
    for (const type of KEYED_RECORD_TYPES) {
      expect(view.inForce(type, absent[type], '2026-02-01'), type).toBeNull();
      expect(view.latestInYear(type, absent[type], 2026), type).toBeNull();
    }
    expect(view.violation).toBeNull();
  });

  it.each(KEYED_RECORD_TYPES)('refuses a %s lookup outside the keys fetched: it throws and keeps the first violation, type and field names only', (type) => {
    const view = keyedRelease({ shared: SHARED, records: RECORDS, requested: requestedKeys({}) });
    let thrown: unknown;
    try {
      view.inForce(type, PRESENT[type], '2026-02-01');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ReleaseReadOutsideFetch);
    const expected = { recordType: type, keyFields: Object.keys(PRESENT[type]).sort() };
    expect((thrown as ReleaseReadOutsideFetch).violation).toEqual(expected);
    expect((thrown as ReleaseReadOutsideFetch).code).toBe('RELEASE_READ_OUTSIDE_FETCH');
    expect(view.violation).toEqual(expected);
    // No value of the key reaches the violation or the message.
    for (const value of Object.values(PRESENT[type])) {
      if (value !== '') {
        expect(JSON.stringify(view.violation)).not.toContain(value);
        expect((thrown as Error).message).not.toContain(value);
      }
    }
    // The first violation is kept: a later one of another type, or by latestInYear, does not replace it.
    const other = KEYED_RECORD_TYPES.find((candidate) => candidate !== type) ?? 'pfs_rvu';
    expect(() => view.latestInYear(other, PRESENT[other], 2026)).toThrow(ReleaseReadOutsideFetch);
    expect(view.violation).toEqual(expected);
    // A shared lookup still answers.
    expect(view.inForce('conversion_factor', { applicability: 'non_qualifying_apm' }, '2026-02-01')).not.toBeNull();
  });

  it('refuses to join the shared types of one release with the records of another', () => {
    const other = indexStoredRelease({ releaseNo: HEADER.releaseNo + 1, manifestSha256: HEADER.manifestSha256 }, KEYED_ROWS);
    expect(() => keyedRelease({ shared: SHARED, records: other, requested: requestedKeys({}) })).toThrow(RangeError);
  });

  it('asks a screening run for each code’s relative values, MPPR rate, edit and same-code pair, the general MPPR rate and the ZIP, in both ZIP files', () => {
    const requested = screeningRequestedKeys(['97110', '97140'], '00011');
    expect(Object.fromEntries(Object.entries(requested).map(([type, keys]) => [type, [...keys].sort()]))).toEqual({
      pfs_rvu: [keyIdentity({ hcpcs: '97110', modifier: '' }), keyIdentity({ hcpcs: '97140', modifier: '' })].sort(),
      ncci_mue: [keyIdentity({ hcpcs: '97110' }), keyIdentity({ hcpcs: '97140' })].sort(),
      mppr_rate: [keyIdentity({ hcpcs: '97110', modifier: '' }), keyIdentity({ hcpcs: '97140', modifier: '' }), keyIdentity({ component: 'practice_expense' })].sort(),
      ncci_ptp: [keyIdentity({ column1: '97110', column2: '97110' }), keyIdentity({ column1: '97140', column2: '97140' })].sort(),
      locality_map: [keyIdentity({ zip: '00011' })],
      // Keyed by the five-digit ZIP, so the fetch holds whatever the lookup reads, with or without a ZIP+4.
      locality_map_plus_four: [keyIdentity({ zip: '00011' })],
    });
    // Field order does not matter: keys compare canonically, as the release index compares them.
    expect(requested.pfs_rvu.has(keyIdentity({ modifier: '', hcpcs: '97110' }))).toBe(true);
  });

  it('is what the engine reads every screening lookup through: a priced line asks nothing outside the run’s keys, and a missing key turns quiet without the flag', () => {
    const line = {
      lineNo: 1,
      serviceLineId: null,
      procedureCode: '97110',
      modifiers: ['GP'],
      units: '2',
      serviceDate: '2026-02-02',
      placeOfService: '11',
      chargeCents: cents(0n),
      observedAllowedCents: cents(0n),
      observedAllowedBasis: 'paid_plus_pr' as const,
      patientShareAdjustments: [],
      agreement: { outcome: 'MA_NONCONTRACTED' as const, mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
    };
    const claim = { claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: null, payerPlanKey: null, lines: [line, { ...line, lineNo: 2 }] };
    const settings = { zip: '00011', defaultRounding: null, placeOfServiceSettings: SYNTHETIC_PLACES };
    const full = keyedRelease({ shared: SHARED, records: RECORDS, requested: screeningRequestedKeys(['97110'], '00011') });
    const priced = price({ claim, release: full, settings, asOf: '2026-10-18' });
    expect(priced.map((result) => result.outcome)).toEqual(['priced', 'priced']);
    expect(full.violation).toBeNull();
    // Without the code's MPPR key the engine still answers, with ENGINE_ERROR, so only the flag makes the failure loud.
    const requested = screeningRequestedKeys(['97110'], '00011');
    const missing = keyedRelease({
      shared: SHARED,
      records: RECORDS,
      requested: { ...requested, mppr_rate: new Set([...requested.mppr_rate].filter((key) => key !== keyIdentity({ hcpcs: '97110', modifier: '' }))) },
    });
    const quiet = price({ claim, release: missing, settings, asOf: '2026-10-18' });
    expect(quiet.map((result) => (result.outcome === 'unpriced' ? result.reason : result.outcome))).toEqual(['ENGINE_ERROR', 'ENGINE_ERROR']);
    expect(missing.violation).toEqual({ recordType: 'mppr_rate', keyFields: ['hcpcs', 'modifier'] });
  });

  it('prices a ZIP split across localities through its ZIP+4 file’s record, fetched by the ZIP, and flags a run that did not fetch it (SCR-15)', () => {
    const line = {
      lineNo: 1,
      serviceLineId: null,
      procedureCode: '97110',
      modifiers: ['GP'],
      units: '1',
      serviceDate: '2026-02-02',
      placeOfService: '11',
      chargeCents: cents(0n),
      observedAllowedCents: cents(0n),
      observedAllowedBasis: 'paid_plus_pr' as const,
      patientShareAdjustments: [],
      agreement: { outcome: 'MA_NONCONTRACTED' as const, mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
    };
    const claim = { claimStatusCode: '1', reversed: false, corrected: false, remittanceDate: null, payerPlanKey: null, lines: [line] };
    const settings = { zip: '00012', zipPlusFour: '5000', defaultRounding: null, placeOfServiceSettings: SYNTHETIC_PLACES };
    const requested = screeningRequestedKeys(['97110'], '00012');
    const full = keyedRelease({ shared: SHARED, records: RECORDS, requested });
    const [priced] = price({ claim, release: full, settings, asOf: '2026-10-18' });
    expect(full.violation).toBeNull();
    expect(priced?.outcome).toBe('priced');
    // The ZIP+4's range names locality 02, through the record the run fetched by its ZIP.
    expect(priced?.trace.steps.fee_schedule?.locality?.plus_four).toMatchObject({ zip_plus_four: '5000', carrier: '99999', locality: '02' });
    expect(priced?.trace.steps.fee_schedule?.gpci?.record.key).toEqual({ carrier: '99999', locality: '02' });
    const without = keyedRelease({ shared: SHARED, records: RECORDS, requested: { ...requested, locality_map_plus_four: new Set<string>() } });
    const [quiet] = price({ claim, release: without, settings, asOf: '2026-10-18' });
    expect(quiet?.outcome).toBe('unpriced');
    expect(without.violation).toEqual({ recordType: 'locality_map_plus_four', keyFields: ['zip'] });
  });
});

/** A key set as sorted lists, for comparing. */
function listed(keys: RequestedKeys): Record<string, string[]> {
  return Object.fromEntries(Object.entries(keys).map(([type, set]) => [type, [...set].sort()]));
}

describe('claimsRequestedKeys (audit #31; docs/adr/0071)', () => {
  it('asks for each code’s relative values, edit and MPPR rate, the general rate once, every ordered pair of lines of a claim and date, and the ZIP in both ZIP files', () => {
    const claims = [
      {
        lines: [
          { lineNo: 1, procedureCode: '97110', serviceDate: '2026-02-02' },
          { lineNo: 2, procedureCode: '97140', serviceDate: '2026-02-02' },
          { lineNo: 3, procedureCode: '97530', serviceDate: '2026-02-03' },
        ],
      },
      // Another claim's line on the same date pairs with nothing of the first claim.
      { lines: [{ lineNo: 1, procedureCode: '97110', serviceDate: '2026-02-02' }] },
    ];
    expect(listed(claimsRequestedKeys(claims, '00011'))).toEqual(
      listed(
        requestedKeys({
          pfs_rvu: ['97110', '97140', '97530'].map((hcpcs) => ({ hcpcs, modifier: '' })),
          ncci_mue: ['97110', '97140', '97530'].map((hcpcs) => ({ hcpcs })),
          mppr_rate: [...['97110', '97140', '97530'].map((hcpcs) => ({ hcpcs, modifier: '' })), { component: 'practice_expense' }],
          ncci_ptp: [
            { column1: '97140', column2: '97110' },
            { column1: '97110', column2: '97140' },
          ],
          locality_map: [{ zip: '00011' }],
          locality_map_plus_four: [{ zip: '00011' }],
        }),
      ),
    );
    // Two lines of one code on one date are the same-code pair; a practice with no ZIP asks for the empty one.
    const same = claimsRequestedKeys([{ lines: [1, 2].map((lineNo) => ({ lineNo, procedureCode: '97110', serviceDate: '2026-02-02' })) }], '');
    expect([...same.ncci_ptp]).toEqual([keyIdentity({ column1: '97110', column2: '97110' })]);
    expect([...same.locality_map]).toEqual([keyIdentity({ zip: '' })]);
    expect(listed(claimsRequestedKeys([], '00011')).mppr_rate).toEqual([keyIdentity({ component: 'practice_expense' })]);
  });

  it('unions two key sets per type, leaving both as they were', () => {
    const a = requestedKeys({ pfs_rvu: [{ hcpcs: '97110', modifier: '' }], locality_map: [{ zip: '00011' }] });
    const b = requestedKeys({ pfs_rvu: [{ hcpcs: '97140', modifier: '' }, { hcpcs: '97110', modifier: '' }], ncci_mue: [{ hcpcs: '97140' }] });
    expect(listed(unionKeys(a, b))).toEqual(
      listed(requestedKeys({ pfs_rvu: [{ hcpcs: '97110', modifier: '' }, { hcpcs: '97140', modifier: '' }], ncci_mue: [{ hcpcs: '97140' }], locality_map: [{ zip: '00011' }] })),
    );
    expect(a.pfs_rvu.size).toBe(1);
    expect(b.locality_map.size).toBe(0);
  });
});

describe('pricing through a keyed source by the claims’ own keys (audit #31; docs/adr/0071)', () => {
  const release900001 = indexRelease(readRuleRelease('fixtures/synthetic/rules/release-synth-900001'));
  // Codes the release holds (relative values, MPPR, MUE and pairs among them) and one it does not.
  const CODES = ['97110', '97140', '97530', '97116', '97161', '97164', '97026', '97035', 'G0283', '99999'] as const;
  const DATES = ['2026-02-02', '2026-02-03', '2026-11-30'] as const;
  const MODIFIERS = [[], ['GP'], ['GP', '59'], ['GP', 'CQ']] as const;
  const settings = { zip: '00011', defaultRounding: null, placeOfServiceSettings: SYNTHETIC_PLACES };

  const lineArbitrary = fc.record({
    procedureCode: fc.constantFrom(...CODES),
    serviceDate: fc.constantFrom(...DATES),
    units: fc.integer({ min: 1, max: 3 }),
    modifiers: fc.constantFrom(...MODIFIERS),
  });
  const claimArbitrary = fc.array(lineArbitrary, { minLength: 1, maxLength: 8 }).map((drawn): ClaimFacts => ({
    claimStatusCode: '1',
    reversed: false,
    corrected: false,
    remittanceDate: null,
    payerPlanKey: null,
    lines: drawn.map(
      (line, index): LineFacts => ({
        lineNo: index + 1,
        serviceLineId: null,
        procedureCode: line.procedureCode,
        modifiers: [...line.modifiers],
        units: String(line.units),
        serviceDate: line.serviceDate,
        placeOfService: '11',
        chargeCents: cents(10_000n),
        observedAllowedCents: cents(0n),
        observedAllowedBasis: 'paid_plus_pr',
        patientShareAdjustments: [],
        agreement: { outcome: 'MA_NONCONTRACTED', mapping: SCREENING_MAPPING, terms: MA_NONCONTRACTED_TERMS },
      }),
    ),
  }));

  it('never sets the violation, and prices every line exactly as the whole release does (the flags all on)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(claimArbitrary, { minLength: 1, maxLength: 3 }), async (claims) => {
        const source = memoryReleaseSource(release900001);
        const view = await source.view(claimsRequestedKeys(claims, settings.zip));
        for (const claim of claims) {
          const keyed = price({ claim, release: view, settings, asOf: '2026-12-15' });
          expect(view.violation).toBeNull();
          expect(keyed).toEqual(price({ claim, release: release900001, settings, asOf: '2026-12-15' }));
        }
      }),
      { numRuns: 200 },
    );
  });

  it('serves every key asked so far, and is just as loud on a key never asked', async () => {
    const source = memoryReleaseSource(release900001);
    expect([source.releaseNo, source.manifestSha256]).toEqual([release900001.releaseNo, release900001.manifestSha256]);
    await source.view(requestedKeys({ pfs_rvu: [{ hcpcs: '97110', modifier: '' }] }));
    const later = await source.view(requestedKeys({ ncci_mue: [{ hcpcs: '97110' }] }));
    expect(later.inForce('pfs_rvu', { hcpcs: '97110', modifier: '' }, '2026-02-02')).not.toBeNull();
    expect(later.inForce('ncci_mue', { hcpcs: '97110' }, '2026-02-02')).not.toBeNull();
    expect(() => later.inForce('pfs_rvu', { hcpcs: '97140', modifier: '' }, '2026-02-02')).toThrow(ReleaseReadOutsideFetch);
    expect(later.violation).toEqual({ recordType: 'pfs_rvu', keyFields: ['hcpcs', 'modifier'] });
  });
});
