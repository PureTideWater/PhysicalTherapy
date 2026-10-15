import { aws_ec2 as ec2 } from 'aws-cdk-lib';

/**
 * The three environments of PRD section 15. `dev` is local Docker Postgres and MinIO with
 * synthetic data only; its stack exists so shared constructs can be synthesized and tested the
 * same way as the others. `staging` is a full AWS copy with synthetic data; `production` holds PHI.
 */
export const ENVIRONMENTS = ['dev', 'staging', 'production'] as const;
export type EnvironmentName = (typeof ENVIRONMENTS)[number];

/** CloudFormation stack name per environment. */
export function stackName(environment: EnvironmentName): string {
  return `tp-${environment}`;
}

/** The repository whose pull requests may assume the read-only staging diff role (ADR 0006). */
export const GITHUB_REPOSITORY = 'PureTideWater/PhysicalTherapy';

export interface DatabaseSettings {
  readonly instanceType: ec2.InstanceType;
  /** Multi-AZ in production (PRD 15, Stack: database). */
  readonly multiAz: boolean;
  /** Deletion protection in production. */
  readonly deletionProtection: boolean;
  readonly allocatedStorageGiB: number;
  /** Storage autoscaling ceiling. */
  readonly maxAllocatedStorageGiB: number;
}

export interface EnvironmentSettings {
  readonly name: EnvironmentName;
  /** Real PHI exists in production only (PRD 16, development data boundary). */
  readonly holdsPhi: boolean;
  /** Distinct per environment so the networks can be joined later without renumbering. */
  readonly vpcCidr: string;
  readonly database: DatabaseSettings;
  /**
   * Object Lock mode for packets and audit copies. Production is COMPLIANCE: nobody, the account
   * root included, can shorten or remove the seven years. Staging and dev hold synthetic copies
   * only, so GOVERNANCE keeps the same default retention while letting a deliberate, permissioned
   * bypass clear them.
   */
  readonly objectLockMode: 'COMPLIANCE' | 'GOVERNANCE';
  /** Deletion protection on the user pool and termination protection on the stack. */
  readonly protectFromDeletion: boolean;
  /** The read-only role pull requests assume for `cdk diff` (staging only, ADR 0006). */
  readonly pullRequestDiffRole: boolean;
}

const burstable = (size: ec2.InstanceSize) => ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, size);

const SETTINGS: Readonly<Record<EnvironmentName, EnvironmentSettings>> = {
  dev: {
    name: 'dev',
    holdsPhi: false,
    vpcCidr: '10.10.0.0/16',
    database: {
      instanceType: burstable(ec2.InstanceSize.MICRO),
      multiAz: false,
      deletionProtection: false,
      allocatedStorageGiB: 20,
      maxAllocatedStorageGiB: 50,
    },
    objectLockMode: 'GOVERNANCE',
    protectFromDeletion: false,
    pullRequestDiffRole: false,
  },
  staging: {
    name: 'staging',
    holdsPhi: false,
    vpcCidr: '10.20.0.0/16',
    database: {
      instanceType: burstable(ec2.InstanceSize.SMALL),
      multiAz: false,
      deletionProtection: false,
      allocatedStorageGiB: 20,
      maxAllocatedStorageGiB: 100,
    },
    objectLockMode: 'GOVERNANCE',
    protectFromDeletion: false,
    pullRequestDiffRole: true,
  },
  production: {
    name: 'production',
    holdsPhi: true,
    vpcCidr: '10.30.0.0/16',
    database: {
      instanceType: burstable(ec2.InstanceSize.MEDIUM),
      multiAz: true,
      deletionProtection: true,
      allocatedStorageGiB: 50,
      maxAllocatedStorageGiB: 500,
    },
    objectLockMode: 'COMPLIANCE',
    protectFromDeletion: true,
    pullRequestDiffRole: false,
  },
};

export function environmentSettings(environment: EnvironmentName): EnvironmentSettings {
  return SETTINGS[environment];
}
