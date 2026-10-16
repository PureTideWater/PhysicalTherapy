import { type FigureCheck, type LedgerEntry, type StatementCheck, type StoredStatement, ratioText } from '@tp/ledger';
import { type Cents, formatUsd } from '@tp/money';

import { escapeHtml } from '../report/html';

/**
 * The ROI statement as one self-contained HTML document, which the statement job prints to PDF with
 * Chromium (PRD 13, ROI statement; PRD 5, J12; PRD 15, Documents: "Playwright and Chromium for PDF
 * export of reports and packets, in the worker only"). Each figure carries its stage label and the
 * entries it sums beneath it (opaque entry and case IDs, stages, amounts and the dates the money moved),
 * so the statement recomputes from the ledger; "recovered" names only the proof level's cash, net of
 * recoupments and reversals; the proof level is stated, and a practice that cannot supply deposit data
 * is told its recovered is proved by posting. Fees are billing's: none are recorded yet, so no ratio is
 * given. No claim number, patient or service date appears. Nothing loads from outside the document.
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
}

const STYLE = `
  @page { size: Letter; }
  * { box-sizing: border-box; }
  body { font-family: "Helvetica Neue", Arial, sans-serif; font-size: 10pt; color: #111; margin: 0; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  h2 { font-size: 12.5pt; margin: 18pt 0 6pt; border-bottom: 1px solid #999; padding-bottom: 2pt; }
  p { margin: 4pt 0; }
  .pins { color: #444; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; margin: 4pt 0 8pt; font-size: 8.5pt; }
  caption { text-align: left; font-weight: bold; padding: 2pt 0; }
  th, td { border: 1px solid #bbb; padding: 3pt 4pt; text-align: left; vertical-align: top; }
  th { background: #eee; }
  td.amount, th.amount { text-align: right; }
  .empty { color: #555; font-style: italic; }
  footer { margin-top: 18pt; font-size: 8pt; color: #444; border-top: 1px solid #999; padding-top: 4pt; }
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
    ? 'Recovered is proved by deposit: cash the bank export shows deposited against the remittance, net of recoupments and reversals.'
    : 'Recovered is proved by posting: this practice supplies no deposit data, so recovered is cash its posting export shows posted against the remittance, net of recoupments and reversals.';
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
  return `<table><caption>${escapeHtml(caption)}</caption><thead><tr><th scope="col">Entry</th><th scope="col">Case</th><th scope="col">Stage</th><th scope="col">Money moved</th><th scope="col" class="amount">Amount</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function figure(title: string, note: string, check: FigureCheck, empty: string): string {
  return `<h2>${escapeHtml(title)}: ${escapeHtml(usd(check.storedCents))}</h2>
  <p>${escapeHtml(note)} ${escapeHtml(check.matches ? `Its ${String(check.entries.length)} linked entries give ${usd(check.recomputedCents)}.` : `Its linked entries give ${usd(check.recomputedCents)}, not the figure stored.`)}</p>
  ${entryTable(`Entries of ${title.toLowerCase()}`, check.entries, empty)}`;
}

export function statementHtml(document: StatementDocument): string {
  const { statement, check } = document;
  const ratio = ratioText(statement.recoveredCents, statement.feesCents);
  const cases = statement.links.actionableOpen;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>ROI statement</title><style>${STYLE}</style></head>
<body>
  <h1>ROI statement, ${escapeHtml(statement.periodFrom)} to ${escapeHtml(statement.periodTo)}</h1>
  <p>${escapeHtml(document.practiceName)}</p>
  <p class="pins">Statement ${escapeHtml(document.statementId)}; generated ${escapeHtml(document.generatedAt)} UTC ${escapeHtml(document.generatedBy === null ? 'as the quarterly statement, by the reconcile job' : `on demand by ${document.generatedBy}`)}. Every figure is the sum of the ledger entries listed beneath it; an entry is never changed, and a correction is an entry of its own.</p>
  <p>${escapeHtml(proofLevelText(statement.proofLevel))}</p>
  <h2>Fees paid to the product: ${escapeHtml(usd(statement.feesCents))}</h2>
  <p>${escapeHtml(
    ratio === null
      ? 'Billing records no fees paid in the period, so no ratio of recovered to fees is given.'
      : `Net recovered is ${ratio} times the fees paid in the period.`,
  )}</p>
  ${figure('Recovered principal, net', 'Cash at the proof level whose money moved in the period, less recoupments and reversals; payer approved and interest are never in it.', check.recovered, 'No cash was recovered in the period.')}
  ${figure('Interest, net', 'Interest the payer paid in the period, shown apart from recovered principal.', check.interest, 'No interest was paid in the period.')}
  ${figure('Payer approved, not yet at the proof level', 'Approved by the end of the period and not yet posted or deposited as the proof level needs: its own stage, never summed into recovered.', check.approvedUnposted, 'Nothing approved is waiting to be posted.')}
  <h2>Actionable in open cases: ${escapeHtml(usd(statement.actionableOpenCents))}</h2>
  <p>${escapeHtml(cases.length === 0 ? 'No case was open when the statement was generated.' : `The actionable totals of ${String(cases.length)} open ${cases.length === 1 ? 'case' : 'cases'} when the statement was generated: ${cases.join(', ')}.`)}</p>
  <h2>Pursuit hours logged: ${escapeHtml(statement.pursuitHours)}</h2>
  <p>${escapeHtml('Hours the cases’ time log records for the period; no time log is kept yet.')}</p>
  <footer>Amounts are computed in integer cents from the ledger; no figure adds two stages together.</footer>
</body></html>`;
}
