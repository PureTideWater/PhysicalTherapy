import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';

import { buildApp } from '../lib/app';
import { ENVIRONMENTS, stackName } from '../lib/environments';
import { PlatformStack } from '../lib/platform-stack';

describe('CDK app', () => {
  it('has one stack per environment', () => {
    const app = buildApp(new App());
    const stacks = app.node.children.filter((child): child is PlatformStack => child instanceof PlatformStack);
    expect(stacks.map((stack) => stack.stackName)).toEqual(['tp-dev', 'tp-staging', 'tp-production']);
    expect(stacks.map((stack) => stack.environmentName)).toEqual([...ENVIRONMENTS]);
  });

  it('synthesizes every stack with its environment tag and no resources yet', () => {
    const app = buildApp(new App());
    const assembly = app.synth();
    for (const environment of ENVIRONMENTS) {
      const stack = app.node.findChild(stackName(environment)) as PlatformStack;
      const template = Template.fromStack(stack);
      const resources = (template.toJSON() as { Resources?: Record<string, unknown> }).Resources ?? {};
      expect(Object.keys(resources).filter((id) => id !== 'CDKMetadata')).toEqual([]);
      const artifact = assembly.getStackByName(stackName(environment));
      expect(artifact.tags).toMatchObject({ environment, project: 'therapy-platform' });
    }
  });
});
