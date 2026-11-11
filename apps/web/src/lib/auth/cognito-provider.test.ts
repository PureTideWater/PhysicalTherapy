import { createHmac } from 'node:crypto';

import { createLogger } from '@tp/observability';
import { describe, expect, it } from 'vitest';

import {
  type CognitoClient,
  CognitoAuthProvider,
  ConfirmClientRetriesError,
  type IdTokenVerifier,
  MfaNotProvenError,
  type OneAttemptClient,
  cognitoClients,
  confirmChangedNothing,
} from './cognito-provider';
import type { AuthStep, NewPasswordStep } from './provider';
import { ClientSecret } from './secret-hash';

/**
 * The Cognito provider against a mocked SDK client (no AWS account is reachable from where this is
 * built). Each test scripts what Cognito answers per command and checks what was sent.
 *
 * The mock is the confidential client's endpoint too (SEC-20; docs/adr/0088, D1): given the client's secret, it
 * recomputes each request's hash over that request's own username (or compares RevokeToken's ClientSecret) and answers
 * a missing or wrong one as Cognito does, and it refuses a credential on any call that takes none. So every scripted
 * test below proves the username each call's hash is over. Without a secret (the public client of release N) it
 * refuses any credential at all.
 */

type Answer = Record<string, unknown> | Error;

interface Sent {
  readonly command: string;
  readonly input: Record<string, unknown>;
}

function named(name: string, message = name): Error {
  const error = new Error(message);
  error.name = name;
  return error;
}

/** An error as the SDK gives a service's answer: its name, the fault the model names and the HTTP status. */
function answered(name: string, status: number, fault: 'client' | 'server' = status < 500 ? 'client' : 'server', message = name): Error {
  return Object.assign(named(name, message), { $fault: fault, $metadata: { httpStatusCode: status } });
}

/** A client as the provider takes the confirm's: the scripted send(), and the attempts it says it makes. */
function attempts(client: CognitoClient, maxAttempts = 1): OneAttemptClient {
  return { send: client.send.bind(client), config: { maxAttempts: () => Promise.resolve(maxAttempts) } };
}

/** The synthetic client's secret, as the endpoint holds it. */
const SECRET = 'synthetic-client-secret-0000000000000000000000000000';
const CLIENT_ID = 'syntheticclient';

/** The hash the endpoint expects, computed here independently of the provider. */
function hashOver(username: string, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${username}${CLIENT_ID}`).digest('base64');
}

/** Where each hashed call carries its username and its hash. */
const HASHED: Readonly<Record<string, (input: Record<string, unknown>) => readonly [unknown, unknown]>> = {
  InitiateAuthCommand: (input) => [(input.AuthParameters as Record<string, unknown> | undefined)?.USERNAME, (input.AuthParameters as Record<string, unknown> | undefined)?.SECRET_HASH],
  RespondToAuthChallengeCommand: (input) => [
    (input.ChallengeResponses as Record<string, unknown> | undefined)?.USERNAME,
    (input.ChallengeResponses as Record<string, unknown> | undefined)?.SECRET_HASH,
  ],
  ForgotPasswordCommand: (input) => [input.Username, input.SecretHash],
  ConfirmForgotPasswordCommand: (input) => [input.Username, input.SecretHash],
};

/** Whether a request carries any client credential, anywhere. */
function carriesCredential(input: Record<string, unknown>): boolean {
  return /"(SECRET_HASH|SecretHash|ClientSecret)"/.test(JSON.stringify(input));
}

/** What the confidential client's endpoint answers a request's credential: nothing when it holds, else Cognito's refusal. */
function credentialRefusal(name: string, input: Record<string, unknown>, secret: string | null): Error | undefined {
  if (secret === null) {
    return carriesCredential(input) ? new Error(`unexpected credential on ${name}`) : undefined;
  }
  const hashed = HASHED[name];
  if (hashed !== undefined) {
    const [username, hash] = hashed(input);
    if (hash === undefined) {
      return named('NotAuthorizedException', `Client ${CLIENT_ID} is configured with secret but SECRET_HASH was not received`);
    }
    return typeof username === 'string' && hash === hashOver(username, secret) ? undefined : named('NotAuthorizedException', `Unable to verify secret hash for client ${CLIENT_ID}`);
  }
  if (name === 'RevokeTokenCommand') {
    return input.ClientSecret === secret ? undefined : named('UnauthorizedException', 'Client secret is not valid for the client.');
  }
  return carriesCredential(input) ? new Error(`unexpected credential on ${name}`) : undefined;
}

/** Every request any test sent, for the checks across the file. */
const everySent: Sent[] = [];

/**
 * The internal name a challenge's answer gave for its Session (USERNAME, or USER_ID_FOR_SRP alone), as Cognito holds the
 * user behind a Session: a RespondToAuthChallenge on that Session must send that name as USERNAME, and its hash over it
 * (docs/adr/0088, D1; review infra-auth-IA-1). A Session answered with no name is held to nothing here.
 */
function sessionNameRefusal(sessions: ReadonlyMap<string, string>, name: string, input: Record<string, unknown>, secret: string | null): Error | undefined {
  if (name !== 'RespondToAuthChallengeCommand' || typeof input.Session !== 'string') {
    return undefined;
  }
  const internal = sessions.get(input.Session);
  const username = (input.ChallengeResponses as Record<string, unknown> | undefined)?.USERNAME;
  if (internal === undefined || username === internal) {
    return undefined;
  }
  return named('NotAuthorizedException', secret === null ? 'Incorrect username or password.' : `Unable to verify secret hash for client ${CLIENT_ID}`);
}

function cognito(script: Record<string, Answer | Answer[]>, secret: string | null = SECRET) {
  const sent: Sent[] = [];
  const sessions = new Map<string, string>();
  const queues = new Map(Object.entries(script).map(([name, answers]) => [name, Array.isArray(answers) ? [...answers] : [answers]]));
  const client = {
    send: (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = command.constructor.name;
      sent.push({ command: name, input: command.input });
      everySent.push({ command: name, input: command.input });
      const refusal = credentialRefusal(name, command.input, secret) ?? sessionNameRefusal(sessions, name, command.input, secret);
      if (refusal !== undefined) {
        return Promise.reject(refusal);
      }
      const queue = queues.get(name);
      const answer = queue !== undefined && queue.length > 1 ? queue.shift() : queue?.[0];
      if (answer === undefined) {
        return Promise.reject(new Error(`unscripted ${name}`));
      }
      if (!(answer instanceof Error) && typeof answer.Session === 'string') {
        const parameters = answer.ChallengeParameters as Record<string, string> | undefined;
        const internal = parameters?.USERNAME ?? parameters?.USER_ID_FOR_SRP;
        if (internal !== undefined) {
          sessions.set(answer.Session, internal);
        }
      }
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(answer);
    },
  } as unknown as CognitoClient;
  return { client, sent };
}

const verifier: IdTokenVerifier = {
  verify: (token) => (token === 'id-token' ? Promise.resolve({ sub: 'sub-1', email: 'person@synthetic.test' }) : Promise.reject(named('JwtInvalidSignatureError'))),
};

const TOKENS = { AuthenticationResult: { IdToken: 'id-token', AccessToken: 'access-token', RefreshToken: 'refresh-token' } };

/**
 * A provider over the scripted endpoint. `secret`: what the provider is given (the client's own by default; null for
 * the public client); `endpoint`: what the endpoint holds (the client's own by default). The confirm's one-attempt
 * client is the same scripted endpoint unless `confirmClient` gives another.
 */
function make(
  script: Record<string, Answer | Answer[]>,
  options: { readonly secret?: string | null; readonly endpoint?: string | null; readonly confirmClient?: OneAttemptClient } = {},
) {
  const secret = options.secret === undefined ? SECRET : options.secret;
  const { client, sent } = cognito(script, options.endpoint === undefined ? secret : options.endpoint);
  const lines: string[] = [];
  const provider = new CognitoAuthProvider({
    client,
    confirmClient: options.confirmClient ?? attempts(client),
    userPoolId: 'us-east-1_Synthetic',
    clientId: CLIENT_ID,
    verifier,
    ...(secret === null ? {} : { clientSecret: new ClientSecret(secret) }),
    logger: createLogger({ sink: (line) => lines.push(line), level: 'debug' }),
  });
  return { provider, sent, lines };
}

function challengeOf(step: AuthStep | NewPasswordStep): string {
  if (!('challenge' in step)) {
    throw new Error(`expected a challenge, got ${step.kind}`);
  }
  return step.challenge;
}

describe('CognitoAuthProvider: password, TOTP and new passwords', () => {
  it('signs in with the choice-based flow, then answers the TOTP challenge and verifies the ID token', async () => {
    const { provider, sent } = make({
      InitiateAuthCommand: { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's1', ChallengeParameters: { USER_ID_FOR_SRP: 'internal-name' } },
      RespondToAuthChallengeCommand: TOKENS,
    });
    // What the person typed, sent as it was: the expectation below names this same value.
    const typed = 'Synthetic-Pass-2026';
    const step = await provider.signIn('person@synthetic.test', typed);
    expect(step.kind).toBe('mfa_required');
    expect(sent[0]?.input).toEqual({
      AuthFlow: 'USER_AUTH',
      ClientId: 'syntheticclient',
      AuthParameters: { USERNAME: 'person@synthetic.test', PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: typed, SECRET_HASH: hashOver('person@synthetic.test') },
    });
    const done = await provider.answerTotp(challengeOf(step), '123456');
    expect(done).toEqual({ kind: 'authenticated', identity: { sub: 'sub-1', email: 'person@synthetic.test', method: 'totp' }, grant: JSON.stringify({ a: 'access-token', r: 'refresh-token' }) });
    expect(sent[1]?.input).toEqual({
      ClientId: 'syntheticclient',
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: 's1',
      // The challenge's hash is over Cognito's USERNAME, never the typed email.
      ChallengeResponses: { USERNAME: 'internal-name', SOFTWARE_TOKEN_MFA_CODE: '123456', SECRET_HASH: hashOver('internal-name') },
    });
  });

  it('rejects wrong credentials and wrong codes, and reports an expired session', async () => {
    const { provider } = make({
      InitiateAuthCommand: [named('NotAuthorizedException'), { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's1' }],
      RespondToAuthChallengeCommand: [named('CodeMismatchException'), named('NotAuthorizedException', 'Invalid session for the user, session is expired.')],
    });
    expect(await provider.signIn('person@synthetic.test', 'wrong')).toEqual({ kind: 'rejected', stage: 'password' });
    const step = await provider.signIn('person@synthetic.test', 'right');
    expect(await provider.answerTotp(challengeOf(step), '000000')).toEqual({ kind: 'rejected', stage: 'mfa' });
    expect(await provider.answerTotp(challengeOf(step), '123456')).toEqual({ kind: 'expired' });
    expect(await provider.answerTotp('not json', '123456')).toEqual({ kind: 'expired' });
    expect(await provider.answerTotp('{"s":1}', '123456')).toEqual({ kind: 'expired' });
  });

  it('passes other failures through', async () => {
    const { provider } = make({ InitiateAuthCommand: named('TooManyRequestsException'), RespondToAuthChallengeCommand: named('InternalErrorException') });
    await expect(provider.signIn('person@synthetic.test', 'x')).rejects.toThrow('TooManyRequestsException');
    await expect(provider.answerTotp(JSON.stringify({ s: 's', u: 'u', email: 'e@synthetic.test' }), '123456')).rejects.toThrow('InternalErrorException');
  });

  it('refuses a challenge it does not answer, and tokens it cannot verify', async () => {
    const odd = make({ InitiateAuthCommand: { ChallengeName: 'SMS_OTP', Session: 's' } });
    await expect(odd.provider.signIn('person@synthetic.test', 'x')).rejects.toThrow('does not answer');
    const mfa = { InitiateAuthCommand: { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's1' } };
    const bad = make({ ...mfa, RespondToAuthChallengeCommand: { AuthenticationResult: { IdToken: 'forged', AccessToken: 'a' } } });
    await expect(bad.provider.answerTotp(challengeOf(await bad.provider.signIn('person@synthetic.test', 'x')), '123456')).rejects.toThrow('JwtInvalidSignatureError');
    const none = make({ ...mfa, RespondToAuthChallengeCommand: { AuthenticationResult: {} } });
    await expect(none.provider.answerTotp(challengeOf(await none.provider.signIn('person@synthetic.test', 'x')), '123456')).rejects.toThrow('no tokens');
  });

  it('never takes tokens for a password alone as a sign-in: the second factor must have answered a challenge (PRD 6)', async () => {
    // A pool that stopped requiring MFA would hand out tokens for the password: refused, and the refresh token revoked.
    const passwordOnly = make({ InitiateAuthCommand: TOKENS, RevokeTokenCommand: {} });
    await expect(passwordOnly.provider.signIn('person@synthetic.test', 'Synthetic-Pass-2026')).rejects.toThrow(MfaNotProvenError);
    expect(passwordOnly.sent.map((entry) => entry.command)).toEqual(['InitiateAuthCommand', 'RevokeTokenCommand']);
    expect(passwordOnly.sent[1]?.input).toEqual({ ClientId: 'syntheticclient', Token: 'refresh-token', ClientSecret: SECRET });
    // The same after a new password, even when revoking fails; and with no refresh token, nothing to revoke.
    const newPassword = make({ InitiateAuthCommand: { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's1' }, RespondToAuthChallengeCommand: TOKENS, RevokeTokenCommand: named('InternalErrorException') });
    const step = await newPassword.provider.signIn('person@synthetic.test', 'Temporary-Pass-1');
    await expect(newPassword.provider.setNewPassword(challengeOf(step), 'Chosen-Pass-2026')).rejects.toThrow(MfaNotProvenError);
    const noRefresh = make({ InitiateAuthCommand: { AuthenticationResult: { IdToken: 'id-token', AccessToken: 'a' } } });
    await expect(noRefresh.provider.signIn('person@synthetic.test', 'x')).rejects.toThrow(/without a second factor/);
    expect(noRefresh.sent.map((entry) => entry.command)).toEqual(['InitiateAuthCommand']);
  });

  it('sets a new password after a temporary one, checking the policy first', async () => {
    const { provider, sent } = make({
      InitiateAuthCommand: { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's1' },
      RespondToAuthChallengeCommand: [{ ChallengeName: 'MFA_SETUP', Session: 's2' }, named('InvalidPasswordException')],
    });
    const step = await provider.signIn('person@synthetic.test', 'Temporary-Pass-1');
    expect(step.kind).toBe('new_password_required');
    expect(await provider.setNewPassword(challengeOf(step), 'weak')).toMatchObject({ kind: 'invalid_password' });
    expect(sent).toHaveLength(1);
    const next = await provider.setNewPassword(challengeOf(step), 'Chosen-Pass-2026');
    expect(next.kind).toBe('mfa_setup_required');
    expect(sent[1]?.input).toMatchObject({
      ChallengeName: 'NEW_PASSWORD_REQUIRED',
      ChallengeResponses: { NEW_PASSWORD: 'Chosen-Pass-2026', USERNAME: 'person@synthetic.test', SECRET_HASH: hashOver('person@synthetic.test') },
    });
    expect(await provider.setNewPassword(challengeOf(step), 'Chosen-Pass-2027')).toEqual({ kind: 'invalid_password', problems: [] });
  });

  it('SEC-22: names the enrolling subject on MFA_SETUP from Cognito’s USERNAME or USER_ID_FOR_SRP, through a new password too, and never the typed email (docs/adr/0088, D3; review security-S2)', async () => {
    const byUsername = make({ InitiateAuthCommand: { ChallengeName: 'MFA_SETUP', Session: 's1', ChallengeParameters: { USERNAME: 'internal-name' } } });
    expect(await byUsername.provider.signIn('person@synthetic.test', 'Synthetic-Pass-2026')).toMatchObject({ kind: 'mfa_setup_required', subject: 'internal-name' });
    const bySrp = make({ InitiateAuthCommand: { ChallengeName: 'MFA_SETUP', Session: 's1', ChallengeParameters: { USER_ID_FOR_SRP: 'srp-name' } } });
    expect(await bySrp.provider.signIn('person@synthetic.test', 'Synthetic-Pass-2026')).toMatchObject({ kind: 'mfa_setup_required', subject: 'srp-name' });
    // Neither named: no subject, and never the address that was typed.
    const unnamed = make({ InitiateAuthCommand: { ChallengeName: 'MFA_SETUP', Session: 's1' } });
    const bare = await unnamed.provider.signIn('person@synthetic.test', 'Synthetic-Pass-2026');
    expect(bare.kind).toBe('mfa_setup_required');
    expect(bare).not.toHaveProperty('subject');
    // A new password's MFA_SETUP keeps the name Cognito gave the step before it, and only that.
    const invited = make({
      InitiateAuthCommand: { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's1', ChallengeParameters: { USER_ID_FOR_SRP: 'internal-name' } },
      RespondToAuthChallengeCommand: { ChallengeName: 'MFA_SETUP', Session: 's2' },
    });
    const first = await invited.provider.signIn('person@synthetic.test', 'Temporary-Pass-1');
    expect(first).not.toHaveProperty('subject');
    expect(await invited.provider.setNewPassword(challengeOf(first), 'Chosen-Pass-2026')).toMatchObject({ kind: 'mfa_setup_required', subject: 'internal-name' });
    const nameless = make({ InitiateAuthCommand: { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's1' }, RespondToAuthChallengeCommand: { ChallengeName: 'MFA_SETUP', Session: 's2' } });
    const after = await nameless.provider.setNewPassword(challengeOf(await nameless.provider.signIn('person@synthetic.test', 'Temporary-Pass-1')), 'Chosen-Pass-2026');
    expect(after.kind).toBe('mfa_setup_required');
    expect(after).not.toHaveProperty('subject');
  });

  it('enrolls TOTP: associate, verify, then answer MFA_SETUP', async () => {
    const { provider, sent } = make({
      InitiateAuthCommand: { ChallengeName: 'MFA_SETUP', Session: 's1' },
      AssociateSoftwareTokenCommand: { SecretCode: 'JBSWY3DPEHPK3PXP', Session: 's2' },
      VerifySoftwareTokenCommand: [{ Status: 'ERROR' }, named('EnableSoftwareTokenMFAException'), { Status: 'SUCCESS', Session: 's3' }],
      RespondToAuthChallengeCommand: TOKENS,
    });
    const step = await provider.signIn('person@synthetic.test', 'Synthetic-Pass-2026');
    const setup = await provider.beginTotpSetup(challengeOf(step));
    if ('kind' in setup) {
      throw new Error('expected a setup');
    }
    expect(setup.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(setup.uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(await provider.completeTotpSetup(setup.challenge, '000000')).toEqual({ kind: 'rejected', stage: 'mfa' });
    expect(await provider.completeTotpSetup(setup.challenge, '000001')).toEqual({ kind: 'rejected', stage: 'mfa' });
    expect(await provider.completeTotpSetup(setup.challenge, '123456')).toMatchObject({ kind: 'authenticated', identity: { method: 'totp' } });
    expect(sent.map((call) => call.command)).toEqual([
      'InitiateAuthCommand',
      'AssociateSoftwareTokenCommand',
      'VerifySoftwareTokenCommand',
      'VerifySoftwareTokenCommand',
      'VerifySoftwareTokenCommand',
      'RespondToAuthChallengeCommand',
    ]);
    expect(sent.at(-1)?.input).toMatchObject({ ChallengeName: 'MFA_SETUP', Session: 's3', ChallengeResponses: { SECRET_HASH: hashOver('person@synthetic.test') } });
    // Associating and verifying the authenticator take the session alone, no credential.
    expect(sent.filter((call) => call.command.endsWith('SoftwareTokenCommand')).every((call) => !carriesCredential(call.input))).toBe(true);
  });

  it('reports expired setup sessions and passes other setup failures through', async () => {
    const challenge = JSON.stringify({ s: 's', u: 'u', email: 'e@synthetic.test' });
    const stale = make({ AssociateSoftwareTokenCommand: named('NotAuthorizedException'), VerifySoftwareTokenCommand: named('NotAuthorizedException') });
    expect(await stale.provider.beginTotpSetup(challenge)).toEqual({ kind: 'expired' });
    expect(await stale.provider.completeTotpSetup(challenge, '123456')).toEqual({ kind: 'expired' });
    expect(await stale.provider.beginTotpSetup('nope')).toEqual({ kind: 'expired' });
    expect(await stale.provider.completeTotpSetup('nope', '123456')).toEqual({ kind: 'expired' });
    const broken = make({ AssociateSoftwareTokenCommand: named('InternalErrorException'), VerifySoftwareTokenCommand: named('InternalErrorException') });
    await expect(broken.provider.beginTotpSetup(challenge)).rejects.toThrow('InternalErrorException');
    await expect(broken.provider.completeTotpSetup(challenge, '123456')).rejects.toThrow('InternalErrorException');
    // A challenge whose subject is not a string is not one this server sealed: nothing is sent for it.
    const odd = JSON.stringify({ s: 's', u: 'u', email: 'e@synthetic.test', n: 7 });
    expect(await broken.provider.beginTotpSetup(odd)).toEqual({ kind: 'expired' });
    expect(await broken.provider.completeTotpSetup(odd, '123456')).toEqual({ kind: 'expired' });
  });
});

describe('CognitoAuthProvider: passkeys', () => {
  const OPTIONS = { challenge: 'abc', rpId: 'app.synthetic.test', allowCredentials: [] };

  it('signs in with a passkey through the WEB_AUTHN challenge', async () => {
    const { provider, sent } = make({
      InitiateAuthCommand: { ChallengeName: 'WEB_AUTHN', Session: 'w1', ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: JSON.stringify(OPTIONS) } },
      RespondToAuthChallengeCommand: [TOKENS, named('WebAuthnChallengeNotFoundException'), named('NotAuthorizedException')],
    });
    const { options, challenge } = await provider.beginKeySignIn('person@synthetic.test');
    expect(options).toEqual(OPTIONS);
    expect(sent[0]?.input).toEqual({
      AuthFlow: 'USER_AUTH',
      ClientId: 'syntheticclient',
      AuthParameters: { USERNAME: 'person@synthetic.test', PREFERRED_CHALLENGE: 'WEB_AUTHN', SECRET_HASH: hashOver('person@synthetic.test') },
    });
    const response = { id: 'cred', rawId: 'cred', type: 'public-key', response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' }, clientExtensionResults: {} } as const;
    expect(await provider.completeKeySignIn(challenge, response)).toMatchObject({ kind: 'authenticated', identity: { method: 'webauthn' } });
    expect(sent[1]?.input).toMatchObject({ ChallengeName: 'WEB_AUTHN', ChallengeResponses: { CREDENTIAL: JSON.stringify(response) } });
    expect(await provider.completeKeySignIn(challenge, response)).toEqual({ kind: 'rejected', stage: 'hardware_key' });
    expect(await provider.completeKeySignIn(challenge, response)).toEqual({ kind: 'expired' });
  });

  it('answers the WEB_AUTHN challenge as Cognito named the user, USER_ID_FOR_SRP alone included, never as the typed email (review infra-auth-IA-1)', async () => {
    for (const parameters of [{ USER_ID_FOR_SRP: 'internal-name' }, { USERNAME: 'internal-name', USER_ID_FOR_SRP: 'other-name' }]) {
      const { provider, sent } = make({
        InitiateAuthCommand: { ChallengeName: 'WEB_AUTHN', Session: 'w2', ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: JSON.stringify(OPTIONS), ...parameters } },
        RespondToAuthChallengeCommand: TOKENS,
      });
      const { challenge } = await provider.beginKeySignIn('person@synthetic.test');
      const response = { id: 'cred', rawId: 'cred', type: 'public-key', response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' }, clientExtensionResults: {} } as const;
      expect(await provider.completeKeySignIn(challenge, response)).toMatchObject({ kind: 'authenticated', identity: { method: 'webauthn' } });
      expect(sent[1]?.input).toMatchObject({ ChallengeName: 'WEB_AUTHN', Session: 'w2', ChallengeResponses: { USERNAME: 'internal-name', SECRET_HASH: hashOver('internal-name') } });
    }
    // Without the secret (release N) the same name is sent, and no hash.
    const open = make(
      { InitiateAuthCommand: { ChallengeName: 'WEB_AUTHN', Session: 'w3', ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: JSON.stringify(OPTIONS), USER_ID_FOR_SRP: 'internal-name' } }, RespondToAuthChallengeCommand: TOKENS },
      { secret: null },
    );
    const { challenge } = await open.provider.beginKeySignIn('person@synthetic.test');
    expect(await open.provider.completeKeySignIn(challenge, {} as never)).toMatchObject({ kind: 'authenticated' });
    expect((open.sent[1]?.input.ChallengeResponses as Record<string, unknown>).USERNAME).toBe('internal-name');
    expect(open.sent[1]?.input.ChallengeResponses).not.toHaveProperty('SECRET_HASH');
  });

  it('the twin refuses a challenge answered under another name than Cognito gave for its Session (review infra-auth-IA-1)', async () => {
    const { provider } = make({ RespondToAuthChallengeCommand: TOKENS, InitiateAuthCommand: { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's9', ChallengeParameters: { USER_ID_FOR_SRP: 'internal-name' } } });
    await provider.signIn('person@synthetic.test', 'Synthetic-Pass-2026');
    await expect(provider.answerTotp(JSON.stringify({ s: 's9', u: 'person@synthetic.test', email: 'person@synthetic.test' }), '123456')).rejects.toThrow('client credential');
  });

  it('refuses when Cognito offers no passkey challenge, and passes other failures through', async () => {
    const { provider } = make({ InitiateAuthCommand: { ChallengeName: 'PASSWORD', Session: 'w' } });
    await expect(provider.beginKeySignIn('person@synthetic.test')).rejects.toThrow('did not offer');
    const broken = make({ RespondToAuthChallengeCommand: named('InternalErrorException') });
    await expect(broken.provider.completeKeySignIn(JSON.stringify({ s: 's', u: 'u', email: 'e@synthetic.test' }), {} as never)).rejects.toThrow('InternalErrorException');
  });

  it('lists, starts and completes passkey registration with the access token', async () => {
    const grant = JSON.stringify({ a: 'access-token', r: 'refresh-token' });
    const { provider, sent } = make({
      ListWebAuthnCredentialsCommand: [{ Credentials: [] }, { Credentials: [{ CredentialId: 'c' }] }, {}],
      StartWebAuthnRegistrationCommand: [{ CredentialCreationOptions: { challenge: 'r', rp: { id: 'app.synthetic.test', name: 'x' } } }, {}],
      CompleteWebAuthnRegistrationCommand: [{}, named('WebAuthnClientMismatchException'), named('InternalErrorException')],
      RevokeTokenCommand: {},
    });
    expect(await provider.hasHardwareKey(grant)).toBe(false);
    expect(await provider.hasHardwareKey(grant)).toBe(true);
    expect(await provider.hasHardwareKey(grant)).toBe(false);
    const begun = await provider.beginKeyRegistration(grant);
    expect(begun.options).toMatchObject({ challenge: 'r' });
    await expect(provider.beginKeyRegistration(grant)).rejects.toThrow('no registration options');
    const response = { id: 'c', rawId: 'c', type: 'public-key', response: { clientDataJSON: 'x', attestationObject: 'y' }, clientExtensionResults: {} } as const;
    expect(await provider.completeKeyRegistration(grant, begun.challenge, response)).toBe(true);
    expect(await provider.completeKeyRegistration(grant, begun.challenge, response)).toBe(false);
    await expect(provider.completeKeyRegistration(grant, begun.challenge, response)).rejects.toThrow('InternalErrorException');
    expect(sent.filter((call) => call.command !== 'RevokeTokenCommand').every((call) => call.input.AccessToken === 'access-token')).toBe(true);
    await provider.release(grant);
    expect(sent.at(-1)).toEqual({ command: 'RevokeTokenCommand', input: { ClientId: 'syntheticclient', Token: 'refresh-token', ClientSecret: SECRET } });
    // The passkey calls take the access token alone, no credential.
    expect(sent.filter((call) => call.command !== 'RevokeTokenCommand').every((call) => !carriesCredential(call.input))).toBe(true);
    await provider.release(JSON.stringify({ a: 'only-access' }));
    expect(sent.filter((call) => call.command === 'RevokeTokenCommand')).toHaveLength(1);
    await expect(provider.hasHardwareKey('{}')).rejects.toThrow('access token');
  });
});

describe('CognitoAuthProvider: administration', () => {
  it('creates an invited user (Cognito emails the temporary password), or finds the existing one and whether it ever signed in (SEC-22)', async () => {
    const { provider, sent } = make({
      AdminCreateUserCommand: [
        { User: { Attributes: [{ Name: 'sub', Value: 'sub-new' }] } },
        named('UsernameExistsException'),
        named('UsernameExistsException'),
        named('UsernameExistsException'),
        named('InternalErrorException'),
        { User: {} },
      ],
      AdminGetUserCommand: [
        { UserStatus: 'CONFIRMED', UserAttributes: [{ Name: 'email', Value: 'x' }, { Name: 'sub', Value: 'sub-old' }] },
        { UserStatus: 'FORCE_CHANGE_PASSWORD', UserAttributes: [{ Name: 'sub', Value: 'sub-invited' }] },
        { UserAttributes: [{ Name: 'sub', Value: 'sub-unknown-status' }] },
      ],
    });
    expect(await provider.ensureUser('new@synthetic.test')).toEqual({ sub: 'sub-new', created: true, neverSignedIn: true });
    expect(sent[0]?.input).toEqual({
      UserPoolId: 'us-east-1_Synthetic',
      Username: 'new@synthetic.test',
      UserAttributes: [
        { Name: 'email', Value: 'new@synthetic.test' },
        { Name: 'email_verified', Value: 'true' },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    });
    expect(await provider.ensureUser('old@synthetic.test')).toEqual({ sub: 'sub-old', created: false, neverSignedIn: false });
    expect(sent.at(-1)).toEqual({ command: 'AdminGetUserCommand', input: { UserPoolId: 'us-east-1_Synthetic', Username: 'old@synthetic.test' } });
    expect(await provider.ensureUser('invited@synthetic.test')).toEqual({ sub: 'sub-invited', created: false, neverSignedIn: true });
    // A status Cognito did not name is not taken for "never signed in".
    expect(await provider.ensureUser('unknown@synthetic.test')).toEqual({ sub: 'sub-unknown-status', created: false, neverSignedIn: false });
    await expect(provider.ensureUser('x@synthetic.test')).rejects.toThrow('InternalErrorException');
    await expect(provider.ensureUser('y@synthetic.test')).rejects.toThrow('without a subject');
  });

  it('sends an invitation again, and leaves a user who has signed in as they are (J2)', async () => {
    const { provider, sent } = make({ AdminCreateUserCommand: [{}, named('UnsupportedUserStateException'), named('InternalErrorException')] });
    expect(await provider.resendInvitation('invited@synthetic.test')).toBe(true);
    expect(sent[0]).toEqual({
      command: 'AdminCreateUserCommand',
      input: { UserPoolId: 'us-east-1_Synthetic', Username: 'invited@synthetic.test', MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'] },
    });
    // Signed in since: nothing sent, and the answer says so, so a link onto the account is refused (review security-N3).
    await expect(provider.resendInvitation('active@synthetic.test')).resolves.toBe(false);
    await expect(provider.resendInvitation('x@synthetic.test')).rejects.toThrow('InternalErrorException');
  });

  it('SGN-14: an invitation the message trigger could not write fails to the administrator, never as created or as not sent', async () => {
    const lambdaErrors = ['UnexpectedLambdaException', 'UserLambdaValidationException', 'InvalidLambdaResponseException'];
    const { provider } = make({ AdminCreateUserCommand: [...lambdaErrors, ...lambdaErrors].map((name) => named(name)) });
    for (const name of lambdaErrors) {
      await expect(provider.ensureUser('new@synthetic.test')).rejects.toThrow(name);
    }
    for (const name of lambdaErrors) {
      await expect(provider.resendInvitation('invited@synthetic.test')).rejects.toThrow(name);
    }
  });

  it('signs a user out everywhere by subject', async () => {
    const { provider, sent } = make({ AdminUserGlobalSignOutCommand: {} });
    await provider.globalSignOut('sub-1');
    expect(sent).toEqual([{ command: 'AdminUserGlobalSignOutCommand', input: { UserPoolId: 'us-east-1_Synthetic', Username: 'sub-1' } }]);
  });
});

describe('CognitoAuthProvider: a forgotten password (SGN-05, SGN-06)', () => {
  const EMAIL = 'person@synthetic.test';
  const NEW_PASSWORD = 'Chosen-Reset-Pass-2026';

  const resetting = make;

  it('asks Cognito for a code with the client and the hash over the typed address (no admin call), and never reads the masked destination', async () => {
    const { provider, sent, lines } = resetting({
      ForgotPasswordCommand: { CodeDeliveryDetails: { Destination: 'p***@s***', DeliveryMedium: 'EMAIL', AttributeName: 'email' } },
    });
    await expect(provider.requestPasswordReset(EMAIL, 'request-1')).resolves.toBeUndefined();
    expect(sent).toEqual([{ command: 'ForgotPasswordCommand', input: { ClientId: 'syntheticclient', Username: EMAIL, SecretHash: hashOver(EMAIL) } }]);
    expect(lines.join('\n')).not.toContain('p***');
    expect(lines.join('\n')).not.toContain(EMAIL);
  });

  it('answers the same for every refusal only a real account (or a quota) can cause, logging its code and the request alone', async () => {
    const swallowed = [
      'UserNotFoundException',
      'NotAuthorizedException',
      'InvalidParameterException',
      'LimitExceededException',
      'CodeDeliveryFailureException',
      'TooManyRequestsException',
    ];
    const { provider, lines } = resetting({ ForgotPasswordCommand: swallowed.map((name) => named(name, `${name} for ${EMAIL}`)) });
    for (const name of swallowed) {
      expect([name, await provider.requestPasswordReset(EMAIL, 'request-2')]).toEqual([name, undefined]);
    }
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.map((entry) => [entry.level, entry.msg, entry.error_code, entry.request_id])).toEqual(
      swallowed.map((name) => ['warn', 'password reset request not delivered', name, 'request-2']),
    );
    expect(lines.join('\n')).not.toContain(EMAIL);
  });

  it('passes its own failures through, so a broken provider never says to check the email', async () => {
    const { provider } = resetting({ ForgotPasswordCommand: [named('InternalErrorException'), named('ResourceNotFoundException'), new Error('socket hang up')] });
    await expect(provider.requestPasswordReset(EMAIL)).rejects.toThrow('InternalErrorException');
    await expect(provider.requestPasswordReset(EMAIL)).rejects.toThrow('ResourceNotFoundException');
    await expect(provider.requestPasswordReset(EMAIL)).rejects.toThrow('socket hang up');
  });

  it('SGN-14: a code the message trigger could not write is our failure: it is thrown, never answered as not delivered', async () => {
    const lambdaErrors = ['UnexpectedLambdaException', 'UserLambdaValidationException', 'InvalidLambdaResponseException'];
    const { provider, lines } = resetting({ ForgotPasswordCommand: lambdaErrors.map((name) => named(name)) });
    for (const name of lambdaErrors) {
      await expect(provider.requestPasswordReset(EMAIL, 'request-3')).rejects.toThrow(name);
    }
    expect(lines.join('\n')).not.toContain('not delivered');
  });

  it('sets the new password with the mailed code, with the client and the hash over the typed address', async () => {
    const { provider, sent } = resetting({ ConfirmForgotPasswordCommand: {} });
    expect(await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).toEqual({ kind: 'reset' });
    expect(sent).toEqual([
      { command: 'ConfirmForgotPasswordCommand', input: { ClientId: 'syntheticclient', Username: EMAIL, ConfirmationCode: '123456', Password: NEW_PASSWORD, SecretHash: hashOver(EMAIL) } },
    ]);
  });

  it('answers one refusal for every code problem and an unknown user', async () => {
    const refused = ['CodeMismatchException', 'ExpiredCodeException', 'LimitExceededException', 'TooManyFailedAttemptsException', 'UserNotFoundException', 'NotAuthorizedException'];
    const { provider } = resetting({ ConfirmForgotPasswordCommand: refused.map((name) => named(name)) });
    for (const name of refused) {
      expect([name, await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)]).toEqual([name, { kind: 'rejected' }]);
    }
  });

  it('checks the policy before Cognito, maps the pool’s own refusal, and passes a client fault that changed nothing through', async () => {
    const { provider, sent } = resetting({ ConfirmForgotPasswordCommand: [named('InvalidPasswordException'), answered('ResourceNotFoundException', 400)] });
    expect(await provider.confirmPasswordReset(EMAIL, '123456', 'weak')).toMatchObject({ kind: 'invalid_password' });
    expect(sent).toEqual([]);
    expect(await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).toEqual({ kind: 'invalid_password', problems: [] });
    await expect(provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).rejects.toThrow('ResourceNotFoundException');
  });
});

describe('CognitoAuthProvider: a reset whose answer is lost (SGN-18; docs/adr/0093, D9)', () => {
  const EMAIL = 'person@synthetic.test';
  const NEW_PASSWORD = 'Chosen-Reset-Pass-2026';
  const LAMBDA = ['UnexpectedLambdaException', 'UserLambdaValidationException', 'InvalidLambdaResponseException'];

  it('SGN-18: the confirm is sent on the one-attempt client and never on the retrying one', async () => {
    const retrying = cognito({ ConfirmForgotPasswordCommand: {}, ForgotPasswordCommand: {} });
    const once = cognito({ ConfirmForgotPasswordCommand: {} });
    const { provider, sent } = make({ ForgotPasswordCommand: {} }, { confirmClient: attempts(once.client) });
    await provider.requestPasswordReset(EMAIL, 'request-1');
    expect(await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).toEqual({ kind: 'reset' });
    expect(once.sent.map((call) => call.command)).toEqual(['ConfirmForgotPasswordCommand']);
    expect(sent.map((call) => call.command)).toEqual(['ForgotPasswordCommand']);
    expect(retrying.sent).toEqual([]);
  });

  it('SGN-18: a confirm client left on more than one attempt sends nothing and throws', async () => {
    for (const maxAttempts of [3, 2, 0]) {
      const once = cognito({ ConfirmForgotPasswordCommand: {} });
      const { provider, sent } = make({}, { confirmClient: attempts(once.client, maxAttempts) });
      await expect(provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).rejects.toThrow(ConfirmClientRetriesError);
      expect([...once.sent, ...sent]).toEqual([]);
    }
  });

  it('SGN-18: the composed clients: the confirm’s is set to one attempt, the other keeps the SDK’s retries', async () => {
    const { client, confirmClient } = cognitoClients('us-east-1');
    expect(await confirmClient.config.maxAttempts()).toBe(1);
    expect(await client.config.maxAttempts()).toBeGreaterThan(1);
    expect(confirmClient).not.toBe(client);
  });

  it('SGN-18: no answer, a server fault and a trigger’s failure are an unknown outcome, by the error’s name alone', async () => {
    const unknown: readonly (readonly [Error, string])[] = [
      [named('TimeoutError', `socket timed out for ${EMAIL}`), 'TimeoutError'],
      [new Error('socket hang up'), 'Error'],
      [Object.assign(named('ECONNRESET'), { $metadata: {} }), 'ECONNRESET'],
      [answered('InternalErrorException', 500), 'InternalErrorException'],
      [answered('ServiceUnavailable', 503), 'ServiceUnavailable'],
      [answered('UnknownError', 502, 'client'), 'UnknownError'],
      [named('InternalErrorException'), 'InternalErrorException'],
      ...LAMBDA.map((name) => [answered(name, 400), name] as const),
    ];
    const { provider, sent, lines } = make({ ConfirmForgotPasswordCommand: unknown.map(([error]) => error) });
    for (const [, name] of unknown) {
      expect([name, await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)]).toEqual([name, { kind: 'outcome_unknown', code: name }]);
    }
    expect(sent).toHaveLength(unknown.length);
    expect(lines.join('\n')).not.toContain(EMAIL);
  });

  it('SGN-18: an error with no name at all is an unknown outcome named unknown', async () => {
    const { provider } = make({ ConfirmForgotPasswordCommand: Object.assign(new Error('x'), { name: '' }) });
    expect(await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).toEqual({ kind: 'outcome_unknown', code: 'unknown' });
  });

  it('SGN-18: every answer that changed nothing stays what it was: the code’s refusals, the policy’s, the credential’s, and any other client fault thrown', async () => {
    const rejected = ['CodeMismatchException', 'ExpiredCodeException', 'LimitExceededException', 'TooManyFailedAttemptsException', 'UserNotFoundException', 'NotAuthorizedException', 'UserNotConfirmedException'];
    const thrown = ['TooManyRequestsException', 'InvalidParameterException', 'ResourceNotFoundException', 'ForbiddenException', 'OperationNotEnabledException', 'PasswordHistoryPolicyViolationException', 'SomeUnmodelledClientFault'];
    const { provider } = make({
      ConfirmForgotPasswordCommand: [
        ...rejected.slice(0, 6).map((name) => answered(name, 400)),
        answered('InvalidPasswordException', 400),
        answered('NotAuthorizedException', 400, 'client', `Unable to verify secret hash for client ${CLIENT_ID}`),
        ...thrown.map((name) => answered(name, name === 'ForbiddenException' ? 403 : 400)),
        Object.assign(named('ThrottlingException'), { $fault: 'client' }),
        answered('UserNotConfirmedException', 400),
      ],
    });
    for (const name of rejected.slice(0, 6)) {
      expect([name, await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)]).toEqual([name, { kind: 'rejected' }]);
    }
    expect(await provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).toEqual({ kind: 'invalid_password', problems: [] });
    await expect(provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).rejects.toMatchObject({ name: 'ClientCredentialError', code: 'NotAuthorizedException' });
    for (const name of [...thrown, 'ThrottlingException', 'UserNotConfirmedException']) {
      await expect(provider.confirmPasswordReset(EMAIL, '123456', NEW_PASSWORD)).rejects.toMatchObject({ name });
    }
  });

  it('SGN-18: the rule itself: a 4xx or a client fault with no status changed nothing, unless a trigger’s; a status wins over the fault', () => {
    expect(confirmChangedNothing(answered('TooManyRequestsException', 429))).toBe(true);
    expect(confirmChangedNothing(Object.assign(named('X'), { $fault: 'client' }))).toBe(true);
    expect(confirmChangedNothing(answered('X', 500, 'client'))).toBe(false);
    expect(confirmChangedNothing(answered('X', 400, 'server'))).toBe(true);
    expect(confirmChangedNothing(Object.assign(named('X'), { $fault: 'server' }))).toBe(false);
    expect(confirmChangedNothing(answered('X', 399))).toBe(false);
    expect(confirmChangedNothing(named('X'))).toBe(false);
    for (const name of LAMBDA) {
      expect(confirmChangedNothing(answered(name, 400))).toBe(false);
    }
    for (const value of [undefined, null, 'TooManyRequestsException', 400]) {
      expect(confirmChangedNothing(value)).toBe(false);
    }
  });
});

describe('CognitoAuthProvider: a hardware key removed (docs/adr/0093, D6)', () => {
  const GRANT = JSON.stringify({ a: 'access-token', r: 'refresh-token' });

  it('removes the credential with the grant’s access token and no client credential', async () => {
    const { provider, sent, lines } = make({ DeleteWebAuthnCredentialCommand: {} });
    expect(await provider.removeHardwareKey(GRANT, 'credential-1')).toBe(true);
    expect(sent).toEqual([{ command: 'DeleteWebAuthnCredentialCommand', input: { AccessToken: 'access-token', CredentialId: 'credential-1' } }]);
    expect(lines).toEqual([]);
  });

  it('answers false for any failure, a grant that does not open included, logging the error’s name alone', async () => {
    const { provider, lines } = make({
      DeleteWebAuthnCredentialCommand: [answered('ResourceNotFoundException', 400, 'client', 'credential-1 of access-token'), answered('InternalErrorException', 500), named('NotAuthorizedException', 'Access Token has been revoked'), new Error('socket hang up')],
    });
    for (let call = 0; call < 4; call += 1) {
      expect(await provider.removeHardwareKey(GRANT, 'credential-1')).toBe(false);
    }
    expect(await provider.removeHardwareKey('not a grant', 'credential-1')).toBe(false);
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.map((entry) => [entry.level, entry.msg, entry.error_code])).toEqual(
      ['ResourceNotFoundException', 'InternalErrorException', 'NotAuthorizedException', 'Error', 'SyntaxError'].map((name) => ['warn', 'provider hardware key removal failed', name]),
    );
    expect(lines.join('\n')).not.toContain('access-token');
    expect(lines.join('\n')).not.toContain('credential-1');
  });

  it('a refused client credential is thrown, never answered as not removed', async () => {
    const { provider } = make({ DeleteWebAuthnCredentialCommand: named('NotAuthorizedException', `Unable to verify secret hash for client ${CLIENT_ID}`) });
    await expect(provider.removeHardwareKey(GRANT, 'credential-1')).rejects.toMatchObject({ name: 'ClientCredentialError', code: 'NotAuthorizedException' });
  });
});

describe('CognitoAuthProvider: the confidential client (SEC-20; docs/adr/0088, D1 and D2)', () => {
  const EMAIL = 'person@synthetic.test';
  const OPTIONS = { challenge: 'abc', rpId: 'app.synthetic.test', allowCredentials: [] };
  const KEY_RESPONSE = { id: 'cred', rawId: 'cred', type: 'public-key', response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' }, clientExtensionResults: {} } as const;

  /** What a ClientCredentialError looks like from outside: its name and the Cognito error it stands for, never Cognito's words. */
  const credentialError = (code: string): unknown => expect.objectContaining({ name: 'ClientCredentialError', code, message: expect.not.stringMatching(/syntheticclient|secret hash/i) as unknown });

  it('SEC-20: without a client secret (the public client of release N) sends no hash and no secret on any call', async () => {
    const { provider, sent } = make(
      {
        InitiateAuthCommand: [{ ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's1', ChallengeParameters: { USERNAME: 'internal-name' } }, { ChallengeName: 'WEB_AUTHN', Session: 'w1', ChallengeParameters: { CREDENTIAL_REQUEST_OPTIONS: JSON.stringify(OPTIONS) } }],
        RespondToAuthChallengeCommand: TOKENS,
        RevokeTokenCommand: {},
        ForgotPasswordCommand: {},
        ConfirmForgotPasswordCommand: {},
      },
      { secret: null },
    );
    const done = await provider.answerTotp(challengeOf(await provider.signIn(EMAIL, 'Synthetic-Pass-2026')), '123456');
    await provider.release(done.kind === 'authenticated' ? done.grant : '{}');
    await provider.beginKeySignIn(EMAIL);
    await provider.requestPasswordReset(EMAIL, 'request-1');
    expect(await provider.confirmPasswordReset(EMAIL, '123456', 'Chosen-Reset-Pass-2026')).toEqual({ kind: 'reset' });
    expect(sent.map((call) => call.command)).toEqual(['InitiateAuthCommand', 'RespondToAuthChallengeCommand', 'RevokeTokenCommand', 'InitiateAuthCommand', 'ForgotPasswordCommand', 'ConfirmForgotPasswordCommand']);
    expect(sent.every((call) => !carriesCredential(call.input))).toBe(true);
  });

  it('SEC-20: a refused client credential is a ClientCredentialError from every call that takes it, never a wrong password, an expired step, a wrong code or a swallowed reset', async () => {
    // The provider holds one secret and the endpoint another: every hashed call is refused as Cognito refuses it.
    const wrong = { secret: `${SECRET.slice(0, -1)}1`, endpoint: SECRET };
    const challenge = JSON.stringify({ s: 's', u: 'internal-name', email: EMAIL });
    const { provider, lines } = make({ AssociateSoftwareTokenCommand: { SecretCode: 'JBSWY3DPEHPK3PXP', Session: 's2' }, VerifySoftwareTokenCommand: { Status: 'SUCCESS', Session: 's3' } }, wrong);
    await expect(provider.signIn(EMAIL, 'Synthetic-Pass-2026')).rejects.toEqual(credentialError('NotAuthorizedException'));
    await expect(provider.setNewPassword(challenge, 'Chosen-Pass-2026')).rejects.toEqual(credentialError('NotAuthorizedException'));
    await expect(provider.answerTotp(challenge, '123456')).rejects.toEqual(credentialError('NotAuthorizedException'));
    // Associate and verify take no credential; the MFA_SETUP answer after them does.
    await expect(provider.completeTotpSetup(challenge, '123456')).rejects.toEqual(credentialError('NotAuthorizedException'));
    await expect(provider.beginKeySignIn(EMAIL)).rejects.toEqual(credentialError('NotAuthorizedException'));
    await expect(provider.completeKeySignIn(challenge, KEY_RESPONSE)).rejects.toEqual(credentialError('NotAuthorizedException'));
    await expect(provider.requestPasswordReset(EMAIL, 'request-3')).rejects.toEqual(credentialError('NotAuthorizedException'));
    await expect(provider.confirmPasswordReset(EMAIL, '123456', 'Chosen-Reset-Pass-2026')).rejects.toEqual(credentialError('NotAuthorizedException'));
    // RevokeToken's modelled errors have no NotAuthorizedException: its refusal is UnauthorizedException (review infra-auth-IA-9).
    await expect(provider.release(JSON.stringify({ a: 'access-token', r: 'refresh-token' }))).rejects.toEqual(credentialError('UnauthorizedException'));
    // A reset request refused for the credential is not "not delivered": it is the platform's failure.
    expect(lines.map((line) => (JSON.parse(line) as Record<string, unknown>).msg)).not.toContain('password reset request not delivered');
    // A missing hash is the same refusal as a wrong one.
    const missing = make({}, { secret: null, endpoint: SECRET });
    await expect(missing.provider.signIn(EMAIL, 'Synthetic-Pass-2026')).rejects.toEqual(credentialError('NotAuthorizedException'));
  });

  it('SEC-20: the revoke after tokens for a password alone rethrows a credential refusal, and swallows every other failure as before', async () => {
    const revokeRefused = make({ InitiateAuthCommand: TOKENS, RevokeTokenCommand: named('UnauthorizedException', 'Client secret is not valid for the client.') });
    await expect(revokeRefused.provider.signIn(EMAIL, 'x')).rejects.toEqual(credentialError('UnauthorizedException'));
    const revokeBroken = make({ InitiateAuthCommand: TOKENS, RevokeTokenCommand: named('InternalErrorException') });
    await expect(revokeBroken.provider.signIn(EMAIL, 'x')).rejects.toThrow(MfaNotProvenError);
  });

  it('SEC-20: release() swallows a revoke failure that is not the credential, logging its code alone', async () => {
    const { provider, lines } = make({ RevokeTokenCommand: [named('InternalErrorException', 'token refresh-token'), named('NotAuthorizedException', 'Token is not valid for the client')] });
    const grant = JSON.stringify({ a: 'access-token', r: 'refresh-token' });
    await expect(provider.release(grant)).resolves.toBeUndefined();
    await expect(provider.release(grant)).resolves.toBeUndefined();
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.map((entry) => [entry.level, entry.msg, entry.error_code])).toEqual([
      ['warn', 'provider token revoke failed', 'InternalErrorException'],
      ['warn', 'provider token revoke failed', 'NotAuthorizedException'],
    ]);
    expect(lines.join('\n')).not.toContain('refresh-token');
  });

  it('SEC-20: a wrong password, a wrong code and a stale session are still told apart from the credential', async () => {
    const { provider } = make({
      InitiateAuthCommand: [named('NotAuthorizedException', 'Incorrect username or password.'), { ChallengeName: 'SOFTWARE_TOKEN_MFA', Session: 's1' }],
      RespondToAuthChallengeCommand: [named('CodeMismatchException'), named('NotAuthorizedException', 'Invalid session for the user, session is expired.')],
      ConfirmForgotPasswordCommand: named('NotAuthorizedException', 'User cannot be confirmed.'),
    });
    expect(await provider.signIn(EMAIL, 'wrong')).toEqual({ kind: 'rejected', stage: 'password' });
    const step = await provider.signIn(EMAIL, 'right');
    expect(await provider.answerTotp(challengeOf(step), '000000')).toEqual({ kind: 'rejected', stage: 'mfa' });
    expect(await provider.answerTotp(challengeOf(step), '123456')).toEqual({ kind: 'expired' });
    expect(await provider.confirmPasswordReset(EMAIL, '123456', 'Chosen-Reset-Pass-2026')).toEqual({ kind: 'rejected' });
  });

  it('SEC-20: the secret is in no challenge, grant, step or log line', async () => {
    const { provider, lines } = make({
      InitiateAuthCommand: { ChallengeName: 'NEW_PASSWORD_REQUIRED', Session: 's1', ChallengeParameters: { USER_ID_FOR_SRP: 'internal-name' } },
      RespondToAuthChallengeCommand: [{ ChallengeName: 'MFA_SETUP', Session: 's2' }, TOKENS],
      AssociateSoftwareTokenCommand: { SecretCode: 'JBSWY3DPEHPK3PXP', Session: 's3' },
      VerifySoftwareTokenCommand: { Status: 'SUCCESS', Session: 's4' },
      ForgotPasswordCommand: named('LimitExceededException'),
      RevokeTokenCommand: named('InternalErrorException'),
    });
    const first = await provider.signIn(EMAIL, 'Temporary-Pass-1');
    const second = await provider.setNewPassword(challengeOf(first), 'Chosen-Pass-2026');
    const setup = await provider.beginTotpSetup(challengeOf(second));
    const done = await provider.completeTotpSetup('challenge' in setup ? setup.challenge : '', '123456');
    await provider.release(done.kind === 'authenticated' ? done.grant : '{}');
    await provider.requestPasswordReset(EMAIL, 'request-4');
    const shown = JSON.stringify([first, second, setup, done, lines]);
    expect(shown).not.toContain(SECRET);
    expect(shown).not.toContain(hashOver('internal-name'));
  });
});

describe('every request in this file', () => {
  it('SEC-20: never refreshes: no REFRESH_TOKEN_AUTH and no GetTokensFromRefreshToken (the app never refreshes; a refresh would hash over the sub)', () => {
    expect(everySent.length).toBeGreaterThan(50);
    expect(everySent.filter((call) => call.command === 'GetTokensFromRefreshTokenCommand' || call.input.AuthFlow === 'REFRESH_TOKEN_AUTH')).toEqual([]);
  });
});
