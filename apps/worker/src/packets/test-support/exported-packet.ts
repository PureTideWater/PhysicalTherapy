import { type RowIdentifiers, assemblePacket, draftNarrative, insertIdentifiers } from '@tp/packets';
import { assemblyInput, line, promptPayRecord } from '@tp/packets/testing';

/** A SYNTHETIC packet version as the export reads it: its content, its identifiers inserted, and its approval. */

export const content = assemblePacket(
  assemblyInput({
    asOf: '2026-05-01',
    lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), line(2, { receivedOn: null })],
    interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
  }),
);
export const identifiers = new Map<number, RowIdentifiers>([
  [1, { claim_control_number: 'SYNCCN0001', patient_control_number: '=SYNPCN0001', patient_name: 'SYNTHETIC, PATIENT <ONE>', member_id: 'SYNMBR1' }],
  [2, { claim_control_number: 'SYNCCN0002', patient_control_number: 'SYNPCN0002', patient_name: 'SYNTHETIC, PATIENT TWO', member_id: null }],
]);
export const exported = insertIdentifiers(content, `${draftNarrative(content)}\n\nClaim {{claim_control_number:1}} is the first [3].`, identifiers);
export const approval = { versionNo: 2, versionSha256: 'c'.repeat(64), draftedBy: 'drafter@synthetic.test', approvedBy: 'approver@synthetic.test', approvedAt: '2026-05-02T10:00:00.000Z', approvedAlone: false, regulationConfirmedBy: null };
