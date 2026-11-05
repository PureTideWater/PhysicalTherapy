import type { DocumentStatus } from '@tp/db/runtime';
import { recoveredLabel as ledgerRecoveredLabel } from '@tp/ledger';
import { cents, formatUsd } from '@tp/money';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';
import { Fragment, type ReactNode } from 'react';

import type { BillableView, CorrectionView, MatchView, ReportedInterestView } from '../../lib/reconciliation/queries';
import { Money } from '../remittances/display';

/**
 * Display pieces of the Reconciliation screen and the ROI statements (PRD 7, Reconciliation and
 * Reports; PRD 13): every dollar figure carries its stage's label, "recovered" stands only beside the
 * proof level's cash net of recoupments and reversals, approved and interest are their own figures, and
 * nothing unmatched is in any of them.
 */

/** A ledger entry's stage in words. */
export const ENTRY_STAGE_WORDS: Readonly<Record<string, string>> = {
  approved: 'Payer approved',
  posted: 'Posted',
  deposited: 'Deposited',
  recouped: 'Recouped',
  reversed: 'Reversed',
  adjusted: 'Adjusted',
  interest: 'Interest',
};

export function entryStage(stage: string): string {
  return ENTRY_STAGE_WORDS[stage] ?? stage;
}

/** What an entry's evidence is, in words. */
export const EVIDENCE_WORDS: Readonly<Record<string, string>> = {
  claim: 'remittance claim',
  payer_response: 'payer response',
  posting_row: 'posting export row',
  eft_row: 'bank export row',
  provider_adjustment: 'PLB adjustment',
  ledger_entry: 'the entry it corrects',
};

/**
 * The label of a recovered dollar figure: "Recovered" never stands without posted or deposited
 * (docs/brand/BRAND.md, section 7), so it names the proof level the cash is proved by (@tp/ledger's, which
 * the PDFs use too).
 */
export function recoveredLabel(level: string): string {
  return ledgerRecoveredLabel(level === 'deposited' ? 'deposited' : 'posted');
}

/**
 * The proof level, in the words the ROI statement uses (PRD 13: a practice that cannot supply deposit data says
 * "posted"): the cash it counts, deposited or posted, then what proves it. It follows "cash" or a recovered label, and
 * a screen may set it in parentheses ("$0.00 (cash posted, ...)"), so it holds none of its own.
 */
export function proofLevelWords(level: 'posted' | 'deposited'): string {
  return level === 'deposited' ? 'deposited, proved by the bank export' : 'posted, proved by the posting export, as no deposit data is supplied';
}

export interface TotalsFigures {
  readonly proofLevel: 'posted' | 'deposited';
  readonly approvedCents: string;
  readonly payerApprovedCents: string;
  readonly postedCents: string;
  readonly depositedCents: string;
  readonly recoupedCents: string;
  readonly interestCents: string;
  readonly recoveredCents: string;
}

/** The cash a recovered figure counts, in words, at the proof level: "cash deposited, proved by the bank export, net of recoupments and reversals". */
export function recoveredCashWords(level: 'posted' | 'deposited'): string {
  return `cash ${proofLevelWords(level)}, net of recoupments and reversals`;
}

/**
 * The Payer approved tile's note on Reconciliation, by proof level: short, so the six tiles keep one height (UX-9);
 * its reversal detail is in LEDGER_TOTALS_HELP. The figure is cumulative (an approval stays approved once its cash
 * arrives, and after a takeback), so the note says "to date" and gives the proof level's rule, never a status: "only
 * deposited cash counts as recovered", not "counted as recovered only once it is deposited", which read as money still
 * to come beside a smaller Recovered; the Deposited tile beside it says how much has come. As long as the note it
 * replaced, so the row keeps its height. Each is written out whole for the copy lint.
 */
export const PAYER_APPROVED_NOTE: Readonly<Record<'posted' | 'deposited', string>> = {
  posted: 'what payers agreed to pay to date, never the patient’s share; only posted cash counts as recovered',
  deposited: 'what payers agreed to pay to date, never the patient’s share; only deposited cash counts as recovered',
};

/**
 * The practice home's Payer approved tile's note, by proof level: PAYER_APPROVED_NOTE's terms (to date, never the
 * patient's share, the proof level's rule), and, since no Deposited tile stands beside it, the lines it is on and that
 * it holds what has come as well as what has not; the home's three tiles have room for it.
 */
export const PAYER_APPROVED_HOME_NOTE: Readonly<Record<'posted' | 'deposited', string>> = {
  posted: 'what payers agreed to pay to date on the lines they corrected, posted or not, never the patient’s share; only posted cash counts as recovered',
  deposited: 'what payers agreed to pay to date on the lines they corrected, deposited or not, never the patient’s share; only deposited cash counts as recovered',
};

/** The totals' help beneath the screen's description, by proof level: what Payer approved is net of, moved from its tile's note (UX-9). */
export const LEDGER_TOTALS_HELP: Readonly<Record<'posted' | 'deposited', string>> = {
  posted: 'Payer approved is net of reversals and of what was taken back before it posted.',
  deposited: 'Payer approved is net of reversals and of what was taken back before it was deposited.',
};

/** The ledger's totals, each its own stage; recovered last, with its proof level. */
export function LedgerTotals({ totals, title, description }: { readonly totals: TotalsFigures; readonly title: string; readonly description: string }) {
  const figures: readonly { readonly key: string; readonly label: string; readonly cents: string; readonly note: string }[] = [
    {
      key: 'approved',
      label: 'Payer approved',
      cents: totals.payerApprovedCents,
      note: PAYER_APPROVED_NOTE[totals.proofLevel],
    },
    { key: 'posted', label: 'Posted', cents: totals.postedCents, note: 'posting export rows matched to the remittance' },
    { key: 'deposited', label: 'Deposited', cents: totals.depositedCents, note: 'bank export rows matched to the remittance' },
    { key: 'recouped', label: 'Recouped', cents: totals.recoupedCents, note: 'taken back by PLB WO or a reversal' },
    { key: 'interest', label: 'Interest', cents: totals.interestCents, note: 'paid by the payer, net of any it took back, apart from principal' },
  ];
  return (
    <Card role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description} <span data-help="payer-approved">{LEDGER_TOTALS_HELP[totals.proofLevel]}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {figures.map((figure) => (
            <div key={figure.key} className="rounded-md border p-3" data-figure={figure.key}>
              <dt className="text-xs font-medium text-fg-muted">{figure.label}</dt>
              <dd className="text-lg font-medium">
                <Money value={figure.cents} />
              </dd>
              <dd className="text-xs text-muted-foreground">{figure.note}</dd>
            </div>
          ))}
          <div className="rounded-md border border-border-strong p-3" data-figure="recovered">
            <dt className="text-xs font-medium text-fg-muted">{recoveredLabel(totals.proofLevel)}</dt>
            <dd className="text-lg font-medium">
              <Money value={totals.recoveredCents} />
            </dd>
            <dd className="text-xs text-muted-foreground">{recoveredCashWords(totals.proofLevel)}</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/**
 * An interest match's words after its remittance (designs/ledger-interest-once.md section 7; docs/adr/0084): a PLB L6's
 * interest paid or taken back in its check, by the sign of the match's own interest entry; an AMT I match written before
 * the interest fix (development data only) keeps its words.
 */
export function interestWords(match: Pick<MatchView, 'source' | 'takesBack'>): string {
  if (match.source !== 'plb') {
    return ': the claim’s interest';
  }
  return match.takesBack ? ': interest taken back in this check (PLB L6)' : ': interest paid in this check (PLB L6)';
}

/**
 * Under a line's Interest list: each remittance in which the claims of a chain the line is matched to report interest
 * (AMT I) netting to other than zero, as reported and counted nowhere, then once what is counted (docs/adr/0084). Nothing
 * when no chain reports any.
 */
export function ReportedInterest({ rows }: { readonly rows: readonly ReportedInterestView[] }) {
  if (rows.length === 0) {
    return null;
  }
  return (
    <div className="flex flex-col gap-1" data-reported-interest={rows.length}>
      <ul className="flex flex-col gap-1">
        {rows.map((row, index) => (
          <li key={`${row.remittanceId}-${String(index)}`} className="text-sm" data-reported={row.takenBack ? 'taken-back' : 'paid'} data-cents={row.amountCents}>
            Remittance <span className="font-mono">{row.trace}</span>, {row.payerName}, paid {row.paidOn}: the claim reports <Money value={row.amountCents} /> of interest
            {row.takenBack ? ' taken back' : ''} (AMT I).
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground" data-reported-note="">
        Interest is counted only as a check pays it or takes it back (PLB L6), in the list above.
      </p>
    </div>
  );
}

/** What became of an uploaded export, by its document's status. */
const EXPORT_STATUS_TEXT: Readonly<Partial<Record<DocumentStatus, string>>> = {
  loaded: 'Read into rows and reconciled',
  unreadable: 'Could not be read with the template: no row was stored',
  duplicate: 'The same file as an export already uploaded: nothing read again',
  quarantined: 'Quarantined by the malware scan',
  wrong_type: 'Not a CSV export: save a spreadsheet as CSV, or check this is the right file',
  failed: 'Intake failed; retry it from Uploads',
};

/** What became of an uploaded export. */
export function exportStatusText(status: DocumentStatus, kind: 'posting_export' | 'eft_export', templateMapped: boolean): string {
  if (status === 'stored') {
    return kind === 'posting_export' && !templateMapped ? 'Waiting for the practice’s posting template' : 'Stored; waiting for the reconcile';
  }
  return EXPORT_STATUS_TEXT[status] ?? 'Being taken in';
}

export function KindBadge({ kind }: { readonly kind: 'posting_export' | 'eft_export' }) {
  return <Badge variant="outline">{kind === 'posting_export' ? 'Posting export' : 'EFT or bank export'}</Badge>;
}

const OUTCOME_WORDS = { approved: 'higher allowed: approved', decreased: 'lower allowed: approval taken back', no_change: 'no change' } as const;

/** A match's outcome against its case line, in words. */
export function outcomeWords(outcome: keyof typeof OUTCOME_WORDS | null): string {
  return outcome === null ? '' : OUTCOME_WORDS[outcome];
}

/** How the allowed amount moved against the baseline the outcome was decided on, as the decreased words name it. */
const ALLOWED_WORDS = { higher: 'higher allowed', same: 'same allowed', lower: 'lower allowed' } as const;

/**
 * A standing claim match's outcome in words, in payment terms (PRD 13, Matching step 1; docs/adr/0067): the outcome is
 * decided on the allowed amount and every amount is the payer's cash, so the words name both where they differ. An
 * approval says what the payer pays more (a confirmation of a payer response's acceptance too); a correction that pays
 * nothing more says whose it is; a decrease says which way the allowed amount moved and whether anything was taken
 * back. A match the payment reading does not cover (a reversed one) keeps its outcome's words.
 */
export function correctionWords(match: Pick<MatchView, 'outcome' | 'reading' | 'allowed' | 'paymentIncreaseCents'>): ReactNode {
  const { reading, allowed } = match;
  if (reading === null || allowed === null) {
    return outcomeWords(match.outcome);
  }
  switch (reading) {
    case 'approved':
    case 'confirmed':
      return (
        <>
          {OUTCOME_WORDS.approved}; the payer pays <Money value={match.paymentIncreaseCents} /> more
        </>
      );
    case 'patient_balance':
      return 'higher allowed: payer corrected; balance is the patient’s';
    case 'other_reductions':
      return 'higher allowed: payer corrected; it pays nothing more (other reductions)';
    case 'taken_back':
      return allowed === 'lower' ? OUTCOME_WORDS.decreased : `${ALLOWED_WORDS[allowed]}, lower payment: approval taken back`;
    case 'nothing_to_take_back':
      return `${ALLOWED_WORDS[allowed]}, lower payment: nothing approved to take back`;
    case 'payment_did_not_fall':
      return 'lower allowed: nothing taken back, the payment did not fall';
    case 'no_change':
      return OUTCOME_WORDS.no_change;
  }
}

/** A signed amount, its sign inside the mono figure (docs/brand/BRAND.md: every money figure is mono): "+$6.00", or "−$10.00" with the minus sign. */
function Signed({ cents: text }: { readonly cents: string }) {
  const negative = text.startsWith('-');
  return (
    <span className="font-mono tabular-nums">
      {negative ? '−' : '+'}
      {formatUsd(cents(BigInt(negative ? text.slice(1) : text)))}
    </span>
  );
}

/** A non-breaking space, so a reason and its amount never break apart ("coinsurance +$6.00" at 390 px). */
const NBSP = '\u00a0';

const REASON_WORDS: readonly (readonly [keyof NonNullable<BillableView['reasons']>, string])[] = [
  ['deductible', 'deductible'],
  ['coinsurance', 'coinsurance'],
  ['copay', 'copay'],
  ['other', 'other patient share'],
];

/** The reasons whose share changed, each signed ("coinsurance +$16.00, deductible −$10.00"); "the patient’s share" for a reader who does not read PHI. */
function ShareReasons({ reasons }: { readonly reasons: BillableView['reasons'] }) {
  if (reasons === null) {
    return <>the patient’s share</>;
  }
  const changed = REASON_WORDS.filter(([key]) => reasons[key] !== '0');
  return (
    <>
      {changed.map(([key, word], index) => (
        <span key={key}>
          {index === 0 ? '' : ', '}
          {word}
          {NBSP}
          <Signed cents={reasons[key]} />
        </span>
      ))}
    </>
  );
}

/**
 * The reasons whose share rose, by name ("deductible", "deductible and copay"), or "share" for a reader who does not
 * read PHI, or when any reason fell (the signed reasons beside it say which).
 */
function roseWords(reasons: BillableView['reasons']): string {
  if (reasons === null) {
    return 'share';
  }
  const changed = REASON_WORDS.filter(([key]) => reasons[key] !== '0');
  if (changed.some(([key]) => reasons[key].startsWith('-'))) {
    return 'share';
  }
  return changed.length === 0 ? 'share' : changed.map(([, word]) => word).join(' and ');
}

function Allocation({ billable }: { readonly billable: BillableView }) {
  return billable.allocation === null ? null : (
    <>
      {' '}
      The payer reported the patient’s share for the whole claim; it is split to this line by {billable.allocation.basis === 'allowed' ? 'allowed amount' : 'charge'} (
      <Money value={billable.allocation.lineWeightCents} /> of <Money value={billable.allocation.claimWeightCents} />
      ).
    </>
  );
}

/** What to do with a correction the patient's share took (UX-3): on the line's words and the case's Packet and dispute card. */
export const PATIENT_BALANCE_NEXT_STEP = 'Bill the balance to the patient in the practice-management system; a packet would ask the payer for what it has already allowed.';

const isNegative = (text: string): boolean => text.startsWith('-');
const isPositive = (text: string): boolean => text !== '0' && !isNegative(text);
const magnitude = (text: string): string => (isNegative(text) ? text.slice(1) : text);

/**
 * Whether a pays-nothing-more correction's figures run across more than one correction: they run from the original
 * claim's line, while its kind is read from the latest match alone, whose payment increase is never above zero and
 * whose share rose ("patient_balance") or did not ("other_reductions"; patient-share.ts readingOf). A payment above
 * zero, or a share that moved the other way, came from an earlier correction (RX2-3).
 */
function spansCorrections(kind: NonNullable<CorrectionView['kind']>, billable: BillableView): boolean {
  if (isPositive(billable.paymentIncreaseCents)) {
    return true;
  }
  return kind === 'other_reductions' ? isPositive(billable.shareChangeCents) : !isPositive(billable.shareChangeCents);
}

/**
 * The allowed amount's change and every part it is made of, so the amounts add up: the allowed increase is the payer's
 * payment, plus the patient's share, plus the payer's other reductions, a part below zero in words ("fell by"), never a
 * bare minus (RX2-1, RX2-2, RX2-4). Across corrections the figures are cumulative, and the words say so, the payment
 * already in the ledger (RX2-3). "Took all of it" only when the patient's share is the whole increase (UX-1).
 */
function AllowedSum({ billable, cumulative, shareNote = '' }: { readonly billable: BillableView; readonly cumulative: boolean; readonly shareNote?: string }) {
  const { allowedIncreaseCents: allowed, paymentIncreaseCents: paid, shareChangeCents: share, otherReductionCents: other } = billable;
  const parts: ReactNode[] = [];
  if (isPositive(allowed) && share === allowed && paid === '0' && other === '0') {
    parts.push(<>the patient’s {roseWords(billable.reasons)} took all of it</>);
  } else {
    if (isPositive(share)) {
      parts.push(
        <>
          <Money value={share} /> is the patient’s share{shareNote}
        </>,
      );
    } else if (isNegative(share)) {
      parts.push(
        <>
          the patient’s share fell by <Money value={magnitude(share)} />
        </>,
      );
    }
    if (isPositive(other)) {
      parts.push(
        <>
          <Money value={other} /> was reduced by the payer for other reasons, not billable
        </>,
      );
    } else if (isNegative(other)) {
      parts.push(
        <>
          the payer’s other reductions fell by <Money value={magnitude(other)} />
        </>,
      );
    }
  }
  return (
    <>
      {cumulative ? 'Across its corrections the payer' : 'The payer'}{' '}
      {isNegative(allowed) ? (
        <>
          lowered the allowed amount by <Money value={magnitude(allowed)} />
        </>
      ) : (
        <>
          raised the allowed amount by <Money value={allowed} />
        </>
      )}
      {paid === '0' ? (
        ' and pays nothing more'
      ) : isNegative(paid) ? (
        <>
          , and its payment fell by <Money value={magnitude(paid)} />
          {cumulative ? ' (in the ledger)' : ''}
        </>
      ) : (
        <>
          {' '}
          and pays <Money value={paid} /> of it{cumulative ? ' (already in the ledger)' : ''}
        </>
      )}
      {parts.length === 0 ? (
        '.'
      ) : (
        <>
          :{' '}
          {parts.map((part, index) => (
            <Fragment key={index}>
              {index === 0 ? '' : ', and '}
              {part}
            </Fragment>
          ))}
          .
        </>
      )}
    </>
  );
}

/** Whether a correction that paid nothing more wrote an entry: never, but an earlier correction it is summed with may have (RX2-3). */
function noEntryWords(cumulative: boolean): string {
  return cumulative ? 'This correction writes no ledger entry; counted in no total.' : 'No ledger entry is written; counted in no total.';
}

/**
 * A line's entries table's empty row (UX-8): a correction that paid nothing more says so; any other line has no entry
 * yet.
 */
export function lineEntriesEmptyText(kind: CorrectionView['kind']): string {
  return kind === null ? 'No entry on this line yet.' : 'No entry on this line: the correction paid nothing more.';
}

/**
 * The Exports empty state's next step, true to what the upload panel above shows (PRD baseline: an empty state's next
 * step is one the person can take). The panel says first that this person cannot upload, then that uploads are not
 * open, paused or closed; the step follows the same order, so it never asks for an upload the panel refuses. A closed
 * gate's words hold for each of its states (no agreement yet, paused, closed): none promises that uploads open again.
 */
export function exportsEmptyNextStep(upload: { readonly canUpload: boolean; readonly gate: { readonly open: boolean } }): string {
  if (!upload.canUpload) {
    return 'Billing managers, analysts and firm principals upload the practice-management system’s payment-posting export and the bank’s EFT export.';
  }
  if (!upload.gate.open) {
    return 'No export can be uploaded now; the note above says why.';
  }
  return 'Upload the practice-management system’s payment-posting export and the bank’s EFT export above.';
}

/** Whether the case page shows its "Billable to the patient" Fact (UX-5): something billable, or a line with a correction that paid nothing more. */
export function showsBillableFact(corrections: { readonly billableCents: string; readonly lines: Readonly<Record<string, CorrectionView>> }): boolean {
  return corrections.billableCents !== '0' || Object.values(corrections.lines).some((line) => line.kind !== null);
}

/**
 * What a case line's corrections leave billable to the patient, or the correction that pays nothing more, beside the
 * ledger and counted in no total (PRD 13; docs/adr/0067): the allowed amount, then the payer's payment, then the
 * patient's share. The share's reasons (deductible, coinsurance, copay) show to the roles that read PHI; other readers
 * see the patient's share. Nothing when the line's corrections left the patient nothing to bill.
 */
export function LineCorrectionWords({ correction, className = '' }: { readonly correction: CorrectionView | undefined; readonly className?: string }) {
  const billable = correction?.billable ?? null;
  if (correction === undefined || billable === null) {
    return null;
  }
  const box = `rounded-md border border-dashed p-2 text-sm ${className}`.trim();
  const billed = isPositive(billable.billableCents);
  const billableLead = (
    <>
      Billable to the patient: <Money value={billable.billableCents} /> (<ShareReasons reasons={billable.reasons} />
      ).
    </>
  );
  if (correction.kind === 'patient_balance') {
    const cumulative = spansCorrections(correction.kind, billable);
    // "balance is the patient's" and its next step only when the corrections leave the patient something to bill (RX2-2).
    return (
      <p className={box} data-correction="patient_balance" data-billable={billable.billableCents}>
        {billed ? (
          <>{billableLead} Payer corrected; balance is the patient’s.</>
        ) : (
          'Payer corrected; this correction pays nothing more, and its corrections leave the patient nothing to bill.'
        )}{' '}
        <AllowedSum billable={billable} cumulative={cumulative} /> {noEntryWords(cumulative)}
        <Allocation billable={billable} />
        {billed ? ` ${PATIENT_BALANCE_NEXT_STEP}` : null}
      </p>
    );
  }
  if (correction.kind === 'other_reductions') {
    const cumulative = spansCorrections(correction.kind, billable);
    if (cumulative) {
      // An earlier correction paid part, or raised the patient's share (RX-2, RX2-1, RX2-3): every part of the cumulative increase, named.
      return (
        <p className={box} data-correction="other_reductions" data-billable={billable.billableCents}>
          {billed ? <>{billableLead} </> : null}
          Payer corrected; this correction pays nothing more (other reductions). <AllowedSum billable={billable} cumulative /> {noEntryWords(true)}
          <Allocation billable={billable} />
        </p>
      );
    }
    const fell = isNegative(billable.shareChangeCents) ? magnitude(billable.shareChangeCents) : null;
    return (
      <p className={box} data-correction="other_reductions">
        Payer corrected; it pays nothing more (other reductions). The payer raised the allowed amount by <Money value={billable.allowedIncreaseCents} /> and reduced its payment by{' '}
        <Money value={billable.otherReductionCents} /> for other reasons, not billable to the patient
        {fell === null ? null : (
          <>
            ; the patient’s share fell by <Money value={fell} />
          </>
        )}
        . {noEntryWords(false)}
      </p>
    );
  }
  if (!billed) {
    return null;
  }
  // "Of the rest" only when something is left after the payment and both parts of it are above zero (RX2-4).
  const plain = isPositive(billable.paymentIncreaseCents) && isPositive(billable.allowedIncreaseCents) && !isNegative(billable.otherReductionCents);
  return (
    <p className={box} data-billable={billable.billableCents}>
      {billableLead}{' '}
      {plain ? (
        <>
          The payer raised the allowed amount by <Money value={billable.allowedIncreaseCents} /> and pays <Money value={billable.paymentIncreaseCents} /> of it;{' '}
          {billable.otherReductionCents === '0' ? (
            'the rest is the patient’s share, counted in no total.'
          ) : (
            <>
              of the rest, <Money value={billable.billableCents} /> is the patient’s share, counted in no total, and <Money value={billable.otherReductionCents} /> was reduced by the payer for other
              reasons, not billable.
            </>
          )}
        </>
      ) : (
        <AllowedSum billable={billable} cumulative={false} shareNote=", counted in no total" />
      )}
      <Allocation billable={billable} />
    </p>
  );
}

export function levelWords(level: 'claim' | 'check' | 'batch' | null, allocated: boolean): string {
  const base = level === 'claim' ? 'line-level' : level === 'batch' ? 'batch deposit' : 'check-level';
  return allocated ? `${base}, allocated pro rata` : base;
}
