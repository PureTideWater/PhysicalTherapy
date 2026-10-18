/**
 * The migration run's two Lambda handlers (docs/adr/0049), as the inline source CloudFormation gives
 * Lambda (CommonJS, the AWS SDK the Node.js runtime includes). The custom resource that calls them
 * stands between the migration task definition and the three services: CloudFormation updates a
 * service to a new task definition, and so moves traffic to a new image, only once this resource
 * has finished.
 *
 * - onEvent (Create, Update): with `Run` other than 'true' (before the first release, or a deploy
 *   that redeploys a previous image, whose migrations are already applied) it starts nothing. While
 *   the stack is rolling back it starts nothing either: the previous image runs on the newer schema,
 *   which the add, backfill and remove rule keeps safe (PRD 18), and the previous image's migrator
 *   would refuse a history with files it does not have. Otherwise it starts the migration task, in
 *   the app subnets with no public address. Delete starts nothing.
 * - isComplete: done when there is no task, or once the task has stopped with exit code 0; a task
 *   that stopped any other way fails the resource, so the deploy rolls back and no service changes.
 *
 * Errors name the task and its exit and stop codes only; the task's own output is in its log group.
 */
export const MIGRATION_RUNNER_SOURCE = `'use strict';
const { ECSClient, RunTaskCommand, DescribeTasksCommand } = require('@aws-sdk/client-ecs');
const { CloudFormationClient, DescribeStacksCommand } = require('@aws-sdk/client-cloudformation');
const ecs = new ECSClient({});
const cloudformation = new CloudFormationClient({});

async function rollingBack(stackId) {
  const found = await cloudformation.send(new DescribeStacksCommand({ StackName: stackId }));
  const status = (found.Stacks && found.Stacks[0] && found.Stacks[0].StackStatus) || '';
  return status.includes('ROLLBACK');
}

exports.onEvent = async (event) => {
  const p = event.ResourceProperties;
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId };
  }
  const id = 'migration-' + p.ImageTag;
  if (p.Run !== 'true') {
    return { PhysicalResourceId: id, Data: { TaskArn: '', Outcome: 'not-run' } };
  }
  if (await rollingBack(event.StackId)) {
    return { PhysicalResourceId: id, Data: { TaskArn: '', Outcome: 'rollback' } };
  }
  const started = await ecs.send(new RunTaskCommand({
    cluster: p.Cluster,
    taskDefinition: p.TaskDefinition,
    launchType: 'FARGATE',
    count: 1,
    startedBy: 'tp-migration',
    networkConfiguration: { awsvpcConfiguration: { subnets: p.Subnets, securityGroups: p.SecurityGroups, assignPublicIp: 'DISABLED' } },
  }));
  const task = started.tasks && started.tasks[0];
  if (!task || !task.taskArn) {
    const reason = (started.failures && started.failures[0] && started.failures[0].reason) || 'no reason given';
    throw new Error('the migration task did not start: ' + reason);
  }
  return { PhysicalResourceId: id, Data: { TaskArn: task.taskArn, Outcome: 'started' } };
};

exports.isComplete = async (event) => {
  const p = event.ResourceProperties;
  const taskArn = event.Data && event.Data.TaskArn;
  if (event.RequestType === 'Delete' || !taskArn) {
    return { IsComplete: true };
  }
  const described = await ecs.send(new DescribeTasksCommand({ cluster: p.Cluster, tasks: [taskArn] }));
  const task = described.tasks && described.tasks[0];
  if (!task) {
    throw new Error('the migration task ' + taskArn + ' is not found');
  }
  if (task.lastStatus !== 'STOPPED') {
    return { IsComplete: false };
  }
  const container = (task.containers || []).find((c) => c.name === p.ContainerName);
  const exitCode = container ? container.exitCode : undefined;
  if (exitCode === 0) {
    return { IsComplete: true, Data: { TaskArn: taskArn, Outcome: 'migrated' } };
  }
  throw new Error('the migration task ' + taskArn + ' stopped without migrating (exit code ' + String(exitCode) + ', ' + (task.stopCode || 'no stop code') + ')');
};
`;
