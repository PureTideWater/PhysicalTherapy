import { DEFAULT_PROOF_LEVEL, type ReportReconciliation, reportReconciliation } from '@tp/ledger';
import { formatUsd, parseCents } from '@tp/money';
import { type CorrespondenceContact, type ExportedPacket, type PacketContent, type PacketContentV2, type PacketWords, correspondenceText, interestStated, lineInterestStated } from '@tp/packets';
import { type Segment, type Sentence, type Worksheet, segmentText } from '@tp/packets/explain';

import { type FigureColumns, brandedDocument, figureColumns } from '../report/brand';
import { escapeHtml, escapeWithFigures } from '../report/escape';
import { PROGRAM_TEXT, counted, exclusionWords, payerAndPlanWords, releaseText, wordsOf } from './words';

/**
 * The payer's copy of a packet (audit item #37 part 1; the founder's rulings of 2026-10-20; docs/adr/0061): one
 * self-contained HTML document the worker prints to PDF with Chromium (PRD 15, Documents; PRD 12, The packet). It is
 * the practice's own letter to its payer, which the practice sends with the CSV schedule through its own channel, so
 * it prints only what the payer's examiner needs and what code knows when it prints:
 *
 * - the practice and payer, the payer by its name with its identifier in words ("payer ID SYNPAYERQ") and the plan by
 *   its name, or "plan identifier <id>" when no name is known, or, known only by its claim filing indicator, "plan type
 *   <words>" (none for ZZ; the founder's ruling of 2026-10-21), never a remittance key's qualifier code (2U:, CE:,
 *   CLP06:; the verification of 2026-10-21; words.ts payerAndPlanWords()), the contract's cited clause with its title, version,
 *   effective dates and page (or the regulation), and [2], what the payment rules in effect supplied, by release (D14);
 * - the pattern statement, exactly the approved narrative the export's verifier passed, identifiers inserted, and
 *   nothing else in its block;
 * - the line schedule (claim control number, patient and member ID; the patient control number is not printed,
 *   Q2 (a));
 * - the dispute window's dates only (Q3 (a)), with the contract's clause or the release's record behind it, and each
 *   line's window and how its expected amount is computed (the method, each step, the one rounding and the patient
 *   share, reported and never subtracted);
 * - "how its expected amount is computed" (D2) is the words @tp/packets explainPacket(..., 'payer') writes from the
 *   stored traces the approval names, the words the review page shows the reviewer, with the fee schedule worksheets a
 *   payer checks a percent-of-Medicare or Medicare Advantage amount against CMS's own fee schedule with, and no record
 *   ID or SHA-256 (combined audit #38; docs/adr/0072);
 * - interest only where code computed it ("Interest stated in this request: $X"; Q4 (a));
 * - the evidence each citation marker names, by its label;
 * - the requested action, and the approval line with the packet's reference and the correspondence contact (D4 to D6).
 *
 * The internal record stays where it lives and is shown on the reviewer's review page: no login or approval time,
 * specialist line, audit flag, evidence gap, record ID, SHA-256, deadline status or verification, version number,
 * trace reference or note on how amounts were computed is printed here (D2). The renderer gets no login and no hash
 * (D13): only the version's content, its narrative and identifiers, and the payer copy's three facts. It is the
 * export, so it carries the identifiers inserted at export: it is stored sealed with the practice's key. Nothing
 * loads from outside the document. It is set in the report frame's type and tokens (report/brand.ts) as the
 * practice's own correspondence: the practice's name leads the cover and the running header (the frame's white-label
 * slot) and PaidWhole's lockup and name are not on it (docs/adr/0056). A packet states no recovered total, so it never
 * earns the seal or the badge.
 */

/** What the payer's copy prints beside the version's content (D4 to D6): no login, no hash. */
export interface PayerCopy {
  /** The UTC calendar date of the version's approval. */
  readonly approvedOn: string;
  /** The packet's reference (packetReference(approved_sha256)). */
  readonly reference: string;
  /** The practice's correspondence contact as the export read it. */
  readonly contact: CorrespondenceContact;
}

const usd = (value: string) => formatUsd(parseCents(value));

/** A table cell: text, escaped, or the HTML of the calculation's words, already escaped. */
type Cell = string | { readonly html: string };

/** A table; `figures` names its columns (1-based) of codes and of amounts or counts, set in the mono face. */
function table(caption: string | null, headers: readonly Cell[], rows: readonly (readonly Cell[])[], figures: FigureColumns = {}): string {
  const html = (cell: Cell) => (typeof cell === 'string' ? escapeHtml(cell) : cell.html);
  const head = headers.map((header) => `<th scope="col">${html(header)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${html(cell)}</td>`).join('')}</tr>`).join('');
  return `<table${figureColumns(figures)}>${caption === null ? '' : `<caption>${escapeHtml(caption)}</caption>`}<thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * One segment of the calculation's words as HTML: a figure (a value the trace holds) or a code in the mono face with
 * tabular numerals, in the report frame's figure span, as escapeWithFigures() sets an amount in running text; a label
 * (a row or worksheet number) and the words as text.
 */
function segmentHtml(segment: Segment): string {
  const text = escapeHtml(segmentText(segment));
  return 'figure' in segment || 'code' in segment ? `<span class="figure-amount">${text}</span>` : text;
}

const sentenceHtml = (sentence: Sentence): string => sentence.segments.map(segmentHtml).join('');

/**
 * How a row's expected amount is computed, in the payer's words: the summary, then each step's sentences, each its own
 * paragraph. The row's fee schedule step points to its worksheet.
 */
function computedHtml(row: PacketWords['rows'][number]): string {
  const paragraphs = [[row.words.summary], ...row.words.steps.map((step) => step.sentences)];
  return paragraphs.map((sentences) => `<p>${sentences.map(sentenceHtml).join(' ')}</p>`).join('');
}

/**
 * The fee schedule worksheets (combined audit #38; docs/adr/0072): for each distinct set of fee schedule records the
 * rows read, the year, locality, setting, conversion factor and percentage, each part's relative value units,
 * geographic index and amount per unit at the percentage, how they make the amount per unit, and how to check them
 * against CMS's look-up. Every figure is one a row's trace holds; none is an amount at 100% for a contract that is not
 * at 100%, and none is a record ID or SHA-256 (D2). None when no row read a fee schedule.
 */
function worksheetsSection(worksheets: readonly Worksheet[]): string {
  if (worksheets.length === 0) {
    return '';
  }
  const sheets = worksheets.map((sheet) => {
    const parts = sheet.parts.map((part) => [{ html: sentenceHtml(part.name) }, { html: segmentHtml(part.rvu) }, { html: segmentHtml(part.gpci) }, { html: segmentHtml(part.unit) }]);
    const total = [{ html: sentenceHtml(sheet.total.name) }, '', '', { html: segmentHtml(sheet.total.unit) }];
    const { headings } = sheet;
    return [
      `<section class="worksheet">`,
      `<h3>${sentenceHtml(sheet.title)}</h3>`,
      sheet.rows.map((row) => `<p>${sentenceHtml(row)}</p>`).join(''),
      table(null, [headings.part, headings.rvu, headings.gpci, headings.unit].map((heading) => ({ html: sentenceHtml(heading) })), [...parts, total], { amount: [2, 3, 4] }),
      `<p>${sheet.formula.map(sentenceHtml).join(' ')}</p>`,
      `<p>${sentenceHtml(sheet.reductions)}</p>`,
      `<p>${sentenceHtml(sheet.check)}</p>`,
      `</section>`,
    ].join('');
  });
  return `<h2>Fee schedule worksheets</h2>${sheets.join('')}`;
}

/**
 * The dispute window of a tp-packet/2 version: the date its window ends, never a claim that the dispute is timely
 * (Q3 (a)), the evidence behind it, and each line's window and calculation. An exportable version's deadline is
 * verified, so its last day is stated; a version without one is refused here rather than printed with no date. Above
 * the first level the window is the level's own (the payer's denial reopened the case for it), so the copy states
 * that window alone: the lines' first-level windows and their clauses are not this level's deadline, and are neither
 * printed nor listed per line (nor in the CSV).
 */
function disputeWindowSection(content: PacketContentV2, words: PacketWords): string {
  const { deadline } = content;
  if (deadline.ends_on === null) {
    throw new TypeError('the payer’s copy states the dispute window’s last day; a version without one is not printed');
  }
  const nextLevel = deadline.basis === 'next_level_window';
  const window = nextLevel
    ? `The window for dispute level ${String(content.dispute_level)} ends on ${deadline.ends_on}.`
    : `The earliest dispute window among the listed lines ends on ${deadline.ends_on}.`;
  const sources = (nextLevel ? [] : deadline.sources).map((source) => {
    if (source.kind === 'contract_window') {
      const length = source.days === null ? '' : `: ${counted(source.days, 'day')}`;
      return `<li>The contract’s dispute window${escapeHtml(length)} (page ${String(source.page)}):<blockquote>${escapeHtml(source.quote)}</blockquote></li>`;
    }
    const program = source.program === null ? '' : `${wordsOf(PROGRAM_TEXT, source.program, 'dispute window program')} `;
    return `<li>The ${escapeHtml(program)}dispute window in effect for the service dates (release ${String(source.release_no)}).</li>`;
  });
  // The words are this version's, row for row, or nothing is printed.
  if (words.rows.length !== content.lines.length || words.rows.some((row, index) => row.row !== content.lines[index]?.row)) {
    throw new TypeError('the payer’s copy words each row of its version; words of other rows are not printed');
  }
  const rows = content.lines.map((line, index) => {
    // The patient share beside the expected amount, never subtracted from it (as the review page says): its amount in
    // the mono face, its words in the text face.
    const share = line.calculation.patient_share_cents === null ? '' : escapeWithFigures(`${usd(line.calculation.patient_share_cents)}, reported, never subtracted`);
    const computed: Cell[] = [{ html: computedHtml(words.rows[index] as PacketWords['rows'][number]) }, { html: share }];
    return nextLevel ? [String(line.row), ...computed] : [String(line.row), line.deadline.ends_on ?? '', ...computed];
  });
  return [
    `<h2>Dispute window</h2>`,
    `<p><strong>${escapeHtml(window)}</strong></p>`,
    sources.length === 0 ? '' : `<ul>${sources.join('')}</ul>`,
    nextLevel
      ? table('How each line’s expected amount is computed', ['Row', 'How the expected amount is computed', 'Patient share'], rows, { code: [1] })
      : table('Each line’s dispute window and how its expected amount is computed', ['Row', 'Window ends', 'How the expected amount is computed', 'Patient share'], rows, { code: [1], date: [2] }),
    worksheetsSection(words.worksheets),
  ].join('');
}

/**
 * Prompt-pay interest, stated only where code computed it above zero (Q4 (a); lineInterestStated()): the state's rule,
 * the lines whose interest was computed above zero, and their total. Nothing is said of the other lines, and $0.00 is
 * never stated or totalled, so the copy never reads as giving interest up.
 */
function interestSection(content: PacketContent): string {
  const { interest } = content;
  if (interest === null) {
    return '';
  }
  const heading = `<h2>[4] Prompt-pay interest (its own line, not part of the variance)</h2>`;
  if (interest.days_to_pay === null) {
    return `${heading}<p>Prompt-pay interest is not stated in this request.</p>`;
  }
  const rule = `<p>State ${escapeHtml(interest.state)}${interest.statute === null ? '' : `, ${escapeHtml(interest.statute)}`}: payment due ${String(interest.days_to_pay)} ${escapeHtml(interest.day_basis ?? '')} days after the payer received the claim${interest.annual_rate_percent === null ? '' : `, interest at ${escapeHtml(interest.annual_rate_percent)}% a year`} (release ${String(interest.release_no)}).</p>`;
  const exclusions = interest.exclusions.length === 0 ? '' : `<p>The rule does not apply to: ${escapeHtml(interest.exclusions.map((code) => exclusionWords(code)).join(', '))}.</p>`;
  const computed = interest.lines.filter((line) => lineInterestStated(line));
  if (computed.length === 0 || interest.total_cents === null || !interestStated(interest)) {
    return `${heading}${rule}${exclusions}`;
  }
  const lines = table(
    'Interest by line',
    ['Row', 'Received', 'Due', 'Paid', 'Days late', 'Days unpaid to date', 'Interest'],
    computed.map((line) => [
      String(line.row),
      line.received_on ?? '',
      line.due_on ?? '',
      line.paid_on,
      line.days_late === null ? '' : String(line.days_late),
      line.days_unpaid === null ? '' : String(line.days_unpaid),
      usd(line.interest_cents ?? '0'),
    ]),
    { code: [1], date: [2, 3, 4], amount: [5, 6, 7] },
  );
  return `${heading}${rule}${exclusions}${lines}<p><strong>${escapeWithFigures(`Interest stated in this request: ${usd(interest.total_cents)}`)}</strong></p>`;
}

/** An evidence item as the payer's copy names it: its label, a rule release's as [2] reads (D14), never a record ID or hash. */
function evidenceLabel(content: PacketContent, index: number): string {
  const item = content.evidence[index];
  if (item === undefined) {
    return '';
  }
  if (item.kind !== 'rule_release') {
    return item.label;
  }
  const release = content.rule_releases.find((candidate) => candidate.manifest_sha256 === item.sha256)?.release_no ?? Number.parseInt(/\d+/.exec(item.label)?.[0] ?? '', 10);
  return releaseText(content, Number.isInteger(release) ? [release] : []);
}

/**
 * The Verified gate for a packet (docs/adr/0057): a dispute packet asks for money and states no recovered total, so
 * reportReconciliation finds none and the seal never prints on it. Keyed on the packet's reference (an opaque label).
 */
export function packetReconciliation(reference: string): ReportReconciliation {
  return reportReconciliation({ report: { kind: 'packet_version', id: reference }, proofLevel: DEFAULT_PROOF_LEVEL, statedRecoveredCents: null, recoveredEntryIds: [], ledger: new Map() });
}

// The template's own pieces, in tokens (the frame's stylesheet sets the type, tables and colors).
const STYLE = `
  h2 { border-bottom: 1px solid var(--pw-line); padding-bottom: 3pt; }
  .meta { color: var(--pw-slate); font-size: 9pt; }
  blockquote { margin: 4pt 0 4pt 12pt; padding-left: 8pt; border-left: 2px solid var(--pw-border-strong); font-style: italic; }
  table { margin: 4pt 0 8pt; font-size: 8pt; }
  th, td { padding: 4pt 3pt; }
  .narrative p { margin: 0 0 6pt; }
  td p { margin: 0 0 3pt; }
  td p:last-child { margin-bottom: 0; }
  .worksheet { break-inside: avoid; }
  .worksheet h3 { margin: 8pt 0 3pt; }
  .worksheet p { margin: 0 0 3pt; }
`;

/** The narrative's paragraphs as the payer's copy prints them: split on blank lines, trimmed, each its own <p>. */
export function narrativeParagraphs(narrative: string): string[] {
  return narrative
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}

/** A tp-packet/2 version's words, which its copy prints; none is refused rather than printed without them. */
function required(words: PacketWords | null): PacketWords {
  if (words === null) {
    throw new TypeError('the payer’s copy of a tp-packet/2 version prints its calculation in words; a version without them is not printed');
  }
  return words;
}

/**
 * The payer's copy of an export. `words` are the version's calculation in the payer's words (explainPacket(content,
 * traces, 'payer'), which checks every trace against the approved content): required for a tp-packet/2 version, whose
 * calculations the copy prints; a tp-packet/1 version prints none, so takes null.
 */
export function packetHtml(exported: ExportedPacket, payerCopy: PayerCopy, words: PacketWords | null, reconciliation: ReportReconciliation = packetReconciliation(payerCopy.reference)): string {
  const { content, lines, narrative } = exported;
  const { citation, practice, payer, pattern } = content;
  // The payer and plan in words, never in their remittance-key form ("2U:SYNPAYERQ", "CE:SYNPLAN-FIX-ONE", "CLP06:12"),
  // which the internal record and the review page keep; a claim filing indicator with no words refuses the copy.
  const addressee = payerAndPlanWords(payer);
  const identification = [
    `<p><strong>From:</strong> ${escapeHtml(practice.name)}${practice.npi === null ? '' : `, NPI ${escapeHtml(practice.npi)}`}${practice.tax_id_last4 === null ? '' : `, tax ID ending ${escapeHtml(practice.tax_id_last4)}`}</p>`,
    `<p><strong>To:</strong> ${escapeHtml(addressee)}</p>`,
    `<p class="meta">Dispute level ${String(content.dispute_level)}; prepared ${escapeHtml(content.as_of)}; reference ${escapeHtml(payerCopy.reference)}.</p>`,
  ].join('');
  const cited =
    citation.kind === 'contract'
      ? [
          `<p>[1] ${escapeHtml(citation.contract_title)}, version ${String(citation.version_no)} (effective ${escapeHtml(citation.effective_from)}${citation.effective_to === null ? '' : ` to ${escapeHtml(citation.effective_to)}`}), page ${String(citation.page)}:</p>`,
          `<blockquote>${escapeHtml(citation.quote)}</blockquote>`,
        ].join('')
      : `<p>[1] ${escapeHtml(citation.reference)}: ${escapeHtml(citation.statement)}</p>`;
  const releases = releaseText(
    content,
    content.rule_releases.map((release) => release.release_no),
  );
  const schedule = table(
    `[3] Line schedule: ${counted(pattern.lines, 'line')} on ${counted(pattern.claims, 'claim')}`,
    ['Row', 'Claim control number', 'Patient', 'Member ID', 'Service date', 'Code', 'Modifiers', 'Units', 'Expected', 'Observed', 'Variance'],
    [
      ...lines.map((line) => [
        String(line.row),
        line.claim_control_number,
        line.patient_name,
        line.member_id,
        line.service_date,
        line.procedure_code,
        line.modifiers.join(' '),
        line.units,
        usd(line.expected_cents),
        usd(line.observed_cents),
        usd(line.variance_cents),
      ]),
      ['Total', '', '', '', '', '', '', pattern.units, usd(pattern.expected_cents), usd(pattern.observed_cents), usd(pattern.variance_cents)],
    ],
    { code: [1, 6, 7], id: [2, 4], date: [5], amount: [8, 9, 10, 11] },
  );
  const evidence = content.evidence.map((_item, index) => {
    const marker = content.sources.find((source) => source.kind === 'evidence' && source.evidence_index === index)?.marker;
    return `<li>${marker === undefined ? '' : `[${String(marker)}] `}${escapeHtml(evidenceLabel(content, index))}</li>`;
  });
  const paragraphs = narrativeParagraphs(narrative)
    .map((paragraph) => `<p>${escapeWithFigures(paragraph)}</p>`)
    .join('');
  const approval = `Approved for submission by ${practice.name} on ${payerCopy.approvedOn}, reference ${payerCopy.reference}.`;
  const correspondence = `Correspondence about this dispute: ${correspondenceText(payerCopy.contact)}.`;
  return brandedDocument(
    {
      title: 'Payment dispute',
      kicker: 'Payment dispute',
      heading: 'Request to reprocess underpaid claims',
      practiceName: practice.name,
      meta: [`To ${addressee}`, `Dispute level ${String(content.dispute_level)}; prepared ${content.as_of}`, `Reference ${payerCopy.reference}`],
      reference: `Reference ${payerCopy.reference}`,
      reconciliation,
      // The practice's own letter to its payer: its name leads, not the vendor's.
      whiteLabel: { firmName: practice.name },
    },
    STYLE,
    `<h1>Request to reprocess underpaid claims</h1>
${identification}
<h2>${citation.kind === 'contract' ? 'Contract citation' : 'Regulation cited'}</h2>
${cited}
<p>[2] ${escapeHtml(releases)}</p>
<h2>Pattern statement</h2>
<div class="narrative">${paragraphs}</div>
<h2>Line schedule</h2>
${schedule}
${content.format === 'tp-packet/2' ? disputeWindowSection(content, required(words)) : ''}
${interestSection(content)}
<h2>Evidence</h2>
<ul>${evidence.join('')}</ul>
<h2>Requested action</h2>
<p>${escapeWithFigures(content.requested_action)}</p>
<h2>Approval and correspondence</h2>
<p>${escapeHtml(approval)}</p>
<p>${escapeHtml(correspondence)}</p>`,
  );
}
