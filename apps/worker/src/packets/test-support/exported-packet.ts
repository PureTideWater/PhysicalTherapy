import {
  type AssemblyInput,
  type AssemblyLine,
  type DeadlineSource,
  type PacketContent,
  type PacketWords,
  type RowIdentifiers,
  SYNTHETIC_CORRESPONDENCE_CONTACT,
  assemblePacket,
  draftNarrative,
  explainPacket,
  insertIdentifiers,
  lineCalculation,
  packetReference,
} from '@tp/packets';
import { cents } from '@tp/money';
import { IDS, type PricedLineOptions, assemblyInput, contractCitation, contractWindowSource, pricedLine, promptPayRecord } from '@tp/packets/testing';
import type { PricingTrace } from '@tp/pricing';
import { contractAgreement, percentTerms } from '@tp/pricing/testing';

import type { PayerCopy } from '../html';

/**
 * A SYNTHETIC packet version as the export reads it: its content, its identifiers inserted, and what the payer's copy
 * prints beside them (audit item #37 part 1, D4 to D6): the approval's date, the reference and the contact. The
 * formula prefix sample sits in a patient's name, since the payer's copy prints no patient control number (Q2 (a)).
 *
 * Every line is priced by the engine (tracedLine(), over @tp/packets' pricedLine()), so its calculation's SHA-256 is a
 * real trace's, and the copy's words are explainPacket()'s over those traces (payerWords(); combined audit #38).
 */

/** Every trace a test line was priced as, by its SHA-256: one key per trace, whatever row or version it is in. */
const TRACES = new Map<string, PricingTrace>();

/**
 * Schedule row `n` priced by the engine (by default the SYNTHETIC fixed schedule's 97110 x 2 at 50.00 a unit, allowed
 * 70.00, as @tp/packets' line() states it), with the row's own facts (`overrides`: its received and paid dates, its
 * deadline) over it; its trace is kept for payerWords().
 */
export function tracedLine(n: number, overrides: Partial<Omit<AssemblyLine, 'calculation'>> = {}, options: PricedLineOptions = {}): AssemblyLine {
  const { line, trace } = pricedLine(n, options);
  TRACES.set(line.calculation.trace_sha256, trace);
  return { ...line, ...overrides };
}

/**
 * A row as priced by `trace` instead of its own (a trace a test writes for a shape the engine does not write): its
 * calculation copied from that trace, so its SHA-256 is that trace's, which is kept for payerWords().
 */
export function retracedLine(line: AssemblyLine, trace: PricingTrace): AssemblyLine {
  const calculation = lineCalculation(trace);
  TRACES.set(calculation.trace_sha256, trace);
  return { ...line, calculation };
}

/** An assembly input whose lines are traced (three, as assemblyInput()'s), with `overrides` over it. */
export const tracedInput = (overrides: Partial<AssemblyInput> = {}): AssemblyInput => assemblyInput({ lines: [tracedLine(1), tracedLine(2), tracedLine(3)], ...overrides });

/** The stored traces of a version's lines, by priced line ID, as the export reads them (packetTraces()). */
export function tracesOf(packet: PacketContent): Map<string, unknown> {
  const traces = new Map<string, unknown>();
  for (const line of packet.lines) {
    const trace = 'calculation' in line ? TRACES.get(line.calculation.trace_sha256) : undefined;
    if (trace !== undefined) {
      traces.set(line.priced_line_id, trace);
    }
  }
  return traces;
}

/** A version's calculation in the payer's words, as the export words it (none for a tp-packet/1 version, which prints none). */
export const payerWords = (packet: PacketContent): PacketWords | null => (packet.format === 'tp-packet/2' ? explainPacket(packet, tracesOf(packet), 'payer') : null);

export const content = assemblePacket(
  assemblyInput({
    asOf: '2026-05-01',
    lines: [tracedLine(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), tracedLine(2, { receivedOn: null })],
    interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
  }),
);
export const identifiers = new Map<number, RowIdentifiers>([
  [1, { claim_control_number: 'SYNCCN0001', patient_control_number: 'SYNPCN0001', patient_name: '=SYNTHETIC, PATIENT <ONE>', member_id: 'SYNMBR1' }],
  [2, { claim_control_number: 'SYNCCN0002', patient_control_number: 'SYNPCN0002', patient_name: 'SYNTHETIC, PATIENT TWO', member_id: null }],
]);
export const narrative = `${draftNarrative(content)}\n\nClaim {{claim_control_number:1}} is the first [3].`;
export const exported = insertIdentifiers(content, narrative, identifiers);
export const payerCopy: PayerCopy = { approvedOn: '2026-05-02', reference: packetReference('c'.repeat(64)), contact: SYNTHETIC_CORRESPONDENCE_CONTACT };
export const words = payerWords(content);

/** The internal record of the SYNTHETIC approval, which the payer's copy never prints (the scan's secrets). */
export const INTERNAL_RECORD = {
  drafter: 'drafter@synthetic.test',
  approver: 'approver@synthetic.test',
  specialist: 'specialist@synthetic.test',
  versionSha256: 'c'.repeat(64),
} as const;

/** A distinct 64-hex sentinel for every hash the maximal content holds. */
const sentinel = (n: number) => `${n.toString(16).padStart(2, '0')}${'abcdef0123456789'.repeat(4)}`.slice(0, 64);

const RELEASE_RECORD: DeadlineSource = { kind: 'release_record', release_no: 900002, sha256: sentinel(0x11), program: 'medicare', level: 'L2' };

/**
 * A version with every internal field filled with a distinct sentinel (T1, T5): both kinds of deadline source, two
 * releases, evidence of all four kinds with IDs and hashes, an evidence gap, interest computed on two lines and not on
 * the third, a line whose deadline holds a cause, and a hash of its own for each line's trace (each a real trace's, as
 * each line is priced on its own service date).
 */
export const maximalContent = assemblePacket(
  assemblyInput({
    asOf: '2026-05-01',
    citation: contractCitation({ document_sha256: sentinel(0x01), page_sha256: sentinel(0x02) }),
    releases: [
      { release_no: 900001, manifest_sha256: sentinel(0x03) },
      { release_no: 900002, manifest_sha256: sentinel(0x04) },
    ],
    lines: [
      tracedLine(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }),
      tracedLine(2, { receivedOn: '2026-03-03', paidOn: '2026-05-01' }),
      tracedLine(3, { receivedOn: null, deadline: { status: 'unverified', source: 'contract', endsOn: '2036-04-05', cause: 'CONTRACT_WINDOW_UNVERIFIED' } }),
    ],
    interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ sha256: sentinel(0x05) }) },
    contractDocuments: [
      { documentId: IDS.document, sha256: sentinel(0x01) },
      { documentId: '00000000-0000-4000-8000-0000000000c1', sha256: sentinel(0x06) },
    ],
    remittances: [{ documentId: IDS.remittanceDocument, sha256: sentinel(0x07), paidOn: '2026-05-01' }],
    attachedDocuments: [{ documentId: '00000000-0000-4000-8000-0000000000c2', sha256: sentinel(0x08) }],
    deadlineSources: [contractWindowSource({ hash: sentinel(0x09), document_id: '00000000-0000-4000-8000-0000000000c3' }), RELEASE_RECORD],
  }),
);
export const maximalIdentifiers = new Map<number, RowIdentifiers>([
  [1, { claim_control_number: 'SYNCCN0001', patient_control_number: 'SYNPCN0001', patient_name: 'SYNTHETIC, PATIENT ONE', member_id: 'SYNMBR1' }],
  [2, { claim_control_number: 'SYNCCN0002', patient_control_number: 'SYNPCN0002', patient_name: 'SYNTHETIC, PATIENT TWO', member_id: 'SYNMBR2' }],
  [3, { claim_control_number: 'SYNCCN0003', patient_control_number: 'SYNPCN0003', patient_name: 'SYNTHETIC, PATIENT THREE', member_id: null }],
]);
export const maximalNarrative = `${draftNarrative(maximalContent)}\n\nClaim {{claim_control_number:3}} for {{patient_name:3}} is the last [3].`;
export const maximalExported = insertIdentifiers(maximalContent, maximalNarrative, maximalIdentifiers);
export const maximalWords = payerWords(maximalContent);

/** The SYNTHETIC contract's dispute window of 3650 days, for a line priced under terms of its own. */
const WINDOWS = { timely_filing_days: null, dispute_window_days: 3650, appeal_levels: [] };

/**
 * A percent-of-Medicare version whose lines take every step the payer's words name (combined audit #38): 110% of the
 * fee schedule with every Medicare flag on, the multiple procedure payment reduction on the second unit, CQ's
 * assistant reduction, the contract's own 95%, sequestration on the payer's share, and each line's own rounding rule;
 * both lines read one fee schedule worksheet.
 */
export const steppedContent = assemblePacket(
  assemblyInput({
    asOf: '2026-05-01',
    citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110' }, quote: '97110 is paid 110% of the Medicare physician fee schedule' }),
    lines: (['HALF_EVEN_CENT', 'TRUNCATE'] as const).map((rounding, index) =>
      tracedLine(index + 1, {}, {
        facts: {
          modifiers: ['GP', 'CQ'],
          observedAllowedCents: cents(2000n),
          agreement: contractAgreement({
            terms: percentTerms({
              percentage: '110',
              flags: { apply_mppr: true, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' },
              adjustment: { kind: 'PERCENT', percent: '95' },
              rounding,
            }),
            rateRecordId: IDS.rateRecord,
            windows: WINDOWS,
          }),
        },
      }),
    ),
  }),
);
export const steppedIdentifiers = new Map<number, RowIdentifiers>([
  [1, { claim_control_number: 'SYNCCN0001', patient_control_number: 'SYNPCN0001', patient_name: 'SYNTHETIC, PATIENT ONE', member_id: 'SYNMBR1' }],
  [2, { claim_control_number: 'SYNCCN0002', patient_control_number: 'SYNPCN0002', patient_name: 'SYNTHETIC, PATIENT TWO', member_id: 'SYNMBR2' }],
]);
export const steppedNarrative = draftNarrative(steppedContent);
export const steppedExported = insertIdentifiers(steppedContent, steppedNarrative, steppedIdentifiers);
