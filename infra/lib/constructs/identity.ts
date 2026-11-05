import { Aws, type CfnCondition, Duration, Fn, RemovalPolicy, Stack, type aws_cloudwatch_actions as cloudwatchActions, aws_cognito as cognito, aws_iam as iam, type aws_kms as kms } from 'aws-cdk-lib';
import { AUTH_MAIL_SENDER_NAME, fallbackCodeMessage, fallbackInvitationMessage } from '@tp/auth-mail';
import { Construct } from 'constructs';

import { CognitoMessages } from './cognito-messages';

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
 * An invitation's temporary password lasts as long as the invitation does (INVITATION_DAYS in packages/db, the
 * invitation table's expiry; docs/adr/0053): an administrator re-sends it after that.
 */
export const INVITATION_DAYS = 7;

export interface IdentityProps {
  readonly deletionProtection: boolean;
  /** The passkey relying-party ID: the application's host name. */
  readonly relyingPartyId: string;
  /** The sender of Cognito's email, and the domain whose verified SES identity sends it. */
  readonly mailFrom: { readonly address: string; readonly domain: string };
  /** The transactional stream's configuration set, which Cognito's email goes through (docs/adr/0065). */
  readonly configurationSet: string;
  /** True in phase 2 (MailIdentitiesVerified): the stack's identity is verified, so Cognito may send through it. */
  readonly identitiesVerified: CfnCondition;
  /** What the CustomMessage trigger needs: its log group's name and key, the sign-in page's host and the operator's alarms. */
  readonly messages: { readonly environmentName: string; readonly key: kms.IKey; readonly appDomainName: string; readonly notify: cloudwatchActions.SnsAction };
}

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
 * - Passkeys are bound to the application's own host: the relying-party ID is AppDomainName, the
 *   same value the web app gives WebAuthn (WEBAUTHN_RP_ID), so a browser on the application's origin
 *   can use them (docs/adr/0049).
 * - Cognito's own email (invitations, verification and recovery codes) goes through SES from
 *   MailFromAddress, the worker's sender too, under the SES identity of its domain in this region
 *   (the DEVELOPER sending account) and the transactional stream's configuration set, so its bounces and
 *   complaints are recorded and an undelivered invitation is flagged (docs/adr/0065). Only in phase 2
 *   (MailIdentitiesVerified=true): the stack creates that identity, and Cognito refuses an unverified one,
 *   so in phase 1 the pool keeps Cognito's own capped sender, before any customer exists (D2).
 *
 * - Every email the pool sends is the brand's (docs/adr/0081, the code-email amendment): a CustomMessage trigger
 *   (CognitoMessages) sets each source's own words from @tp/auth-mail, and the pool's own verification and invitation
 *   templates are the same frame's generic fallback, which Cognito sends when the trigger leaves a message unchanged.
 *   The verification template is shared by every code source, so it never carries the reset's words. The sender
 *   reads "PaidWhole <MailFromAddress>", as the worker's mail does.
 *
 * Lockout after ten failures, the 30-minute idle limit and the device list are application rules
 * (sessions.md); Cognito's own lockout sits beneath them.
 */
export class Identity extends Construct {
  readonly userPool: cognito.UserPool;
  readonly webClient: cognito.UserPoolClient;
  readonly messages: CognitoMessages;

  constructor(scope: Construct, id: string, props: IdentityProps) {
    super(scope, id);
    const stack = Stack.of(this);
    this.messages = new CognitoMessages(this, 'Messages', props.messages);
    const code = fallbackCodeMessage();
    const invitation = fallbackInvitationMessage(`https://${props.messages.appDomainName}/sign-in`);
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
      passkeyRelyingPartyId: props.relyingPartyId,
      passwordPolicy: {
        minLength: PASSWORD_MIN_LENGTH,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: true,
        tempPasswordValidity: Duration.days(INVITATION_DAYS),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userVerification: { emailStyle: cognito.VerificationEmailStyle.CODE, emailSubject: code.subject, emailBody: code.html },
      userInvitation: { emailSubject: invitation.subject, emailBody: invitation.html },
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      deletionProtection: props.deletionProtection,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Written to the resource directly: the L2 SES option checks the address's domain at synth time,
    // and both are deploy-time parameters here. Phase 1 leaves the property out (Cognito's own sender).
    (this.userPool.node.defaultChild as cognito.CfnUserPool).emailConfiguration = Fn.conditionIf(
      props.identitiesVerified.logicalId,
      {
        EmailSendingAccount: 'DEVELOPER',
        From: Fn.join('', [`${AUTH_MAIL_SENDER_NAME} <`, props.mailFrom.address, '>']),
        SourceArn: `arn:${stack.partition}:ses:${stack.region}:${stack.account}:identity/${props.mailFrom.domain}`,
        ConfigurationSet: props.configurationSet,
      },
      Aws.NO_VALUE,
    );
    // The trigger, by hand rather than lambdaTriggers, so the permission names the account as well as the pool.
    const pool = this.userPool.node.defaultChild as cognito.CfnUserPool;
    pool.lambdaConfig = { customMessage: this.messages.handler.functionArn };
    this.messages.handler.addPermission('InvokedByTheUserPool', {
      principal: new iam.ServicePrincipal('cognito-idp.amazonaws.com'),
      action: 'lambda:InvokeFunction',
      sourceArn: this.userPool.userPoolArn,
      sourceAccount: stack.account,
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
