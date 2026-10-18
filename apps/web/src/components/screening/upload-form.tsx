'use client';

import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tp/ui';
import { type FormEvent, startTransition, useActionState, useRef, useState } from 'react';

import type { ActionState } from '../../lib/http/next';
import { FILE_MESSAGES } from '../../lib/screening/messages';
import { type ScreeningParse, parseScreeningFile } from '../../lib/screening/parse';
import { TEMPLATE_FILE_NAME, screeningTemplateCsv } from '../../lib/screening/template';
import { Field, SelectField } from '../field';

/**
 * The free screening's upload (Change Order 001, CO-04; reconciliation-001, D18 a and D21 a). The file is read here,
 * in the browser, and never sent: the file input has no name, so no form submission carries it. The browser hashes
 * its bytes, checks the header and every row against the screening's format, and refuses a file that holds patient
 * information (names, dates of birth, member IDs, dates of service or claim numbers), naming the column by its
 * position and header, before anything is sent. A clean file goes to the server as its hash, its header cells, its
 * row count and its rows of totals in their canonical form; the server checks them all again. ZIP+4 is asked for only
 * when the server says the ZIP needs it (decision D20 a). The result is emailed: the page only says to check the email.
 */

export interface ScreeningUploadFormProps {
  readonly action: (state: ActionState, form: FormData) => Promise<ActionState>;
  readonly states: readonly { readonly value: string; readonly label: string }[];
  readonly maxRows: number;
}

/** The fields the server names in its refusals, as the form labels them. */
const FIELD_NAMES: Readonly<Record<string, string>> = {
  practiceName: 'Practice name',
  state: 'State',
  zip: 'ZIP code',
  zipPlusFour: 'ZIP+4',
  contactEmail: 'Work email',
  upload: 'File',
  input: 'Form',
};

function issueField(field: string): string {
  return FIELD_NAMES[field] ?? field;
}

export function ScreeningUploadForm({ action, states, maxRows }: ScreeningUploadFormProps) {
  const [state, formAction, pending] = useActionState(action, {});
  const [parsed, setParsed] = useState<ScreeningParse | null>(null);
  const [reading, setReading] = useState(false);
  const [local, setLocal] = useState<readonly string[]>([]);
  const chosen = useRef<File | null>(null);
  const asksPlusFour = state.issues?.some((issue) => issue.field === 'zipPlusFour') === true;
  const [plusFour, setPlusFour] = useState(false);
  const showPlusFour = plusFour || asksPlusFour;

  const read = async (file: File | null): Promise<ScreeningParse | null> => {
    chosen.current = file;
    setLocal([]);
    if (file === null) {
      setParsed(null);
      return null;
    }
    setReading(true);
    try {
      const result = await parseScreeningFile(file);
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
      if (asksPlusFour) {
        setPlusFour(true);
      }
      const body = new FormData(form);
      body.set('fileSha256', result.fileSha256);
      body.set('headers', JSON.stringify(result.headers));
      body.set('rowCount', String(result.rowCount));
      body.set('rows', result.rows);
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
  return (
    <form onSubmit={submit} className="flex flex-col gap-6" data-slot="screening-upload">
      <Card>
        <CardHeader>
          <CardTitle>About your practice</CardTitle>
          <CardDescription>Who the screening is for, and where its result is emailed. Your ZIP code names the Medicare locality the rows are priced at.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <Field label="Practice name" name="practiceName" required maxLength={200} autoComplete="organization" />
          <SelectField label="State" name="state" options={[{ value: '', label: 'Choose a state' }, ...states]} required />
          <Field label="ZIP code" name="zip" required inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" hint="The five-digit ZIP of the practice's location." />
          {showPlusFour ? (
            <Field
              label="ZIP+4"
              name="zipPlusFour"
              required
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              autoComplete="off"
              hint="This ZIP spans two Medicare localities; the four digits after the dash say which one the practice is in."
            />
          ) : null}
          <Field label="Work email" name="contactEmail" type="email" required maxLength={254} autoComplete="email" hint="The result is emailed here as a link that opens it for 30 days." />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your file</CardTitle>
          <CardDescription>
            A CSV or tab-separated file of totals, one row per code, modifier set, units, place of service, payer product and quarter, at most {maxRows.toLocaleString('en-US')} rows. It is read in this browser and never uploaded: only its rows of totals are sent.
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
          <div>
            <Button type="button" variant="outline" size="sm" onClick={download}>
              Download the column template
            </Button>
          </div>
          {reading ? <p className="text-sm text-muted-foreground" data-state="reading">Reading the file in this browser…</p> : null}
          {parsed?.ok === true ? (
            <p className="text-sm" data-state="file-ready">
              The file is ready: <span className="font-mono tabular-nums">{parsed.rowCount.toLocaleString('en-US')}</span> {parsed.rowCount === 1 ? 'row' : 'rows'} of totals, and no column of patient information.
            </p>
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
