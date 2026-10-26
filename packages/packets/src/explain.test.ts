import { cents } from '@tp/money';
import { type PricingTrace, price } from '@tp/pricing';
import { contractAgreement, lineFacts, maAgreement, perVisitTerms, percentTerms, pricingInput, syntheticRelease } from '@tp/pricing/testing';
import { describe, expect, it } from 'vitest';

import { assemblePacket } from './assemble';
import { lineCalculation, traceSha256 as traceShaOf } from './calculation';
import { ExplainBindingError, explainPacket } from './explain';
import { WORDS_VERSION, explainLine, feeScheduleWorksheets, plainText } from './explain/index';
import type { PacketContentV2 } from './format';
import { MA_NONCONTRACTED_CITATION } from './payer';
import { IDS, assemblyInput, contractCitation, line, pricedLine } from './test-support';

/**
 * A packet's calculation in words (design 4.3, explain.test.ts; CAS-32): bound to what was approved before anything is
 * worded. A trace whose SHA-256 differs from its calculation's, a missing one, a line priced by another rate record
 * than the contract citation's, or a non-Medicare Advantage line under the regulation, is refused naming the row; and
 * the words are byte-identical for identical input.
 */

function packet(lines = [pricedLine(1), pricedLine(2), pricedLine(3)], overrides: Parameters<typeof assemblyInput>[0] = {}) {
  const content = assemblePacket(assemblyInput({ lines: lines.map((item) => item.line), ...overrides }));
  const traces = new Map<string, unknown>(content.lines.map((line, index) => [line.priced_line_id, JSON.parse(JSON.stringify((lines[index] as { trace: PricingTrace }).trace))]));
  return { content, traces };
}

describe('explainPacket', () => {
  it('words each row from its trace, as explainLine words it with the packet’s rows and worksheets, and names the renderer', () => {
    const { content, traces } = packet();
    const words = explainPacket(content, traces, 'payer');
    expect(words.wordsVersion).toBe(WORDS_VERSION);
    expect(words.rows.map((row) => row.row)).toEqual([1, 2, 3]);
    expect(words.worksheets).toEqual([]);
    expect(plainText(words.rows[0]?.words.summary as never)).toBe('2 units × $50.00 = $100.00 under the contract’s clause on page 2; rounded once to $100.00; observed allowed $70.00; short $30.00.');
    for (const row of words.rows) {
      expect(row.worksheet).toBeNull();
      expect(row.words).toEqual(explainLine(traces.get(content.lines[row.row - 1]?.priced_line_id as string) as PricingTrace, { kind: 'contract', page: 2 }, 'payer', { rowsOfClaim: new Map() }));
    }
  });

  it('numbers the worksheets as feeScheduleWorksheets() does and points each row to its own', () => {
    const percent = contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110', '97140'] }), rateRecordId: IDS.rateRecord });
    const low = cents(2000n);
    const lines = [pricedLine(1, { facts: { agreement: percent, observedAllowedCents: low } }), pricedLine(2, { facts: { agreement: percent, procedureCode: '97140', observedAllowedCents: low } }), pricedLine(3, { facts: { agreement: percent, observedAllowedCents: low } })];
    const { content, traces } = packet(lines, { citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110' } }) });
    const words = explainPacket(content, traces, 'payer');
    const rowOf = (code: string) => content.lines.filter((line) => line.procedure_code === code).map((line) => line.row);
    expect(words.worksheets.map((sheet) => sheet.lines)).toEqual([rowOf('97110'), rowOf('97140')].sort((a, b) => (a[0] as number) - (b[0] as number)));
    expect(words.worksheets).toEqual(feeScheduleWorksheets(content.lines.map((line) => ({ row: line.row, trace: traces.get(line.priced_line_id) as PricingTrace, citation: { kind: 'contract', page: 2 } })), 'payer'));
    for (const row of words.rows) {
      const sheet = words.worksheets.find((item) => item.lines.includes(row.row));
      expect(row.worksheet).toBe(sheet?.number);
      expect(plainText(row.words.steps.find((item) => item.step === 'fee_schedule')?.sentences[0] as never)).toBe(`See fee schedule worksheet ${String(sheet?.number)}.`);
    }
  });

  it('names another line of the same claim by its row', () => {
    const percent = contractAgreement({ terms: percentTerms({ percentage: '110', codes: ['97110', '97140'], flags: { apply_mppr: true } }), rateRecordId: IDS.rateRecord });
    const claim = [lineFacts({ agreement: percent, observedAllowedCents: cents(1000n) }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: percent, observedAllowedCents: cents(1000n) })];
    const priced = price(pricingInput(syntheticRelease(), claim, { claim: { remittanceDate: '2026-04-08' } }));
    const lines = priced.map((item, index) => {
      if (item.outcome !== 'priced') throw new Error('both lines price');
      const assembled = line(index + 1, {
        claimId: line(1).claimId,
        serviceDate: item.trace.line.service_date,
        procedureCode: item.trace.line.procedure_code,
        units: item.trace.line.units,
        expectedCents: item.expectedAllowedCents,
        observedCents: cents(1000n),
        varianceCents: item.varianceCents,
        paidCents: cents(1000n),
        calculation: lineCalculation(item.trace),
      });
      return { line: assembled, trace: item.trace };
    });
    const { content, traces } = packet(lines, { citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110' } }) });
    const rows = explainPacket(content, traces, 'payer').rows;
    const rowOfLine = (lineNo: number) => content.lines.find((item) => (traces.get(item.priced_line_id) as PricingTrace).line.line_no === lineNo)?.row as number;
    const reduced = rows.find((row) => row.row === rowOfLine(1));
    expect(plainText(reduced?.words.steps.find((item) => item.step === 'mppr')?.sentences[0] as never)).toBe(
      `Ranked by practice-expense part on the claim’s day, the first unit is claim line 2 (row ${String(rowOfLine(2))})’s ($17.556).`,
    );
  });

  it('names each row by its own claim’s other lines only, never another claim’s or its own', () => {
    // Two claims, each a visit of lines 1 and 2 whose line 1 carries the visit's amount (the other line, overpaid, is
    // not a row): claim A's carrier is row 1, claim B's row 2. A row named from the wrong claim, or the line itself,
    // would read "(row 1)" or "(row 2)" beside its own line.
    const perVisit = contractAgreement({ terms: perVisitTerms(8000n), rateRecordId: IDS.rateRecord });
    const carrier = (claimId: string, n: number) => {
      const facts = [lineFacts({ agreement: perVisit, observedAllowedCents: cents(2000n) }), lineFacts({ lineNo: 2, procedureCode: '97140', agreement: perVisit, observedAllowedCents: cents(2000n) })];
      const [item] = price(pricingInput(syntheticRelease(), facts, { claim: { remittanceDate: '2026-04-08' } }));
      if (item?.outcome !== 'priced') throw new Error('the carrier prices');
      const assembled = line(n, {
        claimId,
        serviceDate: item.trace.line.service_date,
        procedureCode: item.trace.line.procedure_code,
        units: item.trace.line.units,
        expectedCents: item.expectedAllowedCents,
        observedCents: cents(2000n),
        varianceCents: item.varianceCents,
        paidCents: cents(2000n),
        calculation: lineCalculation(item.trace),
      });
      return { line: assembled, trace: item.trace };
    };
    const { content, traces } = packet([carrier(line(1).claimId, 1), carrier(line(2).claimId, 2)], { citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '8000' } }) });
    const rows = explainPacket(content, traces, 'payer').rows;
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(plainText(row.words.steps.find((item) => item.step === 'per_visit')?.sentences[0] as never)).toBe('$80.00 once for the visit, carried by this line (claim line 1); the visit’s lines are claim line 1 and claim line 2.');
    }
  });

  it('refuses a row whose trace differs from the SHA-256 its calculation carries, naming the row', () => {
    const { content, traces } = packet();
    const id = content.lines[1]?.priced_line_id as string;
    const tampered = structuredClone(traces.get(id)) as PricingTrace;
    (tampered.steps.rounding as { rounded_cents: string }).rounded_cents = '10001';
    traces.set(id, tampered);
    let thrown: unknown;
    try {
      explainPacket(content, traces, 'payer');
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ExplainBindingError);
    expect(thrown).toMatchObject({ name: 'ExplainBindingError', reason: 'trace_differs', row: 2, message: "row 2's calculation cannot be worded: trace_differs" });
  });

  it('refuses a row whose trace is missing', () => {
    const { content, traces } = packet();
    traces.delete(content.lines[2]?.priced_line_id as string);
    expect(() => explainPacket(content, traces, 'internal')).toThrow(expect.objectContaining({ reason: 'trace_missing', row: 3 }));
  });

  it('refuses a row priced by another rate record than the contract citation’s (finding m4)', () => {
    const other = pricedLine(2, { facts: { agreement: contractAgreement({ terms: percentTerms(), rateRecordId: 'rr-synth-other' }), observedAllowedCents: cents(2000n) } });
    const { content, traces } = packet([pricedLine(1), other, pricedLine(3)]);
    expect(() => explainPacket(content, traces, 'payer')).toThrow(expect.objectContaining({ reason: 'rate_record_differs', row: 2 }));
  });

  it('refuses a row under the regulation citation that is not Medicare Advantage non-contracted (finding m4), and words one that is', () => {
    const ma = (n: number) => pricedLine(n, { facts: { agreement: maAgreement(), procedureCode: '97161', units: '1', observedAllowedCents: cents(4000n) } });
    const regulated = packet([ma(1), ma(2)], { citation: MA_NONCONTRACTED_CITATION });
    const words = explainPacket(regulated.content, regulated.traces, 'payer');
    expect(plainText(words.rows[0]?.words.summary as never)).toMatch(/ under 42 CFR 422\.214; /);
    expect(words.worksheets).toHaveLength(1);
    const mixed = packet([ma(1), pricedLine(2)], { citation: MA_NONCONTRACTED_CITATION });
    expect(() => explainPacket(mixed.content, mixed.traces, 'payer')).toThrow(expect.objectContaining({ reason: 'not_medicare_advantage', row: 2 }));
  });

  it('refuses a tp-packet/1 version, which holds no calculation to bind', () => {
    const { content, traces } = packet();
    const v1 = { ...content, format: 'tp-packet/1' } as unknown as PacketContentV2;
    expect(() => explainPacket(v1, traces, 'payer')).toThrow(expect.objectContaining({ name: 'ExplainBindingError', reason: 'format', row: null, message: "the packet's calculation cannot be worded: format" }));
  });

  it('refuses a priced row whose trace names no agreement, under either citation, rather than failing to read it', () => {
    const withoutAgreement = (content: PacketContentV2, traces: Map<string, unknown>) => {
      const id = content.lines[0]?.priced_line_id as string;
      const changed = { ...(traces.get(id) as PricingTrace), agreement: null };
      const calculation = { ...content.lines[0]!.calculation, trace_sha256: traceShaOf(changed) };
      traces.set(id, changed);
      return { ...content, lines: content.lines.map((line, index) => (index === 0 ? { ...line, calculation } : line)) };
    };
    const contracted = packet();
    expect(() => explainPacket(withoutAgreement(contracted.content, contracted.traces), contracted.traces, 'payer')).toThrow(expect.objectContaining({ reason: 'rate_record_differs', row: 1 }));
    const ma = (n: number) => pricedLine(n, { facts: { agreement: maAgreement(), procedureCode: '97161', units: '1', observedAllowedCents: cents(4000n) } });
    const regulated = packet([ma(1), ma(2)], { citation: MA_NONCONTRACTED_CITATION });
    expect(() => explainPacket(withoutAgreement(regulated.content, regulated.traces), regulated.traces, 'payer')).toThrow(expect.objectContaining({ reason: 'not_medicare_advantage', row: 1 }));
  });

  it('refuses a row whose stored trace priced nothing', () => {
    const { content, traces } = packet();
    const id = content.lines[0]?.priced_line_id as string;
    const unpriced = { ...(traces.get(id) as PricingTrace), outcome: { result: 'unpriced', reason: 'ENGINE_ERROR', detail: 'unexpected', step: 'input' } };
    const calculation = { ...content.lines[0]!.calculation, trace_sha256: traceShaOf(unpriced) };
    const changed = { ...content, lines: content.lines.map((line, index) => (index === 0 ? { ...line, calculation } : line)) };
    traces.set(id, unpriced);
    expect(() => explainPacket(changed, traces, 'payer')).toThrow(expect.objectContaining({ reason: 'not_priced', row: 1 }));
  });

  it('gives byte-identical words for identical input', () => {
    const { content, traces } = packet();
    const again = new Map([...traces].map(([id, trace]) => [id, structuredClone(trace)]));
    expect(JSON.stringify(explainPacket(structuredClone(content), again, 'payer'))).toBe(JSON.stringify(explainPacket(content, traces, 'payer')));
  });

});
