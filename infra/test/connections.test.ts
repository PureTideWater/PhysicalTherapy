import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';

import { WEB_POOL_CONNECTIONS } from '../../apps/web/src/lib/server/pools';
import { PRACTICE_JOB_SLOTS } from '../../apps/worker/src/jobs/registry';
import { OPERATOR_POOL_CONNECTIONS, QUEUE_POOL_CONNECTIONS, SCREENING_SWEEP_CONNECTIONS, SCREENING_THREAD_CONNECTIONS } from '../../apps/worker/src/pools';
import {
  ConnectionBudgetError,
  DATABASE_CONNECTIONS_ALARM_PERCENT,
  MIGRATION_TASK_CONNECTIONS,
  RDS_RESERVED_CONNECTIONS,
  RESERVE_CONNECTIONS,
  checkedConnectionBudget,
  connectionBudget,
  maxConnections,
  mostTasks,
  webTaskPools,
} from '../lib/connections';
import { DEPLOY_MAX_HEALTHY_PERCENT, WEB_ESIGN_PROVIDER } from '../lib/constructs/compute';
import { DATABASE_PARAMETERS } from '../lib/constructs/database';
import { ENVIRONMENTS, type EnvironmentName, type EnvironmentSettings, environmentSettings } from '../lib/environments';
import { SYNTH_TIMEOUT_MS, synthesized } from './synth';

/** Each environment's figures (docs/adr/0083, "The practice pool"): every task's pools full at once, the reserve, and what the class gives. */
const EXPECTED: Readonly<Record<EnvironmentName, { readonly instanceType: string; readonly worstCase: number; readonly maxConnections: number; readonly alarmThreshold: number }>> = {
  // web 2 x 21, worker 2 x 25, platform 2 x 12, screening 2 x 18, migration 1 x 1, reserve 10.
  dev: { instanceType: 't4g.medium', worstCase: 163, maxConnections: 394, alarmThreshold: 316 },
  staging: { instanceType: 't4g.medium', worstCase: 163, maxConnections: 394, alarmThreshold: 316 },
  // web 4 x 21: production runs two web tasks.
  production: { instanceType: 't4g.medium', worstCase: 205, maxConnections: 394, alarmThreshold: 316 },
};

const withClass = (settings: EnvironmentSettings, size: ec2.InstanceSize): EnvironmentSettings => ({
  ...settings,
  database: { ...settings.database, instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, size) },
});

describe.each(ENVIRONMENTS)('%s: the database connection budget (docs/adr/0083)', (environment) => {
  const settings = environmentSettings(environment);

  it('holds every task’s pools, all full at once, and the reserve under the connections its class gives the application logins', () => {
    const budget = checkedConnectionBudget(settings);
    expect({ instanceType: budget.instanceType, worstCase: budget.worstCase, maxConnections: budget.maxConnections, alarmThreshold: budget.alarmThreshold }).toEqual(EXPECTED[environment]);
    expect(budget.available).toBe(budget.maxConnections - RDS_RESERVED_CONNECTIONS);
    expect(budget.worstCase).toBeLessThan(budget.available);
    expect(budget.fits).toBe(true);
  });

  it('counts each service at the most tasks a deploy runs at once, and the migration task', () => {
    const budget = connectionBudget(settings);
    const { compute } = settings;
    expect(Object.fromEntries(budget.lines.map((entry) => [entry.service, entry.tasks]))).toEqual({
      web: compute.web.desiredCount * 2,
      worker: compute.worker.desiredCount * 2,
      platform: compute.platform.desiredCount * 2,
      screening: compute.screening.desiredCount * 2,
      migration: 1,
    });
    expect(DEPLOY_MAX_HEALTHY_PERCENT).toBe(200);
    for (const entry of budget.lines) {
      expect(entry.connections, entry.service).toBe(entry.tasks * entry.pools.reduce((sum, pool) => sum + pool.connections, 0));
    }
    expect(budget.worstCase).toBe(budget.lines.reduce((sum, entry) => sum + entry.connections, 0) + RESERVE_CONNECTIONS);
  });

  it(
    'is what the stack checked at synthesis, and its alarm line',
    () => {
      expect(synthesized(environment).stack.connectionBudget).toEqual(connectionBudget(settings));
    },
    SYNTH_TIMEOUT_MS,
  );
});

describe('the pools the budget counts, read from the apps', () => {
  const budget = connectionBudget(environmentSettings('production'));
  const perTask = (service: string) => budget.lines.find((entry) => entry.service === service)?.perTask;

  it('gives the worker a connection for each practice job it runs at once beside pg-boss’s pool: 15 and 10', () => {
    expect(PRACTICE_JOB_SLOTS).toBe(15);
    expect(QUEUE_POOL_CONNECTIONS).toBe(10);
    expect(perTask('worker')).toBe(PRACTICE_JOB_SLOTS + QUEUE_POOL_CONNECTIONS);
  });

  it('gives the platform jobs their operator pool and the screening consumer its sweep and a pool per thread, each beside pg-boss’s', () => {
    expect(perTask('platform')).toBe(OPERATOR_POOL_CONNECTIONS + QUEUE_POOL_CONNECTIONS);
    expect(perTask('screening')).toBe(SCREENING_SWEEP_CONNECTIONS + environmentSettings('production').compute.screening.concurrency * SCREENING_THREAD_CONNECTIONS + QUEUE_POOL_CONNECTIONS);
    expect(perTask('screening')).toBe(18);
    expect(perTask('migration')).toBe(MIGRATION_TASK_CONNECTIONS);
  });

  it('gives the web its application, billing, model and producer pools, and the e-signature pool once a vendor is configured', () => {
    expect(WEB_ESIGN_PROVIDER).toBe('none');
    expect(perTask('web')).toBe(WEB_POOL_CONNECTIONS.application + WEB_POOL_CONNECTIONS.billing + WEB_POOL_CONNECTIONS.model + WEB_POOL_CONNECTIONS.queue);
    expect(perTask('web')).toBe(21);
    expect(webTaskPools('a vendor').reduce((sum, pool) => sum + pool.connections, 0)).toBe(21 + WEB_POOL_CONNECTIONS.esign);
  });
});

describe('the instance’s max_connections', () => {
  it('is RDS’s default for the class, LEAST({DBInstanceClassMemory/9531392}, 5000), below what RDS reported on the classes of the same memory', () => {
    expect(DATABASE_PARAMETERS.max_connections).toBeUndefined();
    expect(['t4g.micro', 't4g.small', 't4g.medium', 't4g.large', 't4g.xlarge'].map((type) => maxConnections(type))).toEqual([56, 168, 394, 788, 1577]);
    // RDS for PostgreSQL 17 on the classes of 2, 4 and 8 GiB; the whole memory would give 225, 450 and 901.
    expect(maxConnections('t4g.small')).toBeLessThanOrEqual(191);
    expect(maxConnections('t4g.medium')).toBeLessThanOrEqual(402);
    expect(maxConnections('t4g.large')).toBeLessThanOrEqual(841);
    expect(() => maxConnections('r9.huge')).toThrow(RangeError);
  });

  it('is the parameter group’s where it sets one, a whole number only', () => {
    expect(maxConnections('t4g.micro', { ...DATABASE_PARAMETERS, max_connections: '120' })).toBe(120);
    expect(() => maxConnections('t4g.micro', { max_connections: '{DBInstanceClassMemory/9531392}' })).toThrow(/a whole number only/);
  });
});

describe('a configuration over budget', () => {
  it('is refused, naming each figure: staging’s former db.t4g.small held exactly what its tasks can hold, and the worst case must stay under', () => {
    const settings = withClass(environmentSettings('staging'), ec2.InstanceSize.SMALL);
    expect(() => checkedConnectionBudget(settings)).toThrow(ConnectionBudgetError);
    expect(() => checkedConnectionBudget(settings)).toThrow(
      'the staging database (db.t4g.small) gives the application logins 163 connections (max_connections 168 less 5 reserved), and its tasks can hold 163 at once ' +
        "(web 2 x 21, worker 2 x 25, platform 2 x 12, screening 2 x 18, migration 1 x 1, reserve 10): over budget. Move the environment's database up a class, " +
        'or lower a pool or a task count (infra/lib/connections.ts; docs/adr/0083).',
    );
  });

  it('is refused for dev’s former db.t4g.micro, which cannot hold even one task of each service', () => {
    const settings = withClass(environmentSettings('dev'), ec2.InstanceSize.MICRO);
    expect(connectionBudget(settings)).toMatchObject({ maxConnections: 56, available: 51, worstCase: 163, fits: false });
    expect(() => checkedConnectionBudget(settings)).toThrow(/the dev database \(db\.t4g\.micro\) gives the application logins 51 connections/);
  });

  it('keeps ten connections in reserve, alarms at 80% of max_connections, and counts twice the desired tasks during a deploy', () => {
    expect(DATABASE_CONNECTIONS_ALARM_PERCENT).toBe(80);
    expect(RESERVE_CONNECTIONS).toBe(10);
    expect(mostTasks({ cpu: 512, memoryMiB: 1024, desiredCount: 3 })).toBe(6);
  });
});
