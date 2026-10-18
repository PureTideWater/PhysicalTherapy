import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PASSWORD_MIN_LENGTH, TOKEN_LIFETIMES } from '../lib/constructs/identity';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { onlyResource, propertiesOf, synthesized } from './synth';

/** The session limits docs/product/sessions.md states, read from the document itself. */
function sessionLimits(): { absoluteMinutes: number; idleMinutes: number } {
  const text = readFileSync(path.resolve(import.meta.dirname, '../../docs/product/sessions.md'), 'utf8');
  const absolute = /\| Absolute expiry \| (\d+) hours from sign-in \|/.exec(text)?.[1];
  const idle = /\| Idle expiry on PHI screens \| (\d+) minutes without activity \|/.exec(text)?.[1];
  if (absolute === undefined || idle === undefined) {
    throw new Error('docs/product/sessions.md no longer states the absolute and idle limits in its table');
  }
  return { absoluteMinutes: Number.parseInt(absolute, 10) * 60, idleMinutes: Number.parseInt(idle, 10) };
}

/**
 * PRD 3 and 16, authentication; docs/product/sessions.md. Evidence that MFA is required, no one
 * signs themselves up, and tokens are short-lived.
 */
describe.each(ENVIRONMENTS)('%s: identity', (environment) => {
  const { template } = synthesized(environment);
  const [, pool] = onlyResource(template, 'AWS::Cognito::UserPool');
  const poolProperties = propertiesOf(pool);
  const [, client] = onlyResource(template, 'AWS::Cognito::UserPoolClient');
  const clientProperties = propertiesOf(client);

  it('requires MFA for every user, with TOTP as the second factor and no SMS', () => {
    expect(poolProperties.MfaConfiguration).toBe('ON');
    expect(poolProperties.EnabledMfas).toEqual(['SOFTWARE_TOKEN_MFA']);
  });

  it('allows passkeys (WebAuthn) with user verification required, beside passwords', () => {
    expect(poolProperties.Policies).toMatchObject({ SignInPolicy: { AllowedFirstAuthFactors: ['PASSWORD', 'WEB_AUTHN'] } });
    expect(poolProperties.WebAuthnUserVerification).toBe('required');
  });

  it('binds passkeys to the application host, the relying-party ID the web app gives WebAuthn', () => {
    expect(poolProperties.WebAuthnRelyingPartyID).toEqual({ Ref: PARAMETER_NAMES.appDomainName });
    const config = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/lib/server/config.ts'), 'utf8');
    expect(config).toContain('rpId: settings.WEBAUTHN_RP_ID ?? new URL(settings.APP_ORIGIN).hostname');
  });

  it('sends Cognito\'s email through SES from MailFromAddress, under the SES identity of its domain in this region', () => {
    expect(poolProperties.EmailConfiguration).toEqual({
      EmailSendingAccount: 'DEVELOPER',
      From: { Ref: PARAMETER_NAMES.mailFromAddress },
      SourceArn: {
        'Fn::Join': [
          '',
          [
            'arn:',
            { Ref: 'AWS::Partition' },
            ':ses:',
            { Ref: 'AWS::Region' },
            ':',
            { Ref: 'AWS::AccountId' },
            ':identity/',
            { 'Fn::Select': [1, { 'Fn::Split': ['@', { Ref: PARAMETER_NAMES.mailFromAddress }] }] },
          ],
        ],
      },
    });
  });

  it('has no self sign-up in v0', () => {
    expect(poolProperties.AdminCreateUserConfig).toMatchObject({ AllowAdminCreateUserOnly: true });
  });

  it('enforces the password policy', () => {
    expect(poolProperties.Policies).toMatchObject({
      PasswordPolicy: {
        MinimumLength: PASSWORD_MIN_LENGTH,
        RequireLowercase: true,
        RequireUppercase: true,
        RequireNumbers: true,
        RequireSymbols: true,
        TemporaryPasswordValidityDays: 7,
      },
    });
    expect(PASSWORD_MIN_LENGTH).toBeGreaterThanOrEqual(12);
  });

  it('runs on the Essentials plan (passkeys, choice-based sign-in) without the Plus plan’s threat protection, which the plan does not ask for', () => {
    expect(poolProperties.UserPoolTier).toBe('ESSENTIALS');
    expect(poolProperties.UserPoolAddOns).toBeUndefined();
  });

  it('signs in by email, recovers by email only, and is deletion-protected in production', () => {
    expect(poolProperties.UsernameAttributes).toEqual(['email']);
    expect(poolProperties.AccountRecoverySetting).toEqual({ RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }] });
    expect(poolProperties.DeletionProtection).toBe(environment === 'production' ? 'ACTIVE' : 'INACTIVE');
    expect(pool.DeletionPolicy).toBe('Retain');
  });

  it('issues tokens no longer-lived than the session rules allow', () => {
    const { absoluteMinutes, idleMinutes } = sessionLimits();
    expect(clientProperties.TokenValidityUnits).toEqual({ AccessToken: 'minutes', IdToken: 'minutes', RefreshToken: 'minutes' });
    expect(clientProperties.RefreshTokenValidity).toBe(absoluteMinutes);
    expect(clientProperties.AccessTokenValidity).toBe(TOKEN_LIFETIMES.accessToken.toMinutes());
    expect(clientProperties.IdTokenValidity).toBe(TOKEN_LIFETIMES.idToken.toMinutes());
    expect(clientProperties.AccessTokenValidity as number).toBeLessThan(idleMinutes);
    expect(clientProperties.IdTokenValidity as number).toBeLessThan(idleMinutes);
    expect(clientProperties.AuthSessionValidity).toBe(3);
  });

  it('gives the web client SRP and choice-based sign-in only, no secret, no OAuth, revocable tokens', () => {
    expect([...(clientProperties.ExplicitAuthFlows as string[])].sort()).toEqual([
      'ALLOW_REFRESH_TOKEN_AUTH',
      'ALLOW_USER_AUTH',
      'ALLOW_USER_SRP_AUTH',
    ]);
    expect(clientProperties.GenerateSecret).toBe(false);
    expect(clientProperties.AllowedOAuthFlowsUserPoolClient).toBe(false);
    expect(clientProperties.AllowedOAuthFlows).toBeUndefined();
    expect(clientProperties.EnableTokenRevocation).toBe(true);
    expect(clientProperties.PreventUserExistenceErrors).toBe('ENABLED');
  });
});
