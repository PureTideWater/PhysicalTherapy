import { describe, expect, it } from 'vitest';

import { type CognitoClient, CognitoAuthProvider, type IdTokenVerifier, MfaNotProvenError } from './cognito-provider';
import type { AuthStep } from './provider';

/**
 * The Cognito provider against a mocked SDK client (no AWS account is reachable from where this is
 * built). Each test scripts what Cognito answers per command and checks what was sent.
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

function cognito(script: Record<string, Answer | Answer[]>) {
  const sent: Sent[] = [];
  const queues = new Map(Object.entries(script).map(([name, answers]) => [name, Array.isArray(answers) ? [...answers] : [answers]]));
  const client = {
    send: (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      const name = command.constructor.name;
      sent.push({ command: name, input: command.input });
      const queue = queues.get(name);
      const answer = queue !== undefined && queue.length > 1 ? queue.shift() : queue?.[0];
      if (answer === undefined) {
        return Promise.reject(new Error(`unscripted ${name}`));
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

function make(script: Record<string, Answer | Answer[]>) {
  const { client, sent } = cognito(script);
  return { provider: new CognitoAuthProvider({ client, userPoolId: 'us-east-1_Synthetic', clientId: 'syntheticclient', verifier }), sent };
}

function challengeOf(step: AuthStep): string {
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
    const step = await provider.signIn('person@synthetic.test', 'Synthetic-Pass-2026');
    expect(step.kind).toBe('mfa_required');
    expect(sent[0]?.input).toEqual({
      AuthFlow: 'USER_AUTH',
      ClientId: 'syntheticclient',
      AuthParameters: { USERNAME: 'person@synthetic.test', PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: 'Synthetic-Pass-2026' },
    });
    const done = await provider.answerTotp(challengeOf(step), '123456');
    expect(done).toEqual({ kind: 'authenticated', identity: { sub: 'sub-1', email: 'person@synthetic.test', method: 'totp' }, grant: JSON.stringify({ a: 'access-token', r: 'refresh-token' }) });
    expect(sent[1]?.input).toEqual({
      ClientId: 'syntheticclient',
      ChallengeName: 'SOFTWARE_TOKEN_MFA',
      Session: 's1',
      ChallengeResponses: { USERNAME: 'internal-name', SOFTWARE_TOKEN_MFA_CODE: '123456' },
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
    expect(passwordOnly.sent[1]?.input).toEqual({ ClientId: 'syntheticclient', Token: 'refresh-token' });
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
    expect(sent[1]?.input).toMatchObject({ ChallengeName: 'NEW_PASSWORD_REQUIRED', ChallengeResponses: { NEW_PASSWORD: 'Chosen-Pass-2026', USERNAME: 'person@synthetic.test' } });
    expect(await provider.setNewPassword(challengeOf(step), 'Chosen-Pass-2027')).toEqual({ kind: 'invalid_password', problems: ['a password the user pool accepts'] });
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
    expect(sent.at(-1)?.input).toMatchObject({ ChallengeName: 'MFA_SETUP', Session: 's3' });
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
    expect(sent[0]?.input).toMatchObject({ AuthParameters: { USERNAME: 'person@synthetic.test', PREFERRED_CHALLENGE: 'WEB_AUTHN' } });
    const response = { id: 'cred', rawId: 'cred', type: 'public-key', response: { clientDataJSON: 'x', authenticatorData: 'y', signature: 'z' }, clientExtensionResults: {} } as const;
    expect(await provider.completeKeySignIn(challenge, response)).toMatchObject({ kind: 'authenticated', identity: { method: 'webauthn' } });
    expect(sent[1]?.input).toMatchObject({ ChallengeName: 'WEB_AUTHN', ChallengeResponses: { CREDENTIAL: JSON.stringify(response) } });
    expect(await provider.completeKeySignIn(challenge, response)).toEqual({ kind: 'rejected', stage: 'hardware_key' });
    expect(await provider.completeKeySignIn(challenge, response)).toEqual({ kind: 'expired' });
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
    expect(sent.at(-1)).toEqual({ command: 'RevokeTokenCommand', input: { ClientId: 'syntheticclient', Token: 'refresh-token' } });
    await provider.release(JSON.stringify({ a: 'only-access' }));
    expect(sent.filter((call) => call.command === 'RevokeTokenCommand')).toHaveLength(1);
    await expect(provider.hasHardwareKey('{}')).rejects.toThrow('access token');
  });
});

describe('CognitoAuthProvider: administration', () => {
  it('creates an invited user (Cognito emails the temporary password), or finds the existing one', async () => {
    const { provider, sent } = make({
      AdminCreateUserCommand: [{ User: { Attributes: [{ Name: 'sub', Value: 'sub-new' }] } }, named('UsernameExistsException'), named('InternalErrorException'), { User: {} }],
      AdminGetUserCommand: { UserAttributes: [{ Name: 'email', Value: 'x' }, { Name: 'sub', Value: 'sub-old' }] },
    });
    expect(await provider.ensureUser('new@synthetic.test')).toEqual({ sub: 'sub-new', created: true });
    expect(sent[0]?.input).toEqual({
      UserPoolId: 'us-east-1_Synthetic',
      Username: 'new@synthetic.test',
      UserAttributes: [
        { Name: 'email', Value: 'new@synthetic.test' },
        { Name: 'email_verified', Value: 'true' },
      ],
      DesiredDeliveryMediums: ['EMAIL'],
    });
    expect(await provider.ensureUser('old@synthetic.test')).toEqual({ sub: 'sub-old', created: false });
    await expect(provider.ensureUser('x@synthetic.test')).rejects.toThrow('InternalErrorException');
    await expect(provider.ensureUser('y@synthetic.test')).rejects.toThrow('without a subject');
  });

  it('signs a user out everywhere by subject', async () => {
    const { provider, sent } = make({ AdminUserGlobalSignOutCommand: {} });
    await provider.globalSignOut('sub-1');
    expect(sent).toEqual([{ command: 'AdminUserGlobalSignOutCommand', input: { UserPoolId: 'us-east-1_Synthetic', Username: 'sub-1' } }]);
  });
});
