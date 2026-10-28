import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Component, type ReactNode, StrictMode, startTransition, use, useEffect, useState, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';

// The brand's tokens and the shared stylesheet as written: the browser ignores the Tailwind at-rules, and the unlayered
// rules (the refused mark, 16 px controls, scroll padding, a refused row that wraps) apply as in the app.
import '../../../../../packages/brand/src/tokens.css';
import '../../../../../packages/ui/src/styles.css';
import { ActionForm, RefusalFallback, noteRefusal, takesFocus, takesOrphanedRefusal } from '../action-form';
import { CheckboxField, CheckboxGroup, Field, SelectField, TextAreaField } from '../field';
import type { RefusalState } from '../form-issues';
import { HardwareKeySignIn } from '../hardware-key';
import { ExportRequestForm } from '../packets/export-status';
import { type ResponseLetterFieldProps, type ResponseLetters, ResponseLetterField } from '../packets/response-letter';
import { VersionForm } from '../packets/version-form';
import { PasswordField } from '../password-field';
import { ScreeningSplitForm } from '../screening/split-form';

/**
 * The page the forms' browser harness serves (test-support/browser.ts; design section 8.2): one page, named by
 * `?form=`, of real ActionForms built from the real fields, with an in-memory action the test scripts through
 * `window.harness`. Synthetic values only.
 */

/** What the action does on one call: refuse with a state, refuse after the test releases it, drop the connection, or fail. */
type Step = { readonly refuse: RefusalState } | { readonly hold: RefusalState } | { readonly drop: true } | { readonly fail: string };

/** What the server renders into a form's keys (FormKeys): its request key, and the opaque mark of the person signed in. */
interface PageKeys {
  readonly requestKey: string;
  readonly person: string | null;
}

/** The test's handle on the page. */
interface HarnessControl {
  /** The action's next answers, first first; with none left it refuses with no issue. */
  steps: Step[];
  /** Each call's entries, as the action received them (a file by its name). */
  calls: { readonly entries: readonly (readonly [string, string])[]; readonly passwordType: string | null }[];
  /** Releases a held call. */
  release: (() => void) | null;
  /** What the split form's beforeSubmit answers. */
  allow: boolean;
  /** The stand-in router's refresh() calls. */
  refreshes: number;
  /** What each next refresh renders into the page's keys, first first; with none left a refresh renders nothing new. */
  refreshRenders: Partial<PageKeys>[];
  /** Renders the page again with these keys, as a refresh in place does (the export status's, another form's). */
  render: (next: Partial<PageKeys>) => void;
  /** The response letter form's server: the letters it lists now, which each refresh renders. */
  letters: ResponseLetters;
  /** The response letter form's upload settings now, which each refresh renders. */
  upload: ResponseLetterFieldProps['upload'];
  /** While true, each refresh's answer waits for releaseRefreshes(). */
  holdRefreshes: boolean;
  /** While true, a refresh ends rendering nothing new, as one whose answer was lost. */
  failRefreshes: boolean;
  /** Answers every held refresh. */
  releaseRefreshes: () => void;
  /** Renders what the server gives now (letters and upload settings), as a refresh this form did not ask for. */
  serve: () => void;
  /** Whether the response letter form is mounted and reads the server's answers. */
  serving: boolean;
}

/** The page's keys as the server renders them now, and the page's root, which renders again when they change. */
let keys: PageKeys = { requestKey: 'synthetic-request-key', person: 'synthetic-person-a' };
const rendered = new Set<() => void>();
function renderKeys(next: Partial<PageKeys>): void {
  keys = { ...keys, ...next };
  for (const listener of rendered) {
    listener();
  }
}

/** What the response letter form's server renders: its letters and the upload settings. */
interface LetterServerPage {
  readonly letters: ResponseLetters;
  readonly upload: ResponseLetterFieldProps['upload'];
}

/** The page's answer to its latest refresh (or serve), which the response letter form reads; null while it is not shown. */
let showServer: ((answer: Promise<LetterServerPage>) => void) | null = null;
/** The answers held until the test releases them. */
const heldRefreshes: (() => void)[] = [];

const control: HarnessControl = {
  steps: [],
  calls: [],
  release: null,
  allow: true,
  refreshes: 0,
  refreshRenders: [],
  render: renderKeys,
  letters: { unused: [], thisCase: [], otherCases: [] },
  upload: { canUpload: true, gate: { open: true, reason: null }, maxBytes: 2 * 1024 ** 3 },
  holdRefreshes: false,
  failRefreshes: false,
  releaseRefreshes: () => {
    for (const reply of heldRefreshes.splice(0)) {
      reply();
    }
  },
  serve: () => {
    served = { letters: control.letters, upload: control.upload };
    showServer?.(settled(served));
  },
  serving: false,
};
Object.assign(window, { harness: control });

/** What the response letter form shows now: the last answer that was not lost. */
let served: LetterServerPage = { letters: control.letters, upload: control.upload };

/** A promise React reads as settled already, so the render that takes it does not suspend. */
function settled<T>(value: T): Promise<T> {
  return Object.assign(Promise.resolve(value), { status: 'fulfilled', value });
}

async function action(_previous: RefusalState, data: FormData): Promise<RefusalState> {
  control.calls.push({
    entries: [...data.entries()].map(([name, value]) => [name, typeof value === 'string' ? value : value.name] as const),
    // The password's type when the action runs: a shown password is hidden again before its data is read.
    passwordType: document.querySelector<HTMLInputElement>('#field-password')?.type ?? null,
  });
  const step = control.steps.shift() ?? { refuse: { error: 'Not available to your role: harness.' } };
  if ('hold' in step) {
    await new Promise<void>((resolve) => {
      control.release = resolve;
    });
    control.release = null;
    return step.hold;
  }
  if ('drop' in step) {
    // What fetch throws when the connection drops: a TypeError with no digest.
    throw new TypeError('Failed to fetch');
  }
  if ('fail' in step) {
    // A server failure, as Next rethrows it: an error carrying the digest error.tsx shows.
    throw Object.assign(new Error('An error occurred in the Server Components render.'), { digest: step.fail });
  }
  return step.refuse;
}

/** FormKeys as the server renders it: the request key, and the person's mark on an element that is not posted. */
function Keys({ page }: { readonly page: PageKeys }) {
  return (
    <>
      <input type="hidden" name="requestKey" value={page.requestKey} />
      {page.person === null ? null : <span hidden data-form-actor={page.person} />}
    </>
  );
}

/** ActionForm over the harness's action, as a page renders it. */
function HarnessForm(props: Omit<Parameters<typeof ActionForm>[0], 'action'>) {
  return <ActionForm action={action} {...props} />;
}

/** Shows a server failure's digest, as app/error.tsx shows its reference. */
class Boundary extends Component<{ readonly children: ReactNode }, { readonly digest: string | null }> {
  override state = { digest: null };
  static getDerivedStateFromError(error: unknown) {
    return { digest: error instanceof Error && 'digest' in error ? String(error.digest) : 'none' };
  }
  override render() {
    return this.state.digest === null ? this.props.children : <p data-boundary={this.state.digest}>Something went wrong</p>;
  }
}

const REASONS = [
  { value: 'window_passed', label: 'Window passed' },
  { value: 'other', label: 'Other' },
];

/** A short run's name, and one too long for a phone's select, as a triage run's with its release is. */
const RUNS = [
  { value: 'q1', label: 'Q1' },
  { value: 'long', label: 'SYNTHETIC REMITTANCES OF THE FIRST QUARTER (release 3)' },
];

/** The payer's answers, as "Log a payer response" offers them, starting unchosen. */
const RESPONSES = [
  { value: '', label: 'Choose the payer’s answer' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'partial', label: 'Partially accepted' },
  { value: 'denied', label: 'Denied' },
];

/**
 * "Log a payer response" as the submissions page renders it (design 2.5.1): the payer's letter first, over the real
 * uploader, then the page's own heading and what the letter says. Its letters and upload settings are the server's
 * answer, read as Next reads a refresh's: a refresh sets a new answer in a transition, which suspends until it comes,
 * so a caller that starts the refresh in its own transition sees when it ends.
 */
function ResponseLetterForm({ page }: { readonly page: PageKeys }) {
  const [answer, setAnswer] = useState(() => settled(served));
  useEffect(() => {
    showServer = setAnswer;
    control.serving = true;
    return () => {
      showServer = null;
      control.serving = false;
    };
  }, []);
  const server = use(answer);
  return (
    <HarnessForm submit="Record the response" className="flex max-w-xl flex-col gap-3">
      <Keys page={page} />
      <ResponseLetterField practiceId="practice-1" csrfToken={PAGE_TOKEN} roleNames="Viewer" upload={server.upload} letters={server.letters} />
      <h3 className="text-base font-semibold">What the letter says</h3>
      <SelectField id="response-kind" label="Response" name="kind" required defaultValue="" options={RESPONSES} />
      <Field id="amount" label="Additional amount the payer will pay (accepted or partial only, dollars)" name="amount" inputMode="decimal" />
      <TextAreaField id="response-notes" label="Notes (kept encrypted)" name="notes" maxLength={2000} rows={2} />
    </HarnessForm>
  );
}

/** The page's CSRF token, as pageCsrfToken() renders it: synthetic, and never the form's request key. */
const PAGE_TOKEN = ['synthetic', 'page', 'csrf'].join('-');

/** A document's choice as the submissions page gives it: its SHA-256's prefix a run set in Plex Mono on the line. */
const DOCUMENTS = [
  { value: 'letter', label: [{ text: 'SYNTHETIC payer letter, uploaded 2026-10-27 21:36 UTC, SHA-256 ' }, { text: '0123456789ab…', mono: true }] },
  { value: 'short', label: [{ text: 'Letter' }] },
];

/** Each form, rendered from the page's keys (a refresh renders it again with the keys the server gives then). */
const forms: Record<string, (page: PageKeys) => ReactNode> = {
  /** Every kind of control a refusal must keep, and every secret it must empty (FRM-01). */
  keep: (page) => (
    <HarnessForm submit="Save">
      <Keys page={page} />
      <Field label="Billing ZIP (ZIP+4 if Medicare needs one)" name="zip" defaultValue="27601" hint="Five digits." />
      <SelectField label="Reason" name="reason" options={REASONS} defaultValue="window_passed" />
      <TextAreaField label="Why (for “Other” only)" name="why" />
      <CheckboxField name="confirm" label="This line will not be pursued." errorName="Confirmation" />
      <CheckboxGroup
        legend="Components affected"
        issueKey="components"
        options={[
          { name: 'components[]', value: 'uploads', label: 'Uploads' },
          { name: 'components[]', value: 'pricing', label: 'Pricing' },
        ]}
      />
      <fieldset>
        <legend>Response</legend>
        <label>
          <input type="radio" name="response" value="accepted" defaultChecked /> Accepted
        </label>
        <label>
          <input type="radio" name="response" value="partial" /> Partially accepted
        </label>
      </fieldset>
      <Field label="Service date" name="serviceDate" type="date" />
      <Field label="Month" name="month" type="month" />
      <PasswordField label="Password" name="password" showName=" password" autoComplete="current-password" />
      <Field label="Six-digit code" name="code" autoComplete="one-time-code" inputMode="numeric" hint="Six digits. Spaces are fine." />
      <label htmlFor="raw-pin">Hand-written PIN</label>
      <input id="raw-pin" type="password" name="pin" />
      <label htmlFor="raw-note">Hand-written note</label>
      <input id="raw-note" name="note" aria-describedby="raw-note-hint" />
      <p id="raw-note-hint">A note.</p>
    </HarnessForm>
  ),
  /** Two named submit buttons, as the version form's intents. */
  submitters: () => (
    <HarnessForm submit="Save">
      <Field label="Title" name="title" />
      <button type="submit" name="intent" value="draft">
        Save as draft
      </button>
    </HarnessForm>
  ),
  /** A two-column grid form (FRM-04: the summary spans the columns, no field moves). */
  grid: () => (
    <HarnessForm submit="Add tag" className="grid grid-cols-2 gap-2">
      <Field label="Tag" name="tag" />
      <Field label="Value" name="value" />
      <Field label="Note" name="tagNote" />
    </HarnessForm>
  ),
  /** A row form that does not wrap until it shows a refusal (console status's row). */
  row: () => (
    <HarnessForm submit="Set" className="flex gap-2">
      <SelectField label="Status" name="status" options={REASONS} />
      <Field label="Note" name="rowNote" />
    </HarnessForm>
  ),
  /** A fieldset of independent booleans, each named by its own label, and a group named by its legend. */
  adjustments: () => (
    <HarnessForm submit="Save version">
      <CheckboxGroup
        legend="Medicare adjustments the contract incorporates"
        issueKey="adjustments"
        options={[
          { name: 'applyMppr', label: 'Multiple procedure payment reduction' },
          { name: 'applyNcci', label: 'NCCI edits' },
        ]}
      />
      <CheckboxGroup
        legend="Keep the items that apply"
        issueKey="kept"
        options={[
          { name: 'keep:0', label: 'First item' },
          { name: 'keep:1', label: 'Second item' },
        ]}
      />
      <Field label="Recovered principal, net (posted)" name="recovered" />
      <CheckboxGroup
        legend="Confirm each item before you attest"
        issueKey="confirm"
        itemized
        options={[
          { name: 'confirm_coverage', label: 'Every line in the period was read.' },
          { name: 'confirm_gaps', label: 'Each gap is listed with its reason.' },
        ]}
      />
    </HarnessForm>
  ),
  /** A short form under a 56 px sticky header (FRM-05: the focused field is never under it). */
  header: () => (
    <>
      <header data-slot="app-header">Header</header>
      <HarnessForm submit="Save">
        <Field label="First day" name="firstDay" />
        <div className="spacer" />
        <Field label="Last day" name="lastDay" />
      </HarnessForm>
      <div className="spacer" />
    </>
  ),
  /** A select that cuts a long choice in a narrow column, and a reset button (U-UX-8: the line under it follows both). */
  chosen: () => (
    <div className="narrow">
      <HarnessForm submit="Save">
        <SelectField label="Pricing run" name="run" defaultValue="q1" showChosen options={RUNS} />
        <button type="reset">Start again</button>
      </HarnessForm>
    </div>
  ),
  /** A select whose cut choice holds a SHA-256, as the submissions page's Document does (the UX re-check's polish). */
  document: () => (
    <div className="narrow">
      <HarnessForm submit="Save">
        <SelectField label="Document" name="documentId" defaultValue="letter" showChosen options={DOCUMENTS} />
      </HarnessForm>
    </div>
  ),
  /**
   * The note a refused row's form leaves when the refresh removes the row (RefusalFallback), for a key used before:
   * noted as the form notes it, then taken by the note on mount.
   */
  fallback: () => {
    noteRefusal('gone:row-1', Date.now(), [], 'duplicate');
    return <RefusalFallback prefix="gone:" present={[]} lead="SYNTHETIC: its row left the list." />;
  },
  /** A form whose beforeSubmit may refuse to send (4.6). */
  split: () => (
    <HarnessForm submit="Approve this split" beforeSubmit={() => control.allow}>
      <Field label="Facility places of service" name="facility" issueFor={['settings']} />
      <input type="hidden" name="settings" value="{}" />
    </HarnessForm>
  ),
  /** The screening's split form itself: it shows its own problems and sends nothing while it has any. */
  screening: (page) => <ScreeningSplitForm action={action} facility="" nonFacility="" formKeys={<Keys page={page} />} />,
  /** The hardware-key sign-in, whose ceremony calls the test answers with page.route (its own form, not ActionForm). */
  hardwareKey: () => <HardwareKeySignIn />,
  /**
   * A form a change elsewhere can overtake (#50's Re-run): it reads the page again after a refusal, and its hidden run
   * names an issue by its own data-error-name, as the route words it ("This run: …").
   */
  rerun: () => (
    <HarnessForm submit="Re-run under release 900001" variant="outline" refreshOnError="rerun:run-1" wrapSubmit>
      <input type="hidden" name="runId" value="run-1" data-error-name="This run" />
      <input type="hidden" name="releaseNo" value="900001" data-error-name="Rule release" />
      <Field label="Note" name="note" />
    </HarnessForm>
  ),
  /** The packet builder's version form, which submits as ActionForm does with two actions (design 4.2). */
  version: (page) => (
    <VersionForm
      writeAction={action}
      modelAction={action}
      keys={<Keys page={page} />}
      practiceId="practice-1"
      caseId="case-1"
      basedOnVersionId={null}
      promptPay={{ states: ['NC'], selected: '' }}
      attachable={[]}
      narrative={null}
      submits={[{ intent: 'save', label: 'Save as a new version' }]}
      model={{ heading: 'Draft with the model', description: 'A synthetic draft.', submit: { intent: 'model_draft', label: 'Draft with the model', variant: 'outline' }, unavailable: null }}
    />
  ),
  /** The packet's Export button, a form of hidden fields with its own useActionState (design 4.2). */
  export: (page) => (
    <ExportRequestForm action={action} refusalCodes={['no_approved_version']}>
      <Keys page={page} />
    </ExportRequestForm>
  ),
  /** "Log a payer response" with its letter's field over the real uploader (CAS-47), whose server the test stands in for. */
  'response-letter': (page) => <ResponseLetterForm page={page} />,
  /** Two forms on one page, as the per-row forms: each has its own refusal. */
  two: (page) => (
    <>
      <HarnessForm submit="Save first">
        <Keys page={page} />
        <Field label="Title" name="title" id="first-title" />
      </HarnessForm>
      <HarnessForm submit="Save second">
        <Keys page={page} />
        <Field label="Title" name="title" id="second-title" />
      </HarnessForm>
    </>
  ),
};

/** A router that only counts refreshes, so a form that reads the page again runs outside Next. */
const router = {
  back: () => undefined,
  forward: () => undefined,
  prefetch: () => undefined,
  push: () => undefined,
  replace: () => undefined,
  refresh: () => {
    control.refreshes += 1;
    // The server's answer comes back a moment later and renders in place, as Next's does.
    const next = control.refreshRenders.shift();
    if (next !== undefined) {
      setTimeout(() => {
        renderKeys(next);
      }, 20);
    }
    // The response letter form's letters, in a transition as Next's router sets its state: the caller's own transition,
    // if any, ends only once this answer has rendered.
    if (showServer !== null) {
      const show = showServer;
      const answer = new Promise<LetterServerPage>((resolve) => {
        const reply = () => {
          if (!control.failRefreshes) {
            served = { letters: control.letters, upload: control.upload };
          }
          resolve(served);
        };
        if (control.holdRefreshes) {
          heldRefreshes.push(reply);
        } else {
          setTimeout(reply, 20);
        }
      });
      startTransition(() => {
        show(answer);
      });
    }
  },
  bfcacheId: 'harness',
} satisfies AppRouterInstance;

// The refusal a form hands to what takes its place after the refresh, as #50's explanations read it.
Object.assign(window, {
  takeover: { focus: (keys: readonly string[]) => takesFocus(keys, Date.now(), true), orphaned: (prefix: string) => takesOrphanedRefusal(prefix, [], Date.now(), true) },
});

// Each response a form shows inserts a new summary (design 3.5), counted on <body data-shown>, so a test waits for the
// response rather than for time.
let shown = 0;
new MutationObserver((records) => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node instanceof HTMLElement && (node.matches('[data-slot="refusal-summary"]') || node.querySelector('[data-slot="refusal-summary"]') !== null)) {
        shown += 1;
      }
    }
  }
  document.body.dataset.shown = String(shown);
}).observe(document.body, { childList: true, subtree: true });

const name = new URLSearchParams(window.location.search).get('form') ?? 'keep';
const render = forms[name];
const root = document.getElementById('root');
if (render === undefined || root === null) {
  throw new Error(`no harness form ${name}`);
}

/** The page: rendered again, from the root, whenever its keys change, as a refresh renders a server page in place. */
function Page({ form }: { readonly form: (page: PageKeys) => ReactNode }) {
  const page = useSyncExternalStore(
    (listener) => {
      rendered.add(listener);
      return () => {
        rendered.delete(listener);
      };
    },
    () => keys,
  );
  return form(page);
}

createRoot(root).render(
  <StrictMode>
    <AppRouterContext value={router}>
      <Boundary>
        <Page form={render} />
      </Boundary>
    </AppRouterContext>
  </StrictMode>,
);
Object.assign(window, { harnessReady: true });
