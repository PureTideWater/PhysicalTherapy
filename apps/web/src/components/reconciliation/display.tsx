import type { DocumentStatus } from '@tp/db/runtime';
import { recoveredLabel as ledgerRecoveredLabel } from '@tp/ledger';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@tp/ui';

import { Money } from '../remittances/display';

/**
 * Display pieces of the Reconciliation screen and the ROI statements (PRD 7, Reconciliation and
 * Reports; PRD 13): every dollar figure carries its stage's label, "recovered" stands only beside the
 * proof level's cash net of recoupments and reversals (stage five), approved and interest are their own
 * figures, and nothing unmatched is in any of them.
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
 * "posted"): the cash it counts, deposited or posted, then what proves it. It follows "cash" or a recovered label.
 */
export function proofLevelWords(level: 'posted' | 'deposited'): string {
  return level === 'deposited' ? 'deposited, proved by the bank export' : 'posted, proved by the posting export (no deposit data is supplied)';
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

/** The ledger's totals, each its own stage; recovered last, with its proof level. */
export function LedgerTotals({ totals, title, description }: { readonly totals: TotalsFigures; readonly title: string; readonly description: string }) {
  const figures: readonly { readonly key: string; readonly label: string; readonly cents: string; readonly note: string }[] = [
    {
      key: 'approved',
      label: 'Payer approved',
      cents: totals.payerApprovedCents,
      note: 'accepted by the payer, net of reversals and of what was taken back before it posted; recovered only once it is posted or deposited',
    },
    { key: 'posted', label: 'Posted', cents: totals.postedCents, note: 'posting export rows matched to the remittance' },
    { key: 'deposited', label: 'Deposited', cents: totals.depositedCents, note: 'bank export rows matched to the remittance' },
    { key: 'recouped', label: 'Recouped', cents: totals.recoupedCents, note: 'taken back by PLB WO or a reversal' },
    { key: 'interest', label: 'Interest', cents: totals.interestCents, note: 'paid by the payer, apart from principal' },
  ];
  return (
    <Card role="region" aria-label={title}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
            <dd className="text-xs text-muted-foreground">stage five: cash {proofLevelWords(totals.proofLevel)}, net of recoupments and reversals</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

/** What became of an uploaded export, by its document's status. */
const EXPORT_STATUS_TEXT: Readonly<Partial<Record<DocumentStatus, string>>> = {
  loaded: 'Read into rows and reconciled',
  unreadable: 'Could not be read with the template: no row was stored',
  duplicate: 'The same file as an export already uploaded: nothing read again',
  quarantined: 'Quarantined by the malware scan',
  wrong_type: 'Not a CSV: save it as CSV and upload it again',
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

export function levelWords(level: 'claim' | 'check' | 'batch' | null, allocated: boolean): string {
  const base = level === 'claim' ? 'line-level' : level === 'batch' ? 'batch deposit' : 'check-level';
  return allocated ? `${base}, allocated pro rata` : base;
}
