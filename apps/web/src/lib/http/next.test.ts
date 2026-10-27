import { randomUUID } from 'node:crypto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestAudit } from '../routes/onboarding';
import { signInWithPassword } from '../routes/sign-in';
import { createTicket } from '../routes/support';
import { runAction, runSignInStep } from './next';

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
vi.mock('../server/services', () => ({ services: () => ({ origin: APP, trustedProxyHops: 0 }) }));

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
