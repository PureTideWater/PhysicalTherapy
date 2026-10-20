import { type DeadlineSource, type RowIdentifiers, SYNTHETIC_CORRESPONDENCE_CONTACT, assemblePacket, draftNarrative, insertIdentifiers, packetReference } from '@tp/packets';
import { IDS, assemblyInput, calculation, contractCitation, contractWindowSource, line, promptPayRecord } from '@tp/packets/testing';
import { cents } from '@tp/money';

import type { PayerCopy } from '../html';

/**
 * A SYNTHETIC packet version as the export reads it: its content, its identifiers inserted, and what the payer's copy
 * prints beside them (audit item #37 part 1, D4 to D6): the approval's date, the reference and the contact. The
 * formula prefix sample sits in a patient's name, since the payer's copy prints no patient control number (Q2 (a)).
 */

export const content = assemblePacket(
  assemblyInput({
    asOf: '2026-05-01',
    lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), line(2, { receivedOn: null })],
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
 * the third, a line whose deadline holds a cause, and a hash of its own for each line's trace.
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
      line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01', calculation: calculation(cents(10000n), cents(7000n), cents(5600n), { trace_sha256: sentinel(0x21) }) }),
      line(2, { receivedOn: '2026-03-03', paidOn: '2026-05-01', calculation: calculation(cents(10000n), cents(7000n), cents(5600n), { trace_sha256: sentinel(0x22) }) }),
      line(3, {
        receivedOn: null,
        deadline: { status: 'unverified', source: 'contract', endsOn: '2036-04-05', cause: 'CONTRACT_WINDOW_UNVERIFIED' },
        calculation: calculation(cents(10000n), cents(7000n), cents(5600n), { trace_sha256: sentinel(0x23) }),
      }),
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
