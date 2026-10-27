import { randomUUID } from 'node:crypto';

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import type { StepResult } from '../routes/sign-in';
import { services } from '../server/services';
import { formInput } from './form';
import { clientAddress, retryMinutes } from './rate-limit';
import { RECEIVED_AT_HEADER, receivedAtFrom } from './received';
import type { CookieJar, Issue, MutationResult, Outcome, Route, RouteRequest, Shell, UploadBody } from './route';

/**
 * The Next.js adapters for pages (server components) and server actions; route handlers use
 * handler.ts. Each builds a RouteRequest from Next's cookies and headers and runs the route's
 * invoke(); the authorization is in invoke() and in Postgres, never in middleware (there is none).
 * Pages render per request (the root layout is force-dynamic), so Next sends every page with
 * Cache-Control: private, no-cache, no-store; the e2e tests check it on the PHI pages.
 */

const COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/' };

async function nextCookies(): Promise<CookieJar> {
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, options) => {
      store.set(name, value, { ...COOKIE_OPTIONS, maxAge: options?.maxAgeSeconds });
    },
    delete: (name) => {
      store.set(name, '', { ...COOKIE_OPTIONS, maxAge: 0 });
    },
  };
}

async function nextRequest(params: unknown, input?: unknown, upload?: UploadBody): Promise<RouteRequest> {
  const sent = await headers();
  return {
    cookies: await nextCookies(),
    params,
    input,
    ...(upload === undefined ? {} : { upload }),
    requestId: randomUUID(),
    userAgent: sent.get('user-agent'),
    origin: sent.get('origin'),
    fetchSite: sent.get('sec-fetch-site'),
    clientAddress: clientAddress(sent.get('x-forwarded-for'), services().trustedProxyHops),
    // The proxy's stamp of the request's arrival (it overwrites any copy the client sent).
    receivedAt: receivedAtFrom(sent.get(RECEIVED_AT_HEADER)),
  };
}

/** Where a refused request goes to sign in again; the reason is a code, never an identifier. */
function signInFor(outcome: Outcome<unknown>): string | undefined {
  if (outcome.status === 'unauthenticated') {
    return outcome.reason === 'none' ? '/sign-in' : `/sign-in?reason=${outcome.reason}`;
  }
  if (outcome.status === 'mfa_required') {
    return '/sign-in?reason=mfa_required';
  }
  if (outcome.status === 'hardware_key_required') {
    return '/sign-in/hardware-key?reason=hardware_key_required';
  }
  // A customer who has not accepted the terms of use in force accepts them first; maintenance shows its page.
  if (outcome.status === 'terms_required') {
    return '/terms';
  }
  if (outcome.status === 'maintenance') {
    return '/maintenance';
  }
  return undefined;
}

/** What a refused form says when the wrapper's rate limits refused it (a refused CSRF token is a page out of date, STALE). */
function guardMessage(outcome: Outcome<unknown>): string | undefined {
  if (outcome.status === 'rate_limited') {
    return `Too many attempts in a short time. Wait ${String(retryMinutes(outcome.retryAfterSeconds))} minute${retryMinutes(outcome.retryAfterSeconds) === 1 ? '' : 's'} and try again.`;
  }
  return undefined;
}

export type PageResult<R> =
  | { readonly kind: 'ok'; readonly data: R; readonly shell: Shell | undefined }
  | { readonly kind: 'forbidden'; readonly message: string; readonly roles: readonly string[]; readonly shell: Shell | undefined };

type PageParams = Promise<Record<string, string | string[] | undefined>> | undefined;

async function paramsOf(params: PageParams, searchParams: PageParams): Promise<Record<string, unknown>> {
  return { ...((await searchParams) ?? {}), ...((await params) ?? {}) };
}

/** Runs a page's route. A refused session redirects to sign-in; a practice the actor cannot reach is a 404. */
export async function loadPage<R>(route: Route<R>, props: { readonly params?: PageParams; readonly searchParams?: PageParams }): Promise<PageResult<R>> {
  const outcome = await route.invoke(await nextRequest(await paramsOf(props.params, props.searchParams)), services());
  const signIn = signInFor(outcome);
  if (signIn !== undefined) {
    redirect(signIn);
  }
  if (outcome.status === 'ok') {
    return { kind: 'ok', data: outcome.data, shell: outcome.shell };
  }
  if (outcome.status === 'forbidden') {
    return { kind: 'forbidden', message: outcome.message, roles: outcome.roles, shell: outcome.shell };
  }
  notFound();
}

/** A public page whose handler may send the browser elsewhere (a sign-in step that has expired). */
export async function loadPublicPage<R extends object>(route: Route<R | StepResult>, props: { readonly params?: PageParams; readonly searchParams?: PageParams }): Promise<R> {
  const outcome = await route.invoke(await nextRequest(await paramsOf(props.params, props.searchParams)), services());
  if (outcome.status !== 'ok') {
    notFound();
  }
  if ('redirect' in outcome.data) {
    redirect(outcome.data.redirect);
  }
  return outcome.data as R;
}

/**
 * What a form shows after a server action that did not move on: flags, keys and the rule's own words, never a value
 * the person typed (the form keeps those in the browser, docs/adr/0077).
 */
export interface ActionState {
  readonly error?: string;
  /** The error is the lead of an invalid form, which the browser may choose again from the issues it places (ActionForm's summaryLead). */
  readonly invalid?: boolean;
  readonly issues?: readonly Issue[];
  readonly locked?: boolean;
  /** The page's CSRF token or request key was out of date: the form reads the page again and keeps what was typed. */
  readonly stale?: boolean;
}

/** The lead of an invalid form; the browser says "field" for one field it places (summaryLead). */
const INVALID_LEAD = 'Fix the fields listed here, then try again.';

/**
 * A page out of date (a CSRF token its session has overtaken, or a missing or garbled request key): nothing was saved,
 * and the form reads the page again, which renders a fresh token and key in place, so what was typed stays (ADR 0077).
 * The flag marks it: a form that reads the page again (ActionForm's summary, the version and export forms) writes its
 * own next step, which depends on whether the person's own press sent the post, in place of these words. These are for
 * a form that does not (the screening upload, a #42 file, until it does), so its refusal still has a next step.
 */
const STALE: ActionState = { error: 'This page was out of date, so nothing was saved. Reload the page and try again.', stale: true };

/** Whether an invalid outcome only says the request key is missing or garbled (invoke.ts), which a fresh page mends. */
function onlyRequestKey(issues: readonly Issue[]): boolean {
  return issues.length > 0 && issues.every((issue) => issue.field === 'requestKey');
}

/** A refused form's state for an outcome the wrapper's guards or the input's parse refused, or undefined for any other. */
function refusedInput(outcome: Outcome<unknown>): ActionState | undefined {
  if (outcome.status === 'csrf_refused' || (outcome.status === 'invalid' && onlyRequestKey(outcome.issues))) {
    return STALE;
  }
  const guarded = guardMessage(outcome);
  if (guarded !== undefined) {
    return { error: guarded };
  }
  if (outcome.status === 'invalid') {
    return { error: INVALID_LEAD, invalid: true, issues: outcome.issues };
  }
  return undefined;
}

/** A form's file field as the route's streamed upload (an agreement's signed copy), or none. */
function formUpload(form: FormData, field: string | undefined): UploadBody | undefined {
  if (field === undefined) {
    return undefined;
  }
  const file = form.get(field);
  if (file === null || typeof file === 'string') {
    return undefined;
  }
  return { contentType: file.type === '' ? null : file.type, contentLength: file.size, body: file.stream() as unknown as AsyncIterable<Uint8Array> };
}

/**
 * Runs a mutation's route from a form. Success redirects (Post/Redirect/Get); a refusal returns the
 * form's state. A practice action names its practice and records in `params` (opaque IDs the form
 * carries), which its route checks like a page's.
 */
export async function runAction(route: Route<MutationResult>, form: FormData, params: Record<string, unknown> = {}, options: { readonly fileField?: string } = {}): Promise<ActionState> {
  const outcome = await route.invoke(await nextRequest(params, formInput(form), formUpload(form, options.fileField)), services());
  const signIn = signInFor(outcome);
  if (signIn !== undefined) {
    redirect(signIn);
  }
  if (outcome.status === 'ok') {
    redirect(outcome.data.redirect ?? '/');
  }
  const refusal = refusedInput(outcome);
  if (refusal !== undefined) {
    return refusal;
  }
  if (outcome.status === 'forbidden') {
    return { error: `Not available to your role: ${outcome.message}.` };
  }
  if (outcome.status === 'not_found') {
    return { error: 'That record is no longer there. Reload the page.' };
  }
  if (outcome.status === 'suspended') {
    return { error: `Not started: ${outcome.reason}.` };
  }
  return { error: 'This form was already submitted. Reload the page to see the result.' };
}

/** Runs a sign-in step from a form: on to the next step, or the step's error. */
export async function runSignInStep(route: Route<StepResult>, form: FormData): Promise<ActionState> {
  const outcome = await route.invoke(await nextRequest({}, formInput(form)), services());
  const refusal = refusedInput(outcome);
  if (refusal !== undefined) {
    return refusal;
  }
  if (outcome.status !== 'ok') {
    return { error: 'Sign-in could not continue. Start again.' };
  }
  if ('redirect' in outcome.data) {
    redirect(outcome.data.redirect);
  }
  return outcome.data;
}
