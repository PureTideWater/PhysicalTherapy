import { Button } from '@tp/ui';
import { AppRouterContext, type AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { Component, type ReactNode, StrictMode, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// The brand's tokens and the shared stylesheet as written: the browser ignores the Tailwind at-rules, and the unlayered
// rules (the refused mark, 16 px controls, scroll padding, a refused row that wraps) apply as in the app.
import '../../../../../packages/brand/src/tokens.css';
import '../../../../../packages/ui/src/styles.css';
import { CheckboxField, CheckboxGroup, Field, SelectField, TextAreaField } from '../field';
import { FormIssues, PendingStatus, type RefusalState, RefusalSummary, useGuardedSubmit } from '../form-issues';
import { PasswordField } from '../password-field';

/**
 * The page the forms' browser harness serves (test-support/browser.ts; design section 8.2): one form, named by
 * `?form=`, built from the real fields and the real form core, with an in-memory action the test scripts through
 * `window.harness`. Synthetic values only.
 *
 * HarnessForm is ActionForm's body as docs/adr/0077 gives it (the summary first, the fields, the button's wrapper
 * with its status): it stands in for ActionForm until the form core lands on #50's ActionForm, which then replaces it.
 */

/** What the action does on one call: refuse with a state, refuse after the test releases it, drop the connection, or fail. */
type Step = { readonly refuse: RefusalState } | { readonly hold: RefusalState } | { readonly drop: true } | { readonly fail: string };

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
}

const control: HarnessControl = { steps: [], calls: [], release: null, allow: true, refreshes: 0 };
Object.assign(window, { harness: control });

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

function HarnessForm({ submit, className, beforeSubmit, children }: { readonly submit: ReactNode; readonly className?: string; readonly beforeSubmit?: (form: HTMLFormElement) => boolean; readonly children?: ReactNode }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { state, fromBrowser, pending, formAction, onSubmit } = useGuardedSubmit(action, beforeSubmit === undefined ? {} : { beforeSubmit });
  return (
    <FormIssues state={state}>
      {/* data-seq: the response the form shows, so a test waits for it rather than for time. */}
      <form ref={formRef} action={formAction} onSubmit={onSubmit} className={className ?? 'flex flex-col gap-4'} data-seq={state.seq ?? 0}>
        <RefusalSummary state={state} fromBrowser={fromBrowser} submit={submit} formRef={formRef} />
        {children}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" aria-disabled={pending || undefined}>
            {submit}
          </Button>
          <PendingStatus pending={pending} />
        </div>
      </form>
    </FormIssues>
  );
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

const forms: Record<string, () => ReactNode> = {
  /** Every kind of control a refusal must keep, and every secret it must empty (FRM-01). */
  keep: () => (
    <HarnessForm submit="Save">
      <input type="hidden" name="requestKey" value="synthetic-request-key" />
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
  /** A form whose beforeSubmit may refuse to send (the split form, 4.6). */
  split: () => (
    <HarnessForm submit="Approve this split" beforeSubmit={() => control.allow}>
      <Field label="Facility places of service" name="facility" issueFor={['settings']} />
      <input type="hidden" name="settings" value="{}" />
    </HarnessForm>
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
  },
  bfcacheId: 'harness',
} satisfies AppRouterInstance;

const name = new URLSearchParams(window.location.search).get('form') ?? 'keep';
const render = forms[name];
const root = document.getElementById('root');
if (render === undefined || root === null) {
  throw new Error(`no harness form ${name}`);
}
createRoot(root).render(
  <StrictMode>
    <AppRouterContext value={router}>
      <Boundary>{render()}</Boundary>
    </AppRouterContext>
  </StrictMode>,
);
Object.assign(window, { harnessReady: true });
