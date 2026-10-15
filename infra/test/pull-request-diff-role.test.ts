import { describe, expect, it } from 'vitest';

import { CLOUDFORMATION_DESCRIBE_ACTIONS, DENIED_CONTENT_READS } from '../lib/constructs/pull-request-diff-role';
import { ENVIRONMENTS, GITHUB_REPOSITORY } from '../lib/environments';
import { actionsOf, logicalIdOf, onlyResource, propertiesOf, resourceById, resourcesOf, roleStatements, synthesized } from './synth';

/** docs/adr/0006: a read-only OIDC role in the staging account lets pull requests diff staging. */
describe('the pull-request diff role', () => {
  it.each(ENVIRONMENTS.filter((environment) => environment !== 'staging'))('does not exist in %s', (environment) => {
    const { template } = synthesized(environment);
    expect(resourcesOf(template, 'AWS::IAM::OIDCProvider')).toEqual([]);
    expect(JSON.stringify(template.toJSON())).not.toContain('token.actions.githubusercontent.com');
  });

  const { stack, template } = synthesized('staging');
  const diff = stack.pullRequestDiff;
  if (diff === undefined) {
    throw new Error('the staging stack has no pull-request diff role');
  }
  const roleId = logicalIdOf(stack, diff.role);
  const role = propertiesOf(resourceById(template, 'AWS::IAM::Role', roleId));

  it("trusts GitHub's OIDC issuer with the STS audience", () => {
    const [, provider] = onlyResource(template, 'AWS::IAM::OIDCProvider');
    expect(propertiesOf(provider)).toMatchObject({ Url: 'https://token.actions.githubusercontent.com', ClientIdList: ['sts.amazonaws.com'] });
  });

  it("is assumable only from this repository's pull requests", () => {
    expect(role.AssumeRolePolicyDocument).toEqual({
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'sts:AssumeRoleWithWebIdentity',
          Effect: 'Allow',
          Principal: { Federated: { Ref: logicalIdOf(stack, diff.provider) } },
          Condition: {
            StringEquals: {
              'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
              'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPOSITORY}:pull_request`,
            },
          },
        },
      ],
    });
    expect(GITHUB_REPOSITORY).toMatch(/^[\w.-]+\/[\w.-]+$/);
    expect(role.MaxSessionDuration).toBe(3600);
  });

  it('has ReadOnlyAccess plus CloudFormation describe and nothing that writes', () => {
    expect(JSON.stringify(role.ManagedPolicyArns)).toMatch(/:iam::aws:policy\/ReadOnlyAccess"\]\]\}\]$/);
    expect((role.ManagedPolicyArns as unknown[]).length).toBe(1);
    const statements = roleStatements(template, roleId);
    const allowed = statements.filter((statement) => statement.Effect === 'Allow').flatMap(actionsOf);
    expect(allowed).toEqual(CLOUDFORMATION_DESCRIBE_ACTIONS);
    expect(allowed.every((action) => /^cloudformation:(Describe|Get|List)\w+$/.test(action))).toBe(true);
  });

  it('is refused object contents, secret values, parameters and decryption', () => {
    const denied = roleStatements(template, roleId).filter((statement) => statement.Effect === 'Deny');
    expect(denied).toEqual([{ Sid: 'NoContentReads', Effect: 'Deny', Action: DENIED_CONTENT_READS, Resource: '*' }]);
  });
});
