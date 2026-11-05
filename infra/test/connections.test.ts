import { aws_ec2 as ec2 } from 'aws-cdk-lib';
import { describe, expect, it } from 'vitest';

import { WEB_POOL_CONNECTIONS } from '../../apps/web/src/lib/server/pools';
import { PRACTICE_JOB_SLOTS } from '../../apps/worker/src/jobs/registry';
import { SCREENING_BOSS_OPTIONS } from '../../apps/worker/src/jobs/screening';
import {
  OPERATOR_POOL_CONNECTIONS,
  QUEUE_LISTEN_CONNECTIONS,
  QUEUE_POOL_CONNECTIONS,
  SCREENING_SWEEP_CONNECTIONS,
  SCREENING_THREAD_CONNECTIONS,
  workerTaskPools,
} from '../../apps/worker/src/pools';
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
import { WEB_ESIGN_PROVIDER } from '../lib/constructs/compute';
import { DATABASE_PARAMETERS } from '../lib/constructs/database';
import {
  type DeploymentSettings,
  ENVIRONMENTS,
  type EnvironmentName,
  type EnvironmentSettings,
  ROLLING_DEPLOYMENT,
  STOP_FIRST_DEPLOYMENT,
  environmentSettings,
} from '../lib/environments';
import { SYNTH_TIMEOUT_MS, synthesized } from './synth';

/**
 * Each environment's figures (docs/adr/0083, "The practice pool" and "The instance classes"): every task's pools full at
 * once, the reserve, and what the class gives. Lane A's orchestrator, 2026-11-05: staging on db.t4g.medium, production's
 * class; dev on db.t4g.small, its worker deploying stop-first.
 */
const EXPECTED: Readonly<Record<EnvironmentName, { readonly instanceType: string; readonly worstCase: number; readonly maxConnections: number; readonly alarmThreshold: number }>> = {
  // web 2 x 21, worker 1 x 25 (stop-first: the old task stops before the new one starts), platform 2 x 12, screening 2 x 19, migration 1 x 1, reserve 10.
  dev: { instanceType: 't4g.small', worstCase: 140, maxConnections: 168, alarmThreshold: 135 },
  // web 2 x 21, worker 2 x 25, platform 2 x 12, screening 2 x 19, migration 1 x 1, reserve 10.
  staging: { instanceType: 't4g.medium', worstCase: 165, maxConnections: 394, alarmThreshold: 316 },
  // web 4 x 21: production runs two web tasks.
  production: { instanceType: 't4g.medium', worstCase: 207, maxConnections: 394, alarmThreshold: 316 },
};

const withClass = (settings: EnvironmentSettings, size: ec2.InstanceSize): EnvironmentSettings => ({
  ...settings,
  database: { ...settings.database, instanceType: ec2.InstanceType.of(ec2.InstanceClass.BURSTABLE4_GRAVITON, size) },
});

const withWorkerDeployment = (settings: EnvironmentSettings, deployment: DeploymentSettings): EnvironmentSettings => ({
  ...settings,
  compute: { ...settings.compute, worker: { ...settings.compute.worker, deployment } },
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

  it('counts each service at the most tasks its own deploy runs at once, and the migration task', () => {
    const budget = connectionBudget(settings);
    const { compute } = settings;
    const most = (service: { readonly desiredCount: number; readonly deployment: DeploymentSettings }) => (service.desiredCount * service.deployment.maxHealthyPercent) / 100;
    expect(Object.fromEntries(budget.lines.map((entry) => [entry.service, entry.tasks]))).toEqual({
      web: most(compute.web),
      worker: most(compute.worker),
      platform: most(compute.platform),
      screening: most(compute.screening),
      migration: 1,
    });
    // Every service rolls new-before-old (twice its desired count at once) but dev's worker, which stops first (once).
    expect(Object.fromEntries(budget.lines.map((entry) => [entry.service, entry.tasks]))).toEqual({
      web: compute.web.desiredCount * 2,
      worker: environment === 'dev' ? 1 : 2,
      platform: 2,
      screening: 2,
      migration: 1,
    });
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
    expect(perTask('screening')).toBe(
      SCREENING_SWEEP_CONNECTIONS + environmentSettings('production').compute.screening.concurrency * SCREENING_THREAD_CONNECTIONS + QUEUE_POOL_CONNECTIONS + QUEUE_LISTEN_CONNECTIONS,
    );
    expect(perTask('screening')).toBe(19);
    expect(perTask('migration')).toBe(MIGRATION_TASK_CONNECTIONS);
  });

  it('counts the screening consumer’s pg-boss LISTEN client, which pg-boss opens outside its pool where notify is on (round-3 review WR-5, INFRA-1)', () => {
    // pg-boss 12.38's Db.listen opens a pg.Client of its own for LISTEN/NOTIFY, so its pool's max does not cap it.
    expect(SCREENING_BOSS_OPTIONS.useListenNotify).toBe(true);
    expect(QUEUE_LISTEN_CONNECTIONS).toBe(1);
    expect(workerTaskPools('screening', 3).find((pool) => pool.pool.includes('LISTEN'))).toEqual({ pool: 'pg-boss LISTEN/NOTIFY client (queue login, outside its pool)', connections: 1 });
    // The practice and platform tasks' pg-boss does not set the option, so it opens no listener.
    for (const jobs of ['practice', 'platform'] as const) {
      expect(workerTaskPools(jobs, 3).some((pool) => pool.pool.includes('LISTEN')), jobs).toBe(false);
    }
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

describe('the instance classes and the deploys (Lane A’s orchestrator, 2026-11-05)', () => {
  it('puts staging on db.t4g.medium, production’s class, and dev on db.t4g.small', () => {
    expect(Object.fromEntries(ENVIRONMENTS.map((environment) => [environment, environmentSettings(environment).database.instanceType.toString()]))).toEqual({
      dev: 't4g.small',
      staging: 't4g.medium',
      production: 't4g.medium',
    });
  });

  it('deploys dev’s worker stop-first (minimum healthy 0, maximum 100) and every other service, in every environment, new-before-old', () => {
    expect(STOP_FIRST_DEPLOYMENT).toEqual({ minHealthyPercent: 0, maxHealthyPercent: 100 });
    expect(ROLLING_DEPLOYMENT).toEqual({ minHealthyPercent: 100, maxHealthyPercent: 200 });
    for (const environment of ENVIRONMENTS) {
      const { compute } = environmentSettings(environment);
      for (const service of ['web', 'worker', 'platform', 'screening'] as const) {
        expect(compute[service].deployment, `${environment} ${service}`).toEqual(environment === 'dev' && service === 'worker' ? STOP_FIRST_DEPLOYMENT : ROLLING_DEPLOYMENT);
      }
    }
  });

  it('refuses dev on db.t4g.small while its worker deploys new-before-old, and passes it once the worker deploys stop-first', () => {
    const rolling = withWorkerDeployment(environmentSettings('dev'), ROLLING_DEPLOYMENT);
    expect(connectionBudget(rolling)).toMatchObject({ maxConnections: 168, available: 163, worstCase: 165, fits: false });
    expect(() => checkedConnectionBudget(rolling)).toThrow(
      'the dev database (db.t4g.small) gives the application logins 163 connections (max_connections 168 less 5 reserved), and its tasks can hold 165 at once ' +
        "(web 2 x 21, worker 2 x 25, platform 2 x 12, screening 2 x 19, migration 1 x 1, reserve 10): over budget. Move the environment's database up a class, " +
        'or lower a pool or a task count (infra/lib/connections.ts; docs/adr/0083).',
    );
    const budget = checkedConnectionBudget(environmentSettings('dev'));
    expect(budget).toMatchObject({ instanceType: 't4g.small', maxConnections: 168, available: 163, worstCase: 140, fits: true });
    expect(budget.lines.find((entry) => entry.service === 'worker')).toMatchObject({ tasks: 1, perTask: 25, connections: 25 });
  });
});

describe('a configuration over budget', () => {
  it('is refused, naming each figure: staging on its former db.t4g.small cannot hold what its tasks can hold during a deploy', () => {
    const settings = withClass(environmentSettings('staging'), ec2.InstanceSize.SMALL);
    expect(() => checkedConnectionBudget(settings)).toThrow(ConnectionBudgetError);
    expect(() => checkedConnectionBudget(settings)).toThrow(
      'the staging database (db.t4g.small) gives the application logins 163 connections (max_connections 168 less 5 reserved), and its tasks can hold 165 at once ' +
        "(web 2 x 21, worker 2 x 25, platform 2 x 12, screening 2 x 19, migration 1 x 1, reserve 10): over budget. Move the environment's database up a class, " +
        'or lower a pool or a task count (infra/lib/connections.ts; docs/adr/0083).',
    );
  });

  it('is refused for dev’s former db.t4g.micro, which cannot hold even one task of each service', () => {
    const settings = withClass(environmentSettings('dev'), ec2.InstanceSize.MICRO);
    expect(connectionBudget(settings)).toMatchObject({ maxConnections: 56, available: 51, worstCase: 140, fits: false });
    expect(() => checkedConnectionBudget(settings)).toThrow(/the dev database \(db\.t4g\.micro\) gives the application logins 51 connections/);
  });

  it('keeps ten connections in reserve, alarms at 80% of max_connections, and counts each service’s deploy maximum', () => {
    expect(DATABASE_CONNECTIONS_ALARM_PERCENT).toBe(80);
    expect(RESERVE_CONNECTIONS).toBe(10);
    expect(mostTasks({ cpu: 512, memoryMiB: 1024, desiredCount: 3, deployment: ROLLING_DEPLOYMENT })).toBe(6);
    expect(mostTasks({ cpu: 512, memoryMiB: 1024, desiredCount: 3, deployment: STOP_FIRST_DEPLOYMENT })).toBe(3);
  });
});
