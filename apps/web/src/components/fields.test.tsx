import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CheckboxField, CheckboxGroup, Field, SelectField, TextAreaField } from './field';
import { FieldError, FormIssuesContext, PendingStatus, RefusalSummary, type RefusalSummaryProps } from './form-issues';
import { PasswordField } from './password-field';

/**
 * The shared fields as the server renders them inside a refused form and outside one (test matrix FRM-04; docs/adr/0077,
 * D2 and D3): the message under the control, the control marked and described, the names a summary reads, and the
 * secrets' markers. Synthetic values only. The browser behaviour is action-form.browser.test.tsx's.
 */

type Issues = readonly { readonly field: string; readonly message: string }[];

function inForm(node: ReactNode, issues: Issues = [], refused = issues.length > 0): string {
  return renderToStaticMarkup(<FormIssuesContext value={{ issues, refused }}>{node}</FormIssuesContext>);
}

/** An element's attribute, by the element's id. */
function attribute(html: string, id: string, name: string): string | null {
  const tag = new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`).exec(html)?.[0];
  if (tag === undefined) {
    throw new Error(`no element with id ${id}`);
  }
  // HTML attribute names are case-insensitive: React writes spellCheck, the browser reads spellcheck.
  return new RegExp(` ${name}="([^"]*)"`, 'i').exec(tag)?.[1] ?? null;
}

/** The text of the element with this id, which holds text only. */
function textOf(html: string, id: string): string | undefined {
  return new RegExp(`id="${id}"[^>]*>([^<]*)<`).exec(html)?.[1];
}

const ZIP = { field: 'zip', message: 'five digits, or ZIP+4 such as 27601-1234' };

describe('Field (FRM-04)', () => {
  it('shows the form’s message under the control, marked, described by the message first and then the hint', () => {
    const html = inForm(<Field label="Billing ZIP (ZIP+4 if Medicare needs one)" name="zip" defaultValue="27601" hint="Five digits." />, [ZIP]);
    expect(attribute(html, 'field-zip', 'aria-invalid')).toBe('true');
    expect(attribute(html, 'field-zip', 'aria-describedby')).toBe('field-zip-error field-zip-hint');
    // The described element holds the message alone (the shape #42's screening.spec.ts:718 asserts exactly).
    expect(textOf(html, 'field-zip-error')).toBe(ZIP.message);
    expect(html).toMatch(/<div data-field-error="true" class="[^"]*text-destructive[^"]*"><svg aria-hidden="true" focusable="false"[^>]*>.*<\/svg><span aria-hidden="true" class="font-semibold">Error:<\/span><p id="field-zip-error">/);
  });

  it('shows nothing without an issue for it, and nothing outside a form that refuses', () => {
    const html = inForm(<Field label="Billing ZIP" name="zip" hint="Five digits." />, [{ field: 'city', message: 'fill this in' }]);
    expect(attribute(html, 'field-zip', 'aria-invalid')).toBeNull();
    expect(attribute(html, 'field-zip', 'aria-describedby')).toBe('field-zip-hint');
    expect(html).not.toContain('data-field-error');
    expect(renderToStaticMarkup(<Field label="Billing ZIP" name="zip" />)).not.toContain('aria-invalid');
  });

  it('takes its own error over the form’s, and joins several of the form’s messages', () => {
    expect(textOf(inForm(<Field label="ZIP" name="zip" error="not loaded" />, [ZIP]), 'field-zip-error')).toBe('not loaded');
    const html = inForm(<Field label="Facility" name="facility" issueFor={['settings']} />, [
      { field: 'facility', message: 'list at least one place of service' },
      { field: 'settings.2', message: 'a code is in both lists' },
    ]);
    expect(textOf(html, 'field-facility-error')).toBe('list at least one place of service; a code is in both lists');
    expect(attribute(html, 'field-facility', 'data-issue-for')).toBe('settings');
  });

  it('writes the summary’s name and the secret marker on the control: a one-time code is a secret, an email is not', () => {
    expect(attribute(inForm(<Field label="Why (for “Other” only)" name="why" errorName="Why" />), 'field-why', 'data-error-name')).toBe('Why');
    const code = inForm(<Field label="Six-digit code" name="code" autoComplete="one-time-code" hint="Six digits. Spaces are fine." />);
    expect(attribute(code, 'field-code', 'data-secret')).toBe('');
    expect(attribute(inForm(<Field label="Email" name="email" type="email" />), 'field-email', 'data-secret')).toBeNull();
  });

  it('says a refused code was emptied, after the error and before the hint', () => {
    const issue = { field: 'code', message: 'enter the code your authenticator app shows now' };
    const html = inForm(<Field label="Six-digit code" name="code" autoComplete="one-time-code" hint="Six digits. Spaces are fine." />, [issue]);
    expect(attribute(html, 'field-code', 'aria-describedby')).toBe('field-code-error field-code-emptied field-code-hint');
    expect(html).toContain('<p id="field-code-emptied" data-slot="emptied-note" class="text-sm text-muted-foreground">Emptied for your security.</p>');
    // A refusal with no issue on the code (the first step's) still empties it, and says so.
    expect(inForm(<Field label="Six-digit code" name="code" autoComplete="one-time-code" />, [], true)).toContain('Emptied for your security.');
  });
});

describe('SelectField and TextAreaField (FRM-04)', () => {
  it('are marked, described and named like Field, with a hint, passing other props through', () => {
    const select = inForm(
      <SelectField
        label="Response"
        name="response"
        hint="What the payer’s letter says."
        defaultValue="partial"
        errorName="Payer response"
        options={[
          { value: 'accepted', label: 'Accepted' },
          { value: 'partial', label: 'Partially accepted' },
        ]}
        disabled
      />,
      [{ field: 'response', message: 'choose one' }],
    );
    expect(attribute(select, 'field-response', 'aria-invalid')).toBe('true');
    expect(attribute(select, 'field-response', 'aria-describedby')).toBe('field-response-error field-response-hint');
    expect(attribute(select, 'field-response', 'data-error-name')).toBe('Payer response');
    expect(attribute(select, 'field-response', 'disabled')).toBe('');
    expect(textOf(select, 'field-response-hint')).toBe('What the payer’s letter says.');

    const area = inForm(<TextAreaField label="Why (for “Other” only)" name="why" hint="No patient details." />, [{ field: 'why', message: 'fill this in' }]);
    expect(attribute(area, 'field-why', 'aria-invalid')).toBe('true');
    expect(attribute(area, 'field-why', 'aria-describedby')).toBe('field-why-error field-why-hint');
    expect(textOf(area, 'field-why-error')).toBe('fill this in');
    expect(attribute(inForm(<TextAreaField label="Why" name="why" />), 'field-why', 'aria-invalid')).toBeNull();
  });
});

describe('CheckboxField (FRM-04)', () => {
  it('marks and describes its box, and its wrapper carries data-invalid, only when refused', () => {
    const confirm = <CheckboxField name="confirm" label="This line will not be pursued." errorName="Confirmation" required />;
    const html = inForm(confirm, [{ field: 'confirm', message: 'tick the box to confirm' }]);
    expect(html).toMatch(/^<div data-slot="checkbox-field" data-invalid=""/);
    expect(attribute(html, 'field-confirm', 'aria-invalid')).toBe('true');
    expect(attribute(html, 'field-confirm', 'aria-describedby')).toBe('field-confirm-error');
    expect(attribute(html, 'field-confirm', 'data-error-name')).toBe('Confirmation');
    expect(textOf(html, 'field-confirm-error')).toBe('tick the box to confirm');
    expect(html).toContain('<label for="field-confirm">This line will not be pursued.</label>');
    const clean = inForm(confirm);
    expect(clean).not.toContain('data-invalid');
    expect(attribute(clean, 'field-confirm', 'aria-invalid')).toBeNull();
  });
});

describe('CheckboxGroup (FRM-04)', () => {
  const group = (
    <CheckboxGroup
      legend="Components affected"
      issueKey="components"
      hint="Each part of the service this touches."
      options={[
        { name: 'components[]', value: 'uploads', label: 'Uploads' },
        { name: 'components[]', value: 'pricing', label: 'Pricing', defaultChecked: true },
      ]}
    />
  );

  it('puts the message inside the fieldset after the legend and hint, and the fieldset names both', () => {
    const html = inForm(group, [{ field: 'components', message: 'choose at least one component' }]);
    expect(html).toMatch(/^<fieldset data-issue-for="components" data-invalid="" aria-describedby="group-components-error group-components-hint"/);
    expect(html.indexOf('<legend')).toBeLessThan(html.indexOf('id="group-components-hint"'));
    expect(html.indexOf('id="group-components-hint"')).toBeLessThan(html.indexOf('data-field-error'));
    expect(html.indexOf('data-field-error')).toBeLessThan(html.indexOf('type="checkbox"'));
    expect(textOf(html, 'group-components-error')).toBe('choose at least one component');
    expect(html).toContain('name="components[]" checked="" value="pricing"');
  });

  it('reads an issue on one of its entries ("kept.3"), and nothing without one', () => {
    const kept = (
      <CheckboxGroup
        legend="Keep the items that apply"
        issueKey="kept"
        options={[
          { name: 'keep:0', label: 'First' },
          { name: 'keep:1', label: 'Second' },
        ]}
      />
    );
    expect(inForm(kept, [{ field: 'kept.1', message: 'that item is no longer on the checklist' }])).toContain('data-invalid=""');
    expect(inForm(group)).not.toContain('data-invalid');
    expect(inForm(group)).toMatch(/^<fieldset data-issue-for="components" aria-describedby="group-components-hint"/);
  });
});

describe('PasswordField (FRM-07)', () => {
  const field = (
    <PasswordField
      label="New password"
      name="password"
      showName=" new password"
      autoComplete="new-password"
      required
      hint="At least 12 characters, with a lowercase letter, an uppercase letter, a digit and a symbol."
    />
  );

  it('is a secret password field with no spelling service, described by its hint alone before any refusal', () => {
    const html = inForm(field);
    for (const [name, value] of [
      ['type', 'password'],
      ['data-secret', ''],
      ['spellcheck', 'false'],
      ['autocorrect', 'off'],
      ['autocapitalize', 'none'],
      ['autocomplete', 'new-password'],
      ['aria-describedby', 'field-password-hint'],
    ] as const) {
      expect(attribute(html, 'field-password', name), name).toBe(value);
    }
  });

  it('renders Show hidden until mounted, named by its words and never an aria-label', () => {
    const html = inForm(field);
    expect(html).toMatch(/<button [^>]*type="button" aria-pressed="false" aria-controls="field-password" hidden="">Show<span class="sr-only"> new password<\/span><\/button>/);
    expect(html).not.toContain('aria-label');
  });

  it('after a refusal, is described by its error, then the emptied note, then its hint', () => {
    const html = inForm(field, [{ field: 'password', message: 'it still needs an uppercase letter, a digit and a symbol' }]);
    expect(attribute(html, 'field-password', 'aria-describedby')).toBe('field-password-error field-password-emptied field-password-hint');
    expect(html).toContain('<p id="field-password-emptied" data-slot="emptied-note" class="text-sm text-muted-foreground">Emptied for your security: type it again.</p>');
  });
});

describe('FieldError and PendingStatus', () => {
  it('renders no error line without a message', () => {
    expect(renderToStaticMarkup(<FieldError id="field-zip" error={undefined} />)).toBe('');
  });

  it('is a polite status from the first render, empty until pending', () => {
    expect(renderToStaticMarkup(<PendingStatus pending={false} />)).toBe('<p role="status" class="text-sm text-muted-foreground" data-slot="pending-status"></p>');
    expect(renderToStaticMarkup(<PendingStatus pending />)).toContain('>Working…</p>');
  });
});

describe('RefusalSummary as the server renders it (FRM-04, FRM-06: the post without JavaScript)', () => {
  const summary = (state: RefusalSummaryProps['state'], fromBrowser = false) => renderToStaticMarkup(<RefusalSummary state={state} fromBrowser={fromBrowser} submit="Open ticket" formRef={{ current: null }} />);

  it('renders nothing without a refusal', () => {
    expect(summary({})).toBe('');
  });

  it('is first-in-form markup: focusable, on a line of its own, with each message alone and never a key', () => {
    const html = summary({ error: 'Fix the fields listed here, then try again.', invalid: true, issues: [{ field: 'organizationName', message: 'this form takes no patient information' }, { field: 'input', message: 'one of the two is needed' }] });
    expect(html).toMatch(/^<div data-slot="refusal-summary" role="alert" class="[^"]*col-span-full basis-full w-full[^"]*" data-state="error" tabindex="-1">/);
    expect(html).toContain('<div data-slot="alert-title" class="font-medium tracking-tight">Not done</div>');
    // Before the page is read, the lead counts the issues whose key could be a field: one here.
    expect(html).toContain('<p>Fix the field listed here, then try again.</p>');
    expect(html).toContain('>This form takes no patient information</li>');
    expect(html).toContain('>One of the two is needed</li>');
    expect(html).not.toContain('organizationName');
    expect(html).not.toContain('<a ');
  });

  it('says a page out of date was not saved, and invites a press again only after the person’s own press', () => {
    const stale = { error: 'This page was out of date, so nothing was saved.', stale: true };
    expect(summary(stale)).toContain('<p>This page was out of date, so nothing was saved. Check the form, then send it again if you still mean to.</p>');
    expect(summary(stale, true)).toContain('<p>This page was out of date, so nothing was saved. It is up to date now: press “Open ticket” again.</p>');
  });

  it('names a locked account and an unconfirmed save in its title and state', () => {
    expect(summary({ error: 'Ten failed attempts locked this account.', locked: true })).toMatch(/data-state="locked"[^>]*>.*>Account locked<\/div>/);
    const unconfirmed = summary({ unconfirmed: true, seq: 2 }, true);
    expect(unconfirmed).toContain('data-state="unconfirmed"');
    expect(unconfirmed).toContain('>Not confirmed</div>');
    expect(unconfirmed).toContain('then press “Open ticket” again.</p>');
  });
});
