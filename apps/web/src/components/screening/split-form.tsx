'use client';

import { Input, Label } from '@tp/ui';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

import type { ActionState } from '../../lib/http/next';
import { ActionForm } from '../action-form';
import { Hint } from '../field';
import { usePersonChange } from '../form-issues';

/**
 * The screening's place-of-service split, as a contract specialist approves it (reconciliation-001, D20 a: a
 * platform default the specialist approves, a person and never a model). The engine prices a row at the facility or
 * the non-facility rate by its place of service, and leaves a place missing from the split unpriced
 * (ENGINE_ERROR place_of_service_unmapped). The specialist lists the two-digit codes of each setting; the form sends
 * them as one JSON object of code to setting, which the server checks again and records as a new approved split
 * (each approval is kept; the latest is in force).
 */

const CODE = /^(0[1-9]|[1-9][0-9])$/;

/** The codes a field lists: two digits each, separated by commas or spaces; a one-digit code is padded. */
export function splitCodes(text: string): { readonly codes: readonly string[]; readonly invalid: readonly string[] } {
  const codes: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/).filter((entry) => entry !== '')) {
    const code = /^\d$/.test(part) ? `0${part}` : part;
    (CODE.test(code) ? codes : invalid).push(code);
  }
  return { codes: [...new Set(codes)].sort(), invalid };
}

/** The split as the server takes it, or what is wrong with the two lists (never both). */
export function splitSettings(facility: string, nonFacility: string): { readonly settings: string } | { readonly problems: readonly string[] } {
  const a = splitCodes(facility);
  const b = splitCodes(nonFacility);
  const problems: string[] = [];
  if (a.invalid.length + b.invalid.length > 0) {
    problems.push('Each place of service is a two-digit code from 01 to 99.');
  }
  const both = a.codes.filter((code) => b.codes.includes(code));
  if (both.length > 0) {
    problems.push(`Place of service ${both.join(', ')} is listed as both facility and non-facility.`);
  }
  if (a.codes.length + b.codes.length === 0) {
    problems.push('List at least one place of service.');
  }
  if (problems.length > 0) {
    return { problems };
  }
  const entries = [...a.codes.map((code): [string, string] => [code, 'facility']), ...b.codes.map((code): [string, string] => [code, 'non_facility'])].sort(([x], [y]) => x.localeCompare(y));
  return { settings: JSON.stringify(Object.fromEntries(entries)) };
}

/**
 * Which list each of splitSettings' problems concerns, so the form marks the field at fault: a malformed code, the
 * list it is in; a code in both lists, both; no code at all, the facility list (the one a person fills first).
 */
export function splitFaults(facility: string, nonFacility: string): { readonly facility: boolean; readonly nonFacility: boolean } {
  const a = splitCodes(facility);
  const b = splitCodes(nonFacility);
  const both = a.codes.some((code) => b.codes.includes(code));
  const none = a.codes.length + b.codes.length === 0;
  return { facility: a.invalid.length > 0 || both || none, nonFacility: b.invalid.length > 0 || both };
}

/**
 * The split's problems as the person types: shown at once, and the description of each field at fault, so it is read
 * when the focus lands there. It is not live: a list that changes with each key would speak over the typing.
 */
const PROBLEMS_ID = 'split-problems';

/** How long the lists rest before the status line says their problems (WCAG 4.1.3: never while the person types). */
const SETTLE_MS = 1000;

/** What the status line says, and the saying it is (a press says the same words again as a new one). */
interface Said {
  readonly text: string;
  readonly seq: number;
}

/** The status line's next state: unchanged when it already says `text`, unless `again` (a press) asks for it anew. */
function saying(text: string, again: boolean): (previous: Said) => Said {
  return (previous) => (previous.text === text && !again ? previous : { text, seq: previous.seq + 1 });
}

/**
 * A list of codes the form reads; it has no name, so only the built split is sent. At fault, it is marked invalid
 * and described by the problems first, then its hint. `issueFor` names the hidden field a server issue may be keyed
 * by, so a refusal of the built split is placed on this field (docs/adr/0077). Leaving it says the problems at once.
 */
function CodesField({
  id,
  label,
  value,
  onChange,
  onBlur,
  hint,
  fault,
  issueFor,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onBlur: () => void;
  readonly hint: string;
  readonly fault: boolean;
  readonly issueFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        onBlur={onBlur}
        inputMode="numeric"
        autoComplete="off"
        aria-invalid={fault || undefined}
        aria-describedby={fault ? `${PROBLEMS_ID} ${id}-hint` : `${id}-hint`}
        data-issue-for={issueFor}
      />
      <Hint id={id} hint={hint} />
    </div>
  );
}

export function ScreeningSplitForm({
  action,
  facility: initialFacility,
  nonFacility: initialNonFacility,
  formKeys,
}: {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  /** The split in force's facility codes, space-joined ('' when none is approved yet). */
  readonly facility: string;
  readonly nonFacility: string;
  /** The page's FormKeys (the request key and the CSRF token), rendered on the server. */
  readonly formKeys: ReactNode;
}) {
  const [facility, setFacility] = useState(initialFacility);
  const [nonFacility, setNonFacility] = useState(initialNonFacility);
  // Set by a press with problems, so even two empty lists say what is missing.
  const [pressed, setPressed] = useState(false);
  const built = useMemo(() => splitSettings(facility, nonFacility), [facility, nonFacility]);
  const problems = 'problems' in built ? built.problems : [];
  const shown = problems.length > 0 && (pressed || facility !== '' || nonFacility !== '');
  const faults = shown ? splitFaults(facility, nonFacility) : { facility: false, nonFacility: false };
  // The status line says the problems shown once the lists rest, when a list is left, and on a press; never while the
  // person types. What the page opened with (seq 0) is never said: it is read in place.
  const heard = shown ? problems.join(' ') : '';
  const [said, setSaid] = useState<Said>(() => ({ text: heard, seq: 0 }));
  const pause = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    // Each change of either list starts the pause again; with nothing wrong, the line empties at once, which is silent.
    const timer = setTimeout(
      () => {
        setSaid(saying(heard, false));
      },
      heard === '' ? 0 : SETTLE_MS,
    );
    pause.current = timer;
    return () => {
      clearTimeout(timer);
    };
  }, [facility, nonFacility, heard]);
  const settle = () => {
    clearTimeout(pause.current);
    setSaid(saying(heard, false));
  };
  // The lists are held here, outside the fields ActionForm mounts afresh when the page shows another person signed in
  // (docs/adr/0077, D10), so they start again from the page as rendered now: nothing the first person typed is sent.
  const formRef = useRef<HTMLFormElement | null>(null);
  usePersonChange(formRef, () => {
    clearTimeout(pause.current);
    setFacility(initialFacility);
    setNonFacility(initialNonFacility);
    setPressed(false);
    setSaid({ text: '', seq: 0 });
  });
  return (
    <ActionForm
      action={action}
      submit="Approve this split"
      className="grid gap-4"
      beforeSubmit={(form) => {
        if (problems.length === 0) {
          return true;
        }
        // Nothing is sent while the lists have problems: they are shown and said, the first field at fault is marked,
        // then focused. Said again on every press: Enter in the field at fault moves no focus, so nothing else reads them.
        clearTimeout(pause.current);
        flushSync(() => {
          setPressed(true);
          setSaid(saying(problems.join(' '), true));
        });
        const first = splitFaults(facility, nonFacility).facility ? 'split-facility' : 'split-non-facility';
        form.querySelector<HTMLInputElement>(`#${first}`)?.focus();
        return false;
      }}
    >
      {formKeys}
      <input type="hidden" name="settings" value={'settings' in built ? built.settings : ''} />
      <CodesField
        id="split-facility"
        label="Facility places of service"
        value={facility}
        onChange={setFacility}
        onBlur={settle}
        hint="Two-digit codes, separated by commas or spaces. Priced at the facility rate."
        fault={faults.facility}
        issueFor="settings"
      />
      <CodesField
        id="split-non-facility"
        label="Non-facility places of service"
        value={nonFacility}
        onChange={setNonFacility}
        onBlur={settle}
        hint="Priced at the non-facility rate. A place in neither list is left unpriced."
        fault={faults.nonFacility}
      />
      <div id={PROBLEMS_ID}>
        {shown ? (
          <ul className="list-disc pl-5 text-sm text-destructive" data-state="split-problems">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {/* On the page from the first render; each saying is a new node, so the same words said again are announced again. */}
      <p
        ref={(node) => {
          formRef.current = node?.closest('form') ?? null;
        }}
        role="status"
        className="sr-only"
        data-slot="split-status"
      >
        {said.seq === 0 || said.text === '' ? null : <span key={said.seq}>{said.text}</span>}
      </p>
    </ActionForm>
  );
}
