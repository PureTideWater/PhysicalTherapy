import { randomUUID } from 'node:crypto';

import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import type { StepResult } from '../routes/sign-in';
import { services } from '../server/services';
import type { CookieJar, Issue, MutationResult, Outcome, Route, RouteRequest, Shell } from './route';

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

async function nextRequest(params: unknown, input?: unknown): Promise<RouteRequest> {
  return { cookies: await nextCookies(), params, input, requestId: randomUUID(), userAgent: (await headers()).get('user-agent') };
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

/** What a form shows after a server action that did not move on. */
export interface ActionState {
  readonly error?: string;
  readonly issues?: readonly Issue[];
  readonly problems?: readonly string[];
  readonly locked?: boolean;
}

function formInput(form: FormData): Record<string, string> {
  const input: Record<string, string> = {};
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string' && !name.startsWith('$ACTION')) {
      input[name] = value;
    }
  }
  return input;
}

/**
 * Runs a mutation's route from a form. Success redirects (Post/Redirect/Get); a refusal returns the
 * form's state. A practice action names its practice and records in `params` (opaque IDs the form
 * carries), which its route checks like a page's.
 */
export async function runAction(route: Route<MutationResult>, form: FormData, params: Record<string, unknown> = {}): Promise<ActionState> {
  const outcome = await route.invoke(await nextRequest(params, formInput(form)), services());
  const signIn = signInFor(outcome);
  if (signIn !== undefined) {
    redirect(signIn);
  }
  if (outcome.status === 'ok') {
    redirect(outcome.data.redirect ?? '/');
  }
  if (outcome.status === 'invalid') {
    return { error: 'Check the fields marked below.', issues: outcome.issues };
  }
  if (outcome.status === 'forbidden') {
    return { error: `Not available to your role: ${outcome.message}.` };
  }
  if (outcome.status === 'not_found') {
    return { error: 'That record is no longer there. Reload the page.' };
  }
  return { error: 'This form was already submitted. Reload the page to see the result.' };
}

/** Runs a sign-in step from a form: on to the next step, or the step's error. */
export async function runSignInStep(route: Route<StepResult>, form: FormData): Promise<ActionState> {
  const outcome = await route.invoke(await nextRequest({}, formInput(form)), services());
  if (outcome.status === 'invalid') {
    return { error: 'Check the fields marked below.', issues: outcome.issues };
  }
  if (outcome.status !== 'ok') {
    return { error: 'Sign-in could not continue. Start again.' };
  }
  if ('redirect' in outcome.data) {
    redirect(outcome.data.redirect);
  }
  return outcome.data;
}
