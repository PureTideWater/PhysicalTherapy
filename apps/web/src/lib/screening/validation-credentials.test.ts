import type { AssumeRoleCommand, AssumeRoleCommandOutput } from '@aws-sdk/client-sts';
import { describe, expect, it } from 'vitest';

import { type AssumeRoleSender, VALIDATION_SESSION_NAME, VALIDATION_SESSION_RENEW_MS, VALIDATION_SESSION_SECONDS, ValidationCredentialsMissing, assumedRoleCredentials } from './validation-credentials';

/**
 * The address-validation role's session (docs/adr/0065, "Address validation in its own account"; review S3): assumed
 * with the role the stack names, for 15 minutes under a fixed session name, held until it has 5 minutes left, renewed
 * once for callers that ask together, and asked again after a refusal. A synthetic account and role.
 */

const ROLE = 'arn:aws:iam::444455556666:role/tp-staging-address-validation';
const START = Date.UTC(2026, 9, 27, 12, 0, 0);

/** An STS stand-in: each call answers a session expiring 15 minutes after `now()`, or refuses, or waits for `release`. */
function stsStandIn(now: () => number, answers: ('session' | 'refuse' | 'empty')[] = []) {
  const inputs: AssumeRoleCommand['input'][] = [];
  let release: () => void = () => undefined;
  let held = false;
  const sender: AssumeRoleSender = {
    send: async (command) => {
      inputs.push(command.input);
      if (held) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      const answer = answers.shift() ?? 'session';
      if (answer === 'refuse') {
        throw Object.assign(new Error('not authorized to perform sts:AssumeRole'), { name: 'AccessDenied' });
      }
      const n = inputs.length;
      return {
        $metadata: {},
        ...(answer === 'empty'
          ? {}
          : { Credentials: { AccessKeyId: `ASIASYNTHETIC${String(n)}`, SecretAccessKey: `secret-${String(n)}`, SessionToken: `token-${String(n)}`, Expiration: new Date(now() + VALIDATION_SESSION_SECONDS * 1000) } }),
      } satisfies AssumeRoleCommandOutput;
    },
  };
  return {
    sender,
    inputs,
    hold: () => {
      held = true;
    },
    release: () => {
      held = false;
      release();
    },
  };
}

describe('the address-validation role\'s session', () => {
  it('assumes the role the stack names, for STS\'s least, under a session name that names no one', async () => {
    const clock = START;
    const sts = stsStandIn(() => clock);
    const credentials = assumedRoleCredentials(ROLE, { sts: sts.sender, now: () => clock });
    const first = await credentials();
    expect(sts.inputs).toEqual([{ RoleArn: ROLE, RoleSessionName: VALIDATION_SESSION_NAME, DurationSeconds: 900 }]);
    expect(VALIDATION_SESSION_SECONDS).toBe(900);
    expect(first).toEqual({ accessKeyId: 'ASIASYNTHETIC1', secretAccessKey: 'secret-1', sessionToken: 'token-1', expiration: new Date(START + 900_000) });
    expect(VALIDATION_SESSION_NAME).toMatch(/^[\w+=,.@-]{2,64}$/);
  });

  it('holds a session until it has 5 minutes left, then renews it', async () => {
    let clock = START;
    const sts = stsStandIn(() => clock);
    const credentials = assumedRoleCredentials(ROLE, { sts: sts.sender, now: () => clock });
    const first = await credentials();
    clock = START + 900_000 - VALIDATION_SESSION_RENEW_MS - 1;
    expect(await credentials()).toBe(first);
    expect(sts.inputs).toHaveLength(1);
    clock = START + 900_000 - VALIDATION_SESSION_RENEW_MS;
    const second = await credentials();
    expect(sts.inputs).toHaveLength(2);
    expect(second.accessKeyId).toBe('ASIASYNTHETIC2');
    expect(VALIDATION_SESSION_RENEW_MS).toBe(300_000);
  });

  it('renews once for callers that ask together', async () => {
    const clock = START;
    const sts = stsStandIn(() => clock);
    const credentials = assumedRoleCredentials(ROLE, { sts: sts.sender, now: () => clock });
    sts.hold();
    const asked = [credentials(), credentials(), credentials()];
    sts.release();
    const answers = await Promise.all(asked);
    expect(sts.inputs).toHaveLength(1);
    expect(new Set(answers).size).toBe(1);
  });

  it('passes a refusal on by its name, and asks again the next time', async () => {
    const clock = START;
    const sts = stsStandIn(() => clock, ['refuse', 'session']);
    const credentials = assumedRoleCredentials(ROLE, { sts: sts.sender, now: () => clock });
    await expect(credentials()).rejects.toMatchObject({ name: 'AccessDenied' });
    expect((await credentials()).accessKeyId).toBe('ASIASYNTHETIC2');
    expect(sts.inputs).toHaveLength(2);
  });

  it('refuses an answer without a whole session', async () => {
    const clock = START;
    const sts = stsStandIn(() => clock, ['empty']);
    const credentials = assumedRoleCredentials(ROLE, { sts: sts.sender, now: () => clock });
    await expect(credentials()).rejects.toBeInstanceOf(ValidationCredentialsMissing);
    expect(new ValidationCredentialsMissing().name).toBe('ValidationCredentialsMissing');
  });
});
