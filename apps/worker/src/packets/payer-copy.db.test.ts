import { readDatabaseUrl } from '@tp/db';
import { loadPracticeCipher } from '@tp/db/runtime';
import { asOwner } from '@tp/db/testing';
import { type RowIdentifiers, SYNTHETIC_CORRESPONDENCE_CONTACT, correspondenceText, draftNarrative, fillPlaceholders, packetReference, packetReferencePrefix, payerAndPlanText, remittanceKey } from '@tp/packets';
import { formatCents, formatUsd, parseCents } from '@tp/money';
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
 * approval's UTC date and the reference of the approved hash, and the contact; they name the payer and plan in words,
 * never in their remittance-key form (the verification of 2026-10-21); the PDF holds every sentence of the
 * narrative the verifier passed, whose report the export stores unchanged. Staff then find the packet by its
 * reference. SYNTHETIC CAS-08, and CAS-15 for a copy that states the interest code computed.
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

/** What one export printed, with the scan over it: the job's HTML, the stored CSV and, where Chromium printed it, the PDF's text. */
interface Printed {
  readonly html: string;
  readonly csv: string;
  readonly pdfText: string | null;
  readonly approvalLine: string;
  readonly contactLine: string;
  readonly approvedSha256: string;
  readonly versionId: string;
  readonly packetId: string;
  readonly detail: NonNullable<Awaited<ReturnType<typeof packetVersionOf>>> & { readonly approvedAt: Date };
  readonly identifiers: Map<number, RowIdentifiers>;
}

/**
 * Writes the case's packet (the draft, and a paragraph naming a row by its claim control number and its patient),
 * approves it by a second person, exports it through the job with its renderer recorded, and holds what it printed to
 * the scan: no login of the world, no ID of its rows, no SHA-256 it stores; the approval line and the contact printed.
 */
async function exportedCopy(practice: Practice, caseId: string, promptPayState: string | null): Promise<Printed> {
  const second = await w.person(practice, 'billing_manager');
  const written = await w.as(practice, practice.manager, async (scope) => {
    const assembled = await writePacketVersion(scope, w.keys, { practiceId: practice.practiceId, caseId, basedOnVersionId: null, promptPayState, requestId: 'test-write' });
    return writePacketVersion(scope, w.keys, {
      practiceId: practice.practiceId,
      caseId,
      basedOnVersionId: assembled.versionId,
      narrative: `${draftNarrative(assembled.content)}\n\nClaim {{claim_control_number:1}} of {{patient_name:1}} was paid short of the contract [3].`,
      promptPayState,
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
  const reference = packetReference(approvedSha256);
  const scan = {
    content: detail.content,
    narrative: detail.narrative,
    allowedEmail: SYNTHETIC_CORRESPONDENCE_CONTACT.email ?? null,
    identifiers,
    reference,
    secrets: [...secrets.emails, ...secrets.ids, ...secrets.hashes],
  };

  // DB1: the HTML the job printed.
  expect(renderer.printed).toHaveLength(1);
  const html = renderer.printed[0] ?? '';
  expect(payerCopyLeaks(htmlText(html), scan)).toEqual([]);
  const approvalLine = `Approved for submission by ${detail.content.practice.name} on ${detail.approvedAt.toISOString().slice(0, 10)}, reference ${reference}.`;
  const contactLine = `Correspondence about this dispute: ${correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)}.`;
  expect(htmlText(html)).toContain(approvalLine);
  expect(htmlText(html)).toContain(contactLine);
  // The payer and plan in words, never in the remittance-key form the record keeps (the verification of 2026-10-21).
  expect(remittanceKey(detail.content.payer.payer_id_raw).qualifier).not.toBeNull();
  expect(remittanceKey(detail.content.payer.plan_key).qualifier).not.toBeNull();
  const addressee = `To: ${payerAndPlanText(detail.content.payer)}`;
  expect(addressee).toContain(`(payer ID ${remittanceKey(detail.content.payer.payer_id_raw).identifier})`);
  expect(htmlText(html).replace(/\s+/g, ' ')).toContain(addressee);
  expect(narrativeBlock(html)).toEqual(fillPlaceholders(detail.narrative, identifiers).split(/\n\s*\n/).map((paragraph) => paragraph.trim()));

  // The stored CSV.
  const csv = (await w.stored(practice, detail.exportCsvKey ?? '')).toString('utf8');
  expect(payerCopyLeaks(csv, scan)).toEqual([]);
  // Every row leads with the reference the approval line prints (the founder's ruling of 2026-10-21), one row a line.
  const [header, ...rows] = csv.split('\r\n').filter((row) => row !== '');
  expect(header?.split(',')[0]).toBe('packet_reference');
  expect(rows).toHaveLength(detail.content.lines.length);
  for (const row of rows) {
    expect(row.startsWith(`${reference},`)).toBe(true);
  }

  // The printed PDF's text and metadata, where Chromium printed it.
  let pdfText: string | null = null;
  if (chromiumInstalled()) {
    const pdf = await w.stored(practice, detail.exportPdfKey ?? '');
    const { text, metadata } = await printedPdfText(pdf);
    expect(payerCopyLeaks(`${text}\n${Object.values(metadata).join('\n')}`, scan)).toEqual([]);
    expect(holdsLoosely(text, approvalLine)).toBe(true);
    expect(holdsLoosely(text, contactLine)).toBe(true);
    expect(holdsLoosely(text, addressee)).toBe(true);
    for (const sentence of fillPlaceholders(detail.narrative, identifiers).split(/(?<=\.)\s+/)) {
      expect(holdsLoosely(text, sentence), sentence).toBe(true);
    }
    pdfText = text;
  }

  // DB3: the report over what was printed is the version's, and it passed (the export guard's three checks hold).
  expect(detail.exportVerifier).toEqual(detail.verifier);
  expect(detail.exportVerifier?.passed).toBe(true);
  return { html, csv, pdfText, approvalLine, contactLine, approvedSha256, versionId: written.versionId, packetId: written.packetId, detail: { ...detail, approvedAt: detail.approvedAt }, identifiers };
}

describe('the payer’s copy the export job prints (DB1, DB3)', () => {
  it('holds no login, row ID or stored SHA-256 in its HTML, PDF or CSV; prints the approval line, the reference and the contact; and stores the verifier’s report unchanged', async () => {
    const practice = await w.practice('payer-copy');
    const caseId = await w.caseOf(practice, 'CAS-08/remit.835', 'CE:SYNPLAN-FIX-ONE', MARCH);
    const printed = await exportedCopy(practice, caseId, null);

    // Staff find it by the reference a payer quotes, typed back in any case, in the practice's scope (D5).
    const reference = packetReference(printed.approvedSha256);
    expect(packetReferencePrefix(reference)).toBe(printed.approvedSha256.slice(0, 12));
    expect(await w.as(practice, practice.manager, (scope) => packetVersionsByReference(scope, { practiceId: practice.practiceId, reference }))).toEqual([
      { versionId: printed.versionId, packetId: printed.packetId, caseId, versionNo: 2, disputeLevel: 1, approvedOn: printed.detail.approvedAt.toISOString().slice(0, 10), reference, exported: true, submitted: false },
    ]);
  });

  it('holds none of it either where code computed interest, which it states line by line and in total, the CSV beside it (CAS-15)', async () => {
    const practice = await w.practice('payer-copy-interest');
    const caseId = await w.caseOf(practice, 'CAS-15/remit.835', 'CE:SYNPLAN-FIX-ZZ', { from: '2026-02-01', to: '2026-02-28' });
    const printed = await exportedCopy(practice, caseId, 'ZZ');
    const { interest } = printed.detail.content;
    expect(interest).toMatchObject({ state: 'ZZ', computed: true });
    const total = interest?.total_cents ?? '0';
    expect(BigInt(total)).toBeGreaterThan(0n);
    const section = printed.html.slice(printed.html.indexOf('<h2>[4]'), printed.html.indexOf('<h2>Evidence</h2>'));
    expect(section).toContain('<caption>Interest by line</caption>');
    expect(htmlText(section)).toContain(`Interest stated in this request: ${formatUsd(parseCents(total))}`);
    expect(htmlText(printed.html)).toContain('Pay the prompt-pay interest stated in the interest line');
    if (printed.pdfText !== null) {
      expect(holdsLoosely(printed.pdfText, `Interest stated in this request: ${formatUsd(parseCents(total))}`)).toBe(true);
    }
    // The CSV's interest cell holds the line's stated interest in dollars, right after its received date.
    const line = interest?.lines[0];
    expect(printed.csv).toContain(`,${line?.received_on ?? ''},${formatCents(parseCents(line?.interest_cents ?? '0'))},`);
  });
});
