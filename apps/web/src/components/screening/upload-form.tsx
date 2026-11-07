'use client';

import { Alert, AlertDescription, AlertTitle, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@tp/ui';
import Link from 'next/link';
import { type FormEvent, type ReactNode, type RefObject, useEffect, useRef, useState, useTransition } from 'react';

import type { ContentQuarters } from '@tp/worker/screening-format';

import type { ActionState } from '../../lib/http/next';
import { KEEP_ADDRESS_LABEL, addressHint, isSoftAddressMessage } from '../../lib/screening/address';
import { FILE_MESSAGES, NO_FILE_CHOSEN, leftOutMessage, outsideContentMessage, screenedQuartersMessage } from '../../lib/screening/messages';
import { type ScreeningParse, clockOffset, parseScreeningFile } from '../../lib/screening/parse';
import { ABOUT_PRACTICE, HEARD_FROM_LABEL, REFERRING_FIRM_HINT, REFERRING_FIRM_LABEL, UPLOAD_EMAIL_HINT } from '../../lib/screening/retention';
import { TEMPLATE_FILE_NAME, screeningTemplateCsv } from '../../lib/screening/template';
import { Field, Hint, SelectField } from '../field';
import { FieldError, type FormState, FormIssues, PendingStatus, RefusalSummary, useFieldIssue, useGuardedSubmit } from '../form-issues';

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
 * spans more than one Medicare payment area (PR 6b; the founder's ruling of 2026-10-18, 11:47 UTC, and answer of 2026-10-21 to
 * Q11 (a); docs/adr/0064). The result is emailed:
 * the page only says to check the email. Two optional fields say how the practice heard of PaidWhole (a closed list) and
 * which billing firm referred it, and the hint under the email address says what is deleted and what is kept (audit
 * #57; the founder's rulings of 2026-10-20). The email address is checked as it is typed (audit #76; docs/adr/0065, D9):
 * a likely typo of a large mail provider's domain offers the address meant, and an ending not in use is questioned; the
 * prospect may use the suggestion or keep the address as typed, which the server asks again, as it does when SES cannot
 * confirm the mailbox.
 *
 * The form is on the shared form core (docs/adr/0077): a refusal is summarized first in the form, each field named by
 * the label the person sees and the file input as "File to screen"; a press is pending from the moment it is made,
 * even while the file is still read, and sends one request; a dropped connection keeps every value and the chosen file
 * (in memory only, never in storage) and says the screening is not confirmed. The form is method="post" with no
 * action: a press without JavaScript posts its fields to the page itself, which is not a server action and ignores
 * them, so no value ever reaches a URL, a log or a referrer, and the file input has no name, so nothing is screened.
 */

/** What the ZIP code field takes (PR 6b): the ZIP+4 is asked for only where Medicare splits the ZIP code. */
export const ZIP_HINT = 'Five digits, or ZIP+4 if you know it. A few ZIP codes span more than one Medicare payment area; for those we ask for the ZIP+4.';

/** What the page says without JavaScript, in the file card's own words: the file is read here, so screening needs it. */
export const NO_SCRIPT =
  'Screening a file needs JavaScript, because the file is read in this browser and never uploaded: only its rows of totals are sent. Turn JavaScript on before you fill in the form.';

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
  /**
   * The app's configured web address (services.origin, what the origin check compares against), which a page that
   * failed that check names for the person to open. Never window.location, which on a translated, proxied or saved
   * copy names the copy.
   */
  readonly appOrigin?: string;
}

/**
 * The work email, with the hint for a likely typo or an ending not in use (address.ts), shown once the field is left,
 * in a live region so it is announced, and the box that keeps a questioned address as typed: shown with a hint, or when
 * the server questioned the address (a hint, or a mailbox SES could not confirm). A refused address offers no box.
 */
function ContactEmailField() {
  const error = useFieldIssue('contactEmail');
  const [value, setValue] = useState('');
  const [left, setLeft] = useState('');
  const [keep, setKeep] = useState(false);
  const hint = left === '' ? null : addressHint(left);
  const message = hint?.message ?? null;
  const suggestion = hint?.suggestion ?? null;
  const questioned = message !== null || (error !== undefined && isSoftAddressMessage(error));
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {/* The hint is a legal surface counsel reviews before the screening opens: docs/product/legal-surfaces.md, data-legal-surface="screening-kept-upload". */}
      <Field
        label="Work email"
        name="contactEmail"
        type="email"
        required
        maxLength={254}
        autoComplete="email"
        hint={UPLOAD_EMAIL_HINT}
        value={value}
        onChange={(event) => {
          setValue(event.currentTarget.value);
          setKeep(false);
        }}
        onBlur={() => setLeft(value)}
      />
      <div role="status" className="flex flex-wrap items-center gap-2 text-sm" data-slot="address-hint">
        {message === null || message === error ? null : <p data-state="address-hint">{message}</p>}
        {suggestion === null ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setValue(suggestion);
              setLeft(suggestion);
              setKeep(false);
            }}
          >
            Use {suggestion}
          </Button>
        )}
      </div>
      {questioned ? (
        <div className="flex items-center gap-2 text-sm">
          {/* Controlled on purpose (it resets with the email); never refused, so not a CheckboxField. */}
          <input type="checkbox" id="field-keepAddress" name="keepAddress" value="1" checked={keep} onChange={(event) => setKeep(event.currentTarget.checked)} />
          <Label htmlFor="field-keepAddress">{KEEP_ADDRESS_LABEL}</Label>
        </div>
      ) : null}
    </div>
  );
}

/** The words of a refusal that link to the audit request, where the page's own link is far below. */
const REQUEST_AN_AUDIT = 'request an audit';

/**
 * A form-wide refusal's sentence as the summary shows it (RefusalSummary's renderMessage: never a field's item): its
 * first letter capitalized, and "request an audit" linked to the form, the next step it names (the review of 2026-10-27).
 */
export function refusalSentence(message: string): ReactNode {
  const sentence = `${message.charAt(0).toUpperCase()}${message.slice(1)}`;
  const at = sentence.indexOf(REQUEST_AN_AUDIT);
  if (at < 0) {
    return sentence;
  }
  return (
    <>
      {sentence.slice(0, at)}
      <Link className="underline" href="/request-audit">
        {REQUEST_AN_AUDIT}
      </Link>
      {sentence.slice(at + REQUEST_AN_AUDIT.length)}
    </>
  );
}

/** A chosen file and what reading it gave; null for both when no file is chosen. */
interface FileRead {
  readonly file: File | null;
  readonly result: ScreeningParse | null;
}

const NOTHING_CHOSEN: FileRead = { file: null, result: null };

/** The lead of a refusal of the form's fields; the summary says "field" for one it places (summaryLead). */
const FIELDS_LEAD = 'Fix the fields listed here, then try again.';

/**
 * The file input, named "File to screen" in a refusal's summary through data-issue-for. React owns its marks:
 * aria-invalid is keyed on both the server's refusal of the file and this browser's own problems with it, so the
 * summary's markByHand leaves it alone, and it is described by the server's message, then the "Not sent" list, then its
 * hint, keeping only those shown.
 */
function FileToScreen({ problems, onChoose, inputRef }: { readonly problems: boolean; readonly onChoose: (file: File | null) => void; readonly inputRef: RefObject<HTMLInputElement | null> }) {
  const uploadIssue = useFieldIssue('upload');
  const invalid = problems || uploadIssue !== undefined;
  const described = [uploadIssue === undefined ? null : 'screening-file-error', problems ? 'screening-file-problems' : null, 'screening-file-hint'].filter((part) => part !== null).join(' ');
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="screening-file">File to screen</Label>
      <Input
        ref={inputRef}
        id="screening-file"
        type="file"
        accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
        data-issue-for="upload"
        aria-invalid={invalid || undefined}
        aria-describedby={described}
        onChange={(event) => {
          onChoose(event.currentTarget.files?.[0] ?? null);
        }}
      />
      <FieldError id="screening-file" error={uploadIssue} />
      <Hint id="screening-file" hint="No names, dates of birth, member IDs, dates of service or claim numbers: a file with any of them is refused before anything is sent." />
    </div>
  );
}

export function ScreeningUploadForm({ action, states, maxRows, minClaimLines, serverTime, contentQuarters, sources, appOrigin }: ScreeningUploadFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // The only guard against a second press: set by the press, and let go once its request is answered, or once it
  // ends sending nothing.
  const inFlight = useRef(false);
  // One count of the server's answers and this browser's own (no file chosen), so each inserts a summary of its own.
  const seq = useRef(0);
  const guarded = useGuardedSubmit(action, { inFlight, seq });
  // A press waits for the chosen file's read before it sends: it is pending from the press.
  const [preparing, startPreparing] = useTransition();
  const pending = guarded.pending || preparing;
  // A press with no file chosen: the file input's own message, shown by the summary as a field's. Numbered from the same
  // count as the server's answers, so the newer of the two is shown and an older state never comes back: a file chosen
  // while it is shown replaces it with a state that refuses nothing (so nothing is shown and nothing takes the focus),
  // and the next press's answer, numbered after it, replaces that.
  const [noFile, setNoFile] = useState<FormState | null>(null);
  const shown = noFile !== null && (noFile.seq ?? 0) > (guarded.state.seq ?? 0) ? noFile : guarded.state;
  const [parsed, setParsed] = useState<ScreeningParse | null>(null);
  const [reading, setReading] = useState(false);
  const chosen = useRef<File | null>(null);
  // The chosen file's read, in progress or done: a press awaits it, so a file is never read twice.
  const chosenRead = useRef<Promise<FileRead>>(Promise.resolve(NOTHING_CHOSEN));
  // How far the server's clock is ahead of this browser's, taken once the page is in this browser.
  const offset = useRef(0);
  useEffect(() => {
    offset.current = clockOffset(serverTime, Date.now());
  }, [serverTime]);

  const choose = (file: File | null): void => {
    chosen.current = file;
    // Only this browser's own message is cleared; a server refusal shown stays until the next press is answered.
    if (noFile !== null && shown === noFile) {
      seq.current += 1;
      setNoFile({ seq: seq.current });
    }
    setParsed(null);
    if (file === null) {
      chosenRead.current = Promise.resolve(NOTHING_CHOSEN);
      setReading(false);
      return;
    }
    setReading(true);
    const read = parseScreeningFile(file, new Date(Date.now() + offset.current), contentQuarters).then(
      (result): FileRead => ({ file, result }),
      // A file this browser cannot read (a NotReadableError) is a problem the "Not sent" list names, never a throw that
      // would reach the error page and lose what was typed.
      (): FileRead => ({ file, result: { ok: false, messages: [FILE_MESSAGES.unreadable], reasons: [] } }),
    );
    chosenRead.current = read;
    void read.then(({ result }) => {
      // A later choice replaces this one; only the file still chosen is shown.
      if (chosen.current === file) {
        setParsed(result);
        setReading(false);
      }
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    const form = event.currentTarget;
    startPreparing(async () => {
      let sent = false;
      try {
        let got = await chosenRead.current;
        // A file chosen while this press waited is the one sent, never the rows of the file chosen before it.
        while (got.file !== chosen.current) {
          got = await chosenRead.current;
        }
        if (got.result === null) {
          seq.current += 1;
          setNoFile({ error: FIELDS_LEAD, invalid: true, issues: [{ field: 'upload', message: NO_FILE_CHOSEN }], seq: seq.current });
          return;
        }
        if (!got.result.ok) {
          // Nothing is sent: the problems are this browser's to show, under "Not sent".
          return;
        }
        const { result } = got;
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
        guarded.send(body);
        sent = true;
      } finally {
        if (!sent) {
          inFlight.current = false;
          fileRef.current?.focus();
        }
      }
    });
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
  // No person mark (useClearedForAnotherPerson): the screening route is public and reads no session, and this page
  // renders no FormKeys, so no other person can be signed in to clear it for (the precedent is request-audit/page.tsx).
  return (
    <FormIssues state={shown}>
      <form ref={formRef} method="post" onSubmit={submit} className="flex flex-col gap-6" data-slot="screening-upload">
        {/*
         * No RefreshAfterRefusal: on this public route, csrf_refused (`stale`) means only that the page failed the origin
         * check (lib/http/invoke.ts, publicRoute), which no refresh repairs, so the summary's origin lead names the app's
         * own web address instead. A retry on this page cannot pass the origin check; the values stay only so the person
         * can copy them into the page at appOrigin.
         */}
        <RefusalSummary state={shown} fromBrowser={shown === noFile || guarded.fromBrowser} submit="Screen the file" formRef={formRef} renderMessage={refusalSentence} stale="origin" appOrigin={appOrigin} />
        <noscript>
          <p data-slot="no-javascript" className="rounded-md border px-4 py-3 text-sm">
            {NO_SCRIPT}
          </p>
        </noscript>
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
            <Field label="ZIP code" name="zip" required inputMode="numeric" pattern="[0-9]{5}(-?[0-9]{4})?" maxLength={10} autoComplete="postal-code" hint={ZIP_HINT} />
            <ContactEmailField />
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
            <p className="text-sm" data-slot="screened-quarters">
              {screenedQuartersMessage(contentQuarters)}
            </p>
            <FileToScreen problems={problems.length > 0} onChoose={choose} inputRef={fileRef} />
            <div className="flex flex-col gap-2">
              <div>
                <Button type="button" variant="outline" size="sm" onClick={download} aria-describedby="screening-template-hint">
                  Download the column template
                </Button>
              </div>
              <Hint
                id="screening-template"
                hint={`The template’s first lines state its rules: each row sums at least ${String(minClaimLines)} claim lines, and denied lines are left out of every total and claim count. They start with #, and this page skips them, so you can keep them.`}
              />
            </div>
            {/* A live region that is always there, so what the page says of the chosen file (its reading, and rows left out) is announced. */}
            <div role="status" data-slot="file-status">
              {reading ? (
                <p className="text-sm text-muted-foreground" data-state="reading">
                  Reading the file in this browser…
                </p>
              ) : parsed?.ok === true ? (
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
            </div>
            {problems.length > 0 ? (
              <Alert variant="destructive" data-state="file-refused">
                <AlertTitle>Not sent</AlertTitle>
                <AlertDescription id="screening-file-problems">
                  <p>Nothing was sent. Choose the file again once each problem below is fixed:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {problems.map((problem, index) => (
                      <li key={`${String(index)}:${problem}`}>{problem}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
        <div className="flex flex-wrap items-center gap-2">
          {/* Not aria-disabled while reading: a press then is accepted, waits for the read and sends once. */}
          <Button type="submit" aria-disabled={pending || undefined}>
            Screen the file
          </Button>
          <PendingStatus pending={pending} />
        </div>
      </form>
    </FormIssues>
  );
}
