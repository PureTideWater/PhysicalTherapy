import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { PASSWORD_RESET_CODE_SECONDS, PROVIDER_CHALLENGE_SECONDS, PROVIDER_GRANT_SECONDS, type StepName, pendingSeconds, stepSeconds, warningSeconds } from './step-limits';

/** Each sign-in step's limit, from one constant that infra's user pool pins (docs/adr/0081). */

describe('sign-in step limits', () => {
  it('SGN-01: a step’s limit is the shorter of the provider’s and the pending cookie’s, a whole number of minutes', () => {
    const challengeSteps: StepName[] = ['new_password', 'mfa_setup', 'mfa', 'key'];
    for (const step of challengeSteps) {
      expect(stepSeconds(step)).toBe(Math.min(PROVIDER_CHALLENGE_SECONDS, pendingSeconds(step)));
      expect(stepSeconds(step)).toBe(180);
      expect(pendingSeconds(step)).toBe(300);
    }
    expect(stepSeconds('register_key')).toBe(Math.min(PROVIDER_GRANT_SECONDS, pendingSeconds('register_key')));
    expect(stepSeconds('register_key')).toBe(900);
    expect(pendingSeconds('register_key')).toBe(900);
    for (const step of [...challengeSteps, 'register_key', 'reset'] as const) {
      expect(stepSeconds(step) % 60).toBe(0);
    }
  });

  it('SGN-01: the provider’s lengths mirror the user pool’s sign-in session and access token in infra', () => {
    const identity = readFileSync(path.resolve(import.meta.dirname, '../../../../../infra/lib/constructs/identity.ts'), 'utf8');
    expect(identity).toContain(`authSession: Duration.minutes(${String(PROVIDER_CHALLENGE_SECONDS / 60)}),`);
    expect(identity).toContain(`accessToken: Duration.minutes(${String(PROVIDER_GRANT_SECONDS / 60)}),`);
  });

  it('SGN-06: the reset step states its cookie’s fifteen minutes, shorter than the mailed code’s hour, and warns two minutes before', () => {
    expect(PASSWORD_RESET_CODE_SECONDS).toBe(3600);
    expect(pendingSeconds('reset')).toBe(900);
    expect(stepSeconds('reset')).toBe(Math.min(PASSWORD_RESET_CODE_SECONDS, pendingSeconds('reset')));
    expect(stepSeconds('reset')).toBe(900);
    expect(warningSeconds(stepSeconds('reset'))).toBe(120);
  });

  it('SGN-02: the warning comes a minute before a short step closes, two before a step of ten minutes or more', () => {
    expect(warningSeconds(180)).toBe(60);
    expect(warningSeconds(300)).toBe(60);
    expect(warningSeconds(599)).toBe(60);
    expect(warningSeconds(600)).toBe(120);
    expect(warningSeconds(900)).toBe(120);
  });
});
