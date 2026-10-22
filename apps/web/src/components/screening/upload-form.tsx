'use client';

import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tp/ui';
import { type FormEvent, startTransition, useActionState, useEffect, useRef, useState } from 'react';

import type { ContentQuarters } from '@tp/worker/screening-format';

import type { ActionState } from '../../lib/http/next';
import { FILE_MESSAGES, leftOutMessage, outsideContentMessage } from '../../lib/screening/messages';
import { type ScreeningParse, clockOffset, parseScreeningFile } from '../../lib/screening/parse';
import { ABOUT_PRACTICE, HEARD_FROM_LABEL, REFERRING_FIRM_HINT, REFERRING_FIRM_LABEL, UPLOAD_EMAIL_HINT } from '../../lib/screening/retention';
import { TEMPLATE_FILE_NAME, screeningTemplateCsv } from '../../lib/screening/template';
import { Field, SelectField } from '../field';

/**
 * The free screening's upload (Change Order 001, CO-04; reconciliation-001, D18 a and D21 a). The file is read here,
 * in the browser, and never sent: the file input has no name, so no form submission carries it. The browser checks
 * the header and every row against the screening's format, and refuses a file that holds patient
 * information (names, dates of birth, member IDs, dates of service or claim numbers), naming the column by its
 * position and header, before anything is sent. A file's quarters are dated by the server's clock (the page's
 * serverTime, moved on by this browser's clock since), so a computer whose clock is wrong refuses no quarter the server
 * takes and sends none it refuses. A row of fewer than 11 claim lines (the CMS small-cell standard) is
 * left out before sending, since it can be one patient's service line, and the form says how many rows, claim lines
 * and dollars it left out. So is a Medicare row whose quarter is outside the content the release in force has loaded
 * (audit #7; the founder's answer of 2026-10-21 to PR 6b's Q6 (a)): the form says how many rows, claim lines and dollars
 * it left out and which quarters PaidWhole has loaded, before anything is sent. A clean file goes to the server as its
 * header's canonical column names, its row count, its rows of totals in their canonical form and those six left-out
 * numbers, never a hash of the file (which holds the rows left out); the server checks them again and hashes the rows
 * it accepts. The ZIP code field takes five digits or ZIP+4: the ZIP+4 is needed, and kept, only for a ZIP code that
 * spans two Medicare payment areas (PR 6b; the founder's ruling of 2026-10-18, 11:47 UTC, and answer of 2026-10-21 to
 * Q11 (a); docs/adr/0064). The result is emailed:
 * the page only says to check the email. Two optional fields say how the practice heard of PaidWhole (a closed list) and
 * which billing firm referred it, and the hint under the email address says what is deleted and what is kept (audit
 * #57; the founder's rulings of 2026-10-20).
 */

/** What the ZIP code field takes (PR 6b): the ZIP+4 is asked for only where Medicare splits the ZIP code. */
export const ZIP_HINT = 'Five digits, or ZIP+4 if you know it. A few ZIP codes span two Medicare payment areas; for those we ask for the ZIP+4.';

export interface ScreeningUploadFormProps {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  readonly states: readonly { readonly value: string; readonly label: string }[];
  readonly maxRows: number;
  /** The fewest claim lines a row may sum; a smaller row is left out before sending. */
  readonly minClaimLines: number;
  /** The server's clock when it built the page (ISO 8601): the file's quarters are dated by it, never this computer's. */
  readonly serverTime: string;
  /** The quarters the release in force has the Medicare content for: a Medicare row of any other quarter is left out. */
  readonly contentQuarters: ContentQuarters;
  /** "How did you hear about us?": a blank first option, then the closed list. */
  readonly sources: readonly { readonly value: string; readonly label: string }[];
}

/** The fields the server names in its refusals, as the form labels them. */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  practiceName: 'Practice name',
  state: 'State',
  zip: 'ZIP code',
  contactEmail: 'Work email',
  heardFrom: HEARD_FROM_LABEL,
  referringFirm: REFERRING_FIRM_LABEL,
  upload: 'File',
  input: 'Form',
};

function issueField(field: string): string {
  return FIELD_NAMES[field] ?? field;
}

export function ScreeningUploadForm({ action, states, maxRows, minClaimLines, serverTime, contentQuarters, sources }: ScreeningUploadFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [parsed, setParsed] = useState<ScreeningParse | null>(null);
  const [reading, setReading] = useState(false);
  const [local, setLocal] = useState<readonly string[]>([]);
  const chosen = useRef<File | null>(null);
  // How far the server's clock is ahead of this browser's, taken once the page is in this browser.
  const offset = useRef(0);
  useEffect(() => {
    offset.current = clockOffset(serverTime, Date.now());
  }, [serverTime]);

  const read = async (file: File | null): Promise<ScreeningParse | null> => {
    chosen.current = file;
    setLocal([]);
    if (file === null) {
      setParsed(null);
      return null;
    }
    setReading(true);
    try {
      const result = await parseScreeningFile(file, new Date(Date.now() + offset.current), contentQuarters);
      // A later choice replaces this one; only the file still chosen is shown.
      if (chosen.current === file) {
        setParsed(result);
      }
      return result;
    } finally {
      setReading(false);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    void (async () => {
      const result = parsed ?? (chosen.current === null ? null : await read(chosen.current));
      if (result === null) {
        setLocal([FILE_MESSAGES.noFile]);
        return;
      }
      if (!result.ok) {
        // Nothing is sent: the problems are this browser's to show.
        return;
      }
      const body = new FormData(form);
      body.set('headers', JSON.stringify(result.headers));
      body.set('rowCount', String(result.rowCount));
      body.set('rows', result.rows);
      body.set('leftOutRows', String(result.leftOut.rows));
      body.set('leftOutClaimLines', String(result.leftOut.claimLines));
      body.set('leftOutAllowedCents', result.leftOut.allowedCents.toString());
      body.set('outsideContentRows', String(result.outsideContent.rows));
      body.set('outsideContentClaimLines', String(result.outsideContent.claimLines));
      body.set('outsideContentAllowedCents', result.outsideContent.allowedCents.toString());
      startTransition(() => {
        formAction(body);
      });
    })();
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([screeningTemplateCsv()], { type: 'text/csv' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = TEMPLATE_FILE_NAME;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const problems = parsed !== null && !parsed.ok ? parsed.messages : [];
  const leftOut = parsed?.ok === true ? leftOutMessage(parsed.leftOut) : null;
  const outside = parsed?.ok === true ? outsideContentMessage(parsed.outsideContent, parsed.outsideContentBands, contentQuarters) : null;
  return (
    <form onSubmit={submit} className="flex flex-col gap-6" data-slot="screening-upload">
      <Card>
        <CardHeader>
          <CardTitle>About your practice</CardTitle>
          <CardDescription data-copy="about-practice">
            {ABOUT_PRACTICE} A practice keeps one screening at a time: a later one for the same practice name and ZIP code, or from the same email address, replaces it, and the earlier link stops opening it.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Practice name" name="practiceName" required maxLength={200} autoComplete="organization" />
          <SelectField label="State" name="state" options={[{ value: '', label: 'Choose a state' }, ...states]} required />
          <Field
            label="ZIP code"
            name="zip"
            required
            inputMode="numeric"
            pattern="[0-9]{5}(-?[0-9]{4})?"
            maxLength={10}
            autoComplete="postal-code"
            hint={ZIP_HINT}
          />
          {/* The hint is a legal surface counsel reviews before the screening opens: docs/product/legal-surfaces.md, data-legal-surface="screening-kept-upload". */}
          <Field label="Work email" name="contactEmail" type="email" required maxLength={254} autoComplete="email" hint={UPLOAD_EMAIL_HINT} />
          <SelectField label={HEARD_FROM_LABEL} name="heardFrom" options={sources} />
          <Field label={REFERRING_FIRM_LABEL} name="referringFirm" maxLength={200} autoComplete="off" hint={REFERRING_FIRM_HINT} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your file</CardTitle>
          <CardDescription>
            A CSV or tab-separated file of totals, one row per code, modifier set, units, place of service, payer product and quarter, at most {maxRows.toLocaleString('en-US')} rows. It is read in this browser and never uploaded: only its rows of totals are sent, and a row of fewer than {minClaimLines} claim lines is left out, because it can describe one patient’s care.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="screening-file">File to screen</Label>
            <Input
              id="screening-file"
              type="file"
              accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
              aria-describedby="screening-file-hint"
              onChange={(event) => {
                void read(event.currentTarget.files?.[0] ?? null);
              }}
            />
            <p id="screening-file-hint" className="text-xs text-muted-foreground">
              No names, dates of birth, member IDs, dates of service or claim numbers: a file with any of them is refused before anything is sent.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <div>
              <Button type="button" variant="outline" size="sm" onClick={download} aria-describedby="screening-template-rules">
                Download the column template
              </Button>
            </div>
            <p id="screening-template-rules" className="text-xs text-muted-foreground" data-slot="template-hint">
              The template’s first lines state its rules: each row sums at least {minClaimLines} claim lines, and denied lines are left out of every total and claim count. They start with #, and this page skips them, so you can keep them.
            </p>
          </div>
          {reading ? <p className="text-sm text-muted-foreground" data-state="reading">Reading the file in this browser…</p> : null}
          {parsed?.ok === true ? (
            <div className="flex flex-col gap-1 text-sm">
              <p data-state="file-ready">
                The file is ready: <span className="font-mono tabular-nums">{parsed.rowCount.toLocaleString('en-US')}</span> {parsed.rowCount === 1 ? 'row' : 'rows'} of totals, and no column of patient information.
              </p>
              {leftOut === null ? null : (
                <p data-state="left-out" data-rows={parsed.leftOut.rows} data-claim-lines={parsed.leftOut.claimLines} data-allowed-cents={parsed.leftOut.allowedCents.toString()}>
                  {leftOut}
                </p>
              )}
              {outside === null ? null : (
                <p
                  data-state="outside-content"
                  data-rows={parsed.outsideContent.rows}
                  data-claim-lines={parsed.outsideContent.claimLines}
                  data-allowed-cents={parsed.outsideContent.allowedCents.toString()}
                >
                  {outside}
                </p>
              )}
            </div>
          ) : null}
          {problems.length + local.length > 0 ? (
            <Alert variant="destructive" data-state="file-refused">
              <AlertTitle>Not sent</AlertTitle>
              <AlertDescription>
                <p>Nothing was sent. Fix the file and choose it again:</p>
                <ul className="mt-1 list-disc pl-5">
                  {[...local, ...problems].map((problem, index) => (
                    <li key={`${String(index)}:${problem}`}>{problem}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
      {state.error === undefined ? null : (
        <Alert variant="destructive" data-state="error">
          <AlertTitle>Not done</AlertTitle>
          <AlertDescription>
            <p>{state.error}</p>
            {state.issues === undefined || state.issues.length === 0 ? null : (
              <ul className="mt-1 list-disc pl-5">
                {state.issues.map((issue) => (
                  <li key={`${issue.field}:${issue.message}`}>
                    {issueField(issue.field)}: {issue.message}
                  </li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pending || reading}>
          {pending ? 'Sending…' : 'Screen the file'}
        </Button>
      </div>
    </form>
  );
}
