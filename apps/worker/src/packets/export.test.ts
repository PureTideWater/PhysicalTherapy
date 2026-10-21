import { describe, expect, it } from 'vitest';

import {
  type CorrespondenceContact,
  type PacketContent,
  type PacketContentV1,
  type PacketContentV2,
  SYNTHETIC_CORRESPONDENCE_CONTACT,
  assemblePacket,
  correspondenceText,
  draftNarrative,
  fillPlaceholders,
  insertIdentifiers,
} from '@tp/packets';
import { IDS, REGULATION, assemblyInput, calculation, contractCitation, contractWindowSource, line, promptPayRecord } from '@tp/packets/testing';
import { cents } from '@tp/money';

import { ChromiumPdfRenderer, chromiumInstalled } from '../report/pdf';
import { amountsNotInMono } from '../report/test-support/figures';
import { PACKET_CSV_COLUMNS, packetCsv } from './csv';
import { packetHtml } from './html';
import { INTERNAL_RECORD, content, exported, identifiers, maximalContent, maximalExported, maximalIdentifiers, maximalNarrative, narrative, payerCopy } from './test-support/exported-packet';
import { holdsLoosely, htmlText, narrativeBlock, outsideNarrative, payerCopyLeaks, printedPdfText } from './test-support/payer-copy';
import { PayerCopyWordsError, releaseText } from './words';

/**
 * The payer's copy of an export (audit item #37 part 1; the founder's rulings of 2026-10-20; docs/adr/0061; PRD 12,
 * The packet; CAS-11, CAS-12, CAS-15, CAS-26; CO-05): the HTML the worker prints to PDF and the CSV schedule, from
 * SYNTHETIC versions with their identifiers inserted. T1 to T9 of the design.
 */

const PRACTICE = content.practice.name;
const APPROVAL_LINE = `Approved for submission by ${PRACTICE} on 2026-05-02, reference SK6CS-K6CSK.`;
const CONTACT_LINE = `Correspondence about this dispute: ${correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)}.`;
const SECRETS = [INTERNAL_RECORD.drafter, INTERNAL_RECORD.approver, INTERNAL_RECORD.specialist, INTERNAL_RECORD.versionSha256];
const scanOf = (packet: PacketContent, text: string, rows: typeof identifiers) => ({ content: packet, narrative: text, allowedEmail: SYNTHETIC_CORRESPONDENCE_CONTACT.email ?? null, identifiers: rows, secrets: SECRETS });
/** The phrases the interest and timeliness rulings keep off the payer's copy (Q3 (a), Q4 (a)). */
const FORBIDDEN = [/cannot be computed/i, /can be computed/i, /in all/i, /not claimed/i, /filed within/i, /No dispute window/i];

const printedOf = (packet: PacketContent, text = draftNarrative(packet), rows = identifiers, copy = payerCopy) => packetHtml(insertIdentifiers(packet, text, rows), copy);
/** Identifiers for every row of a SYNTHETIC version of up to three lines. */
const rowsOf = (packet: PacketContent) => new Map([...maximalIdentifiers].filter(([row]) => row <= packet.lines.length));

const received = [line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), line(2, { receivedOn: '2026-03-03', paidOn: '2026-05-01' })];
/** A version at dispute level 2, its window the level's own (a release record at L2, as Q34 would allow). */
const level2 = assemblePacket(assemblyInput({ disputeLevel: 2, nextLevelDeadline: { status: 'verified', source: 'release', endsOn: '2026-12-01', cause: null } }));
/** Lines whose calculations take every step the engine writes: per unit, the schedule, the charge, the base and each adjustment. */
const stepped = (method: 'PERCENT_OF_MEDICARE' | 'LESSER_OF' | 'PER_VISIT' | 'FIXED_SCHEDULE') =>
  [1, 2].map((row) =>
    line(row, {
      calculation: calculation(cents(10000n), cents(7000n), cents(5600n), {
        method,
        steps: [
          { step: method === 'PER_VISIT' ? 'visit' : 'unit', amount_cents: '5000' },
          { step: 'schedule', amount_cents: '10000' },
          { step: 'charge', amount_cents: '12000' },
          { step: 'base', amount_cents: '10000' },
          { step: 'mppr', amount_cents: '10000' },
          { step: 'assistant_reduction', amount_cents: '10000' },
          { step: 'contract_adjustment', amount_cents: '10000' },
          { step: 'sequestration', amount_cents: '9999.5' },
        ],
        rounding: { rule: row === 1 ? 'HALF_EVEN_CENT' : 'TRUNCATE', unrounded_cents: '9999.5', rounded_cents: '10000' },
      }),
    }),
  );
/** The methods of T9, each with every step, a release record of no program, a window of no stated days, an end date and a plan name. */
const METHOD_VERSIONS: Readonly<Record<string, PacketContent>> = {
  'percent of Medicare, every step': assemblePacket(assemblyInput({ lines: stepped('PERCENT_OF_MEDICARE'), citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110' } }) })),
  'lesser of a percent schedule, every step': assemblePacket(
    assemblyInput({ lines: stepped('LESSER_OF'), citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100' } } }) }),
  ),
  'lesser of a fixed schedule, every step': assemblePacket(
    assemblyInput({ lines: stepped('LESSER_OF'), citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '5000' } } }) }),
  ),
  'per visit, every step': assemblePacket(assemblyInput({ lines: stepped('PER_VISIT'), citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '9000' } }) })),
  'a release record of no program, a window of no stated days, an end date and a plan name': assemblePacket(
    assemblyInput({
      lines: stepped('FIXED_SCHEDULE'),
      citation: contractCitation({ effective_to: '2026-12-31' }),
      payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: '2U:SYNPAYERQ', plan_id: IDS.plan, plan_key: 'CE:SYNPLAN-FIX-ONE', plan_name: 'SYNTHETIC PLAN NAME' },
      deadlineSources: [contractWindowSource({ days: null }), { kind: 'release_record', release_no: 900001, sha256: 'b'.repeat(64), program: null, level: 'L2' }],
    }),
  ),
};
/** Paid on time and dated before the due date: every line computes $0.00, which is not stated (Q4 (a)). */
const zeroInterest = assemblePacket(
  assemblyInput({ asOf: '2026-03-10', lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-03-09' }), line(2, { receivedOn: '2026-03-03', paidOn: '2026-03-09' })], interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } }),
);
/** Every route through the renderer: a contract and a regulation, interest computed, partly, not, with no rule on file, level 2, a practice with an NPI and tax ID. */
const VERSIONS: Readonly<Record<string, PacketContent>> = {
  'contract, computed': assemblePacket(assemblyInput({ asOf: '2026-05-01', lines: received, interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } })),
  'contract, partly computed': content,
  'contract, not computed': assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) } })),
  'contract, no rule on file': assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: null } })),
  'contract, the real exclusion code': assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ exclusions: ['self_funded_erisa_plans', 'self_funded_plans'] }) } })),
  'regulation, computed': assemblePacket(assemblyInput({ asOf: '2026-05-01', citation: REGULATION, contractDocuments: [], lines: received, interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } })),
  'regulation, no interest': assemblePacket(assemblyInput({ citation: REGULATION, contractDocuments: [] })),
  'contract, every line $0.00': zeroInterest,
  'level 2': level2,
  'a practice with an NPI and tax ID': assemblePacket(assemblyInput({ practice: { practice_id: IDS.practice, name: 'SYNTHETIC THERAPY GROUP 01', npi: '1234567893', tax_id_last4: '6789' } })),
  ...METHOD_VERSIONS,
  maximal: maximalContent,
};
/** The contacts a practice may set: the full SYNTHETIC one, a name and phone only, an address without an email, an email without an address. */
const { email: _email, address: _address, phone_extension: _extension, ...bare } = SYNTHETIC_CORRESPONDENCE_CONTACT;
const CONTACTS: readonly CorrespondenceContact[] = [
  SYNTHETIC_CORRESPONDENCE_CONTACT,
  bare,
  { ...bare, ...(SYNTHETIC_CORRESPONDENCE_CONTACT.address === undefined ? {} : { address: SYNTHETIC_CORRESPONDENCE_CONTACT.address }) },
  { ...bare, phone_extension: '7', ...(SYNTHETIC_CORRESPONDENCE_CONTACT.email === undefined ? {} : { email: SYNTHETIC_CORRESPONDENCE_CONTACT.email }) },
];

describe('packetHtml: the payer’s copy', () => {
  const html = packetHtml(exported, payerCopy);
  const maximal = packetHtml(maximalExported, payerCopy);

  it('T1: holds no login, record ID, SHA-256, verification, audit flag, gap, specialist line, version number, footer, internal term or code, from a version with every internal field filled', () => {
    expect(payerCopyLeaks(htmlText(maximal), scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual([]);
    expect(payerCopyLeaks(htmlText(html), scanOf(content, narrative, identifiers))).toEqual([]);
    // Every route through the renderer, with each contact a practice may set, in both files.
    for (const [name, packet] of Object.entries(VERSIONS)) {
      const text = name === 'maximal' ? maximalNarrative : draftNarrative(packet);
      const rows = name === 'maximal' ? maximalIdentifiers : rowsOf(packet);
      for (const contact of CONTACTS) {
        const scan = { ...scanOf(packet, text, rows), allowedEmail: contact.email ?? null };
        expect(payerCopyLeaks(htmlText(printedOf(packet, text, rows, { ...payerCopy, contact })), scan), `${name}, HTML`).toEqual([]);
      }
      expect(payerCopyLeaks(packetCsv(insertIdentifiers(packet, text, rows)), scanOf(packet, text, rows)), `${name}, CSV`).toEqual([]);
    }
    for (const printed of [html, maximal]) {
      expect(printed).not.toMatch(/<footer|data-deadline/);
      expect(htmlText(printed)).not.toMatch(/Approval record|Audit flag|Evidence gaps|Version \d+, SHA|trace|SHA-256|specialist|verif/i);
      expect(printed).not.toMatch(/\{\{[a-z_]+:\d+\}\}/);
      expect(printed).not.toMatch(/<script|https?:\/\//);
    }
    // The scan finds what it is for: a login, a record ID and a hash put back are each a leak.
    const planted = `${htmlText(maximal)} ${INTERNAL_RECORD.approver} ${maximalContent.lines[0]?.priced_line_id ?? ''} ${maximalContent.rule_releases[0]?.manifest_sha256 ?? ''} SYNPCN0002`;
    expect(payerCopyLeaks(planted, scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual(
      expect.arrayContaining([`email:${INTERNAL_RECORD.approver}`, expect.stringMatching(/^uuid:/), expect.stringMatching(/^hex:/), 'secret:SYNPCN0002']),
    );
    // And a code printed as a code: a pattern's behavior, an observed basis, a release's default, a deadline cause or basis, an exclusion.
    const codes = ['BELOW_CONTRACT_RATE', 'paid_plus_pr', 'COMMERCIAL_DEFAULT', 'NEXT_LEVEL_UNCITED', 'line_windows', 'next_level_window', 'self_funded_erisa_plans'];
    const found = payerCopyLeaks(`${htmlText(maximal)} ${codes.join(' ')}`, scanOf(maximalContent, maximalNarrative, maximalIdentifiers));
    expect([...found].sort()).toEqual(codes.map((code) => `code:${code}`).sort());
    // The CSV's own header row is the payer's schedule, not a code.
    expect(payerCopyLeaks(packetCsv(maximalExported), scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual([]);
  });

  it('T2: closes with the approval line, its reference, and the correspondence contact; the cover names the reference', () => {
    expect(htmlText(html)).toContain(APPROVAL_LINE);
    expect(htmlText(html)).toContain(CONTACT_LINE);
    expect(html).toContain('<h2>Approval and correspondence</h2>');
    expect(html).toContain('<p>Reference SK6CS-K6CSK</p>');
    expect(html).toContain('<p class="meta">Dispute level 1; prepared 2026-05-01; reference SK6CS-K6CSK.</p>');
    // The contact's email is the one email the copy prints.
    expect(htmlText(html).match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi)).toEqual([SYNTHETIC_CORRESPONDENCE_CONTACT.email]);
  });

  it('T3: prints every marker a narrative may cite in its section: a contract and a regulation, interest computed, partly computed, not computed, and no rule on file', () => {
    for (const [name, packet] of Object.entries(VERSIONS)) {
      const printed = name === 'maximal' ? maximal : printedOf(packet, draftNarrative(packet), rowsOf(packet));
      const evidence = printed.slice(printed.indexOf('<h2>Evidence</h2>'), printed.indexOf('<h2>Requested action</h2>'));
      for (const source of packet.sources) {
        const marker = `[${String(source.marker)}]`;
        const where = {
          citation: `<p>${marker} `,
          rule_release: `<p>${marker} `,
          line_schedule: `<caption>${marker} Line schedule`,
          interest: `<h2>${marker} Prompt-pay interest`,
          evidence: `<li>${marker} `,
        }[source.kind];
        expect(source.kind === 'evidence' ? evidence : printed, `${name}: ${marker}`).toContain(where);
      }
      // [1] under the heading of what it cites: a contract's clause, or the regulation (no contract with the plan).
      expect(printed, name).toContain(packet.citation.kind === 'contract' ? '<h2>Contract citation</h2>' : '<h2>Regulation cited</h2>');
      expect(printed, name).not.toContain(packet.citation.kind === 'contract' ? 'Regulation cited' : 'Contract citation');
    }
  });

  it('T4: prints exactly the verified narrative, identifiers inserted, paragraph by paragraph, and the approval line, reference and contact only outside it', () => {
    for (const [printed, text, rows] of [
      [html, narrative, identifiers],
      [maximal, maximalNarrative, maximalIdentifiers],
    ] as const) {
      const expected = fillPlaceholders(text, rows)
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '');
      expect(narrativeBlock(printed)).toEqual(expected);
      const inside = narrativeBlock(printed).join('\n');
      const outside = htmlText(outsideNarrative(printed));
      for (const item of [APPROVAL_LINE, CONTACT_LINE, 'SK6CS-K6CSK', correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)]) {
        expect(inside).not.toContain(item);
        expect(outside).toContain(item);
      }
    }
  });

  it.skipIf(!chromiumInstalled())(
    'T5: the printed PDF’s text and metadata hold none of it either, and no URL (skipped without Chromium)',
    async () => {
      const pdf = await new ChromiumPdfRenderer().render(maximal);
      const { text, metadata } = await printedPdfText(pdf);
      const printed = `${text}\n${Object.values(metadata).join('\n')}`;
      expect(payerCopyLeaks(printed, scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual([]);
      expect(printed).not.toMatch(/about:blank|https?:\/\//);
      expect(metadata.Title).toBe(`Payment dispute | ${PRACTICE}`);
      expect(holdsLoosely(text, APPROVAL_LINE)).toBe(true);
      expect(holdsLoosely(text, CONTACT_LINE)).toBe(true);
      for (const sentence of fillPlaceholders(maximalNarrative, maximalIdentifiers).split(/(?<=\.)\s+/)) {
        expect(holdsLoosely(text, sentence), sentence).toBe(true);
      }
    },
    60_000,
  );

  it('T5: is checked wherever the tests run in CI: Chromium is installed there', () => {
    if (process.env.CI === 'true') {
      expect(chromiumInstalled()).toBe(true);
    }
  });

  it('is the practice’s own letter to its payer: its name leads the cover and the running header, and PaidWhole’s lockup and name are not on it', () => {
    const cover = html.slice(html.indexOf('<section class="cover"'), html.indexOf('<table class="pages"'));
    expect(cover).toContain(`<div class="cover-top"><p class="firm">${PRACTICE}</p></div>`);
    // Named once on the cover, not again under the headline.
    expect(cover.split(PRACTICE)).toHaveLength(2);
    expect(html).toContain(`<span class="title">${PRACTICE} · Payment dispute</span>`);
    expect(html).toContain(`<title>Payment dispute | ${PRACTICE}</title>`);
    expect(html).not.toMatch(/PaidWhole/i);
    expect(html).not.toContain('data-verified');
  });

  it('holds the citation without its document ID or hashes, the schedule without the patient control number or a trace, and the evidence by its labels', () => {
    expect(html).toContain('<p>[1] SYNTHETIC FIXED SCHEDULE AGREEMENT, version 1 (effective 2026-01-01), page 2:</p><blockquote>97110 is paid 50.00 per unit</blockquote>');
    expect(html).toContain('<p>[2] Payment rules in effect for the service dates: release 900001</p>');
    expect(html).toContain('Claim SYNCCN0001 is the first [3].');
    expect(html).toContain('<td>=SYNTHETIC, PATIENT &lt;ONE&gt;</td>');
    expect(html).toContain(
      '<thead><tr><th scope="col">Row</th><th scope="col">Claim control number</th><th scope="col">Patient</th><th scope="col">Member ID</th><th scope="col">Service date</th><th scope="col">Code</th><th scope="col">Modifiers</th><th scope="col">Units</th><th scope="col">Expected</th><th scope="col">Observed</th><th scope="col">Variance</th></tr></thead>',
    );
    expect(html).toContain('<tr><td>Total</td><td></td><td></td><td></td><td></td><td></td><td></td><td>4</td><td>$200.00</td><td>$140.00</td><td>$60.00</td></tr>');
    expect(html).toContain('<caption>[3] Line schedule: 2 lines on 2 claims</caption>');
    expect(html).not.toContain('SYNPCN');
    expect(html).not.toContain('Patient control number');
    expect(html).toContain('<li>[5] Contract document cited at page 2 (contract version 1)</li>');
    expect(html).toContain('<li>[6] 835 remittance paid 2026-04-08</li>');
    expect(html).toContain('<li>[7] Payment rules in effect for the service dates: release 900001</li>');
    expect(maximal).toContain('<p>[2] Payment rules in effect for the service dates: releases 900001 and 900002</p>');
    expect(maximal).toContain('Payment rules in effect for the service dates: release 900002</li>');
  });

  it.skipIf(!chromiumInstalled())('sets every dollar figure in IBM Plex Mono, the narrative’s and the interest total’s included (skipped without Chromium)', async () => {
    expect(await amountsNotInMono(html)).toEqual([]);
  }, 60_000);

  it('T7: states the dispute window’s dates only: the earliest line window at the first level, the level’s own window above it, its evidence, and never a timeliness claim', () => {
    expect(html).toContain('<h2>Dispute window</h2><p><strong>The earliest dispute window among the listed lines ends on 2036-04-05.</strong></p>');
    expect(html).toContain('<li>The contract’s dispute window: 3650 days (page 1):<blockquote>Disputes are raised within 3650 days of the payment date.</blockquote></li>');
    expect(maximal).toContain('<li>The Medicare dispute window in effect for the service dates (release 900002).</li>');
    expect(html).toContain('<caption>Each line’s dispute window and how its expected amount is computed</caption>');
    expect(html).toContain('<thead><tr><th scope="col">Row</th><th scope="col">Window ends</th><th scope="col">Method</th><th scope="col">Steps</th><th scope="col">Rounding</th><th scope="col">Patient share</th></tr></thead>');
    // The trace's codes in words: the method, each step and the rounding rule.
    expect(html).toContain('<tr><td>1</td><td>2036-04-05</td><td>Fixed schedule</td><td>base $100.00</td><td>half up to the cent: $100.00 to $100.00</td><td>$14.00</td></tr>');
    expect(html).not.toMatch(/FIXED_SCHEDULE|HALF_UP_CENT/);
    // Above the first level the copy states the level's own window alone: no first-level clause or release record, no
    // line's first-level window (in the PDF or the CSV), and each line's calculation still.
    const second = printedOf(level2, draftNarrative(level2), rowsOf(level2));
    const window = second.slice(second.indexOf('<h2>Dispute window</h2>'), second.indexOf('</table>', second.indexOf('<h2>Dispute window</h2>')));
    expect(window).toContain('<h2>Dispute window</h2><p><strong>The window for dispute level 2 ends on 2026-12-01.</strong></p><table');
    expect(window).not.toMatch(/<ul>|The contract’s dispute window|dispute window in effect|Window ends|2036-04-05/);
    expect(window).toContain('<caption>How each line’s expected amount is computed</caption>');
    expect(window).toContain('<thead><tr><th scope="col">Row</th><th scope="col">Method</th><th scope="col">Steps</th><th scope="col">Rounding</th><th scope="col">Patient share</th></tr></thead>');
    expect(window).toContain('<tr><td>1</td><td>Fixed schedule</td><td>base $100.00</td><td>half up to the cent: $100.00 to $100.00</td><td>$14.00</td></tr>');
    const secondCsv = packetCsv(insertIdentifiers(level2, draftNarrative(level2), rowsOf(level2))).split('\r\n');
    expect(secondCsv[1]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('window_ends_on') + 1)).toBe('');
    expect(secondCsv.join('\n')).not.toContain('2036-04-05');
    for (const printed of [html, maximal, second]) {
      for (const phrase of FORBIDDEN) {
        expect(htmlText(printed)).not.toMatch(phrase);
      }
      expect(htmlText(printed)).not.toMatch(/verified|of \d+ lines’ windows/);
    }
    const unstated: PacketContentV2 = { ...content, deadline: { ...content.deadline, ends_on: null } };
    expect(() => printedOf(unstated, narrative, identifiers)).toThrow(TypeError);
  });

  it('T7: prints an unrounded amount in the rounded amount’s form, grouped and signed, its fraction of a cent kept', () => {
    const large = calculation(cents(12345679n), cents(7000n), cents(5600n), {
      steps: [{ step: 'base', amount_cents: '12345678.5' }],
      rounding: { rule: 'HALF_UP_CENT', unrounded_cents: '12345678.5', rounded_cents: '12345679' },
    });
    const packet = assemblePacket(assemblyInput({ lines: [line(1, { expectedCents: cents(12345679n), varianceCents: cents(12338679n), calculation: large })] }));
    const printed = printedOf(packet, draftNarrative(packet), rowsOf(packet));
    expect(printed).toContain('<td>base $123,456.785</td><td>half up to the cent: $123,456.785 to $123,456.79</td>');
    const window = printed.slice(printed.indexOf('<h2>Dispute window</h2>'), printed.indexOf('</table>', printed.indexOf('<h2>Dispute window</h2>')));
    expect(window).not.toContain('$123456');
    // The CSV keeps plain decimal dollars, the fraction of a cent with them.
    expect(packetCsv(insertIdentifiers(packet, draftNarrative(packet), rowsOf(packet))).split('\r\n')[1]).toContain(',Fixed schedule,123456.785,123456.79,');
  });

  it('counts one line, one claim and one day in the singular', () => {
    const [first] = content.lines;
    const [window] = content.deadline.sources;
    if (first === undefined || window?.kind !== 'contract_window') {
      throw new Error('a line and its contract window expected');
    }
    const one: PacketContentV2 = { ...content, pattern: { ...content.pattern, lines: 1, claims: 1 }, lines: [first], deadline: { ...content.deadline, lines: 1, lines_verified: 1, sources: [{ ...window, days: 1 }] } };
    const printed = printedOf(one, exported.narrative, identifiers);
    expect(printed).toContain('[3] Line schedule: 1 line on 1 claim');
    expect(printed).toContain('The contract’s dispute window: 1 day (page 1):');
  });

  it('T8: states interest only where code computed it: those lines, their total in the ruling’s words, the rule alone when none computed, and its own sentence when no rule is on file', () => {
    // Row 1 computed, row 2 (its received date unknown) not: only row 1 is listed.
    const interest = html.slice(html.indexOf('<h2>[4]'), html.indexOf('<h2>Evidence</h2>'));
    expect(interest).toContain('<p>State ZZ, SYNTHETIC statute ZZ 1-2-3: payment due 33 calendar days after the payer received the claim, interest at 9% a year (release 900001).</p>');
    expect(interest).toContain('<p>The rule does not apply to: self-funded plans.</p>');
    expect(interest).toContain('<caption>Interest by line</caption>');
    expect(interest).toMatch(/<tbody><tr><td>1<\/td><td>2026-03-02<\/td>[^]*?<\/tr><\/tbody>/);
    expect(interest.match(/<tr><td>\d+<\/td>/g)).toEqual(['<tr><td>1</td>']);
    expect(htmlText(interest)).toContain('Interest stated in this request: $0.57');
    const none = assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) } }));
    const noneHtml = printedOf(none, draftNarrative(none), rowsOf(none));
    const noneSection = noneHtml.slice(noneHtml.indexOf('<h2>[4]'), noneHtml.indexOf('<h2>Evidence</h2>'));
    expect(noneSection).toBe(
      '<h2>[4] Prompt-pay interest (its own line, not part of the variance)</h2><p>State ZZ, SYNTHETIC statute ZZ 1-2-3: payment due 33 calendar days after the payer received the claim (release 900001).</p><p>The rule does not apply to: self-funded plans.</p>\n',
    );
    // The release's own codes in words: the real North Carolina draft record's exclusion among them.
    const real = VERSIONS['contract, the real exclusion code'];
    if (real === undefined) {
      throw new Error('the version with the real exclusion code');
    }
    expect(printedOf(real, draftNarrative(real), rowsOf(real))).toContain('<p>The rule does not apply to: self-funded ERISA plans, self-funded plans.</p>');
    const noRule = assemblePacket(assemblyInput({ interest: { state: 'ZZ', releaseNo: 900001, record: null } }));
    const noRuleHtml = printedOf(noRule, draftNarrative(noRule), rowsOf(noRule));
    expect(noRuleHtml.slice(noRuleHtml.indexOf('<h2>[4]'), noRuleHtml.indexOf('<h2>Evidence</h2>'))).toBe(
      '<h2>[4] Prompt-pay interest (its own line, not part of the variance)</h2><p>Prompt-pay interest is not stated in this request.</p>\n',
    );
    // Every line computed at $0.00 (paid on time, the version dated before the due date): $0.00 is not stated, listed,
    // totalled or demanded, since interest on the unpaid shortfall keeps accruing after the due date.
    const zeroHtml = printedOf(zeroInterest, draftNarrative(zeroInterest), rowsOf(zeroInterest));
    expect(zeroInterest.interest).toMatchObject({ computed: true, total_cents: '0' });
    expect(zeroHtml.slice(zeroHtml.indexOf('<h2>[4]'), zeroHtml.indexOf('<h2>Evidence</h2>'))).toBe(
      '<h2>[4] Prompt-pay interest (its own line, not part of the variance)</h2><p>State ZZ, SYNTHETIC statute ZZ 1-2-3: payment due 33 calendar days after the payer received the claim, interest at 9% a year (release 900001).</p><p>The rule does not apply to: self-funded plans.</p>\n',
    );
    expect(htmlText(zeroHtml)).not.toMatch(/Interest by line|Interest stated in this request|prompt-pay interest stated|\$0\.00/i);
    expect(zeroInterest.requested_action).not.toMatch(/interest/i);
    expect(draftNarrative(zeroInterest)).not.toMatch(/interest/i);
    const zeroRows = packetCsv(insertIdentifiers(zeroInterest, draftNarrative(zeroInterest), rowsOf(zeroInterest))).split('\r\n');
    expect(zeroRows[1]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('interest') + 1)).toBe('');
    // A version with a line above zero beside a line at $0.00 lists and totals the first alone.
    const mixed = assemblePacket(
      assemblyInput({
        asOf: '2026-05-01',
        lines: [line(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), line(2, { receivedOn: '2026-04-20', paidOn: '2026-04-21', varianceCents: cents(3000n) })],
        interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() },
      }),
    );
    expect(mixed.interest?.lines.map((item) => item.interest_cents)).toEqual(['57', '0']);
    const mixedHtml = printedOf(mixed, draftNarrative(mixed), rowsOf(mixed));
    const mixedSection = mixedHtml.slice(mixedHtml.indexOf('<h2>[4]'), mixedHtml.indexOf('<h2>Evidence</h2>'));
    expect(mixedSection.match(/<tr><td>\d+<\/td>/g)).toEqual(['<tr><td>1</td>']);
    expect(htmlText(mixedSection)).toContain('Interest stated in this request: $0.57');
    expect(mixed.requested_action).toContain('Pay the prompt-pay interest stated in the interest line');
    for (const printed of [html, maximal, noneHtml, noRuleHtml, zeroHtml]) {
      // "not stated" is said only of the whole request when no rule is on file, never of a line or a date.
      expect(htmlText(printed).replace('Prompt-pay interest is not stated in this request.', '')).not.toMatch(/not stated/i);
      for (const phrase of FORBIDDEN) {
        expect(htmlText(printed)).not.toMatch(phrase);
      }
    }
    // The CSV's interest cell is empty for a line whose interest code did not compute (each row's patient name holds a
    // comma, so the cells after it are one further along a plain split).
    const rows = packetCsv(exported).split('\r\n');
    expect(rows[1]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('interest') + 1)).toBe('0.57');
    expect(rows[2]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('interest') + 1)).toBe('');
    expect(rows[2]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('window_ends_on') + 1)).toBe('2036-04-05');
  });

  it('T9: [2] names the Medicare fee schedule only when the release supplied one', () => {
    const percent = assemblePacket(assemblyInput({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110' } }) }));
    const lesserOfPercent = assemblePacket(assemblyInput({ citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100' } } }) }));
    const lesserOfFixed = assemblePacket(assemblyInput({ citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '5000' } } }) }));
    const perVisit = assemblePacket(assemblyInput({ citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '9000' } }) }));
    const regulation = assemblePacket(assemblyInput({ citation: REGULATION, contractDocuments: [] }));
    const schedule = 'Payment rules and the Medicare fee schedule in effect for the service dates: release 900001';
    const rules = 'Payment rules in effect for the service dates: release 900001';
    for (const packet of [regulation, percent, lesserOfPercent]) {
      expect(releaseText(packet, [900001])).toBe(schedule);
      const printed = printedOf(packet, draftNarrative(packet), rowsOf(packet));
      expect(printed).toContain(`<p>[2] ${schedule}</p>`);
      // The rule release's evidence item reads as [2] does.
      expect(printed).toMatch(new RegExp(`<li>\\[\\d+\\] ${schedule}</li>`));
    }
    for (const packet of [content, lesserOfFixed, perVisit]) {
      expect(releaseText(packet, [900001])).toBe(rules);
      expect(printedOf(packet, draftNarrative(packet), rowsOf(packet))).toContain(`<p>[2] ${rules}</p>`);
    }
  });

  it('refuses a code of a closed list it has no words for, rather than print it (the export records a print failure)', () => {
    const [first, ...rest] = content.lines;
    if (first === undefined) {
      throw new Error('a line expected');
    }
    const unknown: PacketContentV2 = { ...content, lines: [{ ...first, calculation: { ...first.calculation, steps: [{ step: 'ncci_bundle', amount_cents: '10000' }] } }, ...rest] };
    expect(() => printedOf(unknown, narrative, identifiers)).toThrow(PayerCopyWordsError);
    const method: PacketContentV2 = { ...content, lines: [{ ...first, calculation: { ...first.calculation, method: 'CAPITATION' } }, ...rest] };
    expect(() => packetCsv(insertIdentifiers(method, narrative, identifiers))).toThrow(PayerCopyWordsError);
  });

  it('prints an earlier tp-packet/1 version without a dispute window section', () => {
    const { deadline: _deadline, lines, ...rest } = content;
    const earlier: PacketContentV1 = { ...rest, format: 'tp-packet/1', lines: lines.map(({ deadline: _line, calculation: _calculation, ...item }) => item) };
    const printed = printedOf(earlier, exported.narrative, identifiers);
    expect(printed).not.toContain('Dispute window');
    expect(printed).toContain('Line schedule');
  });
});

describe('packetCsv: the payer’s schedule', () => {
  it('T6: lists each line with its identifiers but the patient control number, amounts in dollars, interest apart, the window and the calculation in words, formulas refused, and nothing internal', () => {
    const csv = packetCsv(exported);
    const rows = csv.split('\r\n');
    expect(PACKET_CSV_COLUMNS).toEqual([
      'row',
      'payer_claim_control_number',
      'patient_name',
      'member_id',
      'service_date',
      'procedure_code',
      'modifiers',
      'units',
      'expected',
      'observed',
      'variance',
      'paid',
      'paid_on',
      'received_on',
      'interest',
      'window_ends_on',
      'calculation_method',
      'unrounded',
      'rounded',
      'patient_share',
    ]);
    expect(rows[0]).toBe(PACKET_CSV_COLUMNS.join(','));
    expect(rows[1]).toBe(`1,SYNCCN0001,"'=SYNTHETIC, PATIENT <ONE>",SYNMBR1,2026-03-05,97110,,2,100.00,70.00,30.00,56.00,2026-05-01,2026-03-02,0.57,2036-04-05,Fixed schedule,100.00,100.00,14.00`);
    expect(rows[2]).toContain(',not on the remittance,');
    expect(rows.at(-1)).toBe('');
    expect(csv).not.toMatch(/SYNPCN|trace|sha256|deadline_status|deadline_source|FIXED_SCHEDULE/i);
    expect(payerCopyLeaks(csv, scanOf(content, narrative, identifiers))).toEqual([]);
    expect(payerCopyLeaks(packetCsv(maximalExported), scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual([]);
  });
});
