import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

/**
 * The identity provider behind sign-in (PRD 3 and 16, Authentication; docs/product/sessions.md;
 * docs/adr/0016). Production uses Cognito (CognitoAuthProvider); development and tests use
 * DevAuthProvider, which enforces the same rules locally. The provider proves who someone is: their
 * password, their second factor (a TOTP code, or a hardware key whose WebAuthn assertion carries user
 * verification) and the challenges between them. Everything after that (lockout, devices, sessions,
 * the hardware-key rule for internal roles, audit) is the application's, the same for both.
 *
 * Challenges and grants are opaque strings the application carries sealed between steps; a provider
 * never trusts one it cannot open.
 */

export type { AuthenticationResponseJSON, PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON, RegistrationResponseJSON };

export type MfaMethod = 'totp' | 'webauthn';
export type FailureStage = 'password' | 'mfa' | 'hardware_key';

export interface ProviderIdentity {
  /** The provider's subject (user.cognito_sub). */
  readonly sub: string;
  readonly email: string;
  /** The second factor the sign-in used. */
  readonly method: MfaMethod;
}

export type AuthStep =
  /** First sign-in with a temporary password: the user chooses a new one. */
  | { readonly kind: 'new_password_required'; readonly challenge: string }
  /** No second factor yet: the user enrolls TOTP before anything else. */
  | { readonly kind: 'mfa_setup_required'; readonly challenge: string }
  | { readonly kind: 'mfa_required'; readonly challenge: string }
  /**
   * Proven. `grant` lets the application make follow-up calls for the user (hardware-key
   * registration) until it calls release().
   */
  | { readonly kind: 'authenticated'; readonly identity: ProviderIdentity; readonly grant: string }
  /** Wrong credentials at this stage. */
  | { readonly kind: 'rejected'; readonly stage: FailureStage }
  /** The challenge expired or does not open: start again. */
  | { readonly kind: 'expired' };

export type NewPasswordStep = AuthStep | { readonly kind: 'invalid_password'; readonly problems: readonly string[] };

export interface TotpSetup {
  /** The base32 secret the user's authenticator app is given. */
  readonly secret: string;
  readonly uri: string;
  /** The challenge for completeTotpSetup (the provider may have replaced it). */
  readonly challenge: string;
}

export interface KeyChallenge<O> {
  readonly options: O;
  readonly challenge: string;
}

export interface AuthProvider {
  readonly name: 'cognito' | 'dev';
  signIn(email: string, password: string): Promise<AuthStep>;
  setNewPassword(challenge: string, newPassword: string): Promise<NewPasswordStep>;
  beginTotpSetup(challenge: string): Promise<TotpSetup | { readonly kind: 'expired' }>;
  completeTotpSetup(challenge: string, code: string): Promise<AuthStep>;
  answerTotp(challenge: string, code: string): Promise<AuthStep>;
  /** WebAuthn sign-in: the request options for the browser, and the challenge to answer with. */
  beginKeySignIn(email: string): Promise<KeyChallenge<PublicKeyCredentialRequestOptionsJSON>>;
  completeKeySignIn(challenge: string, response: AuthenticationResponseJSON): Promise<AuthStep>;
  hasHardwareKey(grant: string): Promise<boolean>;
  beginKeyRegistration(grant: string): Promise<KeyChallenge<PublicKeyCredentialCreationOptionsJSON>>;
  /** Whether the hardware key was verified and registered. */
  completeKeyRegistration(grant: string, challenge: string, response: RegistrationResponseJSON): Promise<boolean>;
  /** Ends the provider's tokens behind a grant once the application's own session exists. */
  release(grant: string): Promise<void>;
  /**
   * The provider's account for an invited user, created when missing, with a temporary password the
   * provider delivers itself (Cognito's invitation email; the local outbox in development).
   */
  ensureUser(email: string): Promise<{ readonly sub: string; readonly created: boolean }>;
  /** Signs the user out of the provider everywhere (their membership ended, their sessions were revoked). */
  globalSignOut(sub: string): Promise<void>;
}
