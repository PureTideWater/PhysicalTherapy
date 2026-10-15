import { DeleteDBInstanceCommand, DescribeDBInstancesCommand, DescribeDBSnapshotsCommand, ModifyDBInstanceCommand, RestoreDBInstanceFromDBSnapshotCommand } from '@aws-sdk/client-rds';
import { describe, expect, it } from 'vitest';

import { clientMajor } from './pg-dump-restorer';
import { RdsRestoreError, RdsSnapshotRestorer, latestSnapshot, scratchDatabaseUrl } from './rds-restorer';

type Answer = (command: unknown) => unknown;

function rds(answer: Answer) {
  const sent: unknown[] = [];
  return {
    sent,
    client: {
      send: (command: unknown) => {
        sent.push(command);
        try {
          return Promise.resolve(answer(command));
        } catch (error) {
          return Promise.reject(error instanceof Error ? error : new Error('failed'));
        }
      },
    } as never,
  };
}

const SNAPSHOTS = [
  { DBSnapshotIdentifier: 'rds:tp-prod-2026-10-13', Status: 'available', SnapshotCreateTime: new Date('2026-10-13T04:00:00Z') },
  { DBSnapshotIdentifier: 'rds:tp-prod-2026-10-15', Status: 'creating', SnapshotCreateTime: new Date('2026-10-15T04:00:00Z') },
  { DBSnapshotIdentifier: 'rds:tp-prod-2026-10-14', Status: 'available', SnapshotCreateTime: new Date('2026-10-14T04:00:00Z') },
];

const options = {
  sourceInstanceId: 'tp-production',
  scratchInstanceId: 'tp-restore-drill',
  instanceClass: 'db.t4g.medium',
  subnetGroupName: 'tp-data',
  securityGroupIds: ['sg-database'],
  password: () => 'one-time-synthetic',
  pollMs: 1,
  sleep: () => Promise.resolve(),
};

const READY = { DBInstanceStatus: 'available', Endpoint: { Address: 'drill.internal', Port: 5432 }, MasterUsername: 'tp_owner_login', DBName: 'tp' };

describe('latestSnapshot', () => {
  it('picks the newest available snapshot', () => {
    expect(latestSnapshot(SNAPSHOTS)?.DBSnapshotIdentifier).toBe('rds:tp-prod-2026-10-14');
    expect(latestSnapshot([{ Status: 'available' }])).toBeUndefined();
  });
});

describe('RdsSnapshotRestorer (mocked client)', () => {
  it('restores the latest automated snapshot to a private single-AZ scratch instance, sets a one-time password, waits for it, and deletes it after', async () => {
    const statuses = ['creating', 'creating', 'available', 'available', 'resetting-master-credentials', 'available'];
    let polls = 0;
    const fake = rds((command) => {
      if (command instanceof DescribeDBSnapshotsCommand) {
        return command.input.Marker === undefined ? { DBSnapshots: SNAPSHOTS.slice(0, 1), Marker: 'page-2' } : { DBSnapshots: SNAPSHOTS.slice(1) };
      }
      if (command instanceof DescribeDBInstancesCommand) {
        const status = statuses[polls] ?? 'available';
        polls += 1;
        // The first poll after the change still shows it pending.
        return { DBInstances: [{ ...READY, DBInstanceStatus: status, ...(polls === 4 ? { PendingModifiedValues: { MasterUserPassword: '****' } } : {}) }] };
      }
      return {};
    });
    const restored = await new RdsSnapshotRestorer({ client: fake.client, ...options }).restoreLatest();
    expect(restored).toMatchObject({
      snapshotRef: 'rds:tp-prod-2026-10-14',
      targetRef: 'tp-restore-drill',
      databaseUrl: 'postgres://tp_owner_login:one-time-synthetic@drill.internal:5432/tp?sslmode=require',
    });
    const restore = fake.sent.find((command) => command instanceof RestoreDBInstanceFromDBSnapshotCommand) as RestoreDBInstanceFromDBSnapshotCommand;
    expect(restore.input).toEqual({
      DBInstanceIdentifier: 'tp-restore-drill',
      DBSnapshotIdentifier: 'rds:tp-prod-2026-10-14',
      DBInstanceClass: 'db.t4g.medium',
      DBSubnetGroupName: 'tp-data',
      VpcSecurityGroupIds: ['sg-database'],
      MultiAZ: false,
      PubliclyAccessible: false,
      DeletionProtection: false,
      Tags: [{ Key: 'purpose', Value: 'restore-drill' }],
    });
    const modify = fake.sent.find((command) => command instanceof ModifyDBInstanceCommand) as ModifyDBInstanceCommand;
    expect(modify.input).toEqual({ DBInstanceIdentifier: 'tp-restore-drill', MasterUserPassword: 'one-time-synthetic', ApplyImmediately: true });
    expect((fake.sent[0] as DescribeDBSnapshotsCommand).input).toEqual({ DBInstanceIdentifier: 'tp-production', SnapshotType: 'automated', Marker: undefined });
    expect(polls).toBe(6);
    await restored.destroy();
    expect((fake.sent.at(-1) as DeleteDBInstanceCommand).input).toEqual({ DBInstanceIdentifier: 'tp-restore-drill', SkipFinalSnapshot: true, DeleteAutomatedBackups: true });
  });

  it('trusts a password change RDS never shows once the settling time has passed', async () => {
    let clock = 0;
    const fake = rds((command) => (command instanceof DescribeDBSnapshotsCommand ? { DBSnapshots: SNAPSHOTS } : command instanceof DescribeDBInstancesCommand ? { DBInstances: [READY] } : {}));
    const restorer = new RdsSnapshotRestorer({
      client: fake.client,
      ...options,
      settleMs: 100,
      now: () => clock,
      sleep: () => {
        clock += 60;
        return Promise.resolve();
      },
    });
    await expect(restorer.restoreLatest()).resolves.toMatchObject({ targetRef: 'tp-restore-drill' });
    expect(clock).toBe(120);
  });

  it('deletes the scratch instance when it names no master user', async () => {
    const fake = rds((command) =>
      command instanceof DescribeDBSnapshotsCommand ? { DBSnapshots: SNAPSHOTS } : command instanceof DescribeDBInstancesCommand ? { DBInstances: [{ ...READY, MasterUsername: undefined }] } : {},
    );
    await expect(new RdsSnapshotRestorer({ client: fake.client, ...options, settleMs: 0 }).restoreLatest()).rejects.toThrow(/names no master user/);
    expect(fake.sent.at(-1)).toBeInstanceOf(DeleteDBInstanceCommand);
  });

  it('refuses a source without an available snapshot', async () => {
    const fake = rds(() => ({}));
    await expect(new RdsSnapshotRestorer({ client: fake.client, ...options }).restoreLatest()).rejects.toThrow(new RdsRestoreError('the source instance has no available automated snapshot'));
  });

  it('deletes a scratch instance that never becomes available', async () => {
    let clock = 0;
    const fake = rds((command) => (command instanceof DescribeDBSnapshotsCommand ? { DBSnapshots: SNAPSHOTS } : command instanceof DescribeDBInstancesCommand ? {} : {}));
    const restorer = new RdsSnapshotRestorer({
      client: fake.client,
      ...options,
      timeoutMs: 100,
      now: () => clock,
      sleep: () => {
        clock += 60;
        return Promise.resolve();
      },
    });
    await expect(restorer.restoreLatest()).rejects.toThrow(/did not become available/);
    expect(fake.sent.at(-1)).toBeInstanceOf(DeleteDBInstanceCommand);
  });

  it('waits with the default timer and limits, and makes its own password, when none are given', async () => {
    let polls = 0;
    const fake = rds((command) => {
      if (command instanceof DescribeDBSnapshotsCommand) {
        return { DBSnapshots: SNAPSHOTS };
      }
      if (!(command instanceof DescribeDBInstancesCommand)) {
        return {};
      }
      polls += 1;
      return { DBInstances: [{ ...READY, Endpoint: { Address: 'a', Port: 1 }, DBInstanceStatus: polls === 2 ? 'modifying' : 'available' }] };
    });
    const { pollMs: _poll, sleep: _sleep, password: _password, ...defaults } = options;
    const restored = await new RdsSnapshotRestorer({ client: fake.client, ...defaults, pollMs: 1 }).restoreLatest();
    expect(restored.databaseUrl).toMatch(/^postgres:\/\/tp_owner_login:[A-Za-z0-9_-]{32}@a:1\/tp\?sslmode=require$/);
  });
});

describe('scratchDatabaseUrl', () => {
  it('escapes the user and password and requires TLS', () => {
    expect(scratchDatabaseUrl({ address: 'h', port: 5432, user: 'u@x', database: 'tp' }, 'p/q')).toBe('postgres://u%40x:p%2Fq@h:5432/tp?sslmode=require');
  });
});

describe('clientMajor', () => {
  it('reads the major version of the client tools', () => {
    expect(clientMajor('pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)')).toBe(16);
    expect(clientMajor('pg_dump (PostgreSQL) 18.0')).toBe(18);
    expect(() => clientMajor('command not found')).toThrow(/version/);
  });
});
