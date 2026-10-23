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

/** One Fargate task's size (CPU units of 1024 per vCPU, memory in MiB) and how many run. */
export interface TaskSize {
  readonly cpu: number;
  readonly memoryMiB: number;
}

export interface ServiceSettings extends TaskSize {
  /** Tasks the service runs once an image is released (ImageTag set); none before. */
  readonly desiredCount: number;
}

/**
 * The free screening's own consumer (WORKER_JOBS=screening; docs/adr/0062; PR 6b-3, the founder's Q1 of 2026-10-21):
 * one task of 2 vCPU and 4,096 MiB pricing three screenings at once, each in its own worker thread, at a fixed count
 * with no scaling. Declaring it switches the capacity test's time verdict on (tools/screening-capacity/limits.ts).
 */
export interface ScreeningServiceSettings extends ServiceSettings {
  /** Screenings one task prices at once, one worker thread each (SCREENING_CONCURRENCY). */
  readonly concurrency: number;
  /**
   * 'deploy': runs from the first released deploy; 'launch': held at no task until the ScreeningConsumer parameter is
   * 'running' (Q1 (b): production's consumer waits for launch, staging's always runs).
   */
  readonly starts: 'deploy' | 'launch';
}

/**
 * The compute (PRD 15, Stack: compute; PRD 19, Monthly costs: about $82 a month of Fargate for the web and worker at
 * ten customers, the web's larger task of 2026-10-22 included, and about $74.50 for the screening consumer once it
 * runs). The web app runs two tasks in production, one per availability zone; the worker's practice jobs, its platform
 * jobs and the screening consumer run one task each (docs/adr/0049).
 */
export interface ComputeSettings {
  readonly web: ServiceSettings;
  readonly worker: ServiceSettings;
  readonly platform: ServiceSettings;
  /** The screening consumer: the same size everywhere, so staging measures production's task (decision 15). */
  readonly screening: ScreeningServiceSettings;
  readonly migration: TaskSize;
  /**
   * NAT gateways for the app subnets' internet egress (Cognito, Stripe, the compliance platform;
   * docs/adr/0049): one per zone in production, so a zone's loss does not stop sign-in, one elsewhere.
   */
  readonly natGateways: number;
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
  readonly compute: ComputeSettings;
}

const burstable = (size: ec2.InstanceSize) => ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, size);

/**
 * The web at half a vCPU and 1,024 MiB in every environment (the founder's ruling of 2026-10-22 on the sizing question,
 * O9: on a quarter vCPU, three 11-MB uploads at once reached the queue after 14.6 to 16.0 s, against 6.9 s on half a
 * vCPU, the largest share of the worst time), a quarter-vCPU platform task, a half-vCPU worker (Chromium prints its
 * PDFs) and the screening consumer at 2 vCPU and 4,096 MiB (Fargate's least memory at 2 vCPU), three screenings at once
 * (Q1 (a): three worst-shape uploads at once priced in 37.5 to 41.1 s against the 48-s line, where two at a time left
 * the third at 55.8 s). The web's command sets no heap flag: Node 24 sizes V8's heap from the container's memory limit
 * (a 560 MiB heap limit at 1,024 MiB, 259 MiB at 512, measured), so the heap follows this size, and the capacity test
 * runs the web under the same limit, read from here (tools/screening-capacity/limits.ts).
 */
const compute = (webTasks: number, natGateways: number, screeningStarts: ScreeningServiceSettings['starts']): ComputeSettings => ({
  web: { cpu: 512, memoryMiB: 1024, desiredCount: webTasks },
  worker: { cpu: 512, memoryMiB: 1024, desiredCount: 1 },
  platform: { cpu: 256, memoryMiB: 512, desiredCount: 1 },
  screening: { cpu: 2048, memoryMiB: 4096, desiredCount: 1, concurrency: 3, starts: screeningStarts },
  migration: { cpu: 256, memoryMiB: 512 },
  natGateways,
});

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
    compute: compute(1, 1, 'deploy'),
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
    compute: compute(1, 1, 'deploy'),
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
    compute: compute(2, 2, 'launch'),
  },
};

export function environmentSettings(environment: EnvironmentName): EnvironmentSettings {
  return SETTINGS[environment];
}
