import { readDatabaseUrl } from '@tp/db';
import { loadPracticeCipher } from '@tp/db/runtime';
import { asOwner } from '@tp/db/testing';
import { type RowIdentifiers, SYNTHETIC_CORRESPONDENCE_CONTACT, correspondenceText, draftNarrative, fillPlaceholders, packetReference, packetReferencePrefix } from '@tp/packets';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { Practice } from '../price/test-support/pricing-world';
import { chromiumInstalled } from '../report/pdf';
import { scheduleIdentifiers } from './identifiers';
import { packetVersionsByReference } from './by-reference';
import { approvePacketVersion, packetVersionOf, writePacketVersion } from './services';
import { holdsLoosely, htmlText, narrativeBlock, payerCopyLeaks, printedPdfText, recordingRenderer } from './test-support/payer-copy';
import { PacketWorld } from './test-support/packet-world';

/**
 * The payer's copy as the export job prints it (audit item #37 part 1, DB1 and DB3; the founder's rulings of
 * 2026-10-20; docs/adr/0061): the job's real export in the packet world, its renderer wrapped so the HTML it printed
 * is kept. The HTML always, and the printed PDF's text where Chromium is installed, and the stored CSV hold no login of
 * the world, no ID of its rows and no SHA-256 it stores; they hold the approval line with the practice's name, the
 * approval's UTC date and the reference of the approved hash, and the contact; the PDF holds every sentence of the
 * narrative the verifier passed, whose report the export stores unchanged. Staff then find the packet by its
 * reference. SYNTHETIC CAS-08 only.
 */

let w: PacketWorld;
const MARCH = { from: '2026-03-01', to: '2026-03-31' } as const;

beforeAll(async () => {
  w = await PacketWorld.open(readDatabaseUrl());
}, 60_000);

afterAll(async () => {
  await w.close();
});

/** Every login email, every row ID of the practice and the world's people, and every SHA-256 the practice's rows store. */
async function secretsOf(practice: Practice): Promise<{ emails: string[]; ids: string[]; hashes: string[] }> {
  return asOwner(w.owner, [practice.practiceId], async () => {
    const emails = (await w.owner.query<{ email: string }>('SELECT email FROM "user" WHERE email IS NOT NULL')).rows.map((row) => row.email);
    const ids: string[] = [practice.practiceId, ...(await w.owner.query<{ id: string }>('SELECT id FROM "user"')).rows.map((row) => row.id)];
    for (const table of ['"case"', 'case_line', 'packet', 'packet_version', 'priced_line', 'pricing_run', 'service_line', 'claim', 'patient_ref', 'source_document', 'contract', 'contract_version', 'rate_record']) {
      ids.push(...(await w.owner.query<{ id: string }>(`SELECT id FROM ${table} WHERE practice_id = $1`, [practice.practiceId])).rows.map((row) => row.id));
    }
    const hashes = (
      await w.owner.query<{ sha: string }>(
        `SELECT sha FROM (
           SELECT content_sha256 AS sha FROM packet_version WHERE practice_id = $1
           UNION SELECT approved_sha256 FROM packet_version WHERE practice_id = $1 AND approved_sha256 IS NOT NULL
           UNION SELECT verifier_report ->> 'narrative_sha256' FROM packet_version WHERE practice_id = $1
           UNION SELECT sha256 FROM source_document WHERE practice_id = $1
         ) s WHERE sha IS NOT NULL`,
        [practice.practiceId],
      )
    ).rows.map((row) => row.sha);
    return { emails, ids, hashes };
  });
}

describe('the payer’s copy the export job prints (DB1, DB3)', () => {
  it('holds no login, row ID or stored SHA-256 in its HTML, PDF or CSV; prints the approval line, the reference and the contact; and stores the verifier’s report unchanged', async () => {
    const practice = await w.practice('payer-copy');
    const caseId = await w.caseOf(practice, 'CAS-08/remit.835', 'CE:SYNPLAN-FIX-ONE', MARCH);
    const second = await w.person(practice, 'billing_manager');
    const written = await w.as(practice, practice.manager, async (scope) => {
      const assembled = await writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId, basedOnVersionId: null, promptPayState: null, requestId: 'test-write' });
      // The draft, and a paragraph naming a row by its claim control number and its patient.
      return writePacketVersion(scope, w.keys, {
        practiceId: practice.practiceId,
        caseId,
        basedOnVersionId: assembled.versionId,
        narrative: `${draftNarrative(assembled.content)}\n\nClaim {{claim_control_number:1}} of {{patient_name:1}} was paid short of the contract [3].`,
        promptPayState: null,
        requestId: 'test-write',
      });
    });
    await w.as(practice, second, (scope) => approvePacketVersion(scope, { practiceId: practice.practiceId, versionId: written.versionId, versionSha256: written.contentSha256, requestId: 'test-approve' }));
    const renderer = recordingRenderer(w.services.pdf);
    const outcome = await w.export(practice, written.versionId, { ...w.services, pdf: renderer });
    expect(outcome).toMatchObject({ outcome: 'exported' });
    const detail = await w.as(practice, practice.manager, (scope) => packetVersionOf(scope, w.keys, { practiceId: practice.practiceId, versionId: written.versionId, requestId: 'test-read' }));
    if (detail === undefined || detail.approvedAt === null) {
      throw new Error('the version is approved and exported');
    }
    const { rows: approved } = await w.as(practice, practice.manager, (scope) => scope.client.query<{ approved_sha256: string }>('SELECT approved_sha256 FROM packet_version WHERE id = $1', [written.versionId]));
    const approvedSha256 = approved[0]?.approved_sha256 ?? '';
    const identifiers: Map<number, RowIdentifiers> = await w.as(practice, practice.manager, async (scope) =>
      (await scheduleIdentifiers(scope, await loadPracticeCipher(scope, w.keys, practice.practiceId), detail.content, { purpose: 'packet_verification', requestId: 'test-identifiers' })).rows,
    );
    const secrets = await secretsOf(practice);
    // The one email the payer's copy may print is the contact's, and it is no login of the world.
    expect(secrets.emails.map((email) => email.toLowerCase())).not.toContain(SYNTHETIC_CORRESPONDENCE_CONTACT.email);
    const scan = { content: detail.content, narrative: detail.narrative, allowedEmail: SYNTHETIC_CORRESPONDENCE_CONTACT.email ?? null, identifiers, secrets: [...secrets.emails, ...secrets.ids, ...secrets.hashes] };

    // DB1: the HTML the job printed.
    expect(renderer.printed).toHaveLength(1);
    const html = renderer.printed[0] ?? '';
    expect(payerCopyLeaks(htmlText(html), scan)).toEqual([]);
    const approvalLine = `Approved for submission by ${detail.content.practice.name} on ${detail.approvedAt.toISOString().slice(0, 10)}, reference ${packetReference(approvedSha256)}.`;
    const contactLine = `Correspondence about this dispute: ${correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)}.`;
    expect(htmlText(html)).toContain(approvalLine);
    expect(htmlText(html)).toContain(contactLine);
    expect(narrativeBlock(html)).toEqual(fillPlaceholders(detail.narrative, identifiers).split(/\n\s*\n/).map((paragraph) => paragraph.trim()));

    // The stored CSV.
    const csv = (await w.stored(practice, detail.exportCsvKey ?? '')).toString('utf8');
    expect(payerCopyLeaks(csv, scan)).toEqual([]);

    // The printed PDF's text and metadata, where Chromium printed it.
    if (chromiumInstalled()) {
      const pdf = await w.stored(practice, detail.exportPdfKey ?? '');
      const { text, metadata } = await printedPdfText(pdf);
      expect(payerCopyLeaks(`${text}\n${Object.values(metadata).join('\n')}`, scan)).toEqual([]);
      expect(holdsLoosely(text, approvalLine)).toBe(true);
      expect(holdsLoosely(text, contactLine)).toBe(true);
      for (const sentence of fillPlaceholders(detail.narrative, identifiers).split(/(?<=\.)\s+/)) {
        expect(holdsLoosely(text, sentence), sentence).toBe(true);
      }
    }

    // DB3: the report over what was printed is the version's, and it passed (the export guard's three checks hold).
    expect(detail.exportVerifier).toEqual(detail.verifier);
    expect(detail.exportVerifier?.passed).toBe(true);

    // Staff find it by the reference a payer quotes, typed back in any case, in the practice's scope (D5).
    const reference = packetReference(approvedSha256);
    expect(packetReferencePrefix(reference)).toBe(approvedSha256.slice(0, 12));
    expect(await w.as(practice, practice.manager, (scope) => packetVersionsByReference(scope, { practiceId: practice.practiceId, reference }))).toEqual([
      { versionId: written.versionId, packetId: written.packetId, caseId, versionNo: 2, disputeLevel: 1, approvedOn: detail.approvedAt.toISOString().slice(0, 10), reference, exported: true, submitted: false },
    ]);
  });
});
