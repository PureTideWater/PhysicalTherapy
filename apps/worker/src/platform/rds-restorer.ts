import {
  type DBSnapshot,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  DescribeDBSnapshotsCommand,
  type RDSClient,
  RestoreDBInstanceFromDBSnapshotCommand,
} from '@aws-sdk/client-rds';

import type { RestoredInstance, SnapshotRestorer } from './restore-drill';

/**
 * The staging and production SnapshotRestorer: the source instance's latest available automated
 * snapshot is restored to a single-AZ scratch instance in the database subnets (never public), polled
 * until available, and deleted afterwards without a final snapshot. The restored instance keeps the
 * snapshot's master credentials, from which `databaseUrl` builds the connection.
 */
export interface RdsSnapshotRestorerOptions {
  readonly client: Pick<RDSClient, 'send'>;
  readonly sourceInstanceId: string;
  /** The scratch instance's identifier; one drill runs at a time. */
  readonly scratchInstanceId: string;
  readonly instanceClass: string;
  readonly subnetGroupName: string;
  readonly securityGroupIds: readonly string[];
  readonly databaseUrl: (endpoint: { readonly address: string; readonly port: number }) => string;
  readonly pollMs?: number;
  readonly timeoutMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => number;
}

export class RdsRestoreError extends Error {
  override readonly name = 'RdsRestoreError';
}

/** The newest available snapshot, by creation time. */
export function latestSnapshot(snapshots: readonly DBSnapshot[]): DBSnapshot | undefined {
  return snapshots
    .filter((snapshot) => snapshot.Status === 'available' && snapshot.DBSnapshotIdentifier !== undefined && snapshot.SnapshotCreateTime !== undefined)
    .sort((a, b) => (b.SnapshotCreateTime?.getTime() ?? 0) - (a.SnapshotCreateTime?.getTime() ?? 0))[0];
}

export class RdsSnapshotRestorer implements SnapshotRestorer {
  constructor(private readonly options: RdsSnapshotRestorerOptions) {}

  private async snapshots(): Promise<DBSnapshot[]> {
    const found: DBSnapshot[] = [];
    let marker: string | undefined;
    do {
      const page = await this.options.client.send(
        new DescribeDBSnapshotsCommand({ DBInstanceIdentifier: this.options.sourceInstanceId, SnapshotType: 'automated', Marker: marker }),
      );
      found.push(...(page.DBSnapshots ?? []));
      marker = page.Marker;
    } while (marker !== undefined);
    return found;
  }

  private async destroy(): Promise<void> {
    await this.options.client.send(new DeleteDBInstanceCommand({ DBInstanceIdentifier: this.options.scratchInstanceId, SkipFinalSnapshot: true, DeleteAutomatedBackups: true }));
  }

  private async waitUntilAvailable(): Promise<{ address: string; port: number }> {
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const now = this.options.now ?? Date.now;
    const deadline = now() + (this.options.timeoutMs ?? 2 * 3_600_000);
    for (;;) {
      const { DBInstances } = await this.options.client.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: this.options.scratchInstanceId }));
      const instance = DBInstances?.[0];
      const address = instance?.Endpoint?.Address;
      const port = instance?.Endpoint?.Port;
      if (instance?.DBInstanceStatus === 'available' && address !== undefined && port !== undefined) {
        return { address, port };
      }
      if (now() >= deadline) {
        throw new RdsRestoreError('the scratch instance did not become available in time');
      }
      await sleep(this.options.pollMs ?? 30_000);
    }
  }

  async restoreLatest(): Promise<RestoredInstance> {
    const snapshot = latestSnapshot(await this.snapshots());
    const snapshotId = snapshot?.DBSnapshotIdentifier;
    if (snapshotId === undefined) {
      throw new RdsRestoreError('the source instance has no available automated snapshot');
    }
    await this.options.client.send(
      new RestoreDBInstanceFromDBSnapshotCommand({
        DBInstanceIdentifier: this.options.scratchInstanceId,
        DBSnapshotIdentifier: snapshotId,
        DBInstanceClass: this.options.instanceClass,
        DBSubnetGroupName: this.options.subnetGroupName,
        VpcSecurityGroupIds: [...this.options.securityGroupIds],
        MultiAZ: false,
        PubliclyAccessible: false,
        DeletionProtection: false,
        Tags: [{ Key: 'purpose', Value: 'restore-drill' }],
      }),
    );
    let endpoint: { address: string; port: number };
    try {
      endpoint = await this.waitUntilAvailable();
    } catch (error) {
      await this.destroy();
      throw error;
    }
    return { snapshotRef: snapshotId, targetRef: this.options.scratchInstanceId, databaseUrl: this.options.databaseUrl(endpoint), destroy: () => this.destroy() };
  }
}
