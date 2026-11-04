import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SIGN_IN_REASONS, type PasswordToUse, type SignInReason } from '../../lib/routes/sign-in';
import { SignInNotice } from './notice';
import { StepHeading } from './step-heading';

/**
 * Why a person is back on a sign-in page after a step closed or was started again (docs/adr/0081; test matrix SGN-03,
 * SGN-04): on the password page the words say the email is filled in and which password starts again, and on the
 * hardware-key page they speak of the key alone; either notice is a note that takes the focus on arrival, and no other
 * reason's is. The address itself is never in the notice: the page passes only which password to use. The focus needs a
 * browser (the e2e takes it); the server render is read here. Synthetic values only.
 */

const RESTARTS = ['step_expired', 'restarted'] as const;

/** PaidWhole's support address as the page passes it (synthetic): not the person's, so it may sit in the words. */
const SUPPORT = 'support@synthetic.test';

function notice(props: { readonly reason: SignInReason | null; readonly kept?: { readonly use: PasswordToUse | null }; readonly surface?: 'password' | 'key' }): string {
  return renderToStaticMarkup(<SignInNotice supportEmail={SUPPORT} {...props} />);
}

/** The notice's text, its title and words run together as a screen reader reads them. */
function text(markup: string): string {
  return markup
    .replace(/<\/div>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('the sign-in notice after a step', () => {
  it('SGN-03: says the step closed, and that the email is filled in when it was kept', () => {
    expect(text(notice({ reason: 'step_expired' }))).toBe('Sign-in step closed That sign-in step closed. Start again from your email and password.');
    expect(text(notice({ reason: 'step_expired', kept: { use: null } }))).toBe('Sign-in step closed That sign-in step closed. Your email is filled in: type your password to start again.');
    expect(text(notice({ reason: 'restarted' }))).toBe('Start again Start again from your email and password.');
    expect(text(notice({ reason: 'restarted', kept: { use: null } }))).toBe('Start again Your email is filled in: type your password to start again.');
  });

  it('SGN-03: names the password that starts again: the invitation’s until a new one was saved, then the chosen one', () => {
    for (const reason of RESTARTS) {
      expect(text(notice({ reason, kept: { use: 'temporary' } }))).toMatch(/type your password to start again\. Use the temporary password from your invitation\.$/);
      expect(text(notice({ reason, kept: { use: 'chosen' } }))).toMatch(/type your password to start again\. Use the password you chose: the temporary one no longer works\.$/);
      // With no email kept nothing says which password: the page does not know whose step it was.
      expect(text(notice({ reason }))).not.toMatch(/temporary|you chose/);
    }
  });

  it('SGN-03: on the hardware-key page speaks of the key, never of a password or an email', () => {
    expect(text(notice({ reason: 'step_expired', surface: 'key' }))).toBe('Sign-in step closed That sign-in step closed. Start again with your hardware key.');
    expect(text(notice({ reason: 'restarted', surface: 'key' }))).toBe('Start again Start again with your hardware key.');
    for (const reason of RESTARTS) {
      for (const kept of [undefined, { use: 'chosen' as const }]) {
        expect(text(notice({ reason, surface: 'key', ...(kept === undefined ? {} : { kept }) }))).not.toMatch(/password|email/i);
      }
    }
    // The key page's other reasons read as they do on the password page.
    expect(notice({ reason: 'key_registered', surface: 'key' })).toBe(notice({ reason: 'key_registered' }));
  });

  it('SGN-03: takes the focus on arrival for the two restart reasons only, on either page, as a note said once, never also a live region', () => {
    for (const reason of SIGN_IN_REASONS) {
      for (const surface of ['password', 'key'] as const) {
        const markup = notice({ reason, surface });
        const focusable = /^<div[^>]*data-slot="arrival-focus"[^>]*>/.exec(markup);
        if ((RESTARTS as readonly string[]).includes(reason)) {
          // The notice itself is what takes the focus: one element, a note, with nothing around it.
          expect(focusable?.[0], `${reason} on ${surface}`).toContain('tabindex="-1"');
          expect(focusable?.[0], `${reason} on ${surface}`).toContain('role="note"');
          expect(markup.match(/role="/g), `${reason} on ${surface}`).toHaveLength(1);
          expect(markup, `${reason} on ${surface}`).not.toMatch(/role="status"|aria-live/);
        } else {
          expect(focusable, `${reason} on ${surface}`).toBeNull();
          expect(markup).toMatch(/^<div[^>]*role="status"/);
          expect(markup).not.toContain('tabindex');
        }
        expect(markup).not.toContain('role="alert"');
      }
    }
    expect(notice({ reason: null })).toBe('');
  });

  it('SGN-03: never holds an address, nor any attribute that could carry one', () => {
    for (const reason of RESTARTS) {
      for (const use of ['temporary', 'chosen', null] as const) {
        const markup = notice({ reason, kept: { use } });
        expect(markup).not.toContain('@');
        expect(markup).not.toMatch(/data-(?!slot|reason)[a-z-]+=/);
      }
    }
  });
});

describe('the locked notice (UX-066)', () => {
  it('SGN-08: names the support address to write to from the address the person signs in with, on either page, and never offers a reset as the way out', () => {
    for (const surface of ['password', 'key'] as const) {
      const markup = notice({ reason: 'locked', surface });
      expect(text(markup)).toBe(`Account locked This account was locked after ten failed attempts. Write to ${SUPPORT} from the address you sign in with to have it unlocked.`);
      expect(markup).toMatch(/^<div[^>]*role="status"/);
      expect(text(markup)).not.toMatch(/reset|forgot|platform administrator/i);
    }
    // The address is the one the page is given, never a fixed one.
    expect(renderToStaticMarkup(<SignInNotice reason="locked" supportEmail="help@synthetic.test" />)).toContain('Write to help@synthetic.test from');
  });
});

describe('a sign-in step’s heading', () => {
  it('SGN-04: carries the setup step as a caption read with the name, "Step 1 of 2: Choose a password"', () => {
    const markup = renderToStaticMarkup(<StepHeading setup={{ at: 1, of: 2 }}>Choose a password</StepHeading>);
    expect(markup).toMatch(/^<h1 [^>]*><span data-slot="step-marker"[^>]*>Step 1 of 2<span class="opacity-0">: <\/span><\/span>Choose a password<\/h1>$/);
    expect(text(markup)).toBe('Step 1 of 2: Choose a password');
  });

  it('SGN-04: carries no marker on a step that is not numbered', () => {
    const markup = renderToStaticMarkup(<StepHeading setup={null}>Verification code</StepHeading>);
    expect(markup).not.toContain('step-marker');
    expect(text(markup)).toBe('Verification code');
  });
});
