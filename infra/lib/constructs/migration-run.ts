import {
  CustomResource,
  Duration,
  RemovalPolicy,
  Stack,
  type aws_ec2 as ec2,
  type aws_ecs as ecs,
  aws_iam as iam,
  type aws_kms as kms,
  aws_lambda as lambda,
  aws_logs as logs,
  custom_resources as cr,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { MIGRATION_RUNNER_SOURCE } from '../migration-runner';

/** The custom resource type CloudFormation shows for the migration run. */
export const MIGRATION_RUN_TYPE = 'Custom::MigrationRun';

/** How long a migration may run before the deploy fails (inside CloudFormation's hour for a custom resource). */
export const MIGRATION_TIMEOUT = Duration.minutes(50);

/** How often the run asks whether the task has stopped. */
export const MIGRATION_POLL_INTERVAL = Duration.seconds(15);

export interface MigrationRunProps {
  readonly key: kms.IKey;
  readonly logGroupName: string;
  readonly cluster: ecs.ICluster;
  readonly taskDefinition: ecs.FargateTaskDefinition;
  readonly containerName: string;
  readonly subnets: readonly ec2.ISubnet[];
  readonly securityGroup: ec2.ISecurityGroup;
  /** The release the run migrates to; a new tag is a new run. */
  readonly imageTag: string;
  /** 'true' to run the task; anything else records the release without running it. */
  readonly run: string;
}

/**
 * The one-off migration task, run before the new image receives traffic (PRD 15, Environments; PRD
 * 18, Releases; PRD 19, Deploy and rollback: "migrations run as a job; traffic shifts"). A custom
 * resource starts the migration task definition and waits for it (infra/lib/migration-runner.ts);
 * the web, worker and platform services depend on it, so CloudFormation moves none of them to a new
 * task definition until the migration has exited 0, and a failed migration fails the deploy before
 * any traffic moves. The handlers run outside the VPC (they call the ECS and CloudFormation APIs
 * only) and may start exactly the migration task definition's family in this cluster, pass exactly
 * its two roles, and read this stack's status. Their logs go to one log group under the environment key.
 */
export class MigrationRun extends Construct {
  readonly resource: CustomResource;
  readonly logGroup: logs.LogGroup;
  readonly onEvent: lambda.Function;
  readonly isComplete: lambda.Function;

  constructor(scope: Construct, id: string, props: MigrationRunProps) {
    super(scope, id);
    const stack = Stack.of(this);
    this.logGroup = new logs.LogGroup(this, 'Logs', {
      logGroupName: props.logGroupName,
      encryptionKey: props.key,
      retention: logs.RetentionDays.ONE_YEAR,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    const handler = (name: string, entry: 'onEvent' | 'isComplete') =>
      new lambda.Function(this, name, {
        description: `The migration run: ${entry}`,
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: `index.${entry}`,
        code: lambda.Code.fromInline(MIGRATION_RUNNER_SOURCE),
        timeout: Duration.minutes(1),
        memorySize: 256,
        logGroup: this.logGroup,
      });
    this.onEvent = handler('OnEvent', 'onEvent');
    this.isComplete = handler('IsComplete', 'isComplete');

    const ecsArn = (resource: string) => `arn:${stack.partition}:ecs:${stack.region}:${stack.account}:${resource}`;
    const inCluster = { ArnEquals: { 'ecs:cluster': props.cluster.clusterArn } };
    this.onEvent.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'StartTheMigrationTask',
        actions: ['ecs:RunTask'],
        resources: [ecsArn(`task-definition/${props.taskDefinition.family}:*`)],
        conditions: inCluster,
      }),
    );
    const passed = [props.taskDefinition.taskRole.roleArn];
    if (props.taskDefinition.executionRole !== undefined) {
      passed.push(props.taskDefinition.executionRole.roleArn);
    }
    this.onEvent.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'PassTheMigrationRoles',
        actions: ['iam:PassRole'],
        resources: passed,
        conditions: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } },
      }),
    );
    this.onEvent.addToRolePolicy(
      new iam.PolicyStatement({ sid: 'ReadThisStackStatus', actions: ['cloudformation:DescribeStacks'], resources: [stack.stackId] }),
    );
    this.isComplete.addToRolePolicy(
      new iam.PolicyStatement({
        sid: 'WatchTheMigrationTask',
        actions: ['ecs:DescribeTasks'],
        resources: [ecsArn(`task/${props.cluster.clusterName}/*`)],
        conditions: inCluster,
      }),
    );

    const provider = new cr.Provider(this, 'Provider', {
      onEventHandler: this.onEvent,
      isCompleteHandler: this.isComplete,
      totalTimeout: MIGRATION_TIMEOUT,
      queryInterval: MIGRATION_POLL_INTERVAL,
      logGroup: this.logGroup,
      disableWaiterStateMachineLogging: true,
    });
    this.resource = new CustomResource(this, 'Run', {
      serviceToken: provider.serviceToken,
      resourceType: MIGRATION_RUN_TYPE,
      properties: {
        Cluster: props.cluster.clusterArn,
        TaskDefinition: props.taskDefinition.taskDefinitionArn,
        ContainerName: props.containerName,
        Subnets: props.subnets.map((subnet) => subnet.subnetId),
        SecurityGroups: [props.securityGroup.securityGroupId],
        ImageTag: props.imageTag,
        Run: props.run,
      },
    });
  }
}
