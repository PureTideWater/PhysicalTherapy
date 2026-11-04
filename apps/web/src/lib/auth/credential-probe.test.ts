import { createHmac } from 'node:crypto';

import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import { credentialProbeOf } from '../server/services';
import { type CognitoClient, CognitoAuthProvider, isClientCredentialFailure } from './cognito-provider';
import { CredentialProbe, PROBE_USERNAME, classifyProbe, probeRefusal } from './credential-probe';
import { DevAuthProvider } from './dev-provider';
import { MemoryDevStore } from './dev-store';
import { Sealer } from './seal';
import { ClientSecret } from './secret-hash';

/**
 * The start-up credential probe (SEC-20; docs/adr/0088, D8; review infra-auth-IA-6): once per process, one sign-in
 * request for a reserved username that never exists, with the computed hash. It fails only on a positive refusal of
 * the client's credential or of the client itself, and passes open on everything else, so a provider blip never
 * blocks a deploy. While it holds a refusal, the health check answers 503, so the deploy's circuit breaker rolls back
 * before the old client is deleted. Synthetic values only.
 */

const SECRET = 'synthetic-client-secret-0000000000000000000000000000';

function named(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

function probing(attempt: () => Promise<unknown>, timeoutMs?: number) {
  const lines: string[] = [];
  const calls = { count: 0 };
  const probe = new CredentialProbe(
    () => {
      calls.count += 1;
      return attempt();
    },
    createLogger({ sink: (line) => lines.push(line), level: 'debug' }),
    timeoutMs,
  );
  const entries = () => lines.map((line) => JSON.parse(line) as Record<string, unknown>).map((entry) => [entry.level, entry.msg, entry.error_code]);
  return { probe, lines, calls, entries };
}

describe('the start-up credential probe', () => {
  it('SEC-20: fails on a refused client credential and on a client that does not exist, and logs the code alone', async () => {
    const credential = probing(() => Promise.reject(named('NotAuthorizedException', 'Unable to verify secret hash for client syntheticclient')));
    expect(await credential.probe.start()).toBe('refused');
    expect(credential.probe.refused()).toBe(true);
    expect(credential.entries()).toEqual([['error', 'cognito probe refused', 'NotAuthorizedException']]);
    expect(credential.lines.join('\n')).not.toMatch(/syntheticclient|secret hash/i);
    const missingHash = probing(() => Promise.reject(named('NotAuthorizedException', 'Client syntheticclient is configured with secret but SECRET_HASH was not received')));
    expect(await missingHash.probe.start()).toBe('refused');
    const wrongClient = probing(() => Promise.reject(named('ResourceNotFoundException', 'User pool client syntheticclient does not exist.')));
    expect(await wrongClient.probe.start()).toBe('refused');
    expect(wrongClient.entries()).toEqual([['error', 'cognito probe refused', 'ResourceNotFoundException']]);
    const doesNotExist = probing(() => Promise.reject(named('InvalidParameterException', 'User pool client syntheticclient does not exist.')));
    expect(await doesNotExist.probe.start()).toBe('refused');
  });

  it('SEC-20: takes any NotAuthorizedException that names the client or a secret as the client credential, and the person-facing texts as the person’s (review security-N5)', () => {
    // Texts for both mismatch directions, the verified ones and plausible others (the staging gate records Cognito's own).
    for (const message of [
      'Unable to verify secret hash for client syntheticclient',
      'Client syntheticclient is configured with secret but SECRET_HASH was not received',
      'Client syntheticclient is configured without secret.',
      'Client syntheticclient is not configured with a secret',
      'Invalid client syntheticclient',
    ]) {
      expect(isClientCredentialFailure(named('NotAuthorizedException', message)), message).toBe(true);
      expect(classifyProbe(named('NotAuthorizedException', message)), message).toBe('refused');
    }
    for (const message of ['Incorrect username or password.', 'Password attempts exceeded', 'User is disabled.', 'Invalid session for the user, session is expired.', 'Access Token has been revoked']) {
      expect(isClientCredentialFailure(named('NotAuthorizedException', message)), message).toBe(false);
    }
    expect(isClientCredentialFailure(named('UserNotFoundException', 'client secret'))).toBe(false);
  });

  it('SEC-20: passes on the expected refusal of an unknown user and on a challenge', async () => {
    const unknown = probing(() => Promise.reject(named('NotAuthorizedException', 'Incorrect username or password.')));
    expect(await unknown.probe.start()).toBe('passed');
    expect(unknown.probe.refused()).toBe(false);
    expect(unknown.entries()).toEqual([['info', 'cognito probe passed', 'NotAuthorizedException']]);
    const notFound = probing(() => Promise.reject(named('UserNotFoundException')));
    expect(await notFound.probe.start()).toBe('passed');
    const challenged = probing(() => Promise.resolve({ ChallengeName: 'SELECT_CHALLENGE', Session: 's' }));
    expect(await challenged.probe.start()).toBe('passed');
    expect(challenged.entries()).toEqual([['info', 'cognito probe passed', null]]);
  });

  it('SEC-20: passes open, logged inconclusive, on throttling, a timeout and a network error', async () => {
    const throttled = probing(() => Promise.reject(named('TooManyRequestsException')));
    expect(await throttled.probe.start()).toBe('inconclusive');
    expect(throttled.probe.refused()).toBe(false);
    expect(throttled.entries()).toEqual([['warn', 'cognito probe inconclusive', 'TooManyRequestsException']]);
    const slow = probing(() => new Promise(() => undefined), 5);
    expect(await slow.probe.start()).toBe('inconclusive');
    expect(slow.entries()).toEqual([['warn', 'cognito probe inconclusive', 'ProbeTimeout']]);
    const network = probing(() => Promise.reject(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })));
    expect(await network.probe.start()).toBe('inconclusive');
    expect(network.entries()).toEqual([['warn', 'cognito probe inconclusive', 'Error']]);
    expect(network.lines.join('\n')).not.toContain('ECONNREFUSED');
  });

  it('SEC-20: runs once per process: the outcome is cached, and pending reads as healthy', async () => {
    let answer: (value: unknown) => void = () => undefined;
    const { probe, calls } = probing(
      () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    );
    const first = probe.start();
    const second = probe.start();
    expect(probe.state).toBe('pending');
    expect(probe.refused()).toBe(false);
    answer({});
    expect(await first).toBe('passed');
    expect(await second).toBe('passed');
    expect(await probe.start()).toBe('passed');
    expect(calls.count).toBe(1);
  });

  it('SEC-20: is skipped without a call or a log while no secret is set (release N), or for the dev provider', async () => {
    const skipped = CredentialProbe.skipped();
    expect(await skipped.start()).toBe('skipped');
    expect(skipped.state).toBe('skipped');
    expect(skipped.refused()).toBe(false);
    const logger = createLogger({ sink: () => undefined });
    const cognito = (clientSecret?: ClientSecret) =>
      new CognitoAuthProvider({
        client: { send: () => Promise.reject(new Error('unscripted')) },
        userPoolId: 'us-east-1_Synthetic',
        clientId: 'syntheticclient',
        verifier: { verify: () => Promise.reject(new Error('unscripted')) },
        ...(clientSecret === undefined ? {} : { clientSecret }),
        logger,
      });
    const settings = { kind: 'cognito', userPoolId: 'us-east-1_Synthetic', clientId: 'syntheticclient', region: 'us-east-1' } as const;
    expect(credentialProbeOf({ ...settings, clientSecret: null }, cognito(), logger).state).toBe('skipped');
    expect(credentialProbeOf({ ...settings, clientSecret: new ClientSecret(SECRET) }, cognito(new ClientSecret(SECRET)), logger).state).toBe('pending');
    const dev = new DevAuthProvider({ store: new MemoryDevStore(), sealer: new Sealer(Buffer.alloc(32, 9)), webauthn: { rpId: 'localhost', rpName: 'Test', origin: 'http://localhost:3100' }, deliverInvitation: () => Promise.resolve() });
    expect(credentialProbeOf({ kind: 'dev', directory: '/tmp/unused' }, dev, logger).state).toBe('skipped');
  });

  it('SEC-20: makes the health check answer 503 only while it holds a positive refusal (docs/adr/0055 note)', async () => {
    expect(probeRefusal(CredentialProbe.skipped())).toBeUndefined();
    const pending = probing(() => new Promise(() => undefined));
    void pending.probe.start();
    expect(probeRefusal(pending.probe)).toBeUndefined();
    for (const [answer, refused] of [
      [() => Promise.resolve({}), false],
      [() => Promise.reject(named('TooManyRequestsException')), false],
      [() => Promise.reject(named('NotAuthorizedException', 'Unable to verify secret hash for client syntheticclient')), true],
    ] as const) {
      const { probe } = probing(answer);
      await probe.start();
      const response = probeRefusal(probe);
      if (!refused) {
        expect(response).toBeUndefined();
        continue;
      }
      expect(response?.status).toBe(503);
      expect(response?.headers.get('cache-control')).toBe('private, no-store');
      expect(await response?.json()).toEqual({ status: 'credential_refused' });
    }
  });
});

describe('the provider’s probe request', () => {
  it('SEC-20: is one InitiateAuth for the reserved username with the hash over it, no password, and the username in no log line', async () => {
    const sent: { command: string; input: Record<string, unknown> }[] = [];
    const lines: string[] = [];
    const client = {
      send: (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
        sent.push({ command: command.constructor.name, input: command.input });
        return Promise.reject(named('NotAuthorizedException', 'Incorrect username or password.'));
      },
    } as unknown as CognitoClient;
    const logger = createLogger({ sink: (line) => lines.push(line), level: 'debug' });
    const provider = new CognitoAuthProvider({
      client,
      userPoolId: 'us-east-1_Synthetic',
      clientId: 'syntheticclient',
      verifier: { verify: () => Promise.reject(new Error('unscripted')) },
      clientSecret: new ClientSecret(SECRET),
      logger,
    });
    const probe = credentialProbeOf({ kind: 'cognito', userPoolId: 'us-east-1_Synthetic', clientId: 'syntheticclient', region: 'us-east-1', clientSecret: new ClientSecret(SECRET) }, provider, logger);
    expect(await probe.start()).toBe('passed');
    expect(sent).toEqual([
      {
        command: 'InitiateAuthCommand',
        input: {
          AuthFlow: 'USER_AUTH',
          ClientId: 'syntheticclient',
          AuthParameters: { USERNAME: PROBE_USERNAME, SECRET_HASH: createHmac('sha256', SECRET).update(`${PROBE_USERNAME}syntheticclient`).digest('base64') },
        },
      },
    ]);
    // A reserved name under a reserved top-level domain: never a person's.
    expect(PROBE_USERNAME).toMatch(/@[a-z0-9.-]+\.invalid$/);
    expect(lines.join('\n')).not.toContain(PROBE_USERNAME);
    expect(lines.join('\n')).not.toContain(SECRET);
  });
});
