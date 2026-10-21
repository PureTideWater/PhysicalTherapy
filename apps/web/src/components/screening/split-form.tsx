'use client';

import { Input, Label } from '@tp/ui';
import { type ReactNode, useMemo, useState } from 'react';

import type { ActionState } from '../../lib/http/next';
import { ActionForm } from '../action-form';

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

/** A list of codes the form reads; it has no name, so only the built split is sent. */
function CodesField({ id, label, value, onChange, hint }: { readonly id: string; readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        inputMode="numeric"
        autoComplete="off"
        aria-describedby={`${id}-hint`}
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        {hint}
      </p>
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
  const built = useMemo(() => splitSettings(facility, nonFacility), [facility, nonFacility]);
  return (
    <ActionForm action={action} submit="Approve this split" className="grid gap-4">
      {formKeys}
      <input type="hidden" name="settings" value={'settings' in built ? built.settings : ''} />
      <CodesField
        id="split-facility"
        label="Facility places of service"
        value={facility}
        onChange={setFacility}
        hint="Two-digit codes, separated by commas or spaces. Priced at the facility rate."
      />
      <CodesField
        id="split-non-facility"
        label="Non-facility places of service"
        value={nonFacility}
        onChange={setNonFacility}
        hint="Priced at the non-facility rate. A place in neither list is left unpriced."
      />
      {'problems' in built && (facility !== '' || nonFacility !== '') ? (
        <ul className="list-disc pl-5 text-sm text-destructive" data-state="split-problems">
          {built.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
    </ActionForm>
  );
}
