import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { ConfigError, defaultDevAuthDirectory, developmentMasterKey, readWebConfig } from '../server/config';
import { type Services, devOutbox } from '../server/services';
import { PRIVATE_NO_STORE, ResponseCookies, outcomeResponse, routeHandler, setCookieHeader } from './handler';
import { platformRoute, practiceRoute, publicRoute, selfRoute } from './invoke';
import { InputError, NotFoundError } from './route';

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
    const sign = publicRoute({ id: 'test.public', kind: 'action', path: '/sign-in', phi: false, params: z.object({}), handle: () => Promise.resolve({}) });
    expect(sign).toMatchObject({ method: 'POST', mutation: false, access: { kind: 'public' } });
  });
});

describe('public routes', () => {
  const route = publicRoute({
    id: 'test.public',
    kind: 'action',
    path: '/sign-in',
    phi: false,
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

  it('answer a malformed URL parameter as not found', async () => {
    const page = publicRoute({ id: 'test.page', kind: 'page', path: '/sign-in', phi: false, params: z.object({ id: z.uuid() }), handle: () => Promise.resolve({}) });
    expect(await page.invoke(request(undefined, { id: 'SYN-123' }), services)).toEqual({ status: 'not_found' });
  });

  it('name a field-less issue after the input', async () => {
    const whole = publicRoute({ id: 'test.whole', kind: 'action', path: '/sign-in', phi: false, params: z.object({}), input: z.string(), handle: () => Promise.resolve({}) });
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
        seen.push(params, input, request.userAgent, request.requestId);
        return Promise.resolve({ ok: true });
      },
    });
    const handler = routeHandler(route, () => services);
    const get = await handler(new Request('http://localhost/x?a=1', { headers: { 'user-agent': 'agent' } }), { params: Promise.resolve({ b: '2' }) });
    expect(get.status).toBe(200);
    expect(seen.slice(0, 3)).toEqual([{ a: '1', b: '2' }, undefined, 'agent']);
    const post = await handler(new Request('http://localhost/x?a=1&b=2', { method: 'POST', body: JSON.stringify({ x: 1 }) }));
    expect(post.status).toBe(200);
    expect(seen[5]).toEqual({ x: 1 });
    expect(typeof seen[7]).toBe('string');
  });
});

describe('handler errors', () => {
  it('distinguish not found from input errors', () => {
    expect(new NotFoundError().message).toBe('not found');
    expect(new InputError([{ field: 'a', message: 'b' }]).message).toBe('a: b');
  });
});

describe('the web configuration', () => {
  const base = { DATABASE_URL: 'postgres://tp_app_dev:x@localhost:5432/tp' };
  const key = Buffer.alloc(32, 1).toString('base64');

  it('defaults to the local providers in development', () => {
    const config = readWebConfig(base);
    expect(config).toMatchObject({ production: false, origin: 'http://localhost:3000', rpId: 'localhost', auth: { kind: 'dev', directory: defaultDevAuthDirectory() }, keys: { kind: 'local' } });
    expect(config.keys.kind === 'local' && config.keys.masterKey.equals(developmentMasterKey())).toBe(true);
    expect(config.cookieSecret).toHaveLength(32);
  });

  it('requires every implementation choice explicitly in production', () => {
    expect(() => readWebConfig({ ...base, NODE_ENV: 'production' })).toThrow(new ConfigError('TP_AUTH_PROVIDER is required in production'));
    expect(() => readWebConfig({ ...base, NODE_ENV: 'production', TP_AUTH_PROVIDER: 'dev' })).toThrow('TP_KEY_PROVIDER is required in production');
    expect(() => readWebConfig({ ...base, NODE_ENV: 'production', TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'local' })).toThrow('AUTH_COOKIE_SECRET is required in production');
    expect(() => readWebConfig({ ...base, NODE_ENV: 'production', TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'local', AUTH_COOKIE_SECRET: key })).toThrow('TP_LOCAL_MASTER_KEY is required in production');
    const local = readWebConfig({ ...base, NODE_ENV: 'production', TP_AUTH_PROVIDER: 'dev', TP_KEY_PROVIDER: 'local', AUTH_COOKIE_SECRET: key, TP_LOCAL_MASTER_KEY: key, TP_DEV_AUTH_DIR: '/tmp/x' });
    expect(local).toMatchObject({ production: true, auth: { kind: 'dev', directory: '/tmp/x' } });
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
      APP_ORIGIN: 'https://app.synthetic.test/ignored',
    });
    expect(config).toMatchObject({
      origin: 'https://app.synthetic.test',
      rpId: 'app.synthetic.test',
      auth: { kind: 'cognito', userPoolId: 'us-east-1_Synthetic', clientId: 'syntheticclient', region: 'us-east-1' },
      keys: { kind: 'kms', keyId: 'alias/tp-production' },
    });
    expect(() => readWebConfig({ ...base, TP_AUTH_PROVIDER: 'cognito' })).toThrow('COGNITO_USER_POOL_ID is required for Cognito');
    expect(() => readWebConfig({ ...base, TP_KEY_PROVIDER: 'kms' })).toThrow('KMS_KEY_ID is required for KMS');
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
