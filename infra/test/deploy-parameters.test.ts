import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { NO_IMAGE, PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { templateFor } from './synth';

interface CfnParameter {
  readonly Type: string;
  readonly Default?: string;
  readonly AllowedPattern?: string;
  readonly MaxLength?: number;
}

function parameters(environment: (typeof ENVIRONMENTS)[number]): Record<string, CfnParameter> {
  return (templateFor(environment).toJSON() as { Parameters: Record<string, CfnParameter> }).Parameters;
}

/** What differs per deployment comes in as CloudFormation parameters, never from the repository (docs/adr/0049). */
describe.each(ENVIRONMENTS)('%s: deploy-time parameters', (environment) => {
  const declared = parameters(environment);
  const matches = (name: string, value: string) => new RegExp(declared[name]?.AllowedPattern ?? '(?!)').test(value);

  it('takes the host names, certificates, sender and image tag, and no other parameter of its own', () => {
    const own = Object.keys(declared).filter((name) => name !== 'BootstrapVersion');
    expect(own.sort()).toEqual(Object.values(PARAMETER_NAMES).sort());
    for (const name of own) {
      expect(declared[name]?.Type, name).toBe('String');
    }
  });

  it('has no default for anything but the image tag, which starts at none (no task runs)', () => {
    for (const name of Object.values(PARAMETER_NAMES).filter((candidate) => candidate !== PARAMETER_NAMES.imageTag)) {
      expect(declared[name]?.Default, name).toBeUndefined();
    }
    expect(declared[PARAMETER_NAMES.imageTag]?.Default).toBe(NO_IMAGE);
    const template = templateFor(environment).toJSON() as { Conditions: Record<string, unknown> };
    expect(template.Conditions.Released).toEqual({ 'Fn::Not': [{ 'Fn::Equals': [{ Ref: PARAMETER_NAMES.imageTag }, NO_IMAGE] }] });
  });

  it('accepts host names of at most 63 characters for the application (the passkey relying-party ID)', () => {
    expect(declared[PARAMETER_NAMES.appDomainName]?.MaxLength).toBe(63);
    expect(matches(PARAMETER_NAMES.appDomainName, 'app.example.test')).toBe(true);
    for (const bad of ['App.Example.test', 'localhost', 'https://app.example.test', 'app.example.test/', '-app.example.test']) {
      expect(matches(PARAMETER_NAMES.appDomainName, bad), bad).toBe(false);
    }
  });

  it('accepts only an ACM certificate in us-east-1 for CloudFront, and any region\'s for the load balancer', () => {
    const arn = (region: string) => `arn:aws:acm:${region}:123456789012:certificate/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b`;
    expect(matches(PARAMETER_NAMES.staticCertificateArn, arn('us-east-1'))).toBe(true);
    expect(matches(PARAMETER_NAMES.staticCertificateArn, arn('us-west-2'))).toBe(false);
    expect(matches(PARAMETER_NAMES.certificateArn, arn('us-west-2'))).toBe(true);
    expect(matches(PARAMETER_NAMES.certificateArn, 'arn:aws:iam::123456789012:server-certificate/x')).toBe(false);
  });

  it('accepts a sender address on a lowercase domain and image tags only', () => {
    expect(matches(PARAMETER_NAMES.mailFromAddress, 'notices@example.test')).toBe(true);
    expect(matches(PARAMETER_NAMES.mailFromAddress, 'Notices <notices@example.test>')).toBe(false);
    expect(matches(PARAMETER_NAMES.imageTag, 'v2027.1.0')).toBe(true);
    expect(matches(PARAMETER_NAMES.imageTag, NO_IMAGE)).toBe(true);
    expect(matches(PARAMETER_NAMES.imageTag, 'latest:sha256')).toBe(false);
  });
});

describe('the repository holds no deploy-time value', () => {
  it('keeps cdk.json free of context', () => {
    const cdk = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../cdk.json'), 'utf8')) as { context: Record<string, unknown> };
    expect(cdk.context).toEqual({});
  });
});
