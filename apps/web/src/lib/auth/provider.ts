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

/**
 * The provider refused this application's own client credential (docs/adr/0088, D2): a wrong or missing secret hash
 * or client secret. It is the platform's failure, never the person's: the sign-in flow counts no failure, locks
 * nothing and logs it as a security event. `code` is the provider's error name, for the log; the message is fixed
 * text and never the provider's words, which name the client.
 */
export class ClientCredentialError extends Error {
  override readonly name = 'ClientCredentialError';
  constructor(readonly code: string) {
    super('the identity provider refused this application’s client credential');
  }
}

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
  /**
   * No second factor yet: the user enrolls TOTP before anything else, if the application allows it (docs/adr/0088, D3).
   * `subject`: the provider's own name for the user who is enrolling (user.cognito_sub), when the provider named one;
   * never the typed email, so the application can match the account it allows to the user the factor is stored on.
   */
  | { readonly kind: 'mfa_setup_required'; readonly challenge: string; readonly subject?: string }
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

/**
 * A forgotten password's confirmation (docs/adr/0081, the forgotten password). Every code problem (wrong, expired,
 * used, replaced, too many tries) and an unknown address are one 'rejected', so the answer never tells them apart.
 */
export type PasswordResetResult =
  | { readonly kind: 'reset' }
  | { readonly kind: 'rejected' }
  | { readonly kind: 'invalid_password'; readonly problems: readonly string[] }
  /**
   * The provider did not say whether it reset the password (docs/adr/0093, D9): no answer, a server fault, a trigger's
   * failure. The confirm is sent once, never repeated, so this is never a repeat meeting its own used code. `code` is
   * the provider error's name, for the log; never its message.
   */
  | { readonly kind: 'outcome_unknown'; readonly code: string };

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

/** The provider's account for an invited address, and whether it was made now or has ever signed in (ensureUser). */
export interface EnsuredUser {
  readonly sub: string;
  readonly created: boolean;
  readonly neverSignedIn: boolean;
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
  /**
   * Removes a hardware key the grant's user registered, by its credential ID (docs/adr/0093, D6: a key whose
   * registration returned after a password reset was recorded). Best effort: answers whether the provider removed it,
   * and never throws but for a ClientCredentialError.
   */
  removeHardwareKey(grant: string, credentialId: string): Promise<boolean>;
  /**
   * Ends the provider's tokens behind a grant once the application's own session exists. A failure is logged by its
   * code and swallowed (the tokens lapse on their own), except a ClientCredentialError, which is thrown.
   */
  release(grant: string): Promise<void>;
  /**
   * The provider's account for an invited user, created when missing, with a temporary password the
   * provider delivers itself (Cognito's invitation email; the local outbox in development). `neverSignedIn`
   * says the account still waits on its temporary password (Cognito's FORCE_CHANGE_PASSWORD, which this platform
   * never sets on a user who has signed in): only such an account may be linked to an invitation (docs/adr/0088 D4).
   */
  ensureUser(email: string): Promise<EnsuredUser>;
  /**
   * Sends an invited user's invitation again with a new temporary password (J2: "an expired invitation is
   * re-sent by the administrator"): Cognito's resend; the local outbox in development. A user who has chosen
   * a password already is not invited and is left as they are. Answers whether it was sent: false for a user who has
   * signed in (or none), so a caller linking an invitation onto the account can refuse it (docs/adr/0088 D4; review
   * security-N3).
   */
  resendInvitation(email: string): Promise<boolean>;
  /**
   * Sends a reset code if the address names a user who can reset. Resolves the same for every address: a refusal
   * only a real account could cause is swallowed (logged by its error code and `requestId` alone), and only the
   * provider's own failures throw. The sign-in flow asks only for an active account with a second factor (SEC-B1).
   */
  requestPasswordReset(email: string, requestId?: string): Promise<void>;
  /**
   * Sets a new password with the mailed code, the password policy checked first. Every code problem is one 'rejected'.
   * Sent to the provider once (docs/adr/0093, D9): a repeat whose first answer was lost would meet its own used code
   * and read as a refused code. An answer that does not say whether the password changed is 'outcome_unknown'.
   */
  confirmPasswordReset(email: string, code: string, password: string): Promise<PasswordResetResult>;
  /** Signs the user out of the provider everywhere (their membership ended, their sessions were revoked). */
  globalSignOut(sub: string): Promise<void>;
}
