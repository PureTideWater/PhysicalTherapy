import { runInNewContext } from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  COGNITO_MESSAGE_FALLBACK,
  COGNITO_MESSAGE_SIGN_IN_ENV,
  COGNITO_MESSAGE_SOURCE,
  COGNITO_MESSAGE_SOURCE_MAX_BYTES,
  COGNITO_MESSAGE_SOURCES,
  type CognitoMessageSource,
  cognitoMessage,
} from './index';

const SIGN_IN = 'https://app.paidwhole.example/sign-in';
/** A synthetic person's address, which the handler must never read or log. */
const ADDRESS = 'someone@clinic.synthetic.test';

interface CognitoEvent {
  triggerSource?: unknown;
  request?: Record<string, unknown>;
  response?: { emailSubject: string | null; emailMessage: string | null; smsMessage: string | null };
  [key: string]: unknown;
}

/** The handler as Lambda runs it: the inline source in a fresh context, its own environment and a console that records. */
function load(environment: Record<string, string | undefined> = { [COGNITO_MESSAGE_SIGN_IN_ENV]: SIGN_IN }) {
  const lines: string[] = [];
  const record = (...args: unknown[]) => lines.push(args.map(String).join(' '));
  const context = { exports: {} as { handler?: (event: unknown) => Promise<unknown> }, process: { env: environment }, console: { log: record, info: record, warn: record, error: record } };
  runInNewContext(COGNITO_MESSAGE_SOURCE, context);
  const handler = context.exports.handler;
  if (handler === undefined) {
    throw new Error('the source exports no handler');
  }
  return { handler, lines };
}

/** Cognito's event for a source (the shape of the CustomMessage trigger's input), with a record of reads of the address. */
function event(source: unknown, request: Record<string, unknown> = {}): { event: CognitoEvent; attributeReads: () => number } {
  let reads = 0;
  const base: Record<string, unknown> = {
    codeParameter: '{####}',
    usernameParameter: source === 'CustomMessage_AdminCreateUser' ? '{username}' : null,
    linkParameter: '{##Click Here##}',
    clientMetadata: {},
    ...request,
  };
  Object.defineProperty(base, 'userAttributes', {
    enumerable: true,
    get: () => {
      reads += 1;
      return { sub: 'synthetic-sub', email: ADDRESS, email_verified: 'true' };
    },
  });
  return {
    event: {
      version: '1',
      triggerSource: source,
      region: 'us-east-1',
      userPoolId: 'us-east-1_Synthetic',
      userName: 'synthetic-sub',
      callerContext: { awsSdkVersion: 'synthetic', clientId: 'syntheticclient' },
      request: base,
      response: { smsMessage: null, emailMessage: null, emailSubject: null },
    },
    attributeReads: () => reads,
  };
}

const untouched = { smsMessage: null, emailMessage: null, emailSubject: null };

describe('the CustomMessage trigger (SGN-14)', () => {
  it.each(COGNITO_MESSAGE_SOURCES)('%s: sets the subject and the message, with Cognito’s own placeholders once, never reading the address or logging', async (source: CognitoMessageSource) => {
    const { handler, lines } = load();
    const { event: input, attributeReads } = event(source);
    const output = (await handler(input)) as CognitoEvent;
    expect(output).toBe(input);
    const expected = cognitoMessage(source, { code: '{####}', username: '{username}', signInUrl: SIGN_IN });
    expect(output.response).toEqual({ smsMessage: null, emailSubject: expected.subject, emailMessage: expected.html });
    expect(attributeReads()).toBe(0);
    expect(lines).toEqual([]);
  });

  it('places the parameter Cognito gives literally, with no replacement pattern read in it', async () => {
    const { handler } = load();
    const { event: input } = event('CustomMessage_ForgotPassword', { codeParameter: '{#$$#$1}' });
    const output = (await handler(input)) as CognitoEvent;
    expect(output.response?.emailMessage).toContain('>{#$$#$1}</span>');
  });

  const fallbacks: readonly [string, () => CognitoEvent, string, string][] = [
    ['an unknown source', () => event('CustomMessage_SomethingNew').event, 'unknown_source', 'CustomMessage_SomethingNew'],
    ['a source that is not a CustomMessage name, holding an address', () => event(`CustomMessage_${ADDRESS}`).event, 'unknown_source', 'unrecognized'],
    ['no source', () => event(undefined).event, 'unknown_source', 'unrecognized'],
    ['no request', () => ({ ...event('CustomMessage_ForgotPassword').event, request: undefined }), 'no_request', 'CustomMessage_ForgotPassword'],
    ['no response', () => ({ ...event('CustomMessage_ForgotPassword').event, response: undefined }), 'no_response', 'CustomMessage_ForgotPassword'],
    ['a code parameter that is not a string', () => event('CustomMessage_ForgotPassword', { codeParameter: 12345 }).event, 'code_parameter', 'CustomMessage_ForgotPassword'],
    ['a code parameter that is not a placeholder', () => event('CustomMessage_ForgotPassword', { codeParameter: `<b>${ADDRESS}</b>` }).event, 'code_parameter', 'CustomMessage_ForgotPassword'],
    ['an invitation without a username parameter', () => event('CustomMessage_AdminCreateUser', { usernameParameter: null }).event, 'username_parameter', 'CustomMessage_AdminCreateUser'],
    ['an invitation whose username parameter is a value, not a placeholder', () => event('CustomMessage_AdminCreateUser', { usernameParameter: ADDRESS }).event, 'username_parameter', 'CustomMessage_AdminCreateUser'],
  ];

  it.each(fallbacks)('leaves the message to the pool’s own template on %s, logging one line of codes with no address', async (_name, make, reason, triggerSource) => {
    const { handler, lines } = load();
    const input = make();
    const before = JSON.stringify(input.response);
    const output = (await handler(input)) as CognitoEvent;
    expect(output).toBe(input);
    expect(JSON.stringify(output.response)).toBe(before);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toEqual({ error_code: COGNITO_MESSAGE_FALLBACK, reason, trigger_source: triggerSource });
    expect(lines.join('\n')).not.toContain('@');
  });

  it.each([undefined, '', 'http://app.paidwhole.example/sign-in', 'https://app.paidwhole.example/sign-in?next=x', 'https://app.paidwhole.example/sign-in#x', 'https://App.Paidwhole.example/sign-in', 'https://app.paidwhole.example/other'])(
    'leaves the invitation to the pool’s template when its sign-in page is %s, and sends every code message as usual',
    async (signIn) => {
      const { handler, lines } = load({ [COGNITO_MESSAGE_SIGN_IN_ENV]: signIn });
      const invitation = event('CustomMessage_AdminCreateUser').event;
      await handler(invitation);
      expect(invitation.response).toEqual(untouched);
      expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([{ error_code: COGNITO_MESSAGE_FALLBACK, reason: 'sign_in_url', trigger_source: 'CustomMessage_AdminCreateUser' }]);
      const reset = event('CustomMessage_ForgotPassword').event;
      await handler(reset);
      expect(reset.response?.emailSubject).toBe('Your PaidWhole code');
    },
  );

  it('falls back on any error, and still logs no address', async () => {
    const { handler, lines } = load();
    const input = event('CustomMessage_ForgotPassword').event;
    Object.defineProperty(input.request ?? {}, 'codeParameter', {
      get: () => {
        throw new Error(`exploded for ${ADDRESS}`);
      },
    });
    await expect(handler(input)).resolves.toBe(input);
    expect(input.response).toEqual(untouched);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([{ error_code: COGNITO_MESSAGE_FALLBACK, reason: 'error', trigger_source: 'CustomMessage_ForgotPassword' }]);
    expect(lines.join('\n')).not.toContain('@');
  });

  it('is self-contained: no require, import, network or other environment variable, and small enough to inline', () => {
    const source = COGNITO_MESSAGE_SOURCE;
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toMatch(/\bimport\b/);
    expect(source).not.toMatch(/\bfetch\b|XMLHttpRequest|\bnet\b|\bhttps?\.(request|get)\b/);
    expect(source.match(/process\.env(\.[A-Za-z_]+)?/g)).toEqual([`process.env.${COGNITO_MESSAGE_SIGN_IN_ENV}`]);
    expect(source).not.toContain('userAttributes');
    expect(source.startsWith("'use strict';")).toBe(true);
    expect(Buffer.byteLength(source, 'utf8')).toBeLessThanOrEqual(COGNITO_MESSAGE_SOURCE_MAX_BYTES);
    expect(COGNITO_MESSAGE_SOURCE_MAX_BYTES).toBe(16 * 1024);
    expect(COGNITO_MESSAGE_FALLBACK).toBe('COGNITO_MESSAGE_FALLBACK');
  });
});
