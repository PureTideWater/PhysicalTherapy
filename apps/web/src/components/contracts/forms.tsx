import { randomUUID } from 'node:crypto';

import type { ActionState } from '../../lib/http/next';
import type { ContractOption, DocumentSummary } from '../../lib/contracts/contract-queries';
import { KIND_NAMES, formatBytes } from '../../lib/uploads/receipt-labels';
import type { PayerOption } from '../../lib/remittances/queries';
import { ActionForm } from '../action-form';
import { Field, SelectField } from '../field';
import { utc } from '../format';

/**
 * The forms of the contract screens, rendered on the server with a fresh request key each time (PRD 6,
 * Cross-cutting: every mutation guarded by a request key).
 */

type Action = (state: ActionState, form: FormData) => Promise<ActionState>;

/** "Contract, 12.0 KiB, received 2026-10-15 09:12 UTC (3f0b8c1e)": a document without its name, which is never stored. */
export function documentLabel(document: DocumentSummary): string {
  return `${KIND_NAMES[document.kind]}, ${formatBytes(Number(document.sizeBytes))}, received ${utc(document.receivedAt)} (${document.id.slice(0, 8)})`;
}

/**
 * Tags a document to its payer (J5): a new contract with the payer, or one of the payer's contracts
 * (it joins the version being abstracted, or starts a new version from the date given).
 */
export function TagForm({
  action,
  practiceId,
  document,
  payers,
  contracts,
  fixedContract,
}: {
  readonly action: Action;
  readonly practiceId: string;
  readonly document: DocumentSummary;
  readonly payers: readonly PayerOption[];
  readonly contracts: readonly ContractOption[];
  /** On a contract's own page: the contract (and its payer) are given. */
  readonly fixedContract?: ContractOption;
}) {
  const id = (name: string) => `${name}-${document.id}`;
  return (
    <ActionForm action={action} submit={fixedContract === undefined ? 'Tag to the payer' : 'Add to this contract'} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="documentId" value={document.id} />
      {fixedContract === undefined ? (
        <>
          <SelectField label="Payer" name="payerId" id={id('payer')} required options={payers.map((payer) => ({ value: payer.id, label: payer.name }))} />
          <SelectField
            label="Contract"
            name="contractId"
            id={id('contract')}
            options={[
              { value: '', label: 'A new contract with this payer' },
              ...contracts.map((contract) => ({ value: contract.id, label: `${contract.title} (${payers.find((payer) => payer.id === contract.payerId)?.name ?? 'its payer'})` })),
            ]}
          />
          <Field label="Title of a new contract" name="title" id={id('title')} maxLength={200} hint="As the document names the agreement." />
        </>
      ) : (
        <>
          <input type="hidden" name="payerId" value={fixedContract.payerId} />
          <input type="hidden" name="contractId" value={fixedContract.id} />
        </>
      )}
      <Field label="Effective from" name="effectiveFrom" id={id('from')} type="date" hint="The date the document says it takes effect." />
      <Field label="Last day (optional)" name="lastDay" id={id('last-day')} type="date" hint="Blank while it continues until amended." />
    </ActionForm>
  );
}

/** The practice's answer to one of the specialist's open questions. */
export function AnswerForm({ action, practiceId, questionId }: { readonly action: Action; readonly practiceId: string; readonly questionId: string }) {
  return (
    <ActionForm action={action} submit="Send the answer" className="flex flex-col gap-2">
      <input type="hidden" name="requestKey" value={randomUUID()} />
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="questionId" value={questionId} />
      <label htmlFor={`answer-${questionId}`} className="text-sm font-medium">
        Answer
      </label>
      <textarea id={`answer-${questionId}`} name="answer" required maxLength={2000} rows={2} className="rounded-md border bg-background p-2 text-sm" />
    </ActionForm>
  );
}
