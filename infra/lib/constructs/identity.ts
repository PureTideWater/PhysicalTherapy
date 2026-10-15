import { Duration, RemovalPolicy, aws_cognito as cognito } from 'aws-cdk-lib';
import { Construct } from 'constructs';

/**
 * Token lifetimes for the web client, from docs/product/sessions.md. The refresh token lasts the
 * 12-hour absolute session, so no session outlives it; access and ID tokens last half the 30-minute
 * idle limit, so a token is never usable long past an idle expiry or a revocation. The sign-in
 * session (the time to answer an MFA challenge) is Cognito's minimum.
 */
export const TOKEN_LIFETIMES = {
  accessToken: Duration.minutes(15),
  idToken: Duration.minutes(15),
  refreshToken: Duration.hours(12),
  authSession: Duration.minutes(3),
} as const;

export const PASSWORD_MIN_LENGTH = 12;

/**
 * The Cognito user pool (PRD 3 and 16, authentication; docs/product/sessions.md).
 *
 * - MFA is required for every user. Second factors are TOTP only (no SMS). Passkeys (WebAuthn) are
 *   allowed as a sign-in factor with user verification required, which Cognito counts as
 *   multi-factor; the application requires a passkey (hardware key) for internal roles.
 * - No self sign-up in v0: administrators create users. Users sign in by email; recovery is by
 *   email only.
 * - Password policy: at least 12 characters with all four character classes; temporary passwords
 *   expire after three days.
 * - The Essentials feature plan, which has passkeys and the choice-based sign-in. Threat protection
 *   (advanced security) needs the Plus plan; the plan does not ask for it, so it is the owner's call
 *   with its cost (docs/adr/0012), not built in.
 * - Deletion protection follows the environment (production on); the pool is retained if the
 *   stack is deleted.
 *
 * Lockout after ten failures, the 30-minute idle limit and the device list are application rules
 * (sessions.md); Cognito's own lockout sits beneath them.
 */
export class Identity extends Construct {
  readonly userPool: cognito.UserPool;
  readonly webClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: { readonly deletionProtection: boolean }) {
    super(scope, id);
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      selfSignUpEnabled: false,
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      standardAttributes: { email: { required: true, mutable: true } },
      mfa: cognito.Mfa.REQUIRED,
      mfaSecondFactor: { otp: true, sms: false, email: false },
      signInPolicy: { allowedFirstAuthFactors: { password: true, passkey: true } },
      passkeyUserVerification: cognito.PasskeyUserVerification.REQUIRED,
      passwordPolicy: {
        minLength: PASSWORD_MIN_LENGTH,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(3),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      deletionProtection: props.deletionProtection,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // The web app's server signs users in with SRP or the choice-based flow (passkeys); there is no
    // hosted UI and no OAuth flow, and no client secret to store.
    this.webClient = this.userPool.addClient('WebClient', {
      authFlows: { user: true, userSrp: true },
      disableOAuth: true,
      generateSecret: false,
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      accessTokenValidity: TOKEN_LIFETIMES.accessToken,
      idTokenValidity: TOKEN_LIFETIMES.idToken,
      refreshTokenValidity: TOKEN_LIFETIMES.refreshToken,
      authSessionValidity: TOKEN_LIFETIMES.authSession,
    });
  }
}
