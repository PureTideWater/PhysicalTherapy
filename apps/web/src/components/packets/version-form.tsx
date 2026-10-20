'use client';

import type { PacketContent } from '@tp/packets';
import { Alert, AlertDescription, AlertTitle, Button, Label } from '@tp/ui';
import { type ReactNode, useActionState, useState } from 'react';

import type { ActionState } from '../../lib/http/next';
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

function Submit({
  submit,
  formAction,
  pending,
  clicked,
  onClick,
}: {
  readonly submit: VersionSubmit;
  /** The model's draft goes to an action of its own; the others to the form's. */
  readonly formAction: FormAction | undefined;
  readonly pending: boolean;
  readonly clicked: boolean;
  readonly onClick: () => void;
}) {
  // A button with a function formAction carries no name or value: React names the button for its action itself, and
  // the model's draft action reads no intent. The others steer the form's write action by their intent.
  const steer = formAction === undefined ? { name: 'intent', value: submit.intent } : {};
  return (
    <Button type="submit" {...steer} variant={submit.variant ?? 'default'} disabled={pending} onClick={onClick} formAction={formAction}>
      {pending && clicked ? 'Working…' : submit.label}
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
  const [written, writeDispatch, writing] = useActionState(writeAction, {});
  const [drafted, modelDispatch, drafting] = useActionState(modelAction, {});
  const [clicked, setClicked] = useState<VersionIntent | null>(null);
  const pending = writing || drafting;
  // What the last button sent came back with.
  const state = clicked === 'model_draft' ? drafted : written;
  const button = (submit: VersionSubmit) => (
    <Submit
      key={submit.intent}
      submit={submit}
      formAction={submit.intent === 'model_draft' ? modelDispatch : undefined}
      pending={pending}
      clicked={clicked === submit.intent}
      onClick={() => {
        setClicked(submit.intent);
      }}
    />
  );
  return (
    <form action={writeDispatch} className="flex flex-col gap-4" aria-label="Write a version">
      {keys}
      <input type="hidden" name="practiceId" value={practiceId} />
      <input type="hidden" name="caseId" value={caseId} />
      <input type="hidden" name="basedOnVersionId" value={basedOnVersionId ?? ''} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="prompt-pay-state">Prompt-pay state (interest, its own line)</Label>
        <select id="prompt-pay-state" name="promptPayState" defaultValue={promptPay.selected} className="h-9 max-w-xs rounded-md border bg-background px-2 text-sm">
          <option value="">None: no interest line</option>
          {promptPay.states.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>
      {attachable.length === 0 ? null : (
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="font-medium">Attach to the evidence list</legend>
          {attachable.map((document) => (
            <div key={document.id} className="flex items-center gap-2">
              <input type="checkbox" id={`attach-${document.id}`} name={`attach:${document.id}`} defaultChecked={document.checked} />
              <label htmlFor={`attach-${document.id}`}>{document.label}</label>
            </div>
          ))}
        </fieldset>
      )}
      {narrative === null ? null : <NarrativeEditor name="narrative" initial={narrative.initial} content={narrative.content} maxLength={narrative.maxLength} />}
      {state.error === undefined ? null : (
        <Alert variant="destructive" data-state="error">
          <AlertTitle>Not done</AlertTitle>
          <AlertDescription>
            <p>{state.error}</p>
            {state.issues === undefined || state.issues.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {state.issues.map((issue) => (
                  <li key={`${issue.field}:${issue.message}`}>
                    {issue.field}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap gap-3">{submits.map(button)}</div>
      {model === null ? null : (
        <div className="flex flex-col gap-2 border-t pt-4" role="group" aria-label="Draft with the model">
          <p className="text-sm font-medium">{model.heading}</p>
          <p className="text-sm text-muted-foreground">{model.description}</p>
          {model.submit === null ? model.unavailable : <div>{button(model.submit)}</div>}
        </div>
      )}
    </form>
  );
}
