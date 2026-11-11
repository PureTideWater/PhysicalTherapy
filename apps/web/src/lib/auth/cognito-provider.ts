import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminUserGlobalSignOutCommand,
  AssociateSoftwareTokenCommand,
  type AuthenticationResultType,
  CognitoIdentityProviderClient,
  CompleteWebAuthnRegistrationCommand,
  ConfirmForgotPasswordCommand,
  DeleteWebAuthnCredentialCommand,
  ForgotPasswordCommand,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
  StartWebAuthnRegistrationCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { type Logger, createLogger } from '@tp/observability';

import { passwordProblems } from './password';
import {
  type AuthProvider,
  type AuthStep,
  type AuthenticationResponseJSON,
  ClientCredentialError,
  type EnsuredUser,
  type FailureStage,
  type KeyChallenge,
  type MfaMethod,
  type NewPasswordStep,
  type PasswordResetResult,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  type TotpSetup,
} from './provider';
import { type ClientSecret, clientSecretValue, secretHash } from './secret-hash';
import { totpUri } from './totp';

/**
 * The Cognito user pool as the identity provider (infra/lib/constructs/identity.ts; docs/adr/0012 and
 * 0016). The web client signs in with the choice-based flow (USER_AUTH): a password then the TOTP
 * challenge (or TOTP enrollment, or a new password first), or a passkey (WEB_AUTHN, user verification
 * required). ID tokens are verified with aws-jwt-verify before the subject is trusted. Once the
 * application's own session exists the refresh token is revoked: the application's session, not
 * Cognito's tokens, carries the user from then on. Device tracking is off in the pool (a remembered
 * device would skip MFA), so devices are the application's (docs/adr/0016).
 *
 * The web client is confidential once its secret is set (docs/adr/0088, D1): every call that takes the client's
 * credential carries SECRET_HASH or SecretHash over the username that request sends (a challenge's over Cognito's
 * USERNAME, never the typed email), and RevokeToken the secret itself; no other call carries either. A refused
 * credential is a ClientCredentialError (D2), told apart from a wrong password, a wrong code or a stale step before
 * any of them. Without the secret (the public client, release N) nothing is sent.
 *
 * Written against the official SDK; tested with a mocked client (no AWS account is reachable from
 * where this was built).
 */

/** The SDK client, or anything with its send(). */
export type CognitoClient = Pick<CognitoIdentityProviderClient, 'send'>;

/** Verifies a Cognito ID token for the pool and client (aws-jwt-verify's CognitoJwtVerifier). */
export interface IdTokenVerifier {
  verify(idToken: string): Promise<{ readonly sub: string; readonly email?: unknown }>;
}

/**
 * A client that sends each request once (docs/adr/0093, D9): the SDK client built with `maxAttempts: 1`, or anything
 * with its send() and that setting. The provider reads the setting before it sends a confirm, so a client left on the
 * SDK's default (three attempts) sends none.
 */
export type OneAttemptClient = CognitoClient & { readonly config: { readonly maxAttempts: () => Promise<number> } };

/**
 * The two SDK clients the provider takes (docs/adr/0093, D9): `client` with the SDK's retries, for every call whose
 * repeat is a refusal the person can retry, and `confirmClient`, one attempt, for ConfirmForgotPassword alone.
 */
export function cognitoClients(region: string): { readonly client: CognitoIdentityProviderClient; readonly confirmClient: CognitoIdentityProviderClient } {
  return { client: new CognitoIdentityProviderClient({ region }), confirmClient: new CognitoIdentityProviderClient({ region, maxAttempts: 1 }) };
}

/** The confirm's client is not set to one attempt: nothing was sent (docs/adr/0093, D9). */
export class ConfirmClientRetriesError extends Error {
  override readonly name = 'ConfirmClientRetriesError';
  constructor() {
    super('the client that confirms a password reset must send each request once (maxAttempts: 1); nothing was sent');
  }
}

export interface CognitoProviderOptions {
  readonly client: CognitoClient;
  /**
   * The client ConfirmForgotPassword is sent on, and nothing else: one attempt (docs/adr/0093, D9). Required, so no
   * composition leaves the SDK's default: a confirm whose answer was lost would be sent again, meet its own used code
   * and read as a refused code while the password had changed.
   */
  readonly confirmClient: OneAttemptClient;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly verifier: IdTokenVerifier;
  /**
   * The confidential client's secret (docs/adr/0088, D1), held in its wrapper; absent for the public client of
   * release N, when no hash is sent.
   */
  readonly clientSecret?: ClientSecret;
  /** Where a swallowed reset refusal or revoke failure is logged, by its error code and the request alone; standard output by default. */
  readonly logger?: Logger;
}

interface Challenge {
  /** Cognito's session for the next response. */
  readonly s: string;
  /** The USERNAME the responses carry. */
  readonly u: string;
  readonly email: string;
  /** The user's name as Cognito gave it (USERNAME or USER_ID_FOR_SRP, the internal UUID here), when it gave one: never the email. */
  readonly n?: string;
}

interface Grant {
  readonly a: string;
  readonly r?: string;
}

/** Cognito issued tokens to a request that answered no second factor. */
export class MfaNotProvenError extends Error {
  override readonly name = 'MfaNotProvenError';
  constructor() {
    super('Cognito issued tokens without a second factor; the user pool must require MFA, and no session was opened');
  }
}

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string' ? error.name : '';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

/** Cognito's words for a missing or wrong secret hash or client secret (texts unverified: ADR 0088, Not verified here). */
/**
 * Any word about a secret or the client (review security-N5): Cognito's texts are unverified, and a miss would count the
 * platform's failure against people and lock real accounts, so the match is wide. None of the person-facing texts
 * (a wrong password, a disabled user, a stale session, a revoked token) names either.
 */
const CREDENTIAL_WORDS = /secret|\bclient\b/i;
/**
 * RevokeToken's narrower words: its refusal of a token issued to another client names the client too ("Token is not
 * valid for the client"), and a revoke is never counted against a person, so only the secret's own words are taken.
 */
const REVOKE_CREDENTIAL_WORDS = /secret[ _]?hash|client secret/i;

/**
 * Whether Cognito refused the client's own credential (docs/adr/0088, D2): NotAuthorizedException with words about a
 * secret or the client, or for RevokeToken, whose modelled errors have no NotAuthorizedException,
 * UnauthorizedException with the same words (review infra-auth-IA-9). The message classifies only; it is never
 * logged, since it names the client.
 */
export function isClientCredentialFailure(error: unknown, call: 'revoke' | 'other' = 'other'): boolean {
  const name = errorName(error);
  const named = name === 'NotAuthorizedException' || (call === 'revoke' && name === 'UnauthorizedException');
  return named && (call === 'revoke' ? REVOKE_CREDENTIAL_WORDS : CREDENTIAL_WORDS).test(errorMessage(error));
}

/** Throws a ClientCredentialError in place of Cognito's refusal of the credential; returns for anything else. */
function refuseCredential(error: unknown, call: 'revoke' | 'other' = 'other'): void {
  if (isClientCredentialFailure(error, call)) {
    throw new ClientCredentialError(errorName(error));
  }
}

/** Wrong credentials. */
const REJECTED = new Set(['NotAuthorizedException', 'UserNotFoundException', 'PasswordResetRequiredException', 'UserNotConfirmedException']);
/** A wrong second factor. */
const WRONG_CODE = new Set(['CodeMismatchException', 'ExpiredCodeException', 'EnableSoftwareTokenMFAException']);
/** A step whose session expired: Cognito answers NotAuthorizedException for a stale session. */
const STALE = new Set(['NotAuthorizedException', 'ExpiredCodeException']);

/**
 * ForgotPassword refusals that only a real account (invited or disabled in Cognito, no verified email) or a quota can
 * cause: showing any would tell that the address has an account, so they are answered as success (ADR 0081, A2).
 */
const RESET_NOT_DELIVERED = new Set([
  'UserNotFoundException',
  'NotAuthorizedException',
  'InvalidParameterException',
  'LimitExceededException',
  'CodeDeliveryFailureException',
  'TooManyRequestsException',
]);
/** ConfirmForgotPassword's code problems and an unknown user: one refusal, never split by cause. */
const RESET_REJECTED = new Set(['CodeMismatchException', 'ExpiredCodeException', 'LimitExceededException', 'TooManyFailedAttemptsException', 'UserNotFoundException', 'NotAuthorizedException']);

/**
 * A message trigger's failures. On a confirm they are modelled as client faults, but a trigger that runs after the
 * password is stored (post confirmation) fails with the same names, so they do not say nothing changed.
 */
const LAMBDA_TRIGGER = new Set(['UnexpectedLambdaException', 'UserLambdaValidationException', 'InvalidLambdaResponseException']);

/**
 * Whether a failed ConfirmForgotPassword is an answer that changed nothing (docs/adr/0093, D9): the provider answered
 * with a client fault (HTTP 4xx; or the SDK's `$fault` 'client' where no status came with it) not named for a Lambda
 * trigger. Anything else (no answer at all, a server fault, a trigger's failure, a status and a fault that disagree)
 * does not say whether the password changed.
 */
export function confirmChangedNothing(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || LAMBDA_TRIGGER.has(errorName(error))) {
    return false;
  }
  if (neverSent(error)) {
    return true;
  }
  const { $metadata: metadata, $fault: fault } = error as { readonly $metadata?: { readonly httpStatusCode?: unknown }; readonly $fault?: unknown };
  const status = metadata?.httpStatusCode;
  return typeof status === 'number' ? status >= 400 && status < 500 : fault === 'client';
}

/**
 * Connection failures that happen before any byte of the request is written: the connection was refused, or the name
 * did not resolve. A timeout, a reset connection (ECONNRESET) and a broken pipe (EPIPE) are not here: the request may
 * have arrived.
 */
const NEVER_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN']);

/**
 * Whether a failed request cannot have reached the provider (review SEC-S2 of 2026-11-11): the error, a cause of it,
 * or every error an aggregate holds (one per address tried) carries one of NEVER_SENT's codes. Such a confirm changed
 * nothing, so it is the platform's failure and ends nobody's sessions.
 */
function neverSent(error: unknown, depth = 0): boolean {
  if (typeof error !== 'object' || error === null || depth > 4) {
    return false;
  }
  const { code, cause, errors } = error as { readonly code?: unknown; readonly cause?: unknown; readonly errors?: unknown };
  if (typeof code === 'string') {
    return NEVER_SENT.has(code);
  }
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.every((inner) => neverSent(inner, depth + 1));
  }
  return neverSent(cause, depth + 1);
}

/** The challenges this application answers, and the step each is. */
const NEXT_STEPS: Readonly<Record<string, 'new_password_required' | 'mfa_setup_required' | 'mfa_required'>> = {
  NEW_PASSWORD_REQUIRED: 'new_password_required',
  MFA_SETUP: 'mfa_setup_required',
  SOFTWARE_TOKEN_MFA: 'mfa_required',
};

function parseChallenge(challenge: string): Challenge | undefined {
  try {
    const parsed = JSON.parse(challenge) as Partial<Challenge>;
    return typeof parsed.s === 'string' && typeof parsed.u === 'string' && typeof parsed.email === 'string' && (parsed.n === undefined || typeof parsed.n === 'string')
      ? (parsed as Challenge)
      : undefined;
  } catch {
    return undefined;
  }
}

function parseGrant(grant: string): Grant {
  const parsed = JSON.parse(grant) as Partial<Grant>;
  if (typeof parsed.a !== 'string') {
    throw new Error('the grant does not carry an access token');
  }
  return { a: parsed.a, r: typeof parsed.r === 'string' ? parsed.r : undefined };
}

export class CognitoAuthProvider implements AuthProvider {
  readonly name = 'cognito';

  private readonly logger: Logger;

  constructor(private readonly options: CognitoProviderOptions) {
    this.logger = options.logger ?? createLogger();
  }

  /** SECRET_HASH over the username a request sends, for its AuthParameters or ChallengeResponses; nothing for the public client. */
  private hash(username: string): { readonly SECRET_HASH?: string } {
    const secret = this.options.clientSecret;
    return secret === undefined ? {} : { SECRET_HASH: secretHash(secret, username, this.options.clientId) };
  }

  /** SecretHash over the username, for ForgotPassword and ConfirmForgotPassword; nothing for the public client. */
  private secretHash(username: string): { readonly SecretHash?: string } {
    const secret = this.options.clientSecret;
    return secret === undefined ? {} : { SecretHash: secretHash(secret, username, this.options.clientId) };
  }

  /** Revokes a refresh token with the client's secret; a refused credential is a ClientCredentialError, anything else as thrown. */
  private async revoke(token: string): Promise<void> {
    const secret = this.options.clientSecret;
    try {
      await this.options.client.send(new RevokeTokenCommand({ ClientId: this.options.clientId, Token: token, ...(secret === undefined ? {} : { ClientSecret: clientSecretValue(secret) }) }));
    } catch (error) {
      refuseCredential(error, 'revoke');
      throw error;
    }
  }

  private async identity(result: AuthenticationResultType, method: MfaMethod | null): Promise<AuthStep> {
    if (method === null) {
      // Tokens for a password alone (InitiateAuth with PASSWORD, or NEW_PASSWORD_REQUIRED answered):
      // the pool did not ask for a second factor, so no session may come of it (PRD 6: no PHI route
      // without MFA). The tokens are revoked and the sign-in fails loudly; the pool's MFA is misconfigured.
      // A failed revoke is swallowed, but never a refused credential, which is the platform's failure (ADR 0088, D2).
      if (result.RefreshToken !== undefined) {
        await this.revoke(result.RefreshToken).catch((error: unknown) => {
          if (error instanceof ClientCredentialError) {
            throw error;
          }
        });
      }
      throw new MfaNotProvenError();
    }
    if (result.IdToken === undefined || result.AccessToken === undefined) {
      throw new Error('Cognito returned no tokens');
    }
    const payload = await this.options.verifier.verify(result.IdToken);
    const email = typeof payload.email === 'string' ? payload.email : '';
    return { kind: 'authenticated', identity: { sub: payload.sub, email, method }, grant: JSON.stringify({ a: result.AccessToken, r: result.RefreshToken } satisfies Grant) };
  }

  /**
   * What Cognito asked next, as a step. `method` names the second factor the answered challenge was
   * (SOFTWARE_TOKEN_MFA or MFA_SETUP: totp; WEB_AUTHN: webauthn), or null when the request answered no
   * second factor at all, in which case tokens are refused.
   */
  private async next(
    response: { ChallengeName?: string; Session?: string; ChallengeParameters?: Record<string, string>; AuthenticationResult?: AuthenticationResultType },
    email: string,
    method: MfaMethod | null,
    named?: string,
  ): Promise<AuthStep> {
    if (response.AuthenticationResult !== undefined) {
      return this.identity(response.AuthenticationResult, method);
    }
    // The name Cognito gave, in this answer or the step before it (a new password's MFA_SETUP), never the typed email:
    // the enrolment rule matches the account by it (docs/adr/0088, D3; review security-S2).
    const n = response.ChallengeParameters?.USERNAME ?? response.ChallengeParameters?.USER_ID_FOR_SRP ?? named;
    const challenge = JSON.stringify({ s: response.Session ?? '', u: n ?? email, email, ...(n === undefined ? {} : { n }) } satisfies Challenge);
    const next = NEXT_STEPS[response.ChallengeName ?? ''];
    if (next === undefined) {
      throw new Error('Cognito asked for a challenge this application does not answer');
    }
    return next === 'mfa_setup_required' && n !== undefined ? { kind: next, challenge, subject: n } : { kind: next, challenge };
  }

  private async respond(challenge: string, name: string, responses: Record<string, string>, method: MfaMethod | null, stage: FailureStage): Promise<AuthStep> {
    const opened = parseChallenge(challenge);
    if (opened === undefined) {
      return { kind: 'expired' };
    }
    try {
      // The hash is over the USERNAME this request sends (Cognito's, never the typed email), set after the spread.
      const response = await this.options.client.send(
        new RespondToAuthChallengeCommand({
          ClientId: this.options.clientId,
          ChallengeName: name as never,
          Session: opened.s,
          ChallengeResponses: { USERNAME: opened.u, ...responses, ...this.hash(opened.u) },
        }),
      );
      return await this.next(response, opened.email, method, opened.n);
    } catch (error) {
      refuseCredential(error);
      if (WRONG_CODE.has(errorName(error)) && stage !== 'password') {
        return { kind: 'rejected', stage };
      }
      if (STALE.has(errorName(error))) {
        return { kind: 'expired' };
      }
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<AuthStep> {
    try {
      const response = await this.options.client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_AUTH',
          ClientId: this.options.clientId,
          AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: password, ...this.hash(email) },
        }),
      );
      return await this.next(response, email, null);
    } catch (error) {
      refuseCredential(error);
      if (REJECTED.has(errorName(error))) {
        return { kind: 'rejected', stage: 'password' };
      }
      throw error;
    }
  }

  async setNewPassword(challenge: string, newPassword: string): Promise<NewPasswordStep> {
    const problems = passwordProblems(newPassword);
    if (problems.length > 0) {
      return { kind: 'invalid_password', problems };
    }
    try {
      return await this.respond(challenge, 'NEW_PASSWORD_REQUIRED', { NEW_PASSWORD: newPassword }, null, 'password');
    } catch (error) {
      if (errorName(error) === 'InvalidPasswordException') {
        // The user pool refused a password that meets our policy: no rule to name, so the step says so in its own words.
        return { kind: 'invalid_password', problems: [] };
      }
      throw error;
    }
  }

  async beginTotpSetup(challenge: string): Promise<TotpSetup | { readonly kind: 'expired' }> {
    const opened = parseChallenge(challenge);
    if (opened === undefined) {
      return { kind: 'expired' };
    }
    try {
      const response = await this.options.client.send(new AssociateSoftwareTokenCommand({ Session: opened.s }));
      const secret = response.SecretCode ?? '';
      return { secret, uri: totpUri(secret, opened.email), challenge: JSON.stringify({ ...opened, s: response.Session ?? opened.s } satisfies Challenge) };
    } catch (error) {
      if (STALE.has(errorName(error))) {
        return { kind: 'expired' };
      }
      throw error;
    }
  }

  async completeTotpSetup(challenge: string, code: string): Promise<AuthStep> {
    const opened = parseChallenge(challenge);
    if (opened === undefined) {
      return { kind: 'expired' };
    }
    let session: string;
    try {
      const verified = await this.options.client.send(new VerifySoftwareTokenCommand({ Session: opened.s, UserCode: code, FriendlyDeviceName: 'Authenticator app' }));
      if (verified.Status !== 'SUCCESS') {
        return { kind: 'rejected', stage: 'mfa' };
      }
      session = verified.Session ?? opened.s;
    } catch (error) {
      if (WRONG_CODE.has(errorName(error))) {
        return { kind: 'rejected', stage: 'mfa' };
      }
      if (STALE.has(errorName(error))) {
        return { kind: 'expired' };
      }
      throw error;
    }
    return this.respond(JSON.stringify({ ...opened, s: session } satisfies Challenge), 'MFA_SETUP', {}, 'totp', 'mfa');
  }

  answerTotp(challenge: string, code: string): Promise<AuthStep> {
    return this.respond(challenge, 'SOFTWARE_TOKEN_MFA', { SOFTWARE_TOKEN_MFA_CODE: code }, 'totp', 'mfa');
  }

  async beginKeySignIn(email: string): Promise<KeyChallenge<PublicKeyCredentialRequestOptionsJSON>> {
    let response;
    try {
      response = await this.options.client.send(
        new InitiateAuthCommand({ AuthFlow: 'USER_AUTH', ClientId: this.options.clientId, AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'WEB_AUTHN', ...this.hash(email) } }),
      );
    } catch (error) {
      refuseCredential(error);
      throw error;
    }
    const options = response.ChallengeParameters?.CREDENTIAL_REQUEST_OPTIONS;
    if (response.ChallengeName !== 'WEB_AUTHN' || options === undefined) {
      throw new Error('Cognito did not offer a hardware-key challenge');
    }
    // The name Cognito gave, as next() takes it: RespondToAuthChallenge sends it as USERNAME and hashes over it, never
    // over the typed email (docs/adr/0088, D1; review infra-auth-IA-1).
    const n = response.ChallengeParameters?.USERNAME ?? response.ChallengeParameters?.USER_ID_FOR_SRP;
    const challenge = JSON.stringify({ s: response.Session ?? '', u: n ?? email, email, ...(n === undefined ? {} : { n }) } satisfies Challenge);
    return { options: JSON.parse(options) as PublicKeyCredentialRequestOptionsJSON, challenge };
  }

  async completeKeySignIn(challenge: string, response: AuthenticationResponseJSON): Promise<AuthStep> {
    try {
      return await this.respond(challenge, 'WEB_AUTHN', { CREDENTIAL: JSON.stringify(response) }, 'webauthn', 'hardware_key');
    } catch (error) {
      if (errorName(error).startsWith('WebAuthn')) {
        return { kind: 'rejected', stage: 'hardware_key' };
      }
      throw error;
    }
  }

  async hasHardwareKey(grant: string): Promise<boolean> {
    const response = await this.options.client.send(new ListWebAuthnCredentialsCommand({ AccessToken: parseGrant(grant).a }));
    return (response.Credentials ?? []).length > 0;
  }

  async beginKeyRegistration(grant: string): Promise<KeyChallenge<PublicKeyCredentialCreationOptionsJSON>> {
    const response = await this.options.client.send(new StartWebAuthnRegistrationCommand({ AccessToken: parseGrant(grant).a }));
    if (response.CredentialCreationOptions === undefined) {
      throw new Error('Cognito returned no registration options');
    }
    // Cognito keeps the registration challenge itself; the access token ties completion to the user.
    return { options: response.CredentialCreationOptions as unknown as PublicKeyCredentialCreationOptionsJSON, challenge: 'cognito' };
  }

  async completeKeyRegistration(grant: string, _challenge: string, response: RegistrationResponseJSON): Promise<boolean> {
    try {
      await this.options.client.send(new CompleteWebAuthnRegistrationCommand({ AccessToken: parseGrant(grant).a, Credential: response as never }));
      return true;
    } catch (error) {
      if (errorName(error).startsWith('WebAuthn')) {
        return false;
      }
      throw error;
    }
  }

  async removeHardwareKey(grant: string, credentialId: string): Promise<boolean> {
    try {
      await this.options.client.send(new DeleteWebAuthnCredentialCommand({ AccessToken: parseGrant(grant).a, CredentialId: credentialId }));
      return true;
    } catch (error) {
      refuseCredential(error);
      // Best effort (docs/adr/0093, D6): the flow reports a key it could not remove; the error's name alone is logged.
      this.logger.warn('provider hardware key removal failed', { error_code: errorName(error) || 'unknown' });
      return false;
    }
  }

  async release(grant: string): Promise<void> {
    const { r } = parseGrant(grant);
    if (r === undefined) {
      return;
    }
    try {
      await this.revoke(r);
    } catch (error) {
      if (error instanceof ClientCredentialError) {
        throw error;
      }
      // The token lapses on its own; a revoke across a client replacement (ADR 0088, cutover) must not fail a sign-in.
      this.logger.warn('provider token revoke failed', { error_code: errorName(error) || 'unknown' });
    }
  }

  async ensureUser(email: string): Promise<EnsuredUser> {
    const subOf = (attributes: readonly { Name?: string; Value?: string }[] | undefined): string => {
      const sub = attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
      if (sub === undefined) {
        throw new Error('Cognito returned a user without a subject');
      }
      return sub;
    };
    try {
      const created = await this.options.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.options.userPoolId,
          Username: email,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
          DesiredDeliveryMediums: ['EMAIL'],
        }),
      );
      return { sub: subOf(created.User?.Attributes), created: true, neverSignedIn: true };
    } catch (error) {
      if (errorName(error) !== 'UsernameExistsException') {
        throw error;
      }
      const existing = await this.options.client.send(new AdminGetUserCommand({ UserPoolId: this.options.userPoolId, Username: email }));
      // Only a user still on its temporary password has never signed in; any other status (or none) has, or may have.
      return { sub: subOf(existing.UserAttributes), created: false, neverSignedIn: existing.UserStatus === 'FORCE_CHANGE_PASSWORD' };
    }
  }

  async resendInvitation(email: string): Promise<boolean> {
    // Cognito sends the invitation again (with a new temporary password and a new validity period) only for a
    // user still in FORCE_CHANGE_PASSWORD; it refuses one who has signed in, which is answered as not sent.
    try {
      await this.options.client.send(new AdminCreateUserCommand({ UserPoolId: this.options.userPoolId, Username: email, MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'] }));
      return true;
    } catch (error) {
      if (errorName(error) !== 'UnsupportedUserStateException') {
        throw error;
      }
      return false;
    }
  }

  async requestPasswordReset(email: string, requestId?: string): Promise<void> {
    // SecretHash over the typed address once the client is confidential; UserContextData does nothing on the Essentials
    // plan. The masked CodeDeliveryDetails.Destination is never read, shown or logged. A refused credential is no
    // refusal only an account could cause: it is thrown (ADR 0088, D2).
    try {
      await this.options.client.send(new ForgotPasswordCommand({ ClientId: this.options.clientId, Username: email, ...this.secretHash(email) }));
    } catch (error) {
      refuseCredential(error);
      const code = errorName(error);
      if (!RESET_NOT_DELIVERED.has(code)) {
        // Our failure (the provider, the network): it can happen for any address, so it tells nothing.
        throw error;
      }
      this.logger.warn('password reset request not delivered', { error_code: code, request_id: requestId ?? null });
    }
  }

  async confirmPasswordReset(email: string, code: string, password: string): Promise<PasswordResetResult> {
    const problems = passwordProblems(password);
    if (problems.length > 0) {
      return { kind: 'invalid_password', problems };
    }
    // One attempt, read from the client itself before anything is sent (docs/adr/0093, D9).
    if ((await this.options.confirmClient.config.maxAttempts()) !== 1) {
      throw new ConfirmClientRetriesError();
    }
    try {
      // It returns no tokens and opens no session: the next sign-in asks for the second factor.
      await this.options.confirmClient.send(
        new ConfirmForgotPasswordCommand({ ClientId: this.options.clientId, Username: email, ConfirmationCode: code, Password: password, ...this.secretHash(email) }),
      );
      return { kind: 'reset' };
    } catch (error) {
      refuseCredential(error);
      const name = errorName(error);
      if (RESET_REJECTED.has(name)) {
        return { kind: 'rejected' };
      }
      if (name === 'InvalidPasswordException') {
        // Unreachable while the pool's policy matches passwordProblems: no rule to name, as setNewPassword says it.
        return { kind: 'invalid_password', problems: [] };
      }
      if (confirmChangedNothing(error)) {
        // The provider answered and changed nothing (a throttle, a refused parameter, a missing pool), or was never
        // reached: the platform's failure. Thrown by its name alone (review SEC-N7 of 2026-11-11): the provider's
        // message for a refused parameter can quote the value sent, and this request carries the code and the password.
        const named = new Error(name || 'the identity provider refused the request');
        named.name = name || 'Error';
        throw named;
      }
      // No answer, a server fault or a trigger's failure: the password may have changed (docs/adr/0093, D9). The
      // request was sent once, so this is never a repeat meeting its own used code. The name alone is carried.
      return { kind: 'outcome_unknown', code: name || 'unknown' };
    }
  }

  /**
   * The start-up credential probe's one request (docs/adr/0088, D8): a choice-based sign-in for `username` with the
   * hash and no password, resolving on any answer and rejecting with Cognito's error as it came (credential-probe.ts
   * classifies it).
   */
  async probe(username: string): Promise<void> {
    await this.options.client.send(new InitiateAuthCommand({ AuthFlow: 'USER_AUTH', ClientId: this.options.clientId, AuthParameters: { USERNAME: username, ...this.hash(username) } }));
  }

  async globalSignOut(sub: string): Promise<void> {
    await this.options.client.send(new AdminUserGlobalSignOutCommand({ UserPoolId: this.options.userPoolId, Username: sub }));
  }
}
