'use client';

import type { PacketContent } from '@tp/packets';
import { Button } from '@tp/ui';
import { type FormEvent, type ReactNode, useRef, useState } from 'react';

import type { ActionState } from '../../lib/http/next';
import { CheckboxGroup, SelectField } from '../field';
import { FormIssues, PendingStatus, RefusalSummary, useGuardedSubmit } from '../form-issues';
import { NarrativeEditor } from './narrative-editor';

/**
 * The packet builder's one version form (the best-option audit's item #61, the founder's ruling of 2026-10-18;
 * PRD 7, Packet builder: "narrative editor with verifier results, interest, evidence list"): the request keys,
 * the version edited, the prompt-pay state, the documents attached to the evidence list and the narrative, each
 * once with an ID of its own, and the submit buttons that write a version from them. Every button sends the
 * same fields, so a choice made here (the prompt-pay interest line among them) is never dropped by another
 * button. `save` and `code_draft` go to the form's write action, which their `intent` steers; `model_draft`
 * sends the same form to the model's draft action (its button's own formAction), since each server action runs
 * one route. The server writes, verifies and stores the version, and alone decides whether it may be approved.
 *
 * It submits as ActionForm does (docs/adr/0077): from onSubmit, so a refusal keeps the narrative, the prompt-pay
 * state and the ticks, with one guard across both actions; the submitter chooses the action (its data-intent), and
 * the buttons keep their formAction and intent, so the post without JavaScript still reaches the right one. A refusal
 * shows the shared summary first in the form, naming each field by its label, and marks the fields.
 */

export type VersionIntent = 'save' | 'code_draft' | 'model_draft';

export interface VersionSubmit {
  readonly intent: VersionIntent;
  readonly label: string;
  readonly variant?: 'default' | 'outline';
}

export interface AttachableOption {
  readonly id: string;
  readonly label: string;
  readonly checked: boolean;
}

export interface ModelDraftGroup {
  readonly heading: string;
  readonly description: string;
  /** The model's button, when the model may draft now; otherwise `unavailable` says why. */
  readonly submit: VersionSubmit | null;
  readonly unavailable: ReactNode;
}

type FormAction = (form: FormData) => void;

function Submit({ submit, formAction, pending }: { readonly submit: VersionSubmit; /** The model's draft goes to an action of its own; the others to the form's. */ readonly formAction: FormAction | undefined; readonly pending: boolean }) {
  // A button with a function formAction carries no name or value: React names the button for its action itself, and
  // the model's draft action reads no intent. The others steer the form's write action by their intent. data-intent
  // tells onSubmit which action the press is for; it is not sent.
  const steer = formAction === undefined ? { name: 'intent', value: submit.intent } : {};
  return (
    <Button type="submit" {...steer} data-intent={submit.intent} variant={submit.variant ?? 'default'} aria-disabled={pending || undefined} formAction={formAction}>
      {submit.label}
    </Button>
  );
}

export function VersionForm({
  writeAction,
  modelAction,
  keys,
  practiceId,
  caseId,
  basedOnVersionId,
  promptPay,
  attachable,
  narrative,
  submits,
  model,
}: {
  /** Writes a version from the person's narrative (`save`) or the code-built draft (`code_draft`). */
  readonly writeAction: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** Writes a version from the model's draft (`model_draft`). */
  readonly modelAction: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The request key and the session's CSRF token (FormKeys, rendered on the server). */
  readonly keys: ReactNode;
  readonly practiceId: string;
  readonly caseId: string;
  /** The version edited; null for the packet's first. */
  readonly basedOnVersionId: string | null;
  readonly promptPay: { readonly states: readonly string[]; readonly selected: string };
  readonly attachable: readonly AttachableOption[];
  /** The narrative editor, for a version written from the person's words; absent on the first version's card. */
  readonly narrative: { readonly initial: string; readonly content: PacketContent; readonly maxLength: number } | null;
  readonly submits: readonly VersionSubmit[];
  readonly model: ModelDraftGroup | null;
}) {
  // One guard across both actions: a press for either sends nothing while the other is out.
  const inFlight = useRef(false);
  const write = useGuardedSubmit(writeAction, { inFlight });
  const draft = useGuardedSubmit(modelAction, { inFlight });
  const formRef = useRef<HTMLFormElement>(null);
  const [clicked, setClicked] = useState<VersionIntent | null>(null);
  const pending = write.pending || draft.pending;
  // What the last button sent came back with.
  const shown = clicked === 'model_draft' ? draft : write;
  const pressed = [...submits, ...(model?.submit === null || model?.submit === undefined ? [] : [model.submit])].find((submit) => submit.intent === clicked);
  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const intent = (submitter?.dataset.intent ?? 'save') as VersionIntent;
    setClicked(intent);
    (intent === 'model_draft' ? draft : write).send(new FormData(event.currentTarget, submitter));
  }
  const button = (submit: VersionSubmit) => <Submit key={submit.intent} submit={submit} formAction={submit.intent === 'model_draft' ? draft.formAction : undefined} pending={pending} />;
  return (
    <FormIssues state={shown.state}>
      <form ref={formRef} action={write.formAction} onSubmit={onSubmit} className="flex flex-col gap-4" aria-label="Write a version">
        <RefusalSummary state={shown.state} fromBrowser={shown.fromBrowser} submit={pressed?.label ?? submits[0]?.label ?? ''} formRef={formRef} />
        {keys}
        <input type="hidden" name="practiceId" value={practiceId} />
        <input type="hidden" name="caseId" value={caseId} />
        <input type="hidden" name="basedOnVersionId" value={basedOnVersionId ?? ''} />
        <div className="max-w-xs">
          <SelectField
            label="Prompt-pay state (interest, its own line)"
            name="promptPayState"
            id="prompt-pay-state"
            defaultValue={promptPay.selected}
            options={[{ value: '', label: 'None: no interest line' }, ...promptPay.states.map((code) => ({ value: code, label: code }))]}
          />
        </div>
        {attachable.length === 0 ? null : (
          <CheckboxGroup
            legend="Attach to the evidence list"
            issueKey="attachments"
            options={attachable.map((document) => ({ name: `attach:${document.id}`, value: 'on', label: document.label, defaultChecked: document.checked }))}
          />
        )}
        {narrative === null ? null : <NarrativeEditor name="narrative" initial={narrative.initial} content={narrative.content} maxLength={narrative.maxLength} />}
        <div className="flex flex-wrap items-center gap-3">
          {submits.map(button)}
          <PendingStatus pending={pending && clicked !== 'model_draft'} />
        </div>
        {model === null ? null : (
          <div className="flex flex-col gap-2 border-t pt-4" role="group" aria-label="Draft with the model">
            <p className="text-sm font-medium">{model.heading}</p>
            <p className="text-sm text-muted-foreground">{model.description}</p>
            {model.submit === null ? (
              model.unavailable
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                {button(model.submit)}
                <PendingStatus pending={pending && clicked === 'model_draft'} />
              </div>
            )}
          </div>
        )}
      </form>
    </FormIssues>
  );
}
