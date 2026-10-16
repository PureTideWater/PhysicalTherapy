import { randomBytes, randomUUID } from 'node:crypto';

import {
  type AuthenticationResponseJSON,
  type PublicKeyCredentialCreationOptionsJSON,
  type PublicKeyCredentialRequestOptionsJSON,
  type RegistrationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

import type { DevCredentialStore, DevUserRecord } from './dev-store';
import { DEFAULT_SCRYPT_COST, type ScryptCost, hashPassword, passwordProblems, verifyPassword } from './password';
import type { AuthProvider, AuthStep, KeyChallenge, NewPasswordStep, TotpSetup } from './provider';
import type { Sealer } from './seal';
import { newTotpSecret, totpUri, verifyTotp } from './totp';

/**
 * The local identity provider for development and tests (docs/adr/0016). It enforces what the
 * Cognito user pool enforces: passwords against the policy (scrypt hashes), a new password on first
 * sign-in with a temporary one, TOTP enrollment before anything else and a TOTP code on every sign-in
 * (each code once), and real WebAuthn verification with user verification required, so a browser's
 * virtual authenticator can exercise the hardware-key path. Challenges last three minutes (the user
 * pool's sign-in session) and grants fifteen (its access tokens).
 */

export interface WebAuthnSettings {
  /** The relying party ID: the application's host name. */
  readonly rpId: string;
  readonly rpName: string;
  /** The exact origin the browser signs, scheme and port included. */
  readonly origin: string;
}

export interface DevAuthOptions {
  readonly store: DevCredentialStore;
  readonly sealer: Sealer;
  readonly webauthn: WebAuthnSettings;
  /** Delivers an invitation's temporary password (the local outbox; Cognito emails it). */
  readonly deliverInvitation: (email: string, temporaryPassword: string) => Promise<void>;
  readonly now?: () => Date;
  readonly scryptCost?: ScryptCost;
}

const CHALLENGE_MS = 3 * 60_000;
const GRANT_MS = 15 * 60_000;

type Step = 'new_password' | 'mfa_setup' | 'mfa' | 'key' | 'register';

interface Challenge {
  readonly sub: string | null;
  readonly step: Step;
  /** A TOTP secret being enrolled. */
  readonly secret?: string;
  /** The WebAuthn challenge the browser must sign. */
  readonly webauthn?: string;
}

interface Grant {
  readonly sub: string;
}

/** Something to compare a password with when the email names nobody, at the same cost, so timing does not tell. */
function nobody(cost: ScryptCost): string {
  return `scrypt:v1:${String(cost.n)}:${String(cost.r)}:${String(cost.p)}:${'A'.repeat(22)}:${'A'.repeat(43)}`;
}

function toBytes(base64url: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Buffer.from(base64url, 'base64url'));
}

export function temporaryPassword(): string {
  return `T${randomBytes(12).toString('base64url')}a7!`;
}

export class DevAuthProvider implements AuthProvider {
  readonly name = 'dev';
  private readonly now: () => Date;
  private readonly cost: ScryptCost;

  constructor(private readonly options: DevAuthOptions) {
    this.now = options.now ?? (() => new Date());
    this.cost = options.scryptCost ?? DEFAULT_SCRYPT_COST;
  }

  private challenge(payload: Challenge): string {
    return this.options.sealer.seal('dev-challenge', payload, new Date(this.now().getTime() + CHALLENGE_MS));
  }

  private open(challenge: string, step: Step): Challenge | undefined {
    const payload = this.options.sealer.open('dev-challenge', challenge, this.now()) as Challenge | undefined;
    return payload?.step === step ? payload : undefined;
  }

  private async user(challenge: Challenge | undefined): Promise<DevUserRecord | undefined> {
    return challenge?.sub === undefined || challenge.sub === null ? undefined : this.options.store.bySub(challenge.sub);
  }

  private grantFor(record: DevUserRecord): string {
    return this.options.sealer.seal('dev-grant', { sub: record.sub } satisfies Grant, new Date(this.now().getTime() + GRANT_MS));
  }

  private async granted(grant: string): Promise<DevUserRecord | undefined> {
    const payload = this.options.sealer.open('dev-grant', grant, this.now()) as Grant | undefined;
    return payload === undefined ? undefined : this.options.store.bySub(payload.sub);
  }

  private authenticated(record: DevUserRecord, method: 'totp' | 'webauthn'): AuthStep {
    return { kind: 'authenticated', identity: { sub: record.sub, email: record.email, method }, grant: this.grantFor(record) };
  }

  /** After the password: enroll TOTP first, then a code every time. */
  private secondFactor(record: DevUserRecord): AuthStep {
    return record.totpSecret === null
      ? { kind: 'mfa_setup_required', challenge: this.challenge({ sub: record.sub, step: 'mfa_setup' }) }
      : { kind: 'mfa_required', challenge: this.challenge({ sub: record.sub, step: 'mfa' }) };
  }

  async signIn(email: string, password: string): Promise<AuthStep> {
    const record = await this.options.store.byEmail(email);
    const matches = await verifyPassword(password, record?.passwordHash ?? nobody(this.cost));
    if (record === undefined || !matches) {
      return { kind: 'rejected', stage: 'password' };
    }
    if (record.temporary) {
      return { kind: 'new_password_required', challenge: this.challenge({ sub: record.sub, step: 'new_password' }) };
    }
    return this.secondFactor(record);
  }

  async setNewPassword(challenge: string, newPassword: string): Promise<NewPasswordStep> {
    const record = await this.user(this.open(challenge, 'new_password'));
    if (record === undefined) {
      return { kind: 'expired' };
    }
    const problems = passwordProblems(newPassword);
    if (problems.length > 0) {
      return { kind: 'invalid_password', problems };
    }
    const passwordHash = await hashPassword(newPassword, this.cost);
    const updated = await this.options.store.update(record.sub, (current) => ({ ...current, passwordHash, temporary: false }));
    return updated === undefined ? { kind: 'expired' } : this.secondFactor(updated);
  }

  async beginTotpSetup(challenge: string): Promise<TotpSetup | { readonly kind: 'expired' }> {
    const record = await this.user(this.open(challenge, 'mfa_setup'));
    if (record === undefined) {
      return { kind: 'expired' };
    }
    const secret = newTotpSecret();
    return { secret, uri: totpUri(secret, record.email), challenge: this.challenge({ sub: record.sub, step: 'mfa_setup', secret }) };
  }

  async completeTotpSetup(challenge: string, code: string): Promise<AuthStep> {
    const opened = this.open(challenge, 'mfa_setup');
    const record = await this.user(opened);
    if (record === undefined || opened?.secret === undefined) {
      return { kind: 'expired' };
    }
    const secret = opened.secret;
    const step = verifyTotp(secret, code, this.now());
    if (step === null) {
      return { kind: 'rejected', stage: 'mfa' };
    }
    const updated = await this.options.store.update(record.sub, (current) => ({ ...current, totpSecret: secret, totpLastStep: step }));
    return updated === undefined ? { kind: 'expired' } : this.authenticated(updated, 'totp');
  }

  async answerTotp(challenge: string, code: string): Promise<AuthStep> {
    const record = await this.user(this.open(challenge, 'mfa'));
    if (record === undefined || record.totpSecret === null) {
      return { kind: 'expired' };
    }
    const step = verifyTotp(record.totpSecret, code, this.now(), record.totpLastStep);
    if (step === null) {
      return { kind: 'rejected', stage: 'mfa' };
    }
    const updated = await this.options.store.update(record.sub, (current) => ({ ...current, totpLastStep: step }));
    return updated === undefined ? { kind: 'expired' } : this.authenticated(updated, 'totp');
  }

  async beginKeySignIn(email: string): Promise<KeyChallenge<PublicKeyCredentialRequestOptionsJSON>> {
    const record = await this.options.store.byEmail(email);
    const options = await generateAuthenticationOptions({
      rpID: this.options.webauthn.rpId,
      allowCredentials: (record?.credentials ?? []).map((credential) => ({ id: credential.id, transports: credential.transports ? [...credential.transports] : undefined })),
      userVerification: 'required',
    });
    return { options, challenge: this.challenge({ sub: record?.sub ?? null, step: 'key', webauthn: options.challenge }) };
  }

  async completeKeySignIn(challenge: string, response: AuthenticationResponseJSON): Promise<AuthStep> {
    const opened = this.open(challenge, 'key');
    if (opened === undefined) {
      return { kind: 'expired' };
    }
    const record = await this.user(opened);
    const credential = record?.credentials.find((candidate) => candidate.id === response.id);
    if (record === undefined || credential === undefined) {
      return { kind: 'rejected', stage: 'hardware_key' };
    }
    let verified: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: opened.webauthn ?? '',
        expectedOrigin: this.options.webauthn.origin,
        expectedRPID: this.options.webauthn.rpId,
        credential: { id: credential.id, publicKey: toBytes(credential.publicKey), counter: credential.counter },
        requireUserVerification: true,
      });
    } catch {
      return { kind: 'rejected', stage: 'hardware_key' };
    }
    if (!verified.verified) {
      return { kind: 'rejected', stage: 'hardware_key' };
    }
    const updated = await this.options.store.update(record.sub, (current) => ({
      ...current,
      credentials: current.credentials.map((existing) => (existing.id === credential.id ? { ...existing, counter: verified.authenticationInfo.newCounter } : existing)),
    }));
    return updated === undefined ? { kind: 'expired' } : this.authenticated(updated, 'webauthn');
  }

  async hasHardwareKey(grant: string): Promise<boolean> {
    return ((await this.granted(grant))?.credentials.length ?? 0) > 0;
  }

  async beginKeyRegistration(grant: string): Promise<KeyChallenge<PublicKeyCredentialCreationOptionsJSON>> {
    const record = await this.granted(grant);
    if (record === undefined) {
      throw new Error('the sign-in that allowed key registration has expired');
    }
    const options = await generateRegistrationOptions({
      rpName: this.options.webauthn.rpName,
      rpID: this.options.webauthn.rpId,
      userName: record.email,
      userID: new Uint8Array(Buffer.from(record.sub)),
      attestationType: 'none',
      excludeCredentials: record.credentials.map((credential) => ({ id: credential.id })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
    });
    return { options, challenge: this.challenge({ sub: record.sub, step: 'register', webauthn: options.challenge }) };
  }

  async completeKeyRegistration(grant: string, challenge: string, response: RegistrationResponseJSON): Promise<boolean> {
    const record = await this.granted(grant);
    const opened = this.open(challenge, 'register');
    if (record === undefined || opened?.sub !== record.sub) {
      return false;
    }
    let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: opened.webauthn ?? '',
        expectedOrigin: this.options.webauthn.origin,
        expectedRPID: this.options.webauthn.rpId,
        requireUserVerification: true,
      });
    } catch {
      return false;
    }
    if (!verified.verified) {
      return false;
    }
    const { credential } = verified.registrationInfo;
    await this.options.store.update(record.sub, (current) => ({
      ...current,
      credentials: [
        ...current.credentials,
        { id: credential.id, publicKey: Buffer.from(credential.publicKey).toString('base64url'), counter: credential.counter, transports: credential.transports },
      ],
    }));
    return true;
  }

  release(): Promise<void> {
    return Promise.resolve();
  }

  async ensureUser(email: string): Promise<{ readonly sub: string; readonly created: boolean }> {
    const existing = await this.options.store.byEmail(email);
    if (existing !== undefined) {
      return { sub: existing.sub, created: false };
    }
    const sub = randomUUID();
    const password = temporaryPassword();
    await this.options.store.put({
      sub,
      email,
      passwordHash: await hashPassword(password, this.cost),
      temporary: true,
      totpSecret: null,
      totpLastStep: -1,
      credentials: [],
    });
    await this.options.deliverInvitation(email, password);
    return { sub, created: true };
  }

  async resendInvitation(email: string): Promise<void> {
    const existing = await this.options.store.byEmail(email);
    if (existing?.temporary !== true) {
      return;
    }
    const password = temporaryPassword();
    const passwordHash = await hashPassword(password, this.cost);
    await this.options.store.update(existing.sub, (current) => ({ ...current, passwordHash }));
    await this.options.deliverInvitation(email, password);
  }

  globalSignOut(): Promise<void> {
    return Promise.resolve();
  }
}
