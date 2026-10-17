import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigError, defaultDevAuthDirectory, defaultDocumentsDirectory, developmentMasterKey, readWebConfig } from '../server/config';
import { type Services, devOutbox } from '../server/services';
import { MAX_JSON_BODY_BYTES, PRIVATE_NO_STORE, ResponseCookies, boundedText, downloadHandler, outcomeResponse, routeHandler, setCookieHeader } from './handler';
import { platformRoute, practiceRoute, publicRoute, selfRoute } from './invoke';
import { type Download, InputError, NotFoundError } from './route';

const services = {} as Services;

describe('route definitions', () => {
  it('refuse a route that changes records without an audit event', () => {
    expect(() =>
      selfRoute({ id: 'test.mutation', kind: 'action', path: '/x', phi: false, params: z.object({}), handle: () => Promise.resolve({}) }),
    ).toThrow('changes records but names no audit event');
    expect(() =>
      platformRoute({ id: 'test.post', kind: 'handler', method: 'POST', path: '/console/x', phi: false, permission: 'organization.manage', params: z.object({}), handle: () => Promise.resolve({}) }),
    ).toThrow('names no audit event');
  });

  it('record their access, method and whether they change records', () => {
    const page = practiceRoute({ id: 'test.page', kind: 'page', path: '/p/[practiceId]', phi: true, permission: 'practice.open', params: z.object({ practiceId: z.string() }), handle: () => Promise.resolve(1) });
    expect(page).toMatchObject({ method: 'GET', mutation: false, access: { kind: 'practice', permission: 'practice.open' } });
    const action = selfRoute({ id: 'test.action', kind: 'action', path: '/x', phi: false, params: z.object({}), audit: { action: 'x', objectType: 'y' }, handle: () => Promise.resolve({}) });
    expect(action).toMatchObject({ method: 'POST', mutation: true, access: { kind: 'self' } });
    const sign = publicRoute({ id: 'test.public', kind: 'action', path: '/sign-in', phi: false, rateLimit: 'sign_in', params: z.object({}), handle: () => Promise.resolve({}) });
    expect(sign).toMatchObject({ method: 'POST', mutation: false, access: { kind: 'public' }, rateLimit: 'sign_in', originChecked: true, csrfToken: false, termsExempt: false });
    expect(action).toMatchObject({ rateLimit: 'mutation', originChecked: true, csrfToken: true });
    expect(page).toMatchObject({ rateLimit: null, originChecked: false, csrfToken: false });
  });

  it('refuse a public POST without a rate limit, and a sender’s signature on anything but a public POST (docs/adr/0053)', () => {
    expect(() => publicRoute({ id: 'test.unlimited', kind: 'action', path: '/sign-in', phi: false, params: z.object({}), handle: () => Promise.resolve({}) })).toThrow('names no rate limit');
    expect(() =>
      selfRoute({ id: 'test.signed', kind: 'action', path: '/x', phi: false, signedBySender: true, params: z.object({}), audit: { action: 'x', objectType: 'y' }, handle: () => Promise.resolve({}) }),
    ).toThrow('only a public POST is signed by its sender');
    const webhook = publicRoute({ id: 'test.webhook', kind: 'handler', method: 'POST', path: '/api/x', phi: false, rateLimit: 'webhook', signedBySender: true, params: z.object({}), handle: () => Promise.resolve({}) });
    expect(webhook).toMatchObject({ originChecked: false, csrfToken: false, rateLimit: 'webhook' });
  });
});

describe('public routes', () => {
  const route = publicRoute({
    id: 'test.public',
    kind: 'action',
    path: '/sign-in',
    phi: false,
    rateLimit: 'sign_in',
    params: z.object({}),
    input: z.object({ value: z.string().min(2) }),
    handle: ({ input }) => {
      if (input.value === 'domain') {
        return Promise.reject(new InputError([{ field: 'value', message: 'refused by the domain' }]));
      }
      if (input.value === 'boom') {
        return Promise.reject(new Error('server error'));
      }
      return Promise.resolve({ echoed: input.value });
    },
  });
  const request = (input: unknown, params: unknown = {}) => ({ cookies: new ResponseCookies(null), params, input, requestId: 'r', userAgent: null });

  it('parse their input with the schema and run the handler', async () => {
    expect(await route.invoke(request({ value: 'ok' }), services)).toEqual({ status: 'ok', data: { echoed: 'ok' } });
    expect(await route.invoke(request({ value: 'x' }), services)).toMatchObject({ status: 'invalid', issues: [{ field: 'value' }] });
    expect(await route.invoke(request({}, { extra: 1 }), services)).toMatchObject({ status: 'invalid' });
    expect(await route.invoke(request({ value: 'domain' }), services)).toEqual({ status: 'invalid', issues: [{ field: 'value', message: 'refused by the domain' }] });
    await expect(route.invoke(request({ value: 'boom' }), services)).rejects.toThrow('server error');
  });

  it('refuse a POST another origin sent, before the handler runs (login CSRF; docs/adr/0053)', async () => {
    const appServices = { origin: 'http://localhost:3100' } as Services;
    expect(await route.invoke({ ...request({ value: 'ok' }), origin: 'https://attacker.example' }, appServices)).toEqual({ status: 'csrf_refused' });
    expect(await route.invoke({ ...request({ value: 'ok' }), origin: 'null' }, appServices)).toEqual({ status: 'csrf_refused' });
    expect(await route.invoke({ ...request({ value: 'ok' }), fetchSite: 'cross-site' }, appServices)).toEqual({ status: 'csrf_refused' });
    expect(await route.invoke({ ...request({ value: 'ok' }), origin: 'http://localhost:3100', fetchSite: 'same-origin' }, appServices)).toEqual({ status: 'ok', data: { echoed: 'ok' } });
  });

  it('answer a malformed URL parameter as not found', async () => {
    const page = publicRoute({ id: 'test.page', kind: 'page', path: '/sign-in', phi: false, params: z.object({ id: z.uuid() }), handle: () => Promise.resolve({}) });
    expect(await page.invoke(request(undefined, { id: 'SYN-123' }), services)).toEqual({ status: 'not_found' });
  });

  it('name a field-less issue after the input', async () => {
    const whole = publicRoute({ id: 'test.whole', kind: 'action', path: '/sign-in', phi: false, rateLimit: 'sign_in', params: z.object({}), input: z.string(), handle: () => Promise.resolve({}) });
    expect(await whole.invoke(request(42), services)).toMatchObject({ status: 'invalid', issues: [{ field: 'input' }] });
  });
});

describe('authenticated routes refuse before any database work', () => {
  it('a mutation without a request key, and malformed parameters', async () => {
    const action = selfRoute({ id: 'test.action', kind: 'action', path: '/x', phi: false, params: z.object({}), audit: { action: 'x', objectType: 'y' }, handle: () => Promise.resolve({}) });
    const request = { cookies: new ResponseCookies(null), params: {}, input: { requestKey: 'not-a-uuid' }, requestId: 'r', userAgent: null };
    expect(await action.invoke(request, services)).toEqual({ status: 'invalid', issues: [{ field: 'requestKey', message: 'reload the page and try again' }] });
    const page = practiceRoute({ id: 'test.page', kind: 'page', path: '/p/[practiceId]', phi: true, permission: 'practice.open', params: z.object({ practiceId: z.uuid() }), handle: () => Promise.resolve(1) });
    expect(await page.invoke({ ...request, params: { practiceId: 'SYN-1' } }, services)).toEqual({ status: 'not_found' });
    const withInput = selfRoute({
      id: 'test.input',
      kind: 'action',
      path: '/x',
      phi: false,
      params: z.object({}),
      input: z.object({ name: z.string().min(1) }),
      audit: { action: 'x', objectType: 'y' },
      handle: () => Promise.resolve({}),
    });
    expect(await withInput.invoke({ ...request, input: { requestKey: '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60' } }, services)).toMatchObject({ status: 'invalid', issues: [{ field: 'name' }] });
  });

  it('a mutation from another origin, before the session is looked up (docs/adr/0053)', async () => {
    const action = selfRoute({ id: 'test.action', kind: 'action', path: '/x', phi: false, params: z.object({}), audit: { action: 'x', objectType: 'y' }, handle: () => Promise.resolve({}) });
    const request = { cookies: new ResponseCookies(null), params: {}, input: { requestKey: '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60' }, requestId: 'r', userAgent: null };
    const appServices = { origin: 'https://app.synthetic.test' } as Services;
    expect(await action.invoke({ ...request, origin: 'https://attacker.example' }, appServices)).toEqual({ status: 'csrf_refused' });
    expect(await action.invoke({ ...request, fetchSite: 'same-site' }, appServices)).toEqual({ status: 'csrf_refused' });
  });
});

describe('the route-handler adapter', () => {
  it('reads the Cookie header and writes HttpOnly, Secure, SameSite=Lax cookies', () => {
    const cookies = new ResponseCookies('a=1; tp_session=abc=def; broken; =x');
    expect(cookies.get('a')).toBe('1');
    expect(cookies.get('tp_session')).toBe('abc=def');
    expect(cookies.get('broken')).toBeUndefined();
    cookies.set('tp_sign_in', 'v1.x', { maxAgeSeconds: 300 });
    cookies.delete('a');
    expect(cookies.get('a')).toBeUndefined();
    expect(cookies.written).toEqual(['tp_sign_in=v1.x; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300', 'a=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0']);
    expect(setCookieHeader('x', 'y', undefined)).toBe('x=y; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect(new ResponseCookies(null).get('a')).toBeUndefined();
  });

  it.each([
    [{ status: 'ok', data: { a: 1 } }, 200, { a: 1 }],
    [{ status: 'ok', data: undefined }, 200, null],
    [{ status: 'invalid', issues: [] }, 400, { status: 'invalid', issues: [] }],
    [{ status: 'unauthenticated', reason: 'idle' }, 401, { status: 'unauthenticated', reason: 'idle' }],
    [{ status: 'mfa_required' }, 401, { status: 'mfa_required' }],
    [{ status: 'hardware_key_required' }, 401, { status: 'hardware_key_required' }],
    [{ status: 'forbidden', permission: 'phi.read', message: 'm', roles: [] }, 403, { status: 'forbidden', permission: 'phi.read', message: 'm', roles: [] }],
    [{ status: 'not_found' }, 404, { status: 'not_found' }],
    [{ status: 'duplicate' }, 409, { status: 'duplicate' }],
    [{ status: 'csrf_refused' }, 403, { status: 'csrf_refused' }],
    [{ status: 'terms_required' }, 403, { status: 'terms_required' }],
    [{ status: 'maintenance' }, 503, { status: 'maintenance' }],
  ] as const)('answers %o with %i, private and no-store', async (outcome, status, body) => {
    const cookies = new ResponseCookies(null);
    cookies.set('c', 'v');
    const response = outcomeResponse(outcome, cookies);
    expect(response.status).toBe(status);
    expect(response.headers.get('cache-control')).toBe(PRIVATE_NO_STORE);
    expect(response.headers.get('content-type')).toBe('application/json');
    expect(response.headers.getSetCookie()).toEqual(['c=v; Path=/; HttpOnly; Secure; SameSite=Lax']);
    expect(await response.json()).toEqual(body);
  });

  it('answers a rate-limited request with 429 and when to try again', async () => {
    const response = outcomeResponse({ status: 'rate_limited', retryAfterSeconds: 42 }, new ResponseCookies(null));
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('42');
    expect(await response.json()).toEqual({ status: 'rate_limited', retryAfterSeconds: 42 });
  });

  it('passes the URL’s and the route’s parameters and a JSON body to the route', async () => {
    const seen: unknown[] = [];
    const route = publicRoute({
      id: 'test.handler',
      kind: 'handler',
      path: '/sign-in/x',
      phi: false,
      params: z.object({ a: z.string(), b: z.string() }),
      input: z.unknown(),
      handle: ({ params, input, request }) => {
        seen.push(params, input, request.userAgent, request.requestId, request.origin, request.fetchSite, request.clientAddress, request.csrfToken);
        return Promise.resolve({ ok: true });
      },
    });
    const handler = routeHandler(route, () => ({ ...services, trustedProxyHops: 1 }));
    const get = await handler(
      new Request('http://localhost/x?a=1', {
        headers: { 'user-agent': 'agent', origin: 'http://localhost', 'sec-fetch-site': 'same-origin', 'x-forwarded-for': '198.51.100.7, 203.0.113.9', 'x-csrf-token': 't' },
      }),
      { params: Promise.resolve({ b: '2' }) },
    );
    expect(get.status).toBe(200);
    expect(seen.slice(0, 3)).toEqual([{ a: '1', b: '2' }, undefined, 'agent']);
    expect(seen.slice(4, 8)).toEqual(['http://localhost', 'same-origin', '203.0.113.9', 't']);
    const post = await handler(new Request('http://localhost/x?a=1&b=2', { method: 'POST', body: JSON.stringify({ x: 1 }) }));
    expect(post.status).toBe(200);
    expect(seen[9]).toEqual({ x: 1 });
    expect(typeof seen[11]).toBe('string');
    const broken = await handler(new Request('http://localhost/x?a=1&b=2', { method: 'POST', body: '{' }));
    expect(broken.status).toBe(400);
  });

  it('refuses a body past its limit as it streams, chunked or declared, with 413 and without reading the rest (docs/adr/0055)', async () => {
    let handled = 0;
    const raw = publicRoute({
      id: 'test.raw',
      kind: 'handler',
      method: 'POST',
      path: '/api/x/webhook',
      phi: false,
      rateLimit: 'webhook',
      signedBySender: true,
      params: z.object({}),
      input: z.unknown(),
      handle: ({ input }) => {
        handled += 1;
        return Promise.resolve(input);
      },
    });
    const handler = routeHandler(raw, () => services, { rawBody: { signatureHeader: 'x-signature', maxBytes: 16 } });
    // A chunked body (no Content-Length) that never ends: refused once it passes 16 bytes, its stream cancelled.
    let pulled = 0;
    let cancelled = false;
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1;
        controller.enqueue(new Uint8Array(8).fill(97));
      },
      cancel() {
        cancelled = true;
      },
    });
    const chunked = await handler(new Request('http://localhost/api/x/webhook', { method: 'POST', body: endless, duplex: 'half' } as RequestInit));
    expect(chunked.status).toBe(413);
    expect(await chunked.json()).toEqual({ status: 'invalid', issues: [{ field: 'payload', message: 'the body is too large' }] });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(6);
    // A declared length past the limit is refused before anything is read; a body within it reaches the route as sent.
    expect((await handler(new Request('http://localhost/api/x/webhook', { method: 'POST', body: 'x'.repeat(10), headers: { 'content-length': '99' } }))).status).toBe(413);
    const within = await handler(new Request('http://localhost/api/x/webhook', { method: 'POST', body: '{"é":1}', headers: { 'x-signature': 's' } }));
    expect(within.status).toBe(200);
    expect(await within.json()).toEqual({ payload: '{"é":1}', signature: 's' });
    expect(handled).toBe(1);
    // Sixteen bytes exactly is within; seventeen (a two-byte character at the end) is not.
    expect((await handler(new Request('http://localhost/api/x/webhook', { method: 'POST', body: 'a'.repeat(16) }))).status).toBe(200);
    expect((await handler(new Request('http://localhost/api/x/webhook', { method: 'POST', body: `${'a'.repeat(15)}é` }))).status).toBe(413);
    // A JSON POST is bounded the same way, at MAX_JSON_BODY_BYTES.
    const json = routeHandler(raw, () => services);
    expect((await json(new Request('http://localhost/api/x/webhook', { method: 'POST', body: JSON.stringify({ x: 'y'.repeat(MAX_JSON_BODY_BYTES) }) }))).status).toBe(413);
    // An empty POST is an empty body.
    expect(await boundedText(new Request('http://localhost/x', { method: 'POST' }), 1)).toBe('');
  });

  it('streams a PUT’s body to the route with its declared type and length, its input from the query string', async () => {
    const seen: unknown[] = [];
    const route = publicRoute({
      id: 'test.put',
      kind: 'handler',
      path: '/sign-in/put',
      phi: false,
      params: z.object({}),
      input: z.unknown(),
      handle: async ({ input, request }) => {
        const parts: Buffer[] = [];
        for await (const part of request.upload?.body ?? []) {
          parts.push(Buffer.from(part));
        }
        seen.push(input, request.upload?.contentType, request.upload?.contentLength, Buffer.concat(parts).toString());
        return { ok: true };
      },
    });
    const handler = routeHandler(route, () => services);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('ISA*'));
        controller.enqueue(new TextEncoder().encode('00*'));
        controller.close();
      },
    });
    const response = await handler(
      new Request('http://localhost/x?token=abc&request_key=3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60', { method: 'PUT', body, headers: { 'content-type': 'text/plain', 'content-length': '7' }, duplex: 'half' } as RequestInit),
    );
    expect(response.status).toBe(200);
    expect(seen).toEqual([{ token: 'abc', request_key: '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60', requestKey: '3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60' }, 'text/plain', 7, 'ISA*00*']);
    await handler(new Request('http://localhost/x', { method: 'PUT', headers: { 'content-length': 'many' } }));
    expect(seen.slice(4)).toEqual([{ requestKey: undefined }, null, null, '']);
  });

  it('sends a download route’s file as a private attachment, and a refusal as JSON', async () => {
    const route = publicRoute<Record<string, never>, unknown, Download>({
      id: 'test.download',
      kind: 'handler',
      path: '/sign-in/download',
      phi: false,
      params: z.object({}),
      input: z.unknown(),
      handle: () => Promise.resolve({ download: { filename: 'receipt-3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60.csv', contentType: 'text/csv; charset=utf-8', body: 'a,b\r\n' } }),
    });
    const response = await downloadHandler(route, () => services)(new Request('http://localhost/x'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="receipt-3f0b8c1e-5d2a-4e7f-9a6b-1c2d3e4f5a60.csv"');
    expect(response.headers.get('cache-control')).toBe(PRIVATE_NO_STORE);
    expect(await response.text()).toBe('a,b\r\n');
    const refusing = publicRoute<Record<string, never>, unknown, Download>({
      id: 'test.refusing',
      kind: 'handler',
      path: '/sign-in/refusing',
      phi: false,
      params: z.object({}),
      input: z.unknown(),
      handle: () => Promise.reject(new InputError([{ field: 'x', message: 'no' }])),
    });
    expect((await downloadHandler(refusing, () => services)(new Request('http://localhost/x'))).status).toBe(400);
    expect((await downloadHandler(refusing, () => services)(new Request('http://localhost/x', { method: 'POST', body: '{' }))).status).toBe(400);
    const notAFile = publicRoute({ id: 'test.json', kind: 'handler', path: '/sign-in/json', phi: false, params: z.object({}), handle: () => Promise.resolve({ a: 1 }) });
    const json = await downloadHandler(notAFile as never, () => services)(new Request('http://localhost/x'));
    expect(await json.json()).toEqual({ a: 1 });
  });
});

describe('handler errors', () => {
  it('distinguish not found from input errors', () => {
    expect(new NotFoundError().message).toBe('not found');
    expect(new InputError([{ field: 'a', message: 'b' }]).message).toBe('a: b');
  });
});

describe('the web configuration', () => {
  const base = { DATABASE_URL: 'postgres://tp_app_dev:x@localhost:5432/tp', BILLING_DATABASE_URL: 'postgres://tp_billing_dev:x@localhost:5432/tp' };
  const key = Buffer.alloc(32, 1).toString('base64');

  it('defaults to the local providers in development', () => {
    const config = readWebConfig(base);
    expect(config).toMatchObject({ production: false, origin: 'http://localhost:3000', rpId: 'localhost', auth: { kind: 'dev', directory: defaultDevAuthDirectory() }, keys: { kind: 'local' } });
    expect(config.keys.kind === 'local' && config.keys.masterKey.equals(developmentMasterKey())).toBe(true);
    expect(config.cookieSecret).toHaveLength(32);
  });

  it('connects billing and the e-signature webhook on their own logins: the dev logins in development, explicit ones in production (docs/adr/0055)', () => {
    const dev = readWebConfig({ DATABASE_URL: 'postgres://tp_app_dev:tp_app_dev@localhost:5432/tp' });
    expect(dev.billingDatabaseUrl).toBe('postgres://tp_billing_dev:tp_billing_dev@localhost:5432/tp');
    expect(dev.esignDatabaseUrl).toBe('postgres://tp_esign_dev:tp_esign_dev@localhost:5432/tp');
    expect(readWebConfig({ ...base, ESIGN_PROVIDER: 'none' }).esignDatabaseUrl).toBeNull();
    expect(readWebConfig({ ...base, ESIGN_DATABASE_URL: 'postgres://e:x@localhost:5432/tp' }).esignDatabaseUrl).toBe('postgres://e:x@localhost:5432/tp');
    const e2e = { DATABASE_URL: base.DATABASE_URL, NODE_ENV: 'production', TP_ALLOW_LOCAL_PROVIDERS: 'e2e', TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'local', AUTH_COOKIE_SECRET: key, TP_LOCAL_MASTER_KEY: key };
    expect(() => readWebConfig(e2e)).toThrow(new ConfigError('BILLING_DATABASE_URL is required in production'));
    expect(() => readWebConfig({ ...e2e, BILLING_DATABASE_URL: base.BILLING_DATABASE_URL, ESIGN_PROVIDER: 'local' })).toThrow(
      new ConfigError('ESIGN_DATABASE_URL is required for an e-signature vendor in production'),
    );
    expect(readWebConfig({ ...e2e, BILLING_DATABASE_URL: base.BILLING_DATABASE_URL }).esignDatabaseUrl).toBeNull();
  });

  it('requires every implementation choice explicitly in production', () => {
    const e2e = { ...base, NODE_ENV: 'production', TP_ALLOW_LOCAL_PROVIDERS: 'e2e' };
    expect(() => readWebConfig({ ...base, NODE_ENV: 'production' })).toThrow(new ConfigError('TP_AUTH_PROVIDER is required in production'));
    expect(() => readWebConfig({ ...e2e, TP_AUTH_PROVIDER: 'dev' })).toThrow('TP_KEY_PROVIDER is required in production');
    expect(() => readWebConfig({ ...e2e, TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'local' })).toThrow('AUTH_COOKIE_SECRET is required in production');
    expect(() => readWebConfig({ ...e2e, TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'local', AUTH_COOKIE_SECRET: key })).toThrow('TP_LOCAL_MASTER_KEY is required in production');
    const local = readWebConfig({ ...e2e, TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'local', AUTH_COOKIE_SECRET: key, TP_LOCAL_MASTER_KEY: key, TP_DEV_AUTH_DIR: '/tmp/x' });
    expect(local).toMatchObject({ production: true, auth: { kind: 'dev', directory: '/tmp/x' } });
  });

  it('refuses the local identity and key providers in production unless the e2e suite says it is running', () => {
    const production = { ...base, NODE_ENV: 'production', AUTH_COOKIE_SECRET: key, TP_LOCAL_MASTER_KEY: key };
    const cognito = { TP_AUTH_PROVIDER: 'cognito', COGNITO_USER_POOL_ID: 'us-east-1_Synthetic', COGNITO_CLIENT_ID: 'syntheticclient' };
    expect(() => readWebConfig({ ...production, TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'kms', KMS_KEY_ID: 'alias/tp' })).toThrow(
      new ConfigError('TP_AUTH_PROVIDER=dev is refused in production (Cognito only, outside the e2e suite)'),
    );
    expect(() => readWebConfig({ ...production, ...cognito, TP_KEY_PROVIDER: 'local' })).toThrow(new ConfigError('TP_KEY_PROVIDER=local is refused in production (KMS only, outside the e2e suite)'));
    expect(() => readWebConfig({ ...production, ...cognito, TP_KEY_PROVIDER: 'local', TP_ALLOW_LOCAL_PROVIDERS: 'yes' })).toThrow(new ConfigError('invalid settings: TP_ALLOW_LOCAL_PROVIDERS'));
    expect(readWebConfig({ ...production, ...cognito, TP_KEY_PROVIDER: 'local', TP_ALLOW_LOCAL_PROVIDERS: 'e2e' }).keys.kind).toBe('local');
    // playwright.config.ts is the one place that says so.
    const playwright = readFileSync(path.resolve(import.meta.dirname, '../../../playwright.config.ts'), 'utf8');
    expect(playwright).toContain("TP_ALLOW_LOCAL_PROVIDERS: 'e2e'");
  });

  it('reads Cognito and KMS settings', () => {
    const config = readWebConfig({
      ...base,
      NODE_ENV: 'production',
      TP_AUTH_PROVIDER: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_Synthetic',
      COGNITO_CLIENT_ID: 'syntheticclient',
      TP_KEY_PROVIDER: 'kms',
      KMS_KEY_ID: 'alias/tp-production',
      AUTH_COOKIE_SECRET: key,
      TRUSTED_PROXY_HOPS: '1',
      SUPPORT_EMAIL: 'help@synthetic.test',
      TP_ENVIRONMENT: 'production',
      APP_ORIGIN: 'https://app.synthetic.test/ignored',
      DOCUMENTS_BUCKET: 'tp-production-documents',
      DOCUMENTS_KMS_KEY_ID: 'alias/tp-production',
      QUEUE_DATABASE_URL: 'postgres://tp_queue:x@db.internal:5432/tp',
    });
    expect(config).toMatchObject({
      origin: 'https://app.synthetic.test',
      rpId: 'app.synthetic.test',
      auth: { kind: 'cognito', userPoolId: 'us-east-1_Synthetic', clientId: 'syntheticclient', region: 'us-east-1' },
      keys: { kind: 'kms', keyId: 'alias/tp-production' },
      documents: { kind: 's3', bucket: 'tp-production-documents', kmsKeyId: 'alias/tp-production' },
      queueDatabaseUrl: 'postgres://tp_queue:x@db.internal:5432/tp',
      trustedProxyHops: 1,
      supportEmail: 'help@synthetic.test',
      environment: 'production',
      esign: { kind: 'none' },
      complianceExportDir: null,
    });
    expect(() => readWebConfig({ ...base, TP_AUTH_PROVIDER: 'cognito' })).toThrow('COGNITO_USER_POOL_ID is required for Cognito');
    expect(() => readWebConfig({ ...base, TP_KEY_PROVIDER: 'kms' })).toThrow('KMS_KEY_ID is required for KMS');
  });

  it('lands uploads in a local directory in development, in the documents bucket in production, and queues on the database login by default', () => {
    expect(readWebConfig(base)).toMatchObject({ documents: { kind: 'local', dir: defaultDocumentsDirectory() }, queueDatabaseUrl: base.DATABASE_URL });
    expect(readWebConfig({ ...base, DOCUMENTS_DIR: '/var/tp/documents' }).documents).toEqual({ kind: 'local', dir: '/var/tp/documents' });
    expect(() => readWebConfig({ ...base, DOCUMENTS_BUCKET: 'tp-documents' })).toThrow('DOCUMENTS_KMS_KEY_ID is required for DOCUMENTS_BUCKET');
    expect(() => readWebConfig({ ...base, DOCUMENTS_BUCKET: 'tp-documents', DOCUMENTS_KMS_KEY_ID: 'k', DOCUMENTS_DIR: '/d' })).toThrow('at most one of DOCUMENTS_BUCKET and DOCUMENTS_DIR is set');
    const production = {
      ...base,
      NODE_ENV: 'production',
      TP_AUTH_PROVIDER: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_Synthetic',
      COGNITO_CLIENT_ID: 'syntheticclient',
      TP_KEY_PROVIDER: 'kms',
      KMS_KEY_ID: 'alias/tp',
      AUTH_COOKIE_SECRET: key,
    };
    expect(() => readWebConfig(production)).toThrow(new ConfigError('DOCUMENTS_BUCKET is required in production'));
    expect(() => readWebConfig({ ...production, DOCUMENTS_DIR: '/d' })).toThrow(new ConfigError('DOCUMENTS_DIR is refused in production (S3 only, outside the e2e suite)'));
    expect(readWebConfig({ ...production, TP_ALLOW_LOCAL_PROVIDERS: 'e2e', DOCUMENTS_DIR: '/d' }).documents).toEqual({ kind: 'local', dir: '/d' });
    expect(readWebConfig({ ...production, TP_ALLOW_LOCAL_PROVIDERS: 'e2e' }).documents).toEqual({ kind: 'local', dir: defaultDocumentsDirectory() });
  });

  it('trusts no proxy for the client’s address by default, and requires the count in production (docs/adr/0053)', () => {
    expect(readWebConfig(base).trustedProxyHops).toBe(0);
    expect(readWebConfig({ ...base, TRUSTED_PROXY_HOPS: '2' }).trustedProxyHops).toBe(2);
    expect(() => readWebConfig({ ...base, TRUSTED_PROXY_HOPS: '9' })).toThrow('invalid settings: TRUSTED_PROXY_HOPS');
    const production = {
      ...base,
      NODE_ENV: 'production',
      TP_AUTH_PROVIDER: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_Synthetic',
      COGNITO_CLIENT_ID: 'syntheticclient',
      TP_KEY_PROVIDER: 'kms',
      KMS_KEY_ID: 'alias/tp',
      AUTH_COOKIE_SECRET: key,
      DOCUMENTS_BUCKET: 'tp-documents',
      DOCUMENTS_KMS_KEY_ID: 'alias/tp',
      SUPPORT_EMAIL: 'help@synthetic.test',
      TP_ENVIRONMENT: 'staging',
    };
    expect(() => readWebConfig(production)).toThrow(new ConfigError('TRUSTED_PROXY_HOPS is required in production'));
  });

  it('requires the support address and the environment in production, and refuses the local e-signature stand-in there (docs/adr/0053)', () => {
    const production = {
      ...base,
      NODE_ENV: 'production',
      TP_AUTH_PROVIDER: 'cognito',
      COGNITO_USER_POOL_ID: 'us-east-1_Synthetic',
      COGNITO_CLIENT_ID: 'syntheticclient',
      TP_KEY_PROVIDER: 'kms',
      KMS_KEY_ID: 'alias/tp',
      AUTH_COOKIE_SECRET: key,
      DOCUMENTS_BUCKET: 'tp-documents',
      DOCUMENTS_KMS_KEY_ID: 'alias/tp',
      TRUSTED_PROXY_HOPS: '1',
      SUPPORT_EMAIL: 'help@synthetic.test',
      TP_ENVIRONMENT: 'staging',
    };
    expect(readWebConfig(production)).toMatchObject({ supportEmail: 'help@synthetic.test', environment: 'staging', esign: { kind: 'none' }, complianceExportDir: null });
    expect(() => readWebConfig({ ...production, SUPPORT_EMAIL: undefined })).toThrow(new ConfigError('SUPPORT_EMAIL is required in production'));
    expect(() => readWebConfig({ ...production, TP_ENVIRONMENT: undefined })).toThrow(new ConfigError('TP_ENVIRONMENT is required in production'));
    expect(() => readWebConfig({ ...production, ESIGN_PROVIDER: 'local' })).toThrow(ConfigError);
    expect(readWebConfig({ ...production, COMPLIANCE_EXPORT_DIR: '/srv/evidence' }).complianceExportDir).toBe('/srv/evidence');
    // In development: a synthetic support address, the local stand-in and a local evidence directory.
    const development = readWebConfig(base);
    expect(development).toMatchObject({ supportEmail: 'support@synthetic.test', environment: 'dev', esign: { kind: 'local' } });
    expect(development.complianceExportDir).not.toBeNull();
    expect(readWebConfig({ ...base, ESIGN_PROVIDER: 'none' }).esign).toEqual({ kind: 'none' });
    expect(readWebConfig({ ...base, ESIGN_LOCAL_SECRET: 'synthetic-esign-secret-0001', ESIGN_LOCAL_DIR: '/tmp/esign' }).esign).toEqual({ kind: 'local', secret: 'synthetic-esign-secret-0001', directory: '/tmp/esign' });
  });

  it('names the settings it refuses, never their values', () => {
    expect(() => readWebConfig({ DATABASE_URL: 'secret-value', AUTH_COOKIE_SECRET: 'short' })).toThrow(new ConfigError('invalid settings: DATABASE_URL, AUTH_COOKIE_SECRET'));
  });
});

describe('the development outbox', () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir !== undefined) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes an invitation’s temporary password to a local file named by opaque IDs', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'tp-outbox-'));
    await devOutbox(dir)('invited@synthetic.test', 'Temporary-Pass-1!');
    const [file = ''] = readdirSync(path.join(dir, 'outbox'));
    expect(file).toMatch(/^\d+-[0-9a-f-]{36}\.json$/);
    expect(JSON.parse(readFileSync(path.join(dir, 'outbox', file), 'utf8'))).toEqual({ email: 'invited@synthetic.test', temporaryPassword: 'Temporary-Pass-1!' });
  });
});
