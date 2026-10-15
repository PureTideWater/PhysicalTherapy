import { randomUUID } from 'node:crypto';

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState, Label } from '@tp/ui';
import type { Metadata } from 'next';
import Link from 'next/link';

import { ActionForm } from '../../../../../components/action-form';
import { utc } from '../../../../../components/format';
import { Fact, LineStatusChip, Money, basisName, claimStatusName, period } from '../../../../../components/remittances/display';
import { AppShell, Forbidden } from '../../../../../components/shell';
import { loadPage } from '../../../../../lib/http/next';
import { linePage } from '../../../../../lib/routes/remittances';
import { addLineNoteAction } from './actions';

export const metadata: Metadata = { title: 'Line trace' };

/**
 * One service line (PRD 7, Claims and lines: "open the line trace; add a note"): what the 835 said
 * about it, its adjustments, and how its observed allowed was derived. Expected allowed and the
 * pricing trace that recomputes it arrive with the pricing engine (milestone 5); until then this is
 * the trace's placeholder. Notes are PHI and show only to roles that read PHI; roles that work cases
 * add them.
 */
export default async function LinePage(props: { readonly params: Promise<{ practiceId: string; lineId: string }> }) {
  const page = await loadPage(linePage, props);
  if (page.kind === 'forbidden') {
    return <Forbidden shell={page.shell} section="claims" roles={page.roles} message={page.message} nextStep="Ask the practice's administrator for access." />;
  }
  const { practiceId, detail, canNote } = page.data;
  const { line, adjustments, notes } = detail;
  const modifiers = line.modifiers.filter((modifier) => modifier !== '');
  return (
    <AppShell shell={page.shell} section="claims">
      <div className="flex flex-col gap-1">
        <Link className="text-sm underline" href={`/p/${practiceId}/claims?view=all&claim=${line.claimId}`}>
          Claims and lines
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          Line {line.lineNo}: {line.procedureCode}
          {modifiers.length === 0 ? '' : ` ${modifiers.join(' ')}`}
        </h1>
        <div className="flex flex-wrap gap-1">
          <LineStatusChip status={line.status} />
          {line.reversal ? <Badge variant="secondary">Reversal</Badge> : null}
          {line.reversed ? <Badge variant="outline">Reversed</Badge> : null}
          {line.superseded ? <Badge variant="outline">Superseded</Badge> : null}
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Line trace</CardTitle>
          <CardDescription>Expected allowed and the trace that recomputes it appear here once a pricing run prices this line under a signed-off contract version.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            <Fact label="Expected allowed">
              <Money value={line.expectedAllowedCents} />
            </Fact>
            <Fact label="Observed allowed">
              <Money value={line.observedAllowedCents} /> ({basisName(line.observedAllowedBasis, line.observedAllowedAllocated)})
            </Fact>
            <Fact label="AMT B6">
              <Money value={line.lineAllowedCents} />
            </Fact>
            <Fact label="Charge">
              <Money value={line.chargeCents} />
            </Fact>
            <Fact label="Paid">
              <Money value={line.paidCents} />
            </Fact>
            <Fact label="Patient share">
              <Money value={line.patientShareCents} />
            </Fact>
            <Fact label="Units">
              {line.units ?? '—'}
              {line.originalUnits === null ? '' : ` (billed ${line.originalUnits})`}
            </Fact>
            <Fact label="Code">
              <span className="font-mono text-xs">
                {line.procedureQualifier}:{line.procedureCode}
                {line.modifiers.length === 0 ? '' : `:${line.modifiers.join(':')}`}
              </span>
            </Fact>
            <Fact label="Revenue code">{line.revenueCode ?? '—'}</Fact>
            <Fact label="Plan key">
              <span className="font-mono text-xs">{line.planKey}</span>
            </Fact>
            <Fact label="Payer">
              {line.payerName}, paid {line.paymentDate}{' '}
              <Link className="underline" href={`/p/${practiceId}/remittances/${line.remittanceId}`}>
                (remittance)
              </Link>
            </Fact>
            <Fact label="Claim status">{claimStatusName(line.claimStatusCode)}</Fact>
            {line.identifiers === null ? null : (
              <>
                <Fact label="Patient reference">{line.identifiers.patient}</Fact>
                <Fact label="Patient control number">
                  <span className="font-mono text-xs">{line.identifiers.patientControlNumber}</span>
                </Fact>
                <Fact label="Payer claim control number">
                  <span className="font-mono text-xs">{line.identifiers.payerClaimControlNumber}</span>
                </Fact>
                <Fact label="Service date">{period(line.identifiers.serviceDate, line.identifiers.serviceDateTo)}</Fact>
                <Fact label="Rendering NPI">{line.renderingNpi ?? '—'}</Fact>
              </>
            )}
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Adjustments</CardTitle>
          <CardDescription>The CAS adjustments on this line and on its claim. An unknown code loads with its flag.</CardDescription>
        </CardHeader>
        <CardContent>
          {adjustments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No adjustments.</p>
          ) : (
            <table className="w-full text-left text-sm" aria-label="Adjustments">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Level</th>
                  <th className="py-1 font-medium">Group</th>
                  <th className="py-1 font-medium">Reason</th>
                  <th className="py-1 text-right font-medium">Quantity</th>
                  <th className="py-1 text-right font-medium">Amount</th>
                </tr>
              </thead>
              <tbody>
                {adjustments.map((item, index) => (
                  <tr key={index} className="border-t">
                    <td className="py-1 pr-3">{item.level === 'line' ? 'Line' : 'Claim'}</td>
                    <td className="py-1 pr-3 font-mono text-xs">{item.groupCode}</td>
                    <td className="py-1 pr-3 font-mono text-xs">
                      {item.reasonCode} {item.unknownCode ? <Badge variant="destructive">Unknown code</Badge> : null}
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">{item.quantity ?? '—'}</td>
                    <td className="py-1 text-right">
                      <Money value={item.amountCents} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
      {notes === null ? null : (
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
            <CardDescription>Kept with the line for the people who work it; encrypted with the practice’s key.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {notes.length === 0 ? (
              <EmptyState title="No notes yet" nextStep={canNote ? 'Add what you found or what to do next with this line.' : 'Roles that work cases add notes here.'} />
            ) : (
              <ul className="flex flex-col gap-2" aria-label="Notes">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-md border p-3 text-sm">
                    <p className="whitespace-pre-wrap">{note.note}</p>
                    <p className="pt-1 text-xs text-muted-foreground">
                      {note.createdBy}, {utc(note.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {canNote ? (
              <ActionForm action={addLineNoteAction} submit="Add the note">
                <input type="hidden" name="requestKey" value={randomUUID()} />
                <input type="hidden" name="practiceId" value={practiceId} />
                <input type="hidden" name="lineId" value={line.lineId} />
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="note">Note</Label>
                  <textarea id="note" name="note" required maxLength={2000} rows={3} className="rounded-md border bg-background p-2 text-sm" />
                </div>
              </ActionForm>
            ) : null}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
