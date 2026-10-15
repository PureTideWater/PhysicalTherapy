import { DeleteDBInstanceCommand, DescribeDBInstancesCommand, DescribeDBSnapshotsCommand, RestoreDBInstanceFromDBSnapshotCommand } from '@aws-sdk/client-rds';
import { describe, expect, it } from 'vitest';

import { clientMajor } from './pg-dump-restorer';
import { RdsRestoreError, RdsSnapshotRestorer, latestSnapshot } from './rds-restorer';

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
  databaseUrl: ({ address, port }: { address: string; port: number }) => `postgres://drill@${address}:${String(port)}/tp`,
  pollMs: 1,
  sleep: () => Promise.resolve(),
};

describe('latestSnapshot', () => {
  it('picks the newest available snapshot', () => {
    expect(latestSnapshot(SNAPSHOTS)?.DBSnapshotIdentifier).toBe('rds:tp-prod-2026-10-14');
    expect(latestSnapshot([{ Status: 'available' }])).toBeUndefined();
  });
});

describe('RdsSnapshotRestorer (mocked client)', () => {
  it('restores the latest automated snapshot to a private single-AZ scratch instance, waits for it, and deletes it after', async () => {
    let polls = 0;
    const fake = rds((command) => {
      if (command instanceof DescribeDBSnapshotsCommand) {
        return command.input.Marker === undefined ? { DBSnapshots: SNAPSHOTS.slice(0, 1), Marker: 'page-2' } : { DBSnapshots: SNAPSHOTS.slice(1) };
      }
      if (command instanceof DescribeDBInstancesCommand) {
        polls += 1;
        return polls < 3 ? { DBInstances: [{ DBInstanceStatus: 'creating' }] } : { DBInstances: [{ DBInstanceStatus: 'available', Endpoint: { Address: 'drill.internal', Port: 5432 } }] };
      }
      return {};
    });
    const restored = await new RdsSnapshotRestorer({ client: fake.client, ...options }).restoreLatest();
    expect(restored).toMatchObject({ snapshotRef: 'rds:tp-prod-2026-10-14', targetRef: 'tp-restore-drill', databaseUrl: 'postgres://drill@drill.internal:5432/tp' });
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
    expect((fake.sent[0] as DescribeDBSnapshotsCommand).input).toEqual({ DBInstanceIdentifier: 'tp-production', SnapshotType: 'automated', Marker: undefined });
    expect(polls).toBe(3);
    await restored.destroy();
    expect((fake.sent.at(-1) as DeleteDBInstanceCommand).input).toEqual({ DBInstanceIdentifier: 'tp-restore-drill', SkipFinalSnapshot: true, DeleteAutomatedBackups: true });
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

  it('waits with the default timer and limits when none are given', async () => {
    const fake = rds((command) =>
      command instanceof DescribeDBSnapshotsCommand ? { DBSnapshots: SNAPSHOTS } : { DBInstances: [{ DBInstanceStatus: 'available', Endpoint: { Address: 'a', Port: 1 } }] },
    );
    const { pollMs: _poll, sleep: _sleep, ...defaults } = options;
    await expect(new RdsSnapshotRestorer({ client: fake.client, ...defaults }).restoreLatest()).resolves.toMatchObject({ databaseUrl: 'postgres://drill@a:1/tp' });
  });
});

describe('clientMajor', () => {
  it('reads the major version of the client tools', () => {
    expect(clientMajor('pg_dump (PostgreSQL) 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)')).toBe(16);
    expect(clientMajor('pg_dump (PostgreSQL) 18.0')).toBe(18);
    expect(() => clientMajor('command not found')).toThrow(/version/);
  });
});
