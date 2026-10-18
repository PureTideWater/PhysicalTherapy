import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminUserGlobalSignOutCommand,
  AssociateSoftwareTokenCommand,
  type AuthenticationResultType,
  CompleteWebAuthnRegistrationCommand,
  type CognitoIdentityProviderClient,
  InitiateAuthCommand,
  ListWebAuthnCredentialsCommand,
  RespondToAuthChallengeCommand,
  RevokeTokenCommand,
  StartWebAuthnRegistrationCommand,
  VerifySoftwareTokenCommand,
} from '@aws-sdk/client-cognito-identity-provider';

import { passwordProblems } from './password';
import type {
  AuthProvider,
  AuthStep,
  AuthenticationResponseJSON,
  FailureStage,
  KeyChallenge,
  MfaMethod,
  NewPasswordStep,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
  TotpSetup,
} from './provider';
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
 * Written against the official SDK; tested with a mocked client (no AWS account is reachable from
 * where this was built).
 */

/** The SDK client, or anything with its send(). */
export type CognitoClient = Pick<CognitoIdentityProviderClient, 'send'>;

/** Verifies a Cognito ID token for the pool and client (aws-jwt-verify's CognitoJwtVerifier). */
export interface IdTokenVerifier {
  verify(idToken: string): Promise<{ readonly sub: string; readonly email?: unknown }>;
}

export interface CognitoProviderOptions {
  readonly client: CognitoClient;
  readonly userPoolId: string;
  readonly clientId: string;
  readonly verifier: IdTokenVerifier;
}

interface Challenge {
  /** Cognito's session for the next response. */
  readonly s: string;
  /** The USERNAME the responses carry. */
  readonly u: string;
  readonly email: string;
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

/** Wrong credentials. */
const REJECTED = new Set(['NotAuthorizedException', 'UserNotFoundException', 'PasswordResetRequiredException', 'UserNotConfirmedException']);
/** A wrong second factor. */
const WRONG_CODE = new Set(['CodeMismatchException', 'ExpiredCodeException', 'EnableSoftwareTokenMFAException']);
/** A step whose session expired: Cognito answers NotAuthorizedException for a stale session. */
const STALE = new Set(['NotAuthorizedException', 'ExpiredCodeException']);

/** The challenges this application answers, and the step each is. */
const NEXT_STEPS: Readonly<Record<string, 'new_password_required' | 'mfa_setup_required' | 'mfa_required'>> = {
  NEW_PASSWORD_REQUIRED: 'new_password_required',
  MFA_SETUP: 'mfa_setup_required',
  SOFTWARE_TOKEN_MFA: 'mfa_required',
};

function parseChallenge(challenge: string): Challenge | undefined {
  try {
    const parsed = JSON.parse(challenge) as Partial<Challenge>;
    return typeof parsed.s === 'string' && typeof parsed.u === 'string' && typeof parsed.email === 'string' ? (parsed as Challenge) : undefined;
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

  constructor(private readonly options: CognitoProviderOptions) {}

  private async identity(result: AuthenticationResultType, method: MfaMethod | null): Promise<AuthStep> {
    if (method === null) {
      // Tokens for a password alone (InitiateAuth with PASSWORD, or NEW_PASSWORD_REQUIRED answered):
      // the pool did not ask for a second factor, so no session may come of it (PRD 6: no PHI route
      // without MFA). The tokens are revoked and the sign-in fails loudly; the pool's MFA is misconfigured.
      if (result.RefreshToken !== undefined) {
        await this.options.client.send(new RevokeTokenCommand({ ClientId: this.options.clientId, Token: result.RefreshToken })).catch(() => undefined);
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
  ): Promise<AuthStep> {
    if (response.AuthenticationResult !== undefined) {
      return this.identity(response.AuthenticationResult, method);
    }
    const challenge = JSON.stringify({
      s: response.Session ?? '',
      u: response.ChallengeParameters?.USERNAME ?? response.ChallengeParameters?.USER_ID_FOR_SRP ?? email,
      email,
    } satisfies Challenge);
    const next = NEXT_STEPS[response.ChallengeName ?? ''];
    if (next === undefined) {
      throw new Error('Cognito asked for a challenge this application does not answer');
    }
    return { kind: next, challenge };
  }

  private async respond(challenge: string, name: string, responses: Record<string, string>, method: MfaMethod | null, stage: FailureStage): Promise<AuthStep> {
    const opened = parseChallenge(challenge);
    if (opened === undefined) {
      return { kind: 'expired' };
    }
    try {
      const response = await this.options.client.send(
        new RespondToAuthChallengeCommand({ ClientId: this.options.clientId, ChallengeName: name as never, Session: opened.s, ChallengeResponses: { USERNAME: opened.u, ...responses } }),
      );
      return await this.next(response, opened.email, method);
    } catch (error) {
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
        new InitiateAuthCommand({ AuthFlow: 'USER_AUTH', ClientId: this.options.clientId, AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'PASSWORD', PASSWORD: password } }),
      );
      return await this.next(response, email, null);
    } catch (error) {
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
        return { kind: 'invalid_password', problems: ['a password the user pool accepts'] };
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
    const response = await this.options.client.send(
      new InitiateAuthCommand({ AuthFlow: 'USER_AUTH', ClientId: this.options.clientId, AuthParameters: { USERNAME: email, PREFERRED_CHALLENGE: 'WEB_AUTHN' } }),
    );
    const options = response.ChallengeParameters?.CREDENTIAL_REQUEST_OPTIONS;
    if (response.ChallengeName !== 'WEB_AUTHN' || options === undefined) {
      throw new Error('Cognito did not offer a hardware-key challenge');
    }
    const challenge = JSON.stringify({ s: response.Session ?? '', u: response.ChallengeParameters?.USERNAME ?? email, email } satisfies Challenge);
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

  async release(grant: string): Promise<void> {
    const { r } = parseGrant(grant);
    if (r !== undefined) {
      await this.options.client.send(new RevokeTokenCommand({ ClientId: this.options.clientId, Token: r }));
    }
  }

  async ensureUser(email: string): Promise<{ readonly sub: string; readonly created: boolean }> {
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
      return { sub: subOf(created.User?.Attributes), created: true };
    } catch (error) {
      if (errorName(error) !== 'UsernameExistsException') {
        throw error;
      }
      const existing = await this.options.client.send(new AdminGetUserCommand({ UserPoolId: this.options.userPoolId, Username: email }));
      return { sub: subOf(existing.UserAttributes), created: false };
    }
  }

  async resendInvitation(email: string): Promise<void> {
    // Cognito sends the invitation again (with a new temporary password and a new validity period) only for a
    // user still in FORCE_CHANGE_PASSWORD; it refuses one who has signed in.
    try {
      await this.options.client.send(new AdminCreateUserCommand({ UserPoolId: this.options.userPoolId, Username: email, MessageAction: 'RESEND', DesiredDeliveryMediums: ['EMAIL'] }));
    } catch (error) {
      if (errorName(error) !== 'UnsupportedUserStateException') {
        throw error;
      }
    }
  }

  async globalSignOut(sub: string): Promise<void> {
    await this.options.client.send(new AdminUserGlobalSignOutCommand({ UserPoolId: this.options.userPoolId, Username: sub }));
  }
}
