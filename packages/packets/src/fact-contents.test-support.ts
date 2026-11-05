import { cents } from '@tp/money';

import { type AssemblyLine, assemblePacket } from './assemble';
import { asV1 } from './fact-arbitrary.test-support';
import type { PacketContent, PacketContentV2 } from './format';
import { REGULATION, assemblyInput, contractCitation, contractWindowSource, line, promptPayRecord } from './test-support';

/**
 * Named SYNTHETIC packets for the facts' catalog and renderer tests and their golden renders (design
 * lane-b-packet-figure-placeholders, sections 1, 5 and 8; test matrix CAS-55), each a pattern the catalog tells apart.
 * Invented values only.
 */

const claim = (n: number) => `20000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const patient = (n: number) => `40000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const money = (expected: bigint, observed: bigint, paid: bigint): Partial<AssemblyLine> => ({
  expectedCents: cents(expected),
  observedCents: cents(observed),
  varianceCents: cents(expected - observed),
  paidCents: cents(paid),
});

/**
 * Six lines: 97110 on rows 1, 2 and 4 (claim A, two patients), G0283 with modifiers GP and KX on row 3 (claim B),
 * 0275T on row 5 and a code of another shape on row 6 (claim C), units of two, one and a half and three, values that
 * differ, received dates on record and prompt-pay interest stated.
 */
function severalCodes(): PacketContentV2 {
  return assemblePacket(
    assemblyInput({
      interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
      lines: [
        line(1, { claimId: claim(1), patientKey: patient(1), serviceDate: '2026-03-02', receivedOn: '2026-02-10', ...money(10_000n, 7_000n, 5_600n) }),
        line(2, { claimId: claim(1), patientKey: patient(2), serviceDate: '2026-03-03', units: '1.5', receivedOn: '2026-02-10', ...money(7_500n, 5_250n, 4_200n) }),
        line(3, { claimId: claim(2), patientKey: patient(1), serviceDate: '2026-03-04', procedureCode: 'G0283', modifiers: ['GP', 'KX'], units: '1', receivedOn: '2026-02-10', ...money(2_500n, 1_000n, 800n) }),
        line(4, { claimId: claim(1), patientKey: patient(1), serviceDate: '2026-03-05', units: '3', receivedOn: '2026-02-10', ...money(15_000n, 10_500n, 8_400n) }),
        line(5, { claimId: claim(3), patientKey: patient(3), serviceDate: '2026-03-06', procedureCode: '0275T', modifiers: ['59'], receivedOn: '2026-02-10', ...money(20_000n, 12_000n, 12_000n) }),
        line(6, { claimId: claim(3), patientKey: patient(3), serviceDate: '2026-03-10', procedureCode: '9701', receivedOn: '2026-02-10', ...money(4_000n, 3_000n, 0n) }),
      ],
    }),
  );
}

/** The base: three 97110 x 2 lines at $100.00 expected and $70.00 allowed, each its own claim and patient. */
const base = (): PacketContentV2 => assemblePacket(assemblyInput());

/** One code over three lines of two claims (rows 1 and 2 claim A), the third line's values differing. */
const oneCode = (): PacketContentV2 =>
  assemblePacket(
    assemblyInput({
      lines: [line(1, { claimId: claim(1) }), line(2, { claimId: claim(1) }), line(3, { claimId: claim(3), units: '4', ...money(20_000n, 14_000n, 11_200n) })],
    }),
  );

/** One line. */
const oneLine = (): PacketContentV2 => assemblePacket(assemblyInput({ lines: [line(1, { modifiers: ['GP'] })] }));

/** A per-visit rate, above the first level, two contract windows of different day counts. */
const perVisit = (): PacketContentV2 =>
  assemblePacket(
    assemblyInput({
      citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '9000' }, effective_to: '2026-12-31', version_no: 3, page: 14 }),
      disputeLevel: 2,
      nextLevelDeadline: { status: 'verified', source: 'contract', endsOn: '2027-01-15', cause: null },
      deadlineSources: [contractWindowSource(), contractWindowSource({ contract_version_id: '00000000-0000-4000-8000-0000000000c1', days: 180, page: 9 })],
    }),
  );

/** A lesser-of rule whose schedule side is a fixed schedule, two windows of one day count. */
const lesserOf = (): PacketContentV2 =>
  assemblePacket(
    assemblyInput({
      citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '6000' } } }),
      deadlineSources: [contractWindowSource(), contractWindowSource({ contract_version_id: '00000000-0000-4000-8000-0000000000c1' })],
    }),
  );

/** A percent of Medicare with a locked year, and two rule releases. */
const percent = (): PacketContentV2 =>
  assemblePacket(
    assemblyInput({
      citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percent: '112.5', year_basis: 'LOCKED:2025' } }),
      releases: [
        { release_no: 900001, manifest_sha256: 'a'.repeat(64) },
        { release_no: 900002, manifest_sha256: 'b'.repeat(64) },
      ],
    }),
  );

/** Medicare Advantage non-contracted: the regulation, and interest computed on no line (not stated). */
const regulation = (): PacketContentV2 => assemblePacket(assemblyInput({ citation: REGULATION, interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } }));

/** The base written as a tp-packet/1 version. */
const v1 = (): PacketContent => asV1(base());

export const FACT_CONTENTS = { base, severalCodes, oneCode, oneLine, perVisit, lesserOf, percent, regulation, v1 } as const;
export type FactContent = keyof typeof FACT_CONTENTS;
