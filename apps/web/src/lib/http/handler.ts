import { randomUUID } from 'node:crypto';

import type { Services } from '../server/services';
import type { CookieJar, Outcome, Route } from './route';

/**
 * The route-handler adapter (route.ts files): a Web Request in, a Web Response out, through the same
 * invoke() as pages and server actions. Built on the Fetch API only, so it is tested without a Next
 * server. Every response is JSON with Cache-Control: private, no-store; cookies are written with
 * HttpOnly, Secure, SameSite=Lax and path / (docs/product/sessions.md).
 */

export const PRIVATE_NO_STORE = 'private, no-store';

const STATUS: Readonly<Record<Outcome<unknown>['status'], number>> = {
  ok: 200,
  invalid: 400,
  unauthenticated: 401,
  mfa_required: 401,
  hardware_key_required: 401,
  forbidden: 403,
  not_found: 404,
  duplicate: 409,
};

function readCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) {
      cookies.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
    }
  }
  return cookies;
}

export function setCookieHeader(name: string, value: string, maxAgeSeconds: number | undefined): string {
  const age = maxAgeSeconds === undefined ? '' : `; Max-Age=${String(maxAgeSeconds)}`;
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax${age}`;
}

/** A cookie jar over a request's Cookie header that records what to set on the response. */
export class ResponseCookies implements CookieJar {
  readonly written: string[] = [];
  private readonly values: Map<string, string>;

  constructor(header: string | null) {
    this.values = readCookies(header);
  }

  get(name: string): string | undefined {
    return this.values.get(name);
  }

  set(name: string, value: string, options?: { readonly maxAgeSeconds?: number }): void {
    this.values.set(name, value);
    this.written.push(setCookieHeader(name, value, options?.maxAgeSeconds));
  }

  delete(name: string): void {
    this.values.delete(name);
    this.written.push(setCookieHeader(name, '', 0));
  }
}

/** The outcome as a JSON response: the data on success, the status and its details otherwise. */
export function outcomeResponse(outcome: Outcome<unknown>, cookies: ResponseCookies): Response {
  const body = outcome.status === 'ok' ? outcome.data : outcome;
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': PRIVATE_NO_STORE });
  for (const cookie of cookies.written) {
    headers.append('set-cookie', cookie);
  }
  return new Response(JSON.stringify(body ?? null), { status: STATUS[outcome.status], headers });
}

type Params = Promise<Record<string, string | string[] | undefined>>;

/** A Next route handler for a registered route. GET reads the URL's parameters; POST also reads a JSON body. */
export function routeHandler(route: Route, servicesOf: () => Services) {
  return async (request: Request, context?: { readonly params?: Params }): Promise<Response> => {
    const cookies = new ResponseCookies(request.headers.get('cookie'));
    const params = { ...Object.fromEntries(new URL(request.url).searchParams), ...((await context?.params) ?? {}) };
    let input: unknown;
    if (request.method === 'POST') {
      try {
        input = await request.json();
      } catch {
        return outcomeResponse({ status: 'invalid', issues: [{ field: 'input', message: 'a JSON body' }] }, cookies);
      }
    }
    const outcome = await route.invoke({ cookies, params, input, requestId: randomUUID(), userAgent: request.headers.get('user-agent') }, servicesOf());
    return outcomeResponse(outcome, cookies);
  };
}
