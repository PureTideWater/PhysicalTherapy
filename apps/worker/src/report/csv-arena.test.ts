import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { collect } from '../storage/documents';
import type { ReportLine } from './content';
import { CSV_ARENA_CHUNK_BYTES, CsvArena } from './csv-arena';
import { auditCsv } from './csv';
import { reportLineOrder } from './test-support/whole-read';

/**
 * The audit report's line CSV kept outside the heap (CAS-41.3; SUITE-CAP-1a D17; docs/adr/0083): each line's row is
 * appended to the arena's chunks as it is read, in any order, with its sort key, and streamed in the report's order
 * (payer, plan, the payer's claim control number, line number and line, each text compared by UTF-16 code unit as
 * content.ts compares it) after the last batch. The stream is auditCsv() of the sorted lines byte for byte, whatever
 * the chunk size and wherever a row falls across chunks; release() gives the chunks back. SYNTHETIC lines only.
 */

const LINE: ReportLine = {
  priced_line_id: '11111111-2222-4333-8444-555555555555',
  service_line_id: '66666666-7777-4888-8999-000000000000',
  payer_claim_control_number: 'SYNCCN0001',
  line_no: 1,
  service_date: '2026-10-02',
  procedure_code: '97110',
  modifiers: ['GP'],
  units: '1',
  payer: 'SYNTHETIC PAYER ALPHA',
  plan: 'CE:SYNPLAN-A1',
  charge_cents: '10000',
  observed_allowed_cents: '4000',
  expected_allowed_cents: '5000',
  variance_cents: '1000',
  validated_cents: '1000',
  visit_variance_cents: null,
  unpriced_reason: null,
  window_ends_on: '2036-10-20',
  stage: 'actionable',
  status: 'actionable',
  reasons: [],
  review_flags: [],
  behavior: 'BELOW_CONTRACT_RATE',
  case_id: '0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03',
  anomaly_id: null,
};

/** The arena's stream, whole. */
const streamed = (arena: CsvArena) => collect(arena.rows());

/** What the report wrote before it streamed: the whole CSV of its lines in the report's order. */
const expected = (lines: readonly ReportLine[]) => Buffer.from(auditCsv([...lines].sort(reportLineOrder)), 'utf8');

function filled(lines: readonly ReportLine[], options: { readonly chunkBytes?: number } = {}): CsvArena {
  const arena = new CsvArena(options);
  for (const line of lines) {
    arena.append(line);
  }
  return arena;
}

// Payer and plan names as an 835 can carry them: ties, non-ASCII (one outside the Basic Multilingual Plane, whose
// UTF-16 order differs from its UTF-8 bytes' order), and values a spreadsheet would run or that need quoting.
const PAYERS = ['SYNTHETIC PAYER ALPHA', 'SYNTHETIC PAYER ÉTÉ', 'SYNTHETIC PAYER \u{1F600}', 'SYNTHETIC PAYER ～', '=SYNTHETIC PAYER', 'SYNTHETIC "PAYER", INC', 'SYNTHETIC PAYER\r\nTWO'];
const PLANS = ['CE:SYNPLAN-A1', 'CE:SYNPLAN-A2', '+SYNPLAN', '@SYNPLAN', 'SYNTHETIC SHARED PLAN', 'SYNPLAN Ünï'];
const CLAIMS = ['SYNCCN0001', 'SYNCCN0002', 'SYNCCN0010', '-SYNCCN', 'SYNCCN,"0003"', '\tSYNCCN', 'SYNCCNØ'];
const amount = fc.bigInt({ min: -99_999_999n, max: 99_999_999n }).map(String);
const maybeAmount = fc.option(amount, { nil: null });

const lineArbitrary = fc.record({
  priced_line_id: fc.uuid(),
  service_line_id: fc.uuid(),
  payer_claim_control_number: fc.constantFrom(...CLAIMS),
  line_no: fc.integer({ min: 1, max: 4 }),
  service_date: fc.constantFrom('2026-09-30', '2026-10-01', '2026-10-31'),
  procedure_code: fc.constantFrom('97110', '97140', '97530', '=97161'),
  modifiers: fc.subarray(['GP', 'KX', 'CQ', '59']),
  units: fc.constantFrom('1', '2', '1.5'),
  payer: fc.constantFrom(...PAYERS),
  plan: fc.constantFrom(...PLANS),
  charge_cents: amount,
  observed_allowed_cents: amount,
  expected_allowed_cents: maybeAmount,
  variance_cents: maybeAmount,
  validated_cents: maybeAmount,
  visit_variance_cents: maybeAmount,
  unpriced_reason: fc.constantFrom(null, 'NO_MATCHING_TERM', 'NO_AGREEMENT'),
  window_ends_on: fc.constantFrom(null, '2026-10-23', '2036-10-20'),
  stage: fc.constantFrom('', 'flagged', 'validated', 'actionable'),
  status: fc.constantFrom('actionable', 'held', 'not_actionable', 'written_off', 'in_case_other_run', 'overpaid', 'paid_as_expected', 'with_visit', 'unpriced'),
  reasons: fc.subarray(['DEADLINE_UNVERIFIED', 'NO_WINDOW', 'CONTENT_NOT_LOADED', 'duplicate']),
  review_flags: fc.array(fc.record({ flag: fc.constant('NCCI_PTP'), column1_line_no: fc.integer({ min: 1, max: 4 }) }), { maxLength: 2 }),
  behavior: fc.constantFrom(null, 'BELOW_CONTRACT_RATE', 'MPPR_MISAPPLIED'),
  case_id: fc.option(fc.uuid(), { nil: null }),
  anomaly_id: fc.option(fc.uuid(), { nil: null }),
}) as fc.Arbitrary<ReportLine>;

/** A run's lines (one per service line) in the order the batches happened to read them. */
const runLines = fc.uniqueArray(lineArbitrary, { maxLength: 120, selector: (line) => line.service_line_id });

describe('the line CSV arena (CAS-41.3)', () => {
  it('streams the header alone for a run with no lines, as auditCsv does', async () => {
    const arena = filled([]);
    expect(arena.lines).toBe(0);
    expect(await streamed(arena)).toEqual(Buffer.from(auditCsv([]), 'utf8'));
    arena.release();
  });

  it('streams rows appended in any order in the report’s order, byte for byte the whole CSV, at any chunk size', async () => {
    await fc.assert(
      fc.asyncProperty(runLines, fc.constantFrom(64, 257, 4096, CSV_ARENA_CHUNK_BYTES), async (lines, chunkBytes) => {
        const arena = filled(lines, { chunkBytes });
        expect(arena.lines).toBe(lines.length);
        expect(await streamed(arena)).toEqual(expected(lines));
        arena.release();
      }),
      { numRuns: 200 },
    );
  });

  it('compares text by UTF-16 code unit, as the report sorts, not by its UTF-8 bytes', async () => {
    // U+1F600 is the surrogate pair D83D DE00, below U+FF5E as code units and above it as UTF-8 bytes (F0 > EF).
    const astral = { ...LINE, service_line_id: '66666666-7777-4888-8999-000000000002', payer: 'SYNTHETIC PAYER \u{1F600}' };
    const wide = { ...LINE, service_line_id: '66666666-7777-4888-8999-000000000001', payer: 'SYNTHETIC PAYER ～' };
    const ascii = { ...LINE, service_line_id: '66666666-7777-4888-8999-000000000003', payer: 'SYNTHETIC PAYER ~' };
    const arena = filled([wide, ascii, astral]);
    const text = (await streamed(arena)).toString('utf8');
    expect(text.indexOf('\u{1F600}')).toBeLessThan(text.indexOf('～'));
    expect(text.indexOf('PAYER ~')).toBeLessThan(text.indexOf('\u{1F600}'));
    expect(Buffer.from(text, 'utf8')).toEqual(expected([wide, ascii, astral]));
    arena.release();
  });

  it('breaks a tie on payer, plan, claim number and line number by the line’s ID, whatever order the rows came in', async () => {
    const ids = ['66666666-7777-4888-8999-00000000000c', '66666666-7777-4888-8999-00000000000a', '66666666-7777-4888-8999-00000000000b'];
    const tied = ids.map((id, index) => ({ ...LINE, service_line_id: id, priced_line_id: `11111111-2222-4333-8444-55555555555${String(index)}` }));
    for (const order of [tied, [...tied].reverse(), [tied[1], tied[2], tied[0]] as ReportLine[]]) {
      const arena = filled(order, { chunkBytes: 64 });
      const rows = (await streamed(arena)).toString('utf8').split('\r\n').slice(1, -1);
      expect(rows.map((row) => row.split(',').at(-1))).toEqual(['11111111-2222-4333-8444-555555555551', '11111111-2222-4333-8444-555555555552', '11111111-2222-4333-8444-555555555550']);
      arena.release();
    }
  });

  it('keeps a row longer than a chunk whole, and the rows beside it', async () => {
    const long = { ...LINE, service_line_id: '66666666-7777-4888-8999-000000000001', payer: `SYNTHETIC PAYER ${'É'.repeat(400)}`, plan: `"${'P'.repeat(300)}"` };
    const short = { ...LINE, service_line_id: '66666666-7777-4888-8999-000000000002' };
    const arena = filled([long, short, { ...short, service_line_id: '66666666-7777-4888-8999-000000000003', line_no: 2 }], { chunkBytes: 256 });
    expect(await streamed(arena)).toEqual(expected([long, short, { ...short, service_line_id: '66666666-7777-4888-8999-000000000003', line_no: 2 }]));
    arena.release();
  });

  it('holds the rows’ bytes within one chunk of their size, and gives every chunk back on release', async () => {
    const lines = Array.from({ length: 2_000 }, (_, index) => ({
      ...LINE,
      service_line_id: `66666666-7777-4888-8999-${String(index).padStart(12, '0')}`,
      payer_claim_control_number: `SYNCCN${String(index % 97).padStart(4, '0')}`,
      line_no: 1 + (index % 4),
    }));
    const chunkBytes = 16 * 1024;
    const arena = filled(lines, { chunkBytes });
    // The rows' own bytes: the whole CSV less its header line.
    const rowBytes = Buffer.byteLength(auditCsv(lines), 'utf8') - Buffer.byteLength(auditCsv([]), 'utf8');
    expect(arena.heldBytes).toBeGreaterThanOrEqual(rowBytes);
    expect(arena.heldBytes - rowBytes).toBeLessThan(chunkBytes);
    expect(await streamed(arena)).toEqual(expected(lines));
    arena.release();
    expect(arena.heldBytes).toBe(0);
    expect(() => arena.append(LINE)).toThrow();
    await expect(streamed(arena)).rejects.toThrow();
  });
});
