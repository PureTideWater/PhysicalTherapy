import { randomUUID } from 'node:crypto';

import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FormKeys } from '../../components/form-keys';
import { Sealer } from '../auth/seal';
import { requestAudit } from '../routes/onboarding';
import { type StepResult, signInWithPassword } from '../routes/sign-in';
import { createTicket } from '../routes/support';
import { services } from '../server/services';
import { formActorTag, loadPage, pageFormActor, runAction, runSignInStep } from './next';
import type { MutationResult, Outcome, Route } from './route';

/**
 * What a refused form's state carries back to the browser (test matrix FRM-01, "the action's state carries no value the
 * person typed"; docs/adr/0077): the real adapters over real routes, refused before any database is reached (the
 * origin, the request key, the input's parse), with Next's request context stood in. Synthetic values only.
 */

const APP = 'https://app.synthetic.test';
const sent = { origin: APP as string | null };

vi.mock('next/headers', () => ({
  headers: () => Promise.resolve(new Headers(sent.origin === null ? {} : { origin: sent.origin, 'sec-fetch-site': 'same-origin' })),
  cookies: () => Promise.resolve({ get: () => undefined, set: () => undefined }),
}));
vi.mock('../server/services', async () => {
  const { randomBytes } = await import('node:crypto');
  const { Sealer: Keyed } = await import('../auth/seal');
  const sealer = new Keyed(randomBytes(32));
  return { services: () => ({ origin: APP, trustedProxyHops: 0, sealer }) };
});
// React's cache outside a server render calls through each time; here, as in a page's render, one request is one object.
vi.mock('react', async (original) => {
  return {
    ...(await original<object>()),
    cache: (make: () => unknown) => {
      let made: { readonly value: unknown } | undefined;
      return () => (made ??= { value: make() }).value;
    },
  };
});

/** A form's data from its fields. */
function formOf(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.append(name, value);
  }
  return form;
}

/** Every value typed into a form, each long and odd enough that no rule's words could hold it by chance. */
function typedValues(fields: Record<string, string>): readonly string[] {
  return Object.values(fields).filter((value) => value.length >= 8);
}

/** A fresh request key each run (a literal one reads to a secret scanner as a stored key). */
const REQUEST_KEY = randomUUID();
/** A synthetic password the form is sent with, joined from words so no scanner reads it as a stored secret. */
const TYPED_PASSWORD = ['Synthetic', 'typed', 'secret', '2026'].join('-');

const AUDIT_REQUEST = {
  contactName: 'Synthetic Typed Contact',
  contactEmail: 'typed-not-an-email',
  organizationName: 'SYNTHETIC TYPED ORGANIZATION',
  locations: 'typed-locations',
  payers: 'Synthetic Typed Payer',
  billingArrangement: 'typed-arrangement',
  heardFrom: 'typed-heard-from',
};

const TICKET = { requestKey: REQUEST_KEY, screen: 'typed-screen-name', category: 'typed-category', subject: 'SYNTHETIC typed subject line', message: 'SYNTHETIC typed message body' };

describe('a refused form’s state (FRM-01: it carries no value the person typed)', () => {
  beforeEach(() => {
    sent.origin = APP;
  });

  it('FRM-01: an invalid audit request names each field and the rule’s words, and holds none of the values sent', async () => {
    const state = await runAction(requestAudit, formOf(AUDIT_REQUEST));
    expect(state.invalid).toBe(true);
    expect(state.issues?.map((issue) => issue.field)).toEqual(expect.arrayContaining(['contactEmail', 'locations', 'billingArrangement', 'heardFrom']));
    const carried = JSON.stringify(state);
    for (const value of typedValues(AUDIT_REQUEST)) {
      expect(carried).not.toContain(value);
    }
  });

  it('FRM-01: an invalid ticket, and one with no request key, hold none of the values sent; a missing key is a page out of date', async () => {
    const invalid = await runAction(createTicket, formOf(TICKET));
    expect(invalid.invalid).toBe(true);
    const { requestKey: _key, ...withoutKey } = TICKET;
    const stale = await runAction(createTicket, formOf(withoutKey));
    expect(stale.stale).toBe(true);
    expect(stale.issues).toBeUndefined();
    for (const state of [invalid, stale]) {
      const carried = JSON.stringify(state);
      for (const value of typedValues(TICKET)) {
        expect(carried).not.toContain(value);
      }
    }
  });

  it('FRM-01: a post from another origin is a page out of date, whose words still give a next step to a form that does not read the page again', async () => {
    sent.origin = 'https://elsewhere.synthetic.test';
    const state = await runAction(createTicket, formOf(TICKET));
    expect(state).toEqual({ error: 'This page was out of date, so nothing was saved. Reload the page and try again.', stale: true });
  });

  it('FRM-01, FRM-07: a refused sign-in step holds neither the email nor the password sent', async () => {
    const fields = { email: 'typed-not-an-email-address', password: TYPED_PASSWORD };
    const state = await runSignInStep(signInWithPassword, formOf(fields));
    expect(state.issues?.map((issue) => issue.field)).toEqual(['email']);
    const carried = JSON.stringify(state);
    for (const value of typedValues(fields)) {
      expect(carried).not.toContain(value);
    }
  });
});

/** A route whose outcome is given: the adapters' mapping, without a database. */
function answering<R>(outcome: Outcome<R>): Route<R> {
  return { invoke: () => Promise.resolve(outcome) } as unknown as Route<R>;
}

describe('a request key used before (U-UX-4)', () => {
  it('says the form was already sent and flags it, so the summary titles it "Already sent", never "Not done"', async () => {
    const state = await runAction(answering<MutationResult>({ status: 'duplicate' }), formOf(TICKET));
    expect(state).toEqual({ error: 'This form was already sent, so nothing new was saved. Reload the page to see the result.', duplicate: true });
  });

  it('flags only a used key: an outcome this adapter has no words for yet is a plain refusal, never "Already sent"', async () => {
    const unknown = { status: 'synthetic_future_status' } as unknown as Outcome<MutationResult>;
    expect(await runAction(answering<MutationResult>(unknown), formOf(TICKET))).toEqual({ error: 'Reload the page and try again.' });
  });
});

describe('a sign-in step no press of its form can mend (S-A11Y-2, U-UX-3; docs/adr/0077, D2)', () => {
  const expired = { error: 'This invitation has expired. Ask your organization’s administrator to send it again.', final: true };

  it('carries the route’s final flag to the form, and flags its own "Start again", so the password’s note asks for nothing', async () => {
    expect(await runSignInStep(answering<StepResult>({ status: 'ok', data: expired }), formOf({}))).toEqual(expired);
    expect(await runSignInStep(answering<StepResult>({ status: 'not_found' }), formOf({}))).toEqual({ error: 'Sign-in could not continue. Start again.', final: true });
  });

  it('never flags a refusal a right password may mend', async () => {
    const wrong = { error: 'That did not match. Check the email, the password or the code, and try again.' };
    expect(await runSignInStep(answering<StepResult>({ status: 'ok', data: wrong }), formOf({}))).toEqual(wrong);
    expect((await runSignInStep(answering<StepResult>({ status: 'rate_limited', retryAfterSeconds: 900 }), formOf({}))).final).toBeUndefined();
  });
});

describe('the mark of the person a page’s forms are rendered for (S-SEC-2; docs/adr/0077, D10)', () => {
  const email = 'Synthetic.Person@Example.test';

  it('is the same for every session of one person, another for anyone else, and holds no part of the email', () => {
    const { sealer } = services();
    const tag = formActorTag(sealer, email);
    expect(formActorTag(sealer, ' synthetic.person@example.test ')).toBe(tag);
    expect(formActorTag(sealer, 'synthetic.other@example.test')).not.toBe(tag);
    // Keyed on the server: another key, another mark.
    expect(formActorTag(new Sealer(new Uint8Array(32).fill(7)), email)).not.toBe(tag);
    expect(tag).toMatch(/^[\w-]{43}$/);
    for (const part of ['synthetic', 'person', 'example']) {
      expect(tag.toLowerCase()).not.toContain(part);
    }
  });

  it('is set by loadPage from the page’s shell and rendered by FormKeys on an element that is never posted', async () => {
    const shell = { email, practices: [], currentPracticeId: null, platformRoles: [] };
    await loadPage(answering({ status: 'ok', data: {}, shell }), {});
    const tag = formActorTag(services().sealer, email);
    expect(pageFormActor()).toBe(tag);
    const html = renderToStaticMarkup(await FormKeys());
    expect(html).toContain(`<span hidden="" data-form-actor="${tag}"></span>`);
    // Not a field: only the request key and the CSRF token have names.
    expect([...html.matchAll(/name="([^"]+)"/g)].map((match) => match[1])).toEqual(['requestKey', 'csrfToken']);
    expect(html.toLowerCase()).not.toContain('synthetic.person');
  });
});
