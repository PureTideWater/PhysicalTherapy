import { type FigureCheck, type LedgerEntry, type ReportReconciliation, type StatementCheck, type StoredStatement, ratioText } from '@tp/ledger';
import { type Cents, formatUsd } from '@tp/money';

import { brandedDocument, figureColumns } from '../report/brand';
import { escapeHtml, escapeWithFigures } from '../report/escape';
import { NO_RECOVERED_CASH, RECOVERED_PRINCIPAL_LABELS } from '../report/recovered-words';

/**
 * The ROI statement as one self-contained HTML document, which the statement job prints to PDF with
 * Chromium (PRD 13, ROI statement; PRD 5, J12; PRD 15, Documents: "Playwright and Chromium for PDF
 * export of reports and packets, in the worker only"). Each figure carries its stage label and the
 * entries it sums beneath it (opaque entry and case IDs, stages, amounts and the dates the money moved),
 * so the statement recomputes from the ledger; "recovered" names only the proof level's cash, net of
 * recoupments and reversals; the proof level is stated, and a practice that cannot supply deposit data
 * is told its recovered is proved by posting. Fees are billing's: none are recorded yet, so no ratio is
 * given. No claim number, patient or service date appears. Nothing loads from outside the document. It is
 * set in the PaidWhole report frame (report/brand.ts): the seal and its definition print on the cover only
 * when the ledger says the recovered total reconciles to cash (`reconciliation`, from reportReconciliation).
 */

export interface StatementDocument {
  readonly statementId: string;
  readonly practiceName: string;
  readonly statement: StoredStatement;
  readonly check: StatementCheck;
  /** Who generated it: a person's email, or null for the quarterly statement (the reconcile job). */
  readonly generatedBy: string | null;
  /** UTC, ISO 8601. */
  readonly generatedAt: string;
  /** The Verified gate's answer for this statement, from the ledger (reportReconciliation; docs/adr/0057). */
  readonly reconciliation: ReportReconciliation;
}

// The template's own pieces, in tokens (the frame's stylesheet sets the type, tables, colors and figure-amount).
const STYLE = `
  h2 { border-bottom: 1px solid var(--pw-line); padding-bottom: 3pt; }
  .pins { color: var(--pw-slate); font-size: 9pt; }
  table { margin: 4pt 0 8pt; font-size: 8.5pt; }
  .empty { color: var(--pw-slate); font-style: italic; }
  footer { margin-top: 18pt; font-size: 8pt; color: var(--pw-slate); border-top: 1px solid var(--pw-line); padding-top: 4pt; }
`;

const usd = (value: Cents) => formatUsd(value);

const STAGE_WORDS: Readonly<Record<string, string>> = {
  approved: 'Payer approved',
  posted: 'Posted',
  deposited: 'Deposited',
  recouped: 'Recouped',
  reversed: 'Reversed',
  adjusted: 'Adjusted',
  interest: 'Interest',
};

/** The words for the proof level (PRD 13, Matching step 3: "practices that cannot supply deposit data set their proof level to posted and the ROI statement says so"). */
export function proofLevelText(proofLevel: StoredStatement['proofLevel']): string {
  return proofLevel === 'deposited'
    ? 'Recovered (deposited) is proved by deposit: cash the bank export shows deposited against the remittance, net of recoupments and reversals.'
    : 'Recovered (posted) is proved by posting: this practice supplies no deposit data, so recovered is cash its posting export shows posted against the remittance, net of recoupments and reversals.';
}

function entryTable(caption: string, entries: readonly LedgerEntry[], empty: string): string {
  if (entries.length === 0) {
    return `<p class="empty">${escapeHtml(empty)}</p>`;
  }
  const rows = entries
    .map(
      (entry) =>
        `<tr><td>${escapeHtml(entry.id)}</td><td>${escapeHtml(entry.caseId)}</td><td>${escapeHtml(STAGE_WORDS[entry.stage] ?? entry.stage)}${entry.allocated ? ' (allocated pro rata)' : ''}</td><td>${escapeHtml(entry.effectiveOn)}</td><td class="amount">${escapeHtml(usd(entry.amountCents))}</td></tr>`,
    )
    .join('');
  return `<table${figureColumns({ id: [1, 2], date: [4] })}><caption>${escapeHtml(caption)}</caption><thead><tr><th scope="col">Entry</th><th scope="col">Case</th><th scope="col">Stage</th><th scope="col">Money moved</th><th scope="col" class="amount">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function figure(title: string, note: string, check: FigureCheck, empty: string): string {
  return `<h2>${escapeHtml(title)}: <span class="figure-amount">${escapeHtml(usd(check.storedCents))}</span></h2>
  <p>${escapeHtml(note)} ${escapeWithFigures(check.matches ? `Its ${String(check.entries.length)} linked entries give ${usd(check.recomputedCents)}.` : `Its linked entries give ${usd(check.recomputedCents)}, not the figure stored.`)}</p>
  ${entryTable(`Entries of ${title.toLowerCase()}`, check.entries, empty)}`;
}

export function statementHtml(document: StatementDocument): string {
  const { statement, check } = document;
  // The recovered figure names its proof level, so "recovered" never stands without posted or deposited.
  const recovered = RECOVERED_PRINCIPAL_LABELS[statement.proofLevel];
  const ratio = ratioText(statement.recoveredCents, statement.feesCents);
  const cases = statement.links.actionableOpen;
  const generated = `Generated ${document.generatedAt} UTC ${document.generatedBy === null ? 'as the quarterly statement, by the reconcile job' : `on demand by ${document.generatedBy}`}`;
  return brandedDocument(
    {
      title: 'ROI statement',
      kicker: 'Recovery and return',
      heading: 'ROI statement',
      subheading: `${statement.periodFrom} to ${statement.periodTo}`,
      practiceName: document.practiceName,
      meta: [`Statement ${document.statementId}`, generated, `Proof level: ${statement.proofLevel}`],
      reference: `Statement ${document.statementId}`,
      reconciliation: document.reconciliation,
    },
    STYLE,
    `<p class="pins">Statement ${escapeHtml(document.statementId)}; generated ${escapeHtml(document.generatedAt)} UTC ${escapeHtml(document.generatedBy === null ? 'as the quarterly statement, by the reconcile job' : `on demand by ${document.generatedBy}`)}. Every figure is the sum of the ledger entries listed beneath it; an entry is never changed, and a correction is an entry of its own.</p>
  <p>${escapeHtml(proofLevelText(statement.proofLevel))}</p>
  <h2>Fees paid to PaidWhole: <span class="figure-amount">${escapeHtml(usd(statement.feesCents))}</span></h2>
  <p>${escapeHtml(
    ratio === null
      ? 'Billing records no fees paid in the period, so no ratio to the fees is given.'
      : `${recovered} is ${ratio} times the fees paid in the period.`,
  )}</p>
  ${figure(recovered, 'Cash at the proof level whose money moved in the period, less recoupments and reversals; payer approved and interest are never in it.', check.recovered, NO_RECOVERED_CASH[statement.proofLevel])}
  ${figure('Interest, net', 'Interest the payer paid in the period, shown apart from principal.', check.interest, 'No interest was paid in the period.')}
  ${figure('Payer approved, not yet at the proof level', 'Approved by the end of the period and not yet posted or deposited as the proof level needs: its own stage, never summed into recovered (posted or deposited).', check.approvedUnposted, 'Nothing approved is waiting to be posted.')}
  <h2>Actionable in open cases: <span class="figure-amount">${escapeHtml(usd(statement.actionableOpenCents))}</span></h2>
  <p>${escapeHtml(cases.length === 0 ? 'No case was open when the statement was generated.' : `The actionable totals of ${String(cases.length)} open ${cases.length === 1 ? 'case' : 'cases'} when the statement was generated: ${cases.join(', ')}.`)}</p>
  <h2>Pursuit hours logged: <span class="figure-amount">${escapeHtml(statement.pursuitHours)}</span></h2>
  <p>${escapeHtml('Hours the cases’ time log records for the period; no time log is kept yet.')}</p>
  <footer>Amounts are computed in integer cents from the ledger; no figure adds two stages together.</footer>`,
  );
}
