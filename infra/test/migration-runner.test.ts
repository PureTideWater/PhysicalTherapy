import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import { MIGRATION_RUNNER_SOURCE } from '../lib/migration-runner';

/** What the fake ECS and CloudFormation clients answer, and what they were sent. */
interface World {
  stackStatus: string;
  runTask: { tasks?: { taskArn?: string }[]; failures?: { reason?: string }[] };
  describeTasks: { tasks?: { lastStatus?: string; stopCode?: string; containers?: { name: string; exitCode?: number }[] }[] };
  readonly sent: { command: string; input: Record<string, unknown> }[];
}

function load(world: World) {
  class Command {
    constructor(readonly input: Record<string, unknown>) {}
  }
  class RunTaskCommand extends Command {}
  class DescribeTasksCommand extends Command {}
  class DescribeStacksCommand extends Command {}
  const answer = (command: Command) => {
    world.sent.push({ command: command.constructor.name, input: command.input });
    if (command instanceof RunTaskCommand) {
      return Promise.resolve(world.runTask);
    }
    if (command instanceof DescribeTasksCommand) {
      return Promise.resolve(world.describeTasks);
    }
    return Promise.resolve({ Stacks: [{ StackStatus: world.stackStatus }] });
  };
  class Client {
    send(command: Command) {
      return answer(command);
    }
  }
  const modules: Record<string, unknown> = {
    '@aws-sdk/client-ecs': { ECSClient: Client, RunTaskCommand, DescribeTasksCommand },
    '@aws-sdk/client-cloudformation': { CloudFormationClient: Client, DescribeStacksCommand },
  };
  const exports: { onEvent?: (event: unknown) => Promise<Record<string, unknown>>; isComplete?: (event: unknown) => Promise<Record<string, unknown>> } = {};
  vm.runInNewContext(MIGRATION_RUNNER_SOURCE, { require: (name: string) => modules[name], exports, String, Error });
  if (exports.onEvent === undefined || exports.isComplete === undefined) {
    throw new Error('the handlers are not exported');
  }
  return { onEvent: exports.onEvent, isComplete: exports.isComplete };
}

const PROPERTIES = {
  Cluster: 'arn:aws:ecs:us-east-1:123456789012:cluster/tp-staging',
  TaskDefinition: 'arn:aws:ecs:us-east-1:123456789012:task-definition/tp-staging-migration:7',
  ContainerName: 'migrate',
  Subnets: ['subnet-0a', 'subnet-0b'],
  SecurityGroups: ['sg-0m'],
  ImageTag: 'v2027.1.0',
  Run: 'true',
};
const STACK = 'arn:aws:cloudformation:us-east-1:123456789012:stack/tp-staging/synthetic';
const TASK = 'arn:aws:ecs:us-east-1:123456789012:task/tp-staging/0123456789abcdef';

function world(overrides: Partial<World> = {}): World {
  return { stackStatus: 'UPDATE_IN_PROGRESS', runTask: { tasks: [{ taskArn: TASK }] }, describeTasks: { tasks: [] }, sent: [], ...overrides };
}

const event = (requestType: string, properties: Record<string, unknown> = PROPERTIES, extra: Record<string, unknown> = {}) => ({
  RequestType: requestType,
  StackId: STACK,
  ResourceProperties: properties,
  ...extra,
});

describe('the migration run: onEvent', () => {
  it('starts the migration task in the app subnets with no public address, once per release tag', async () => {
    const state = world();
    const { onEvent } = load(state);
    for (const type of ['Create', 'Update']) {
      expect(await onEvent(event(type))).toEqual({ PhysicalResourceId: 'migration-v2027.1.0', Data: { TaskArn: TASK, Outcome: 'started' } });
    }
    const runs = state.sent.filter((sent) => sent.command === 'RunTaskCommand');
    expect(runs).toHaveLength(2);
    expect(runs[0]?.input).toEqual({
      cluster: PROPERTIES.Cluster,
      taskDefinition: PROPERTIES.TaskDefinition,
      launchType: 'FARGATE',
      count: 1,
      startedBy: 'tp-migration',
      networkConfiguration: { awsvpcConfiguration: { subnets: PROPERTIES.Subnets, securityGroups: PROPERTIES.SecurityGroups, assignPublicIp: 'DISABLED' } },
    });
    expect(state.sent.filter((sent) => sent.command === 'DescribeStacksCommand').map((sent) => sent.input)).toEqual([{ StackName: STACK }, { StackName: STACK }]);
  });

  it('starts nothing before the first release or for a redeployed previous image', async () => {
    const state = world();
    const { onEvent } = load(state);
    expect(await onEvent(event('Create', { ...PROPERTIES, ImageTag: 'none', Run: 'false' }))).toEqual({
      PhysicalResourceId: 'migration-none',
      Data: { TaskArn: '', Outcome: 'not-run' },
    });
    expect(state.sent).toEqual([]);
  });

  it('starts nothing while the stack rolls back: the previous image runs on the newer schema', async () => {
    for (const stackStatus of ['UPDATE_ROLLBACK_IN_PROGRESS', 'ROLLBACK_IN_PROGRESS']) {
      const state = world({ stackStatus });
      const { onEvent } = load(state);
      expect(await onEvent(event('Update'))).toEqual({ PhysicalResourceId: 'migration-v2027.1.0', Data: { TaskArn: '', Outcome: 'rollback' } });
      expect(state.sent.map((sent) => sent.command)).toEqual(['DescribeStacksCommand']);
    }
  });

  it('starts nothing on delete', async () => {
    const state = world();
    const { onEvent } = load(state);
    expect(await onEvent(event('Delete', PROPERTIES, { PhysicalResourceId: 'migration-v2027.1.0' }))).toEqual({ PhysicalResourceId: 'migration-v2027.1.0' });
    expect(state.sent).toEqual([]);
  });

  it('fails the deploy when ECS does not start the task, with ECS\'s reason', async () => {
    const { onEvent } = load(world({ runTask: { tasks: [], failures: [{ reason: 'RESOURCE:ENI' }] } }));
    await expect(onEvent(event('Update'))).rejects.toThrow('the migration task did not start: RESOURCE:ENI');
    const { onEvent: bare } = load(world({ runTask: {} }));
    await expect(bare(event('Update'))).rejects.toThrow('the migration task did not start: no reason given');
  });
});

describe('the migration run: isComplete', () => {
  const started = (extra: Record<string, unknown> = {}) => event('Update', PROPERTIES, { PhysicalResourceId: 'migration-v2027.1.0', Data: { TaskArn: TASK }, ...extra });

  it('is done at once when no task was started, or on delete', async () => {
    const state = world();
    const { isComplete } = load(state);
    expect(await isComplete(event('Create', PROPERTIES, { Data: { TaskArn: '' } }))).toEqual({ IsComplete: true });
    expect(await isComplete(event('Delete', PROPERTIES, { Data: { TaskArn: TASK } }))).toEqual({ IsComplete: true });
    expect(state.sent).toEqual([]);
  });

  it('waits while the task runs', async () => {
    const state = world({ describeTasks: { tasks: [{ lastStatus: 'RUNNING', containers: [{ name: 'migrate' }] }] } });
    const { isComplete } = load(state);
    expect(await isComplete(started())).toEqual({ IsComplete: false });
    expect(state.sent).toEqual([{ command: 'DescribeTasksCommand', input: { cluster: PROPERTIES.Cluster, tasks: [TASK] } }]);
  });

  it('is done once the migration container exits 0', async () => {
    const { isComplete } = load(world({ describeTasks: { tasks: [{ lastStatus: 'STOPPED', stopCode: 'EssentialContainerExited', containers: [{ name: 'migrate', exitCode: 0 }] }] } }));
    expect(await isComplete(started())).toEqual({ IsComplete: true, Data: { TaskArn: TASK, Outcome: 'migrated' } });
  });

  it('fails the deploy, before any service moves, when the migration stops any other way, naming only codes', async () => {
    const failed = load(world({ describeTasks: { tasks: [{ lastStatus: 'STOPPED', stopCode: 'EssentialContainerExited', containers: [{ name: 'migrate', exitCode: 1 }] }] } }));
    await expect(failed.isComplete(started())).rejects.toThrow(`the migration task ${TASK} stopped without migrating (exit code 1, EssentialContainerExited)`);
    const neverRan = load(world({ describeTasks: { tasks: [{ lastStatus: 'STOPPED', stopCode: 'TaskFailedToStart', containers: [{ name: 'migrate' }] }] } }));
    await expect(neverRan.isComplete(started())).rejects.toThrow('(exit code undefined, TaskFailedToStart)');
    const noContainers = load(world({ describeTasks: { tasks: [{ lastStatus: 'STOPPED' }] } }));
    await expect(noContainers.isComplete(started())).rejects.toThrow('(exit code undefined, no stop code)');
    const gone = load(world({ describeTasks: {} }));
    await expect(gone.isComplete(started())).rejects.toThrow(`the migration task ${TASK} is not found`);
  });
});
