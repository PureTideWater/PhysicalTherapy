import { Alert, AlertDescription, AlertTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { EVIDENCE_WORDS, LedgerTotals, entryStage } from '../../../../../components/reconciliation/display';
import { Money, Pager } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import type { EntryView } from '../../../../../lib/reconciliation/queries';
import { ADJUSTMENT_CONSEQUENCE, ledgerReviewPage } from '../../../../../lib/routes/specialist';
import { adjustEntryFormAction } from './actions';
import { FormKeys } from '../../../../../components/form-keys';

export const metadata: Metadata = { title: 'Ledger corrections' };

type Props = { readonly params: Promise<{ practiceId: string }>; readonly searchParams: Promise<Record<string, string | string[] | undefined>> };

/** Corrects an entry's amount with a reason and the specialist's confirmation of what it does. */
function AdjustForm({ practiceId, entry, idPrefix }: { readonly practiceId: string; readonly entry: EntryView; readonly idPrefix: string }) {
  const id = `${idPrefix}-${entry.id}`;
  return (
    <details>
      <summary className="cursor-pointer text-xs underline">Adjust</summary>
      <ActionForm action={adjustEntryFormAction} submit="Adjust the amount" variant="destructive" className="flex max-w-md flex-col gap-2 pt-2">
        <FormKeys />
        <input type="hidden" name="practiceId" value={practiceId} />
        <input type="hidden" name="entryId" value={entry.id} />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`amount-${id}`}>Change in dollars (a minus sign lowers it)</Label>
          <input id={`amount-${id}`} name="amount" required inputMode="decimal" pattern="-?[0-9]{1,9}([.][0-9]{1,2})?" className="rounded-md border bg-background p-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`adjust-reason-${id}`}>Why the amount is corrected</Label>
          <textarea id={`adjust-reason-${id}`} name="reason" required maxLength={2000} rows={2} className="rounded-md border bg-background p-2 text-sm" />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="confirm" required className="mt-1" />
          <span>{ADJUSTMENT_CONSEQUENCE} Adjust it.</span>
        </label>
      </ActionForm>
    </details>
  );
}

function Entries({ entries, practiceId, canAdjust, label }: { readonly entries: readonly EntryView[]; readonly practiceId: string; readonly canAdjust: boolean; readonly label: string }) {
  return (
    <div className="overflow-x-auto">
      <table aria-label={label} className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1 pr-3">#</th>
            <th className="py-1 pr-3">Money moved</th>
            <th className="py-1 pr-3">Stage</th>
            <th className="py-1 pr-3 text-right">Amount</th>
            <th className="py-1 pr-3">Evidence</th>
            <th className="py-1 pr-3">Written by</th>
            <th className="py-1">Correct</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} data-entry={entry.id} data-stage={entry.stage} className="border-b align-top">
              <td className="py-1 pr-3 font-mono text-xs">{entry.seq}</td>
              <td className="py-1 pr-3">{entry.effectiveOn}</td>
              <td className="py-1 pr-3">
                {entryStage(entry.stage)}
                {entry.allocated ? ' (allocated pro rata)' : ''}
              </td>
              <td className="py-1 pr-3 text-right">
                <Money value={entry.amountCents} />
              </td>
              <td className="py-1 pr-3">{EVIDENCE_WORDS[entry.evidenceKind] ?? entry.evidenceKind}</td>
              <td className="py-1 pr-3">{entry.byJob ? 'the reconcile job' : (entry.createdBy ?? '—')}</td>
              <td className="py-1">{canAdjust && entry.adjustable ? <AdjustForm practiceId={practiceId} entry={entry} idPrefix={label === 'Ledger entries' ? 'ledger' : 'shortfall'} /> : null}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Ledger corrections (PRD 13, Entries: "adjusted | A specialist corrects an amount after review, with a
 * reason"), for the contract specialist under the practice's support grant: the ledger's totals, the
 * shortfalls payer responses left (an approval its remittance paid in part), and the entries, each
 * standing one with its correction. Amounts, stages and dates only: no code, date of service or reason.
 */
export default async function LedgerReviewPage(props: Props) {
  const page = await loadPage(ledgerReviewPage, props);
  if (page.kind === 'forbidden') {
    return (
      <Forbidden
        shell={page.shell}
        section="abstraction"
        roles={page.roles}
        message={page.message}
        nextStep="Correcting a ledger amount is the contract specialist's, under a support grant the platform administrator opens from a ticket."
      />
    );
  }
  const { practiceId, totals, shortfalls, entries, canAdjust, notice } = page.data;
  const path = `/p/${practiceId}/abstraction/ledger`;
  return (
    <AppShell shell={page.shell} section="abstraction">
      <div className="flex flex-col gap-1">
        <p className="text-sm">
          <Link className="underline" href={`/p/${practiceId}/abstraction`}>
            Contract abstraction
          </Link>
        </p>
        <h1 className="text-[2rem] font-bold leading-display tracking-display">Ledger corrections</h1>
        <p className="text-base text-muted-foreground">
          Correct an entry&apos;s amount after review, with your reason. The entry never changes; the correction is an entry of its own, which the ledger keeps between zero and what the
          entry&apos;s evidence shows.
        </p>
      </div>
      {notice === 'adjusted' ? (
        <Alert>
          <AlertTitle>Adjusted</AlertTitle>
          <AlertDescription>The correction is an entry of its own in your name, with your reason; the entry it corrects is unchanged.</AlertDescription>
        </Alert>
      ) : null}
      <LedgerTotals totals={totals} title="The practice's ledger" description="Totals by stage, recovered at the practice's proof level." />
      <section aria-label="Shortfalls" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Shortfalls</h2>
        {shortfalls.length === 0 ? (
          <EmptyState title="No shortfall on this page of case lines" nextStep="A shortfall appears when a payer's remittance pays part of what its response accepted." />
        ) : (
          <ul aria-label="Shortfalls" className="flex flex-col gap-3">
            {shortfalls.map((line) => (
              <li key={line.serviceLineId} className="flex flex-col gap-2 rounded-md border p-3" data-shortfall={line.shortfallCents}>
                <p className="text-sm">
                  The payer accepted <Money value={line.shortfallCents} /> more than its remittance paid on this case line. Correct the approval, or leave it for the practice to dispute.
                </p>
                <Entries entries={line.entries} practiceId={practiceId} canAdjust={canAdjust} label="Entries of the line" />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label="Ledger entries" className="flex flex-col gap-2">
        <h2 className="text-xl font-bold tracking-display">Ledger entries</h2>
        {entries.total === 0 ? (
          <EmptyState title="No entry yet" nextStep="Entries appear when a remittance, a posting or a deposit is matched to a case line." />
        ) : (
          <Entries entries={entries.items} practiceId={practiceId} canAdjust={canAdjust} label="Ledger entries" />
        )}
        <Pager path={path} query={{}} page={entries.page} pages={entries.pages} total={entries.total} noun="Entries" param="entries" />
      </section>
    </AppShell>
  );
}
