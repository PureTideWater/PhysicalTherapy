import { describe, expect, it } from 'vitest';

import { awsCredentialsAvailable, planCdkDiff } from '../lib/cdk-diff-plan';

describe('planCdkDiff', () => {
  it('diffs the staging stack when credentials work', () => {
    expect(planCdkDiff(true)).toEqual({ args: ['diff', 'tp-staging', '--no-notices'] });
  });

  it('synthesizes every stack and says why when they do not', () => {
    const plan = planCdkDiff(false);
    expect(plan.args).toEqual(['synth', '--quiet', '--no-notices']);
    expect(plan.note).toMatch(/^cdk:diff: no usable AWS credentials.*diff against staging \(tp-staging\) needs credentials/);
  });

  it('raises a GitHub warning annotation when the diff could not run in CI', () => {
    const plan = planCdkDiff(false, true);
    expect(plan.args).toEqual(['synth', '--quiet', '--no-notices']);
    expect(plan.note).toMatch(/^::warning title=cdk:diff did not diff::no usable AWS credentials/);
    expect(planCdkDiff(true, true).note).toBeUndefined();
  });
});

describe('awsCredentialsAvailable', () => {
  it('is false when STS cannot be reached in time', async () => {
    const env = {
      AWS_ACCESS_KEY_ID: 'synthetic-access-key-id',
      AWS_SECRET_ACCESS_KEY: 'synthetic-value',
      AWS_REGION: 'us-east-1',
      AWS_ENDPOINT_URL_STS: 'http://127.0.0.1:9',
    };
    const saved = { ...process.env };
    Object.assign(process.env, env);
    try {
      expect(await awsCredentialsAvailable(env, 2_000)).toBe(false);
    } finally {
      for (const key of Object.keys(env)) {
        if (saved[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = saved[key];
        }
      }
    }
  });
});
