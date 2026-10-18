import { randomBytes } from 'node:crypto';

import {
  type DBInstance,
  type DBSnapshot,
  DeleteDBInstanceCommand,
  DescribeDBInstancesCommand,
  DescribeDBSnapshotsCommand,
  ModifyDBInstanceCommand,
  type RDSClient,
  RestoreDBInstanceFromDBSnapshotCommand,
} from '@aws-sdk/client-rds';

import type { RestoredInstance, SnapshotRestorer } from './restore-drill';

/**
 * The staging and production SnapshotRestorer: the source instance's latest available automated
 * snapshot is restored to a single-AZ scratch instance in the database subnets (never public), polled
 * until available, and deleted afterwards without a final snapshot.
 *
 * The restored instance keeps the snapshot's master user, whose password rotates every 30 days and
 * so may not be the one the snapshot holds. The restorer therefore sets a one-time random password on
 * the scratch instance (ModifyDBInstance), waits until it is applied and connects with it: the drill
 * never reads the production owner login's secret, and the password lives only as long as the
 * scratch instance (infra/lib/constructs/operator-role.ts grants exactly these calls on that
 * instance).
 */
export interface RdsSnapshotRestorerOptions {
  readonly client: Pick<RDSClient, 'send'>;
  readonly sourceInstanceId: string;
  /** The scratch instance's identifier; one drill runs at a time. */
  readonly scratchInstanceId: string;
  readonly instanceClass: string;
  readonly subnetGroupName: string;
  readonly securityGroupIds: readonly string[];
  /** The one-time master password; 32 random URL-safe characters by default. */
  readonly password?: () => string;
  readonly pollMs?: number;
  readonly timeoutMs?: number;
  /** How long to wait for a password change RDS never reports as pending before trusting it. */
  readonly settleMs?: number;
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

/** The connection the drill uses: the master user, the one-time password, TLS required. */
export function scratchDatabaseUrl(instance: { readonly address: string; readonly port: number; readonly user: string; readonly database: string }, password: string): string {
  const url = new URL(`postgres://${instance.address}:${String(instance.port)}/`);
  url.username = instance.user;
  url.password = password;
  url.pathname = `/${instance.database}`;
  url.searchParams.set('sslmode', 'require');
  return url.toString();
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

  private async describe(): Promise<DBInstance | undefined> {
    const { DBInstances } = await this.options.client.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: this.options.scratchInstanceId }));
    return DBInstances?.[0];
  }

  /** Polls until `done` says the instance is ready, or the timeout passes. */
  private async waitFor(what: string, done: (instance: DBInstance | undefined, elapsedMs: number) => boolean): Promise<DBInstance> {
    const sleep = this.options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const now = this.options.now ?? Date.now;
    const started = now();
    const deadline = started + (this.options.timeoutMs ?? 2 * 3_600_000);
    for (;;) {
      const instance = await this.describe();
      if (instance !== undefined && done(instance, now() - started)) {
        return instance;
      }
      if (now() >= deadline) {
        throw new RdsRestoreError(`the scratch instance did not become ${what} in time`);
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
    try {
      const available = (instance: DBInstance | undefined) => instance?.DBInstanceStatus === 'available' && instance.Endpoint?.Address !== undefined && instance.Endpoint.Port !== undefined;
      const restored = await this.waitFor('available', available);
      const password = (this.options.password ?? (() => randomBytes(24).toString('base64url')))();
      await this.options.client.send(new ModifyDBInstanceCommand({ DBInstanceIdentifier: this.options.scratchInstanceId, MasterUserPassword: password, ApplyImmediately: true }));
      // Applied once RDS has shown the change (pending, or resetting) and is available again; a change
      // it never shows is trusted after the settling time.
      let seen = false;
      const settleMs = this.options.settleMs ?? 300_000;
      const ready = await this.waitFor('available with its new password', (instance, elapsed) => {
        const pending = instance?.PendingModifiedValues?.MasterUserPassword !== undefined;
        seen ||= pending || instance?.DBInstanceStatus !== 'available';
        return available(instance) && !pending && (seen || elapsed >= settleMs);
      });
      const user = ready.MasterUsername ?? restored.MasterUsername;
      const database = ready.DBName ?? restored.DBName;
      if (user === undefined || database === undefined) {
        throw new RdsRestoreError('the scratch instance names no master user or database');
      }
      return {
        snapshotRef: snapshotId,
        targetRef: this.options.scratchInstanceId,
        databaseUrl: scratchDatabaseUrl({ address: ready.Endpoint?.Address ?? '', port: ready.Endpoint?.Port ?? 0, user, database }, password),
        destroy: () => this.destroy(),
      };
    } catch (error) {
      await this.destroy();
      throw error;
    }
  }
}
