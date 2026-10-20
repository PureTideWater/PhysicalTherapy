import { randomUUID } from 'node:crypto';

import type { Services } from '../server/services';
import { CSRF_HEADER } from './csrf';
import { clientAddress } from './rate-limit';
import type { CookieJar, Download, Outcome, Route, RouteRequest, TextDocument, UploadBody } from './route';

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
  suspended: 402,
  csrf_refused: 403,
  rate_limited: 429,
  terms_required: 403,
  maintenance: 503,
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
  if (outcome.status === 'rate_limited') {
    headers.set('retry-after', String(outcome.retryAfterSeconds));
  }
  for (const cookie of cookies.written) {
    headers.append('set-cookie', cookie);
  }
  return new Response(JSON.stringify(body ?? null), { status: STATUS[outcome.status], headers });
}

type Params = Promise<Record<string, string | string[] | undefined>>;

/** A request body as it streams in, without buffering it. */
async function* streamOf(body: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

function lengthOf(header: string | null): number | null {
  return header !== null && /^\d{1,15}$/.test(header) ? Number.parseInt(header, 10) : null;
}

/** The most a JSON POST body may be (a form's fields or a script's input; files never come this way). */
export const MAX_JSON_BODY_BYTES = 1_000_000;

/** The body was larger than its route takes: refused as it streamed, at the limit, never read whole. */
export class BodyTooLargeError extends Error {
  override readonly name = 'BodyTooLargeError';
}

/**
 * A request body as UTF-8 text, read as it streams with a running count of its bytes (docs/adr/0055): a body
 * past `maxBytes` is refused the moment it passes the limit, whatever its Content-Length says or whether it
 * has one (a chunked body has none), and the rest is never read.
 */
export async function boundedText(request: Request, maxBytes: number): Promise<string> {
  const declared = lengthOf(request.headers.get('content-length'));
  if (declared !== null && declared > maxBytes) {
    throw new BodyTooLargeError(`the body declares ${String(declared)} bytes`);
  }
  if (request.body === null) {
    return '';
  }
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new BodyTooLargeError('the body is larger than its route takes');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
}

/** 413 with the outcome's shape: the body is too large, so nothing in it was read. */
function tooLarge(cookies: ResponseCookies, field: string): Response {
  const response = outcomeResponse({ status: 'invalid', issues: [{ field, message: 'the body is too large' }] }, cookies);
  return new Response(response.body, { status: 413, headers: response.headers });
}

/**
 * A handler whose body is read as sent, not as JSON: a signed webhook (docs/adr/0050), whose signature
 * covers the exact bytes. The route's input is { payload, signature } from the body and the header.
 */
export interface RawBodyOptions {
  readonly rawBody: { readonly signatureHeader: string; readonly maxBytes: number };
}

/** The route request for a Web Request: GET reads the URL; POST also a JSON body (or its raw text); PUT streams its body. */
async function routeRequest(
  request: Request,
  cookies: ResponseCookies,
  context: { readonly params?: Params } | undefined,
  options: RawBodyOptions | undefined,
  trustedProxyHops: number,
): Promise<RouteRequest | Response> {
  const query = Object.fromEntries(new URL(request.url).searchParams);
  const params = { ...query, ...((await context?.params) ?? {}) };
  let input: unknown;
  let upload: UploadBody | undefined;
  if (request.method === 'POST' && options !== undefined) {
    let payload: string;
    try {
      payload = await boundedText(request, options.rawBody.maxBytes);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return tooLarge(cookies, 'payload');
      }
      throw error;
    }
    input = { payload, signature: request.headers.get(options.rawBody.signatureHeader) };
  } else if (request.method === 'POST') {
    let text: string;
    try {
      text = await boundedText(request, MAX_JSON_BODY_BYTES);
    } catch (error) {
      if (error instanceof BodyTooLargeError) {
        return tooLarge(cookies, 'input');
      }
      throw error;
    }
    try {
      input = JSON.parse(text) as unknown;
    } catch {
      return outcomeResponse({ status: 'invalid', issues: [{ field: 'input', message: 'a JSON body' }] }, cookies);
    }
  } else if (request.method === 'PUT') {
    // A PUT carries its input in the query string (the upload URL), its request key as request_key.
    input = { ...query, requestKey: query.request_key };
    upload = {
      contentType: request.headers.get('content-type'),
      contentLength: lengthOf(request.headers.get('content-length')),
      body: request.body === null ? streamOf(new Blob([]).stream()) : streamOf(request.body),
    };
  }
  return {
    cookies,
    params,
    input,
    ...(upload === undefined ? {} : { upload }),
    requestId: randomUUID(),
    userAgent: request.headers.get('user-agent'),
    origin: request.headers.get('origin'),
    fetchSite: request.headers.get('sec-fetch-site'),
    clientAddress: clientAddress(request.headers.get('x-forwarded-for'), trustedProxyHops),
    csrfToken: request.headers.get(CSRF_HEADER),
  };
}

/**
 * A Next route handler for a registered route. GET reads the URL's parameters; POST also reads a JSON body
 * (or, with RawBodyOptions, the body as sent and a signature header); PUT streams its body.
 */
export function routeHandler(route: Route, servicesOf: () => Services, options?: RawBodyOptions) {
  return async (request: Request, context?: { readonly params?: Params }): Promise<Response> => {
    const cookies = new ResponseCookies(request.headers.get('cookie'));
    const services = servicesOf();
    const built = await routeRequest(request, cookies, context, options, services.trustedProxyHops);
    if (built instanceof Response) {
      return built;
    }
    return outcomeResponse(await route.invoke(built, services), cookies);
  };
}

function isDownload(data: unknown): data is Download<string | Uint8Array<ArrayBuffer>> {
  return typeof data === 'object' && data !== null && 'download' in data;
}

/**
 * A Next route handler for a registered download route (GET): the file as an attachment, private and
 * never cached, with the opaque file name the route chose; any refusal as the JSON outcome.
 */
export function downloadHandler(route: Route<Download<string | Uint8Array<ArrayBuffer>>>, servicesOf: () => Services) {
  return async (request: Request, context?: { readonly params?: Params }): Promise<Response> => {
    const cookies = new ResponseCookies(request.headers.get('cookie'));
    const services = servicesOf();
    const built = await routeRequest(request, cookies, context, undefined, services.trustedProxyHops);
    if (built instanceof Response) {
      return built;
    }
    const outcome = await route.invoke(built, services);
    if (outcome.status !== 'ok' || !isDownload(outcome.data)) {
      return outcomeResponse(outcome, cookies);
    }
    const { filename, contentType, body } = outcome.data.download;
    return new Response(body, {
      status: 200,
      headers: { 'content-type': contentType, 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': PRIVATE_NO_STORE },
    });
  };
}

function isTextDocument(data: unknown): data is TextDocument {
  return typeof data === 'object' && data !== null && 'text' in data;
}

/**
 * A Next route handler for a registered public text route (GET; /.well-known/security.txt): the document inline,
 * with its own content type, never cached; any refusal as the JSON outcome.
 */
export function textHandler(route: Route<TextDocument>, servicesOf: () => Services) {
  return async (request: Request, context?: { readonly params?: Params }): Promise<Response> => {
    const cookies = new ResponseCookies(request.headers.get('cookie'));
    const services = servicesOf();
    const built = await routeRequest(request, cookies, context, undefined, services.trustedProxyHops);
    if (built instanceof Response) {
      return built;
    }
    const outcome = await route.invoke(built, services);
    if (outcome.status !== 'ok' || !isTextDocument(outcome.data)) {
      return outcomeResponse(outcome, cookies);
    }
    return new Response(outcome.data.text.body, { status: 200, headers: { 'content-type': outcome.data.text.contentType, 'cache-control': PRIVATE_NO_STORE } });
  };
}
