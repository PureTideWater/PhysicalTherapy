import { Stack, type StackProps, Tags } from 'aws-cdk-lib';
import type { Construct } from 'constructs';

import type { EnvironmentName } from './environments';

export interface PlatformStackProps extends StackProps {
  readonly environmentName: EnvironmentName;
}

/**
 * One stack per environment. Empty at milestone 0; milestone 1 adds the VPC, RDS, S3 with
 * per-practice KMS data keys, Secrets Manager and the worker heartbeat alarm.
 */
export class PlatformStack extends Stack {
  readonly environmentName: EnvironmentName;

  constructor(scope: Construct, id: string, props: PlatformStackProps) {
    super(scope, id, props);
    this.environmentName = props.environmentName;
    Tags.of(this).add('project', 'therapy-platform');
    Tags.of(this).add('environment', props.environmentName);
  }
}
