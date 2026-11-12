import { AdminUserGlobalSignOutCommand } from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it } from 'vitest';

import { CognitoProviderSignOut, LocalProviderSignOut, PROVIDER_SIGN_OUT_TIMEOUT_MS } from './cognito-sign-out';

/**
 * The provider_sign_outs job's adapter (JOB-08; docs/adr/0095): one AdminUserGlobalSignOut for the subject in the
 * configured pool, aborted after 10 seconds; "no such user" is an answer; any other error leaves as it came.
 */

const POOL = 'us-east-1_SYNTHETIC1';
const SUBJECT = '0f1e2d3c-4b5a-4c6d-8e7f-9a0b1c2d3e4f';

function named(name: string): Error {
  const error = new Error('synthetic');
  error.name = name;
  return error;
}

describe('the Cognito sign-out adapter', () => {
  it('sends one global sign-out for the subject in the pool', async () => {
    const sent: unknown[] = [];
    const adapter = new CognitoProviderSignOut({ client: { send: (command: unknown) => (sent.push(command), Promise.resolve({})) } as never, userPoolId: POOL });
    expect(await adapter.signOut(SUBJECT)).toBe('signed_out');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toBeInstanceOf(AdminUserGlobalSignOutCommand);
    expect((sent[0] as AdminUserGlobalSignOutCommand).input).toEqual({ UserPoolId: POOL, Username: SUBJECT });
  });

  it('answers “no such user” for the provider’s UserNotFoundException, and throws every other error as it came', async () => {
    const refusing = (error: Error) => new CognitoProviderSignOut({ client: { send: () => Promise.reject(error) } as never, userPoolId: POOL });
    expect(await refusing(named('UserNotFoundException')).signOut(SUBJECT)).toBe('no_such_user');
    const throttled = named('TooManyRequestsException');
    await expect(refusing(throttled).signOut(SUBJECT)).rejects.toBe(throttled);
  });

  it('aborts a call that does not answer, after 10 seconds by default', async () => {
    expect(PROVIDER_SIGN_OUT_TIMEOUT_MS).toBe(10_000);
    const adapter = new CognitoProviderSignOut({
      client: {
        send: (_command: unknown, options: { abortSignal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            options.abortSignal.addEventListener('abort', () => {
              reject(named('AbortError'));
            });
          }),
      } as never,
      userPoolId: POOL,
      timeoutMs: 5,
    });
    await expect(adapter.signOut(SUBJECT)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('development’s twin asks no one and answers signed out', async () => {
    expect(await new LocalProviderSignOut().signOut()).toBe('signed_out');
  });
});
