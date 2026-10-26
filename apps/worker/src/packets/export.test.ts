import { describe, expect, it } from 'vitest';

import {
  type CorrespondenceContact,
  type PacketContent,
  type PacketContentV1,
  type PacketContentV2,
  type PayerIdentification,
  ExplainBindingError,
  ExplainWordsError,
  SYNTHETIC_CORRESPONDENCE_CONTACT,
  assemblePacket,
  correspondenceText,
  draftNarrative,
  explainPacket,
  fillPlaceholders,
  insertIdentifiers,
  plainText,
} from '@tp/packets';
import { IDS, REGULATION, contractCitation, contractWindowSource, derivedFeeScheduleValues, lineSentences, promptPayRecord, worksheetSentences } from '@tp/packets/testing';
import { cents } from '@tp/money';
import type { PricingTrace } from '@tp/pricing';
import { type TermsOptions, contractAgreement, fixedTerms, lesserOfTerms, maAgreement, perVisitTerms } from '@tp/pricing/testing';

import { ChromiumPdfRenderer, chromiumInstalled } from '../report/pdf';
import { amountsNotInMono } from '../report/test-support/figures';
import { PACKET_CSV_COLUMNS, packetCsv } from './csv';
import { PacketExportRenderError, exportWords } from './export';
import { packetHtml } from './html';
import {
  INTERNAL_RECORD,
  content,
  exported,
  identifiers,
  maximalContent,
  maximalExported,
  maximalIdentifiers,
  maximalNarrative,
  maximalWords,
  narrative,
  payerCopy,
  payerWords,
  retracedLine,
  steppedContent,
  steppedExported,
  tracedInput,
  tracedLine,
  tracesOf,
  words,
} from './test-support/exported-packet';
import { QUALIFIED_IDENTIFIER, holdsLoosely, htmlText, narrativeBlock, outsideNarrative, payerCopyLeaks, printedPdfText } from './test-support/payer-copy';
import { PayerCopyWordsError, releaseText } from './words';

/**
 * The payer's copy of an export (audit item #37 part 1; the founder's rulings of 2026-10-20; docs/adr/0061; PRD 12,
 * The packet; CAS-11, CAS-12, CAS-15, CAS-26; CO-05): the HTML the worker prints to PDF and the CSV schedule, from
 * SYNTHETIC versions with their identifiers inserted. T1 to T9 of the design. Every version's lines are priced by the
 * engine (tracedLine()), so each line's calculation in words is explainPacket()'s over the real trace its SHA-256
 * names, as the export words it (combined audit #38; docs/adr/0072; CAS-32 to CAS-34).
 */

const PRACTICE = content.practice.name;
const APPROVAL_LINE = `Approved for submission by ${PRACTICE} on 2026-05-02, reference SK6CS-K6CSK.`;
const CONTACT_LINE = `Correspondence about this dispute: ${correspondenceText(SYNTHETIC_CORRESPONDENCE_CONTACT)}.`;
const SECRETS = [INTERNAL_RECORD.drafter, INTERNAL_RECORD.approver, INTERNAL_RECORD.specialist, INTERNAL_RECORD.versionSha256];
/** The packet's reference both files carry: the PDF prints it, and every row of the CSV leads with it (the founder's ruling of 2026-10-21). */
const REFERENCE = payerCopy.reference;
const scanOf = (packet: PacketContent, text: string, rows: typeof identifiers) => ({
  content: packet,
  narrative: text,
  allowedEmail: SYNTHETIC_CORRESPONDENCE_CONTACT.email ?? null,
  identifiers: rows,
  reference: REFERENCE,
  secrets: SECRETS,
});
/** The phrases the interest and timeliness rulings keep off the payer's copy (Q3 (a), Q4 (a)). */
const FORBIDDEN = [/cannot be computed/i, /can be computed/i, /in all/i, /not claimed/i, /filed within/i, /No dispute window/i];
/** A figure of the calculation's words as the copy sets it: in the report frame's mono figure span. */
const F = (figure: string) => `<span class="figure-amount">${figure}</span>`;
/** The summary of each SYNTHETIC fixed-schedule line (97110 x 2 at $50.00 a unit, allowed $70.00), in the payer's words. */
const SUMMARY = `${F('2')} units × ${F('$50.00')} = ${F('$100.00')} under the contract’s clause on page ${F('2')}; rounded once to ${F('$100.00')}; observed allowed ${F('$70.00')}; short ${F('$30.00')}.`;

const printedOf = (packet: PacketContent, text = draftNarrative(packet), rows = identifiers, copy = payerCopy) => packetHtml(insertIdentifiers(packet, text, rows), copy, payerWords(packet));
/** Identifiers for every row of a SYNTHETIC version of up to three lines. */
const rowsOf = (packet: PacketContent) => new Map([...maximalIdentifiers].filter(([row]) => row <= packet.lines.length));

const received = [tracedLine(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), tracedLine(2, { receivedOn: '2026-03-03', paidOn: '2026-05-01' })];
/** Medicare Advantage non-contracted lines, priced at Original Medicare's amount (the regulation's versions). */
const ma = (n: number, overrides: Parameters<typeof tracedLine>[1] = {}) => tracedLine(n, overrides, { facts: { observedAllowedCents: cents(2000n), agreement: maAgreement() } });
const maReceived = [ma(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), ma(2, { receivedOn: '2026-03-03', paidOn: '2026-05-01' })];
const maLines = [ma(1), ma(2), ma(3)];
/** A version at dispute level 2, its window the level's own (a release record at L2, as Q34 would allow). */
const level2 = assemblePacket(tracedInput({ disputeLevel: 2, nextLevelDeadline: { status: 'verified', source: 'release', endsOn: '2026-12-01', cause: null } }));
/** The SYNTHETIC contract's dispute window of 3650 days, for a line priced under terms of its own. */
const WINDOWS = { timely_filing_days: null, dispute_window_days: 3650, appeal_levels: [] };
/**
 * Every Medicare flag but the multiple procedure payment reduction's on, and Medicare's pooled timed-units rule: the
 * reduction ranks practice-expense parts, which only a percent-of-Medicare line reads (steppedContent takes it).
 */
const EVERY_FLAG = { apply_mppr: false, apply_assistant_reduction: true, apply_sequestration: true, apply_ncci: true, timed_units_rule: 'MEDICARE_POOLED' } as const;
/**
 * Two lines priced by the engine under the method's terms with those flags on and a therapy assistant's CQ, so they
 * take every step the method takes (the assistant reduction, the contract's own 95% and sequestration on the payer's
 * share), each line under its own rounding rule.
 */
const stepped = (terms: (options: TermsOptions) => ReturnType<typeof fixedTerms>) =>
  (['HALF_EVEN_CENT', 'TRUNCATE'] as const).map((rounding, index) =>
    tracedLine(index + 1, {}, {
      facts: {
        modifiers: ['GP', 'CQ'],
        observedAllowedCents: cents(2000n),
        agreement: contractAgreement({ terms: terms({ flags: EVERY_FLAG, adjustment: { kind: 'PERCENT', percent: '95' }, rounding }), rateRecordId: IDS.rateRecord, windows: WINDOWS }),
      },
    }),
  );
/** The methods of T9, each with every step, a release record of no program, a window of no stated days, an end date and a plan name. */
const METHOD_VERSIONS: Readonly<Record<string, PacketContent>> = {
  'percent of Medicare, every step': steppedContent,
  'lesser of a percent schedule, every step': assemblePacket(
    tracedInput({
      lines: stepped((options) => lesserOfTerms({ percentage: '100' }, options)),
      citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100' } } }),
    }),
  ),
  'lesser of a fixed schedule, every step': assemblePacket(
    tracedInput({
      lines: stepped((options) => lesserOfTerms({ fixedCents: 5000n }, options)),
      citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '5000' } } }),
    }),
  ),
  'per visit, every step': assemblePacket(tracedInput({ lines: stepped((options) => perVisitTerms(9000n, options)), citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '9000' } }) })),
  'a release record of no program, a window of no stated days, an end date and a plan name': assemblePacket(
    tracedInput({
      lines: stepped((options) => fixedTerms(5000n, options)),
      citation: contractCitation({ effective_to: '2026-12-31' }),
      payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: '2U:SYNPAYERQ', plan_id: IDS.plan, plan_key: 'CE:SYNPLAN-FIX-ONE', plan_name: 'SYNTHETIC PLAN NAME' },
      deadlineSources: [contractWindowSource({ days: null }), { kind: 'release_record', release_no: 900001, sha256: 'b'.repeat(64), program: null, level: 'L2' }],
    }),
  ),
};
/**
 * A payer and plan of each remittance-key form the loaders write besides the default's REF 2U payer and REF CE plan
 * (the verification of 2026-10-21), each with the identification the payer's copy prints for it: an N103 XV payer
 * and a plan keyed by its claim filing indicator, printed as its type in words, and one whose indicator is ZZ
 * (Mutually Defined), which names no type, so the plan is left off (the founder's ruling of 2026-10-21; ADR 0061); a
 * TRN03 payer and a named plan; and an ERA export's NAME: payer and PLAN: plan (the plan as the export names it).
 */
const KEY_FORMS: Readonly<Record<string, { readonly payer: PayerIdentification; readonly printed: string }>> = {
  'an XV payer and a CLP06 plan': {
    payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: 'XV:SYNPAYERXV', plan_id: IDS.plan, plan_key: 'CLP06:12', plan_name: null },
    printed: 'SYNTHETIC PAYER Q (payer ID SYNPAYERXV), plan type Preferred Provider Organization (PPO)',
  },
  'an XV payer and a CLP06 ZZ plan': {
    payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: 'XV:SYNPAYERXV', plan_id: IDS.plan, plan_key: 'CLP06:ZZ', plan_name: null },
    printed: 'SYNTHETIC PAYER Q (payer ID SYNPAYERXV)',
  },
  'a TRN03 payer and a named plan': {
    payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: 'TRN03:1999999999', plan_id: IDS.plan, plan_key: 'CE:SYNPLAN-FIX-ONE', plan_name: 'SYNTHETIC PLAN NAME' },
    printed: 'SYNTHETIC PAYER Q (payer ID 1999999999), plan SYNTHETIC PLAN NAME',
  },
  'an ERA export’s payer and plan': {
    payer: { payer_id: IDS.payer, name: 'SYNTHETIC PAYER Q', payer_id_raw: 'NAME:SYNTHETIC PAYER Q', plan_id: IDS.plan, plan_key: 'PLAN:SYNTHETIC PPO 01', plan_name: null },
    printed: 'SYNTHETIC PAYER Q, plan SYNTHETIC PPO 01',
  },
};
const KEY_FORM_VERSIONS: Readonly<Record<string, PacketContent>> = Object.fromEntries(Object.entries(KEY_FORMS).map(([name, form]) => [name, assemblePacket(tracedInput({ payer: form.payer }))]));
/** Paid on time and dated before the due date: every line computes $0.00, which is not stated (Q4 (a)). */
const zeroInterest = assemblePacket(
  tracedInput({ asOf: '2026-03-10', lines: [tracedLine(1, { receivedOn: '2026-03-02', paidOn: '2026-03-09' }), tracedLine(2, { receivedOn: '2026-03-03', paidOn: '2026-03-09' })], interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } }),
);
/** Every route through the renderer: a contract and a regulation, interest computed, partly, not, with no rule on file, level 2, a practice with an NPI and tax ID. */
const VERSIONS: Readonly<Record<string, PacketContent>> = {
  'contract, computed': assemblePacket(tracedInput({ asOf: '2026-05-01', lines: received, interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } })),
  'contract, partly computed': content,
  'contract, not computed': assemblePacket(tracedInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) } })),
  'contract, no rule on file': assemblePacket(tracedInput({ interest: { state: 'ZZ', releaseNo: 900001, record: null } })),
  'contract, the real exclusion code': assemblePacket(tracedInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ exclusions: ['self_funded_erisa_plans', 'self_funded_plans'] }) } })),
  'regulation, computed': assemblePacket(tracedInput({ asOf: '2026-05-01', citation: REGULATION, contractDocuments: [], lines: maReceived, interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord() } })),
  'regulation, no interest': assemblePacket(tracedInput({ citation: REGULATION, contractDocuments: [], lines: maLines })),
  'contract, every line $0.00': zeroInterest,
  'level 2': level2,
  'a practice with an NPI and tax ID': assemblePacket(tracedInput({ practice: { practice_id: IDS.practice, name: 'SYNTHETIC THERAPY GROUP 01', npi: '1234567893', tax_id_last4: '6789' } })),
  ...METHOD_VERSIONS,
  ...KEY_FORM_VERSIONS,
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
  const html = packetHtml(exported, payerCopy, words);
  const maximal = packetHtml(maximalExported, payerCopy, maximalWords);

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
      expect(payerCopyLeaks(packetCsv(insertIdentifiers(packet, text, rows), REFERENCE), scanOf(packet, text, rows)), `${name}, CSV`).toEqual([]);
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
    // A payer part in its remittance-key form: the content's own payer and plan keys, and any identifier led by a
    // qualifier code (the verification of 2026-10-21).
    const keyed = payerCopyLeaks(`${htmlText(maximal)} To SYNTHETIC PAYER Q (2U:SYNPAYERQ), plan CE:SYNPLAN-FIX-ONE; XV:SYNOTHER`, scanOf(maximalContent, maximalNarrative, maximalIdentifiers));
    expect([...keyed].sort()).toEqual(['payer_key:2U:SYNPAYERQ', 'payer_key:CE:SYNPLAN-FIX-ONE', 'qualified:2U:SYNPAYERQ', 'qualified:CE:SYNPLAN-FIX-ONE', 'qualified:XV:SYNOTHER']);
    // In the narrative too: a key no input the verifier quotes holds (which the verifier refuses, so no approved
    // narrative has one), another payer's as much as the content's own.
    const keyedNarrative = `${maximalNarrative}\n\nThe plan is XV:SYNOTHER under CE:SYNPLAN-FIX-ONE [1].`;
    const keyedCopy = htmlText(printedOf(maximalContent, keyedNarrative, maximalIdentifiers));
    expect([...payerCopyLeaks(keyedCopy, scanOf(maximalContent, keyedNarrative, maximalIdentifiers))].sort()).toEqual([
      'payer_key:CE:SYNPLAN-FIX-ONE',
      'qualified:CE:SYNPLAN-FIX-ONE',
      'qualified:XV:SYNOTHER',
    ]);
    // A key the PDF wrapped at its colon is still the content's key.
    expect(payerCopyLeaks(`${htmlText(maximal)} 2U:\nSYNPAYERQ`, scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual(['payer_key:2U:SYNPAYERQ']);
    // And a code printed as a code: a pattern's behavior, an observed basis, a release's default, a deadline cause or basis, an exclusion.
    const codes = ['BELOW_CONTRACT_RATE', 'paid_plus_pr', 'COMMERCIAL_DEFAULT', 'NEXT_LEVEL_UNCITED', 'line_windows', 'next_level_window', 'self_funded_erisa_plans'];
    const found = payerCopyLeaks(`${htmlText(maximal)} ${codes.join(' ')}`, scanOf(maximalContent, maximalNarrative, maximalIdentifiers));
    expect([...found].sort()).toEqual(codes.map((code) => `code:${code}`).sort());
    // The CSV's own header row is the payer's schedule, not a code.
    expect(payerCopyLeaks(packetCsv(maximalExported, REFERENCE), scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual([]);
  });

  it('T10: names the payer by its name with its ID in words and the plan by its name, its identifier when none is known, or its type in words when the remittance names only its claim filing indicator (none for ZZ), never in a remittance key’s form, in the identification and on the cover (the verification and the founder’s ruling of 2026-10-21)', () => {
    expect(html).toContain('<p><strong>To:</strong> SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan identifier SYNPLAN-FIX-ONE</p>');
    expect(html).toContain('<p>To SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan identifier SYNPLAN-FIX-ONE</p>');
    const named = METHOD_VERSIONS['a release record of no program, a window of no stated days, an end date and a plan name'];
    if (named === undefined) {
      throw new Error('the version with a plan name is listed');
    }
    expect(printedOf(named, draftNarrative(named), rowsOf(named))).toContain('<p><strong>To:</strong> SYNTHETIC PAYER Q (payer ID SYNPAYERQ), plan SYNTHETIC PLAN NAME</p>');
    for (const [name, form] of Object.entries(KEY_FORMS)) {
      const packet = KEY_FORM_VERSIONS[name];
      if (packet === undefined) {
        throw new Error(`the version of ${name} is listed`);
      }
      const printed = printedOf(packet, draftNarrative(packet), rowsOf(packet));
      expect(printed, name).toContain(`<p><strong>To:</strong> ${form.printed}</p>`);
      expect(printed, name).toContain(`<p>To ${form.printed}</p>`);
      // The claim filing indicator is never printed as a plan identifier.
      expect(htmlText(printed), name).not.toMatch(/plan identifier (?:12|ZZ)\b/);
    }
    // Every route through the renderer, in both files: no payer or plan key, and no identifier led by a qualifier code.
    for (const [name, packet] of Object.entries(VERSIONS)) {
      const text = name === 'maximal' ? maximalNarrative : draftNarrative(packet);
      const rows = name === 'maximal' ? maximalIdentifiers : rowsOf(packet);
      const inserted = insertIdentifiers(packet, text, rows);
      for (const printed of [htmlText(packetHtml(inserted, payerCopy, payerWords(packet))), packetCsv(inserted, REFERENCE)]) {
        expect(printed.match(QUALIFIED_IDENTIFIER), name).toBeNull();
        expect(printed, name).not.toContain(packet.payer.payer_id_raw);
        expect(printed, name).not.toContain(packet.payer.plan_key);
      }
    }
    // The release number stays printed as it is (D14): narratives cite it.
    expect(html).toContain('release 900001');
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

  it.skipIf(!chromiumInstalled())(
    'T5: the printed PDF’s text holds every sentence of explainPacket(..., \'payer\') over the version’s traces, the words the review page shows (combined audit #38; CAS-32; skipped without Chromium)',
    async () => {
      for (const [exportedVersion, packet] of [
        [steppedExported, steppedContent],
        [maximalExported, maximalContent],
      ] as const) {
        const pdf = await new ChromiumPdfRenderer().render(packetHtml(exportedVersion, payerCopy, payerWords(packet)));
        const { text } = await printedPdfText(pdf);
        const expected = explainPacket(packet, tracesOf(packet), 'payer');
        for (const sentence of [...expected.rows.flatMap((row) => lineSentences(row.words)), ...expected.worksheets.flatMap(worksheetSentences)]) {
          expect(holdsLoosely(text, plainText(sentence)), plainText(sentence)).toBe(true);
        }
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
    // The calculation's words and the fee schedule worksheet's figures too.
    expect(await amountsNotInMono(packetHtml(steppedExported, payerCopy, payerWords(steppedContent)))).toEqual([]);
  }, 60_000);

  it('T7: states the dispute window’s dates only: the earliest line window at the first level, the level’s own window above it, its evidence, and never a timeliness claim', () => {
    expect(html).toContain('<h2>Dispute window</h2><p><strong>The earliest dispute window among the listed lines ends on 2036-04-05.</strong></p>');
    expect(html).toContain('<li>The contract’s dispute window: 3650 days (page 1):<blockquote>Disputes are raised within 3650 days of the payment date.</blockquote></li>');
    expect(maximal).toContain('<li>The Medicare dispute window in effect for the service dates (release 900002).</li>');
    expect(html).toContain('<caption>Each line’s dispute window and how its expected amount is computed</caption>');
    expect(html).toContain('<thead><tr><th scope="col">Row</th><th scope="col">Window ends</th><th scope="col">How the expected amount is computed</th><th scope="col">Patient share</th></tr></thead>');
    // Each line's calculation in the payer's words (combined audit #38): the summary, then each step, every figure in
    // the mono face; the patient share beside it, never subtracted.
    expect(html).toContain(`<tr><td>1</td><td>2036-04-05</td><td><p>${SUMMARY}</p><p>Fixed schedule: ${F('$50.00')} per unit.</p>`);
    expect(html).toContain(`<td>${F('$14.00')}, reported, never subtracted</td></tr>`);
    expect(html).not.toMatch(/FIXED_SCHEDULE|HALF_UP_CENT|paid_plus_pr/);
    // Above the first level the copy states the level's own window alone: no first-level clause or release record, no
    // line's first-level window (in the PDF or the CSV), and each line's calculation still.
    const second = printedOf(level2, draftNarrative(level2), rowsOf(level2));
    const window = second.slice(second.indexOf('<h2>Dispute window</h2>'), second.indexOf('</table>', second.indexOf('<h2>Dispute window</h2>')));
    expect(window).toContain('<h2>Dispute window</h2><p><strong>The window for dispute level 2 ends on 2026-12-01.</strong></p><table');
    expect(window).not.toMatch(/<ul>|The contract’s dispute window|dispute window in effect|Window ends|2036-04-05/);
    expect(window).toContain('<caption>How each line’s expected amount is computed</caption>');
    expect(window).toContain('<thead><tr><th scope="col">Row</th><th scope="col">How the expected amount is computed</th><th scope="col">Patient share</th></tr></thead>');
    expect(window).toContain(`<tr><td>1</td><td><p>${SUMMARY}</p><p>Fixed schedule: ${F('$50.00')} per unit.</p>`);
    const secondCsv = packetCsv(insertIdentifiers(level2, draftNarrative(level2), rowsOf(level2)), REFERENCE).split('\r\n');
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
    // 1 unit at $246,913.57, of which the contract pays 50%: $123,456.785 before the one rounding.
    const terms = fixedTerms(24691357n, { adjustment: { kind: 'PERCENT', percent: '50' } });
    const large = tracedLine(1, {}, { facts: { units: '1', chargeCents: cents(30000000n), agreement: contractAgreement({ terms, rateRecordId: IDS.rateRecord, windows: WINDOWS }) } });
    const packet = assemblePacket(tracedInput({ lines: [large] }));
    const printed = printedOf(packet, draftNarrative(packet), rowsOf(packet));
    expect(printed).toContain(`after the contract’s adjustment ${F('$123,456.785')}; rounded once to ${F('$123,456.79')};`);
    expect(printed).toContain(`Rounded once, half up to the cent, under the practice’s default, as the contract names no rule: ${F('$123,456.785')} becomes ${F('$123,456.79')}.`);
    const window = printed.slice(printed.indexOf('<h2>Dispute window</h2>'), printed.indexOf('</table>', printed.indexOf('<h2>Dispute window</h2>')));
    expect(window).not.toContain('$123456');
    // The CSV keeps plain decimal dollars, the fraction of a cent with them.
    expect(packetCsv(insertIdentifiers(packet, draftNarrative(packet), rowsOf(packet)), REFERENCE).split('\r\n')[1]).toContain(',Fixed schedule,123456.785,123456.79,');
  });

  it('T7: words every line of every version exactly as explainPacket(..., \'payer\') does over the traces its calculations name, and prints its fee schedule worksheets (combined audit #38; CAS-32, CAS-33)', () => {
    for (const [name, packet] of Object.entries(VERSIONS)) {
      const text = name === 'maximal' ? maximalNarrative : draftNarrative(packet);
      const rows = name === 'maximal' ? maximalIdentifiers : rowsOf(packet);
      const printed = htmlText(printedOf(packet, text, rows));
      // The words the review page shows the reviewer (explainPacket() with the payer audience), each sentence in the copy.
      const expected = explainPacket(packet, tracesOf(packet), 'payer');
      expect(expected.rows.map((row) => row.row), name).toEqual(packet.lines.map((line) => line.row));
      for (const sentence of [...expected.rows.flatMap((row) => lineSentences(row.words)), ...expected.worksheets.flatMap(worksheetSentences)]) {
        expect(holdsLoosely(printed, plainText(sentence)), `${name}: ${plainText(sentence)}`).toBe(true);
      }
      // A worksheet section exactly when a line read a fee schedule.
      expect(printed.includes('Fee schedule worksheets'), name).toBe(expected.worksheets.length > 0);
    }
    // A percent-of-Medicare version: one worksheet for its two lines of one code, setting and locality, which each row's
    // words point to; its parts, their amounts per unit at the contract's percentage, and how to check them at CMS.
    const stepped = printedOf(steppedContent, draftNarrative(steppedContent), rowsOf(steppedContent));
    const sheet = stepped.slice(stepped.indexOf('<h2>Fee schedule worksheets</h2>'));
    expect(sheet.match(/<section class="worksheet">/g)).toHaveLength(1);
    expect(stepped.match(/<p>See fee schedule worksheet 1\.<\/p>/g)).toHaveLength(2);
    expect(sheet).toContain(`<h3>Fee schedule worksheet 1: code ${F('97110')}, ${F('2026')}, carrier ${F('99999')} locality ${F('01')}, non-facility</h3>`);
    expect(sheet).toContain(`<p>Percentage: ${F('110%')} of the fee schedule, under the contract’s clause on page ${F('2')}.</p>`);
    expect(sheet).toContain(`<tr><td>Work</td><td>${F('0.31')}</td><td>${F('1.000')}</td><td>${F('$6.82')}</td></tr>`);
    expect(sheet).toContain(`<tr><td>Per unit</td><td></td><td></td><td>${F('$23.232')}</td></tr>`);
    expect(htmlText(sheet)).toContain('Reductions, in order, then the one rounding: as the words of row 1 and row 2 say.');
    expect(htmlText(sheet)).toMatch(/To check these values, open the Physician Fee Schedule Look-Up Tool of the Centers for Medicare & Medicaid Services \(CMS\) for 2026/);
    // Never an amount at 100% for a contract at 110%, a geographically adjusted RVU or a total RVU: the trace holds none.
    const figures = [...sheet.matchAll(/<span class="figure-amount">([^<]*)<\/span>/g)].map((match) => match[1]);
    for (const trace of tracesOf(steppedContent).values()) {
      for (const derived of derivedFeeScheduleValues(trace as Parameters<typeof derivedFeeScheduleValues>[0])) {
        expect(figures.some((figure) => figure?.replace(/[$,%]/g, '').replace(/ per RVU$/, '') === derived)).toBe(false);
      }
    }
    // A Medicare Advantage line's worksheet is Original Medicare's, at its 100% under the regulation.
    const regulation = VERSIONS['regulation, no interest'];
    if (regulation === undefined) {
      throw new Error('the regulation version');
    }
    expect(htmlText(printedOf(regulation, draftNarrative(regulation), rowsOf(regulation)))).toContain('Percentage: 100% under 42 CFR 422.214');
    // A fixed-schedule version reads no fee schedule: no worksheet.
    expect(html).not.toContain('Fee schedule worksheet');
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
    const none = assemblePacket(tracedInput({ interest: { state: 'ZZ', releaseNo: 900001, record: promptPayRecord({ annual_rate_percent: null }) } }));
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
    const noRule = assemblePacket(tracedInput({ interest: { state: 'ZZ', releaseNo: 900001, record: null } }));
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
    const zeroRows = packetCsv(insertIdentifiers(zeroInterest, draftNarrative(zeroInterest), rowsOf(zeroInterest)), REFERENCE).split('\r\n');
    expect(zeroRows[1]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('interest') + 1)).toBe('');
    // A version with a line above zero beside a line at $0.00 lists and totals the first alone.
    const mixed = assemblePacket(
      tracedInput({
        asOf: '2026-05-01',
        lines: [tracedLine(1, { receivedOn: '2026-03-02', paidOn: '2026-05-01' }), tracedLine(2, { receivedOn: '2026-04-20', paidOn: '2026-04-21' })],
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
    const rows = packetCsv(exported, REFERENCE).split('\r\n');
    expect(rows[1]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('interest') + 1)).toBe('0.57');
    expect(rows[2]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('interest') + 1)).toBe('');
    expect(rows[2]?.split(',').at(PACKET_CSV_COLUMNS.indexOf('window_ends_on') + 1)).toBe('2036-04-05');
  });

  it('T9: [2] names the Medicare fee schedule only when the release supplied one', () => {
    const percent = assemblePacket(tracedInput({ citation: contractCitation({ method: 'PERCENT_OF_MEDICARE', parameters: { percentage: '110' } }) }));
    const lesserOfPercent = assemblePacket(tracedInput({ citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'PERCENT_OF_MEDICARE', percentage: '100' } } }) }));
    const lesserOfFixed = assemblePacket(tracedInput({ citation: contractCitation({ method: 'LESSER_OF', parameters: { schedule: { method: 'FIXED_SCHEDULE', amount_cents: '5000' } } }) }));
    const perVisit = assemblePacket(tracedInput({ citation: contractCitation({ method: 'PER_VISIT', parameters: { amount_cents: '9000' } }) }));
    const regulation = assemblePacket(tracedInput({ citation: REGULATION, contractDocuments: [], lines: maLines }));
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

  it('refuses a code of a closed list it has no words for, rather than print it (the export records a print failure; CAS-34)', () => {
    const [first, ...rest] = content.lines;
    if (first === undefined) {
      throw new Error('a line expected');
    }
    // A trace whose method the words have none for (the engine writes its method as text): the copy is not printed.
    const trace = tracesOf(content).get(first.priced_line_id) as PricingTrace;
    const capitation = { ...trace, terms: { ...(trace.terms as NonNullable<PricingTrace['terms']>), method: 'CAPITATION' } };
    const unknown = assemblePacket(tracedInput({ lines: [retracedLine(tracedLine(1), capitation), tracedLine(2)] }));
    expect(() => printedOf(unknown, draftNarrative(unknown), rowsOf(unknown))).toThrow(new ExplainWordsError('method'));
    expect(() => printedOf(unknown, draftNarrative(unknown), rowsOf(unknown))).toThrow(/the words have no entry for a method/);
    const method: PacketContentV2 = { ...content, lines: [{ ...first, calculation: { ...first.calculation, method: 'CAPITATION' } }, ...rest] };
    expect(() => packetCsv(insertIdentifiers(method, narrative, identifiers), REFERENCE)).toThrow(PayerCopyWordsError);
    // A plan known only by a claim filing indicator with no words (the founder's ruling of 2026-10-21): the copy is not
    // printed, rather than print the code as a plan identifier or drop the plan unnoticed.
    for (const plan_key of ['CLP06:Q9', 'CLP06:C1', 'CLP06:toString']) {
      const unworded = assemblePacket(tracedInput({ payer: { ...content.payer, plan_key, plan_name: null } }));
      expect(() => printedOf(unworded, draftNarrative(unworded), rowsOf(unworded)), plan_key).toThrow(new PayerCopyWordsError('claim filing indicator'));
      expect(() => printedOf(unworded, draftNarrative(unworded), rowsOf(unworded)), plan_key).toThrow(/no words for a claim filing indicator/);
    }
  });

  it('prints a tp-packet/2 version’s calculation only in the words of its own rows, and none without them', () => {
    expect(() => packetHtml(exported, payerCopy, null)).toThrow(TypeError);
    const own = words;
    if (own === null) {
      throw new Error('the version’s words');
    }
    // The maximal version's words (three rows) are not the two-row version's.
    expect(() => packetHtml(exported, payerCopy, maximalWords)).toThrow(/words of other rows are not printed/);
    expect(() => packetHtml(exported, payerCopy, { ...own, rows: [...own.rows].reverse() })).toThrow(/words of other rows are not printed/);
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
  it('T6: lists each line led by the packet’s reference, with its identifiers but the patient control number, amounts in dollars, interest apart, the window and the calculation in words, formulas refused, and nothing internal', () => {
    const csv = packetCsv(exported, REFERENCE);
    const rows = csv.split('\r\n');
    expect(PACKET_CSV_COLUMNS).toEqual([
      'packet_reference',
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
    expect(rows[1]).toBe(`SK6CS-K6CSK,1,SYNCCN0001,"'=SYNTHETIC, PATIENT <ONE>",SYNMBR1,2026-03-05,97110,GP,2,100.00,70.00,30.00,56.00,2026-05-01,2026-03-02,0.57,2036-04-05,Fixed schedule,100.00,100.00,14.00`);
    expect(rows[2]).toContain(',not on the remittance,');
    expect(rows.at(-1)).toBe('');
    // The reference on every row is the one the PDF's approval line prints and the file names carry (the founder's
    // ruling of 2026-10-21), so the schedule still matches its letter if a portal drops the file's name.
    expect(REFERENCE).toBe('SK6CS-K6CSK');
    expect(APPROVAL_LINE).toContain(`reference ${REFERENCE}.`);
    expect(rows.slice(1, -1)).toHaveLength(exported.lines.length);
    for (const row of rows.slice(1, -1)) {
      expect(row.startsWith(`${REFERENCE},`)).toBe(true);
    }
    // And on every row of every version the leak scan prints (T1's routes through the renderer).
    for (const [name, packet] of Object.entries(VERSIONS)) {
      const text = name === 'maximal' ? maximalNarrative : draftNarrative(packet);
      const inserted = name === 'maximal' ? maximalIdentifiers : rowsOf(packet);
      const body = packetCsv(insertIdentifiers(packet, text, inserted), REFERENCE).split('\r\n').slice(1, -1);
      expect(body, name).toHaveLength(packet.lines.length);
      expect(body.every((row) => row.startsWith(`${REFERENCE},`)), name).toBe(true);
    }
    expect(csv).not.toMatch(/SYNPCN|trace|sha256|deadline_status|deadline_source|FIXED_SCHEDULE/i);
    expect(payerCopyLeaks(csv, scanOf(content, narrative, identifiers))).toEqual([]);
    expect(payerCopyLeaks(packetCsv(maximalExported, REFERENCE), scanOf(maximalContent, maximalNarrative, maximalIdentifiers))).toEqual([]);
  });

  it('refuses a reference not in its printed form rather than print it (the export records a print failure)', () => {
    for (const reference of ['', 'sk6cs-k6csk', 'SK6CSK6CSK', 'SK6CS-K6CSL', 'c'.repeat(64)]) {
      expect(() => packetCsv(exported, reference), reference).toThrow(TypeError);
    }
  });
});

describe('exportWords: the export’s calculation in words', () => {
  /** A transaction's client that reads `rows` as the version's stored traces. */
  const reading = (rows: readonly { readonly id: string; readonly trace: unknown }[]) => ({ query: () => Promise.resolve({ rows }) }) as unknown as Parameters<typeof exportWords>[0];
  const stored = (packet: PacketContent) => [...tracesOf(packet)].map(([id, trace]) => ({ id, trace }));

  it('words the version from the traces its approval names, as explainPacket(..., \'payer\') does (CAS-32)', async () => {
    expect(await exportWords(reading(stored(steppedContent)), IDS.practice, steppedContent)).toEqual(explainPacket(steppedContent, tracesOf(steppedContent), 'payer'));
  });

  it('refuses, as a print failure, a trace that is not the one its approval names, a trace missing, and a line priced by another rate record', async () => {
    const failure = async (rows: readonly { readonly id: string; readonly trace: unknown }[], packet: PacketContent = content) => {
      const error: unknown = await exportWords(reading(rows), IDS.practice, packet).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PacketExportRenderError);
      return (error as PacketExportRenderError).cause;
    };
    const [first, second] = stored(content);
    if (first === undefined || second === undefined) {
      throw new Error('two traces');
    }
    const trace = first.trace as PricingTrace;
    const tampered = { ...first, trace: { ...trace, line: { ...trace.line, units: '3' } } };
    expect(await failure([tampered, second])).toEqual(new ExplainBindingError('trace_differs', 1));
    expect(await failure([second])).toEqual(new ExplainBindingError('trace_missing', 1));
    const other = assemblePacket(tracedInput({ lines: [tracedLine(1), tracedLine(2)], citation: contractCitation({ rate_record_id: IDS.version }) }));
    expect(await failure(stored(other), other)).toEqual(new ExplainBindingError('rate_record_differs', 1));
  });
});
