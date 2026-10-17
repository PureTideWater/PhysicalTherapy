import { DEFAULT_PROOF_LEVEL, type ReportReconciliation, reportReconciliation } from '@tp/ledger';
import { formatUsd, parseCents } from '@tp/money';
import { EVIDENCE_GAP_CODES, type EvidenceGapCode, type ExportedPacket } from '@tp/packets';

import { type FigureColumns, brandedDocument, figureColumns } from '../report/brand';
import { escapeHtml, escapeWithFigures } from '../report/escape';

/**
 * A packet as one self-contained HTML document, which the worker prints to PDF with Chromium (PRD 15,
 * Documents: "Playwright and Chromium for PDF export of reports and packets, in the worker only"; PRD
 * 12, The packet): the practice and payer, the contract citation and the rule release, the pattern
 * statement (the approved narrative, identifiers inserted), the line schedule with each line's trace
 * reference, interest as its own line (never inside expected), the evidence list with its gaps, the
 * requested action, and the approval record (who, when, the version's hash, and the audit flag of a
 * single-user approval). It is the export, so it carries the identifiers inserted at export: it is
 * stored sealed with the practice's key. Nothing loads from outside the document. It is set in the report
 * frame's type and tokens (report/brand.ts) as the practice's own correspondence: the practice submits it to
 * its payer through its own channel, so the practice's name leads the cover and the running header (the
 * frame's white-label slot) and PaidWhole's lockup and name are not on it (docs/adr/0054). A packet states
 * no recovered total, so it never earns the seal or the badge.
 */

export interface ApprovalRecord {
  readonly versionNo: number;
  readonly versionSha256: string;
  readonly draftedBy: string | null;
  readonly approvedBy: string | null;
  /** ISO timestamp. */
  readonly approvedAt: string;
  readonly approvedAlone: boolean;
  readonly regulationConfirmedBy: string | null;
}

const usd = (value: string) => formatUsd(parseCents(value));

const GAP_TEXT: Readonly<Record<EvidenceGapCode, string>> = {
  interest_rate_unknown: 'The state rule record states no interest rate: interest cannot be computed until it does.',
  interest_business_days: 'The state rule counts business days, and holidays are not in the record: interest cannot be computed.',
  prompt_pay_rule_missing: 'The rule release holds no prompt-pay rule for the state named: interest cannot be computed.',
  prompt_pay_rule_not_in_effect: 'The prompt-pay rule was not in effect when the payer received this claim.',
  claim_received_date_unknown: 'The remittance does not say when the payer received this claim: its interest cannot be computed.',
  contract_document_hash_unknown: 'The cited contract document has no stored SHA-256.',
};

/** What an evidence gap says in the export. */
export function gapText(code: EvidenceGapCode): string {
  return GAP_TEXT[code];
}

/** Every gap code (for the tests: each has its sentence). */
export const GAP_CODES = EVIDENCE_GAP_CODES;

/** A table; `figures` names its columns (1-based) of codes and of amounts or counts, set in the mono face. */
function table(caption: string, headers: readonly string[], rows: readonly (readonly string[])[], figures: FigureColumns = {}): string {
  const head = headers.map((header) => `<th scope="col">${escapeHtml(header)}</th>`).join('');
  const body = rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
  return `<table${figureColumns(figures)}><caption>${escapeHtml(caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * The Verified gate for a packet (docs/adr/0055): a dispute packet asks for money and states no recovered
 * total, so reportReconciliation finds none and the seal never prints on it.
 */
export function packetReconciliation(approval: ApprovalRecord): ReportReconciliation {
  return reportReconciliation({ report: { kind: 'packet_version', id: approval.versionSha256 }, proofLevel: DEFAULT_PROOF_LEVEL, statedRecoveredCents: null, recoveredEntryIds: [], ledger: new Map() });
}

// The template's own pieces, in tokens (the frame's stylesheet sets the type, tables and colors).
const STYLE = `
  h2 { border-bottom: 1px solid var(--pw-line); padding-bottom: 3pt; }
  .meta { color: var(--pw-slate); font-size: 9pt; }
  blockquote { margin: 4pt 0 4pt 12pt; padding-left: 8pt; border-left: 2px solid var(--pw-border-strong); font-style: italic; }
  table { margin: 4pt 0 8pt; font-size: 8pt; }
  .narrative p { margin: 0 0 6pt; }
  .flag { font-weight: 600; }
  footer { margin-top: 16pt; font-size: 8pt; color: var(--pw-slate); border-top: 1px solid var(--pw-line); padding-top: 4pt; }
`;

export function packetHtml(exported: ExportedPacket, approval: ApprovalRecord, reconciliation: ReportReconciliation = packetReconciliation(approval)): string {
  const { content, lines, narrative } = exported;
  const { citation, practice, payer, pattern, interest } = content;
  const identification = [
    `<p><strong>From:</strong> ${escapeHtml(practice.name)}${practice.npi === null ? '' : `, NPI ${escapeHtml(practice.npi)}`}${practice.tax_id_last4 === null ? '' : `, tax ID ending ${escapeHtml(practice.tax_id_last4)}`}</p>`,
    `<p><strong>To:</strong> ${escapeHtml(payer.name)} (${escapeHtml(payer.payer_id_raw)}), plan ${escapeHtml(payer.plan_name ?? payer.plan_key)}</p>`,
    `<p class="meta">Dispute level ${String(content.dispute_level)}; prepared ${escapeHtml(content.as_of)}.</p>`,
  ].join('');
  const cited =
    citation.kind === 'contract'
      ? [
          `<p>[1] ${escapeHtml(citation.contract_title)}, version ${String(citation.version_no)} (effective ${escapeHtml(citation.effective_from)}${citation.effective_to === null ? '' : ` to ${escapeHtml(citation.effective_to)}`}), document ${escapeHtml(citation.document_id)}, page ${String(citation.page)}:</p>`,
          `<blockquote>${escapeHtml(citation.quote)}</blockquote>`,
          `<p class="meta">Page text SHA-256 ${escapeHtml(citation.page_sha256)}${citation.document_sha256 === null ? '' : `; document SHA-256 ${escapeHtml(citation.document_sha256)}`}.</p>`,
        ].join('')
      : `<p>[1] ${escapeHtml(citation.reference)}: ${escapeHtml(citation.statement)}</p>`;
  const releases = content.rule_releases.map((release) => `Rule release ${String(release.release_no)} (manifest SHA-256 ${release.manifest_sha256})`).join('; ');
  const schedule = table(
    `[3] Line schedule: ${String(pattern.lines)} lines on ${String(pattern.claims)} claims`,
    ['Row', 'Claim control number', 'Patient control number', 'Patient', 'Member ID', 'Service date', 'Code', 'Modifiers', 'Units', 'Expected', 'Observed', 'Variance', 'Trace'],
    [
      ...lines.map((line) => [
        String(line.row),
        line.claim_control_number,
        line.patient_control_number,
        line.patient_name,
        line.member_id,
        line.service_date,
        line.procedure_code,
        line.modifiers.join(' '),
        line.units,
        usd(line.expected_cents),
        usd(line.observed_cents),
        usd(line.variance_cents),
        line.trace_ref,
      ]),
      ['', '', '', '', '', '', '', '', pattern.units, usd(pattern.expected_cents), usd(pattern.observed_cents), usd(pattern.variance_cents), 'Total'],
    ],
    { code: [1, 2, 3, 5, 7, 8, 13], date: [6], amount: [9, 10, 11, 12] },
  );
  const interestSection =
    interest === null
      ? ''
      : [
          `<h2>[4] Prompt-pay interest (its own line, not part of the variance)</h2>`,
          `<p>State ${escapeHtml(interest.state)}${interest.statute === null ? '' : `, ${escapeHtml(interest.statute)}`}: ${interest.days_to_pay === null ? 'no rule on file' : `payment due ${String(interest.days_to_pay)} ${escapeHtml(interest.day_basis ?? '')} days after the payer received the claim`}${interest.annual_rate_percent === null ? '' : `, interest at ${escapeHtml(interest.annual_rate_percent)}% a year`} (rule release ${String(interest.release_no)}).</p>`,
          interest.exclusions.length === 0 ? '' : `<p>The rule does not apply to: ${escapeHtml(interest.exclusions.join(', '))}.</p>`,
          table(
            'Interest by line',
            ['Row', 'Received', 'Due', 'Paid', 'Days late', 'Days unpaid to date', 'Interest'],
            interest.lines.map((line) => [
              String(line.row),
              line.received_on ?? 'not stated',
              line.due_on ?? '',
              line.paid_on,
              line.days_late === null ? '' : String(line.days_late),
              line.days_unpaid === null ? '' : String(line.days_unpaid),
              line.interest_cents === null ? 'cannot be computed' : usd(line.interest_cents),
            ]),
            { code: [1], date: [2, 3, 4], amount: [5, 6, 7] },
          ),
          `<p><strong>Interest ${interest.computed ? '' : 'that can be computed '}in all: ${interest.total_cents === null ? 'cannot be computed' : escapeWithFigures(usd(interest.total_cents))}</strong></p>`,
        ].join('');
  const evidence = content.evidence.map((item, index) => {
    const marker = content.sources.find((source) => source.kind === 'evidence' && source.evidence_index === index)?.marker;
    return `<li>${marker === undefined ? '' : `[${String(marker)}] `}${escapeHtml(item.label)}${item.document_id === null ? '' : ` (document ${escapeHtml(item.document_id)})`}${item.sha256 === null ? '' : `, SHA-256 ${escapeHtml(item.sha256)}`}</li>`;
  });
  const gaps = content.evidence_gaps.map((gap) => `<li>${gap.row === null ? '' : `Row ${String(gap.row)}: `}${escapeHtml(GAP_TEXT[gap.code])}</li>`);
  const approvalRecord = [
    `<p>Version ${String(approval.versionNo)}, SHA-256 ${escapeHtml(approval.versionSha256)}.</p>`,
    `<p>Written by ${escapeHtml(approval.draftedBy ?? 'a person of the practice')}; approved by ${escapeHtml(approval.approvedBy ?? 'a person of the practice')} at ${escapeHtml(approval.approvedAt)}.</p>`,
    approval.regulationConfirmedBy === null ? '' : `<p>The regulation's application to this case was confirmed by contract specialist ${escapeHtml(approval.regulationConfirmedBy)}.</p>`,
    approval.approvedAlone
      ? '<p class="flag">Audit flag: approved by the person who wrote it, in a practice with no second person to approve packets, at least 24 hours after it was written.</p>'
      : '',
  ].join('');
  const paragraphs = narrative
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim() !== '')
    .map((paragraph) => `<p>${escapeWithFigures(paragraph.trim())}</p>`)
    .join('');
  return brandedDocument(
    {
      title: 'Payment dispute',
      kicker: 'Payment dispute',
      heading: 'Request to reprocess underpaid claims',
      practiceName: practice.name,
      meta: [`To ${payer.name} (${payer.payer_id_raw}), plan ${payer.plan_name ?? payer.plan_key}`, `Dispute level ${String(content.dispute_level)}; prepared ${content.as_of}`, `Version ${String(approval.versionNo)}, SHA-256 ${approval.versionSha256.slice(0, 16)}`],
      reference: `Version ${String(approval.versionNo)}, SHA-256 ${approval.versionSha256.slice(0, 16)}`,
      reconciliation,
      // The practice's own letter to its payer: its name leads, not the vendor's.
      whiteLabel: { firmName: practice.name },
    },
    STYLE,
    `<h1>Request to reprocess underpaid claims</h1>
${identification}
<h2>Contract citation</h2>
${cited}
<p>[2] ${escapeHtml(releases)}</p>
<h2>Pattern statement</h2>
<div class="narrative">${paragraphs}</div>
<h2>Line schedule</h2>
${schedule}
${interestSection}
<h2>Evidence</h2>
<ul>${evidence.join('')}</ul>
${gaps.length === 0 ? '' : `<p><strong>Evidence gaps</strong></p><ul>${gaps.join('')}</ul>`}
<h2>Requested action</h2>
<p>${escapeWithFigures(content.requested_action)}</p>
<h2>Approval record</h2>
${approvalRecord}
<footer>Every amount in this packet was computed by code from the practice's remittances and the cited contract terms; interest is stated apart from the variance.</footer>`,
  );
}
