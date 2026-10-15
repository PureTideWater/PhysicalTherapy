import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { type DatabaseClient, databaseClient } from '@tp/db';

import type { RestoredInstance, SnapshotRestorer } from './restore-drill';

/**
 * The local SnapshotRestorer for development and tests: the "latest snapshot" is a pg_dump of the
 * source database taken now (custom format), restored with pg_restore into a new scratch database on
 * the same server, which destroy() drops along with the dump. pg_dump refuses a server newer than
 * itself, so the client tools' major version is checked against the server's first.
 */
export interface PgDumpRestorerOptions {
  /** The database to snapshot. */
  readonly sourceUrl: string;
  /** A login on the same server that may CREATE DATABASE and restore owners (a superuser locally). */
  readonly adminUrl: string;
  /** Where the dump is written while the drill runs. */
  readonly workDir: string;
  /** The directory holding pg_dump and pg_restore; PATH when omitted. */
  readonly binDir?: string;
}

export class RestoreToolError extends Error {
  override readonly name = 'RestoreToolError';
}

/** A libpq connection: the URL without its password, and the password for PGPASSWORD (kept off the command line). */
function libpq(url: string, database?: string): { uri: string; password: string } {
  const parsed = new URL(url);
  const password = decodeURIComponent(parsed.password);
  parsed.password = '';
  if (database !== undefined) {
    parsed.pathname = `/${database}`;
  }
  return { uri: parsed.toString(), password };
}

function run(binary: string, args: readonly string[], password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { env: { ...process.env, PGPASSWORD: password }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString('utf8');
    });
    // stderr can quote SQL; it is drained and dropped, and the error names the tool and its exit code only.
    child.stderr.resume();
    child.on('error', () => {
      reject(new RestoreToolError(`${path.basename(binary)} could not be started`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new RestoreToolError(`${path.basename(binary)} exited with code ${String(code)}`));
      }
    });
  });
}

/** The major version in `pg_dump --version` output ("pg_dump (PostgreSQL) 16.15 ..."). */
export function clientMajor(versionOutput: string): number {
  const match = /\(PostgreSQL\)\s+(\d+)/.exec(versionOutput);
  if (match === null) {
    throw new RestoreToolError('could not read the client tools’ version');
  }
  return Number.parseInt(match[1] ?? '', 10);
}

async function withClient<T>(url: string, use: (client: DatabaseClient) => Promise<T>): Promise<T> {
  const client = databaseClient(url);
  await client.connect();
  try {
    return await use(client);
  } finally {
    await client.end();
  }
}

export class PgDumpRestorer implements SnapshotRestorer {
  constructor(private readonly options: PgDumpRestorerOptions) {}

  private tool(name: 'pg_dump' | 'pg_restore'): string {
    return this.options.binDir === undefined ? name : path.join(this.options.binDir, name);
  }

  /** Whether these client tools can dump the source server; the reason when they cannot. */
  async compatibility(): Promise<{ ok: true } | { ok: false; reason: string }> {
    let client: number;
    try {
      client = clientMajor(await run(this.tool('pg_dump'), ['--version'], ''));
    } catch (error) {
      return { ok: false, reason: (error as Error).message };
    }
    const server = await withClient(this.options.sourceUrl, async (connection) => {
      const { rows } = await connection.query<{ version: string }>("SELECT current_setting('server_version_num') AS version");
      return Math.floor(Number.parseInt(rows[0]?.version ?? '0', 10) / 10_000);
    });
    return client >= server ? { ok: true } : { ok: false, reason: `pg_dump ${String(client)} cannot dump a PostgreSQL ${String(server)} server; point PG_BIN_DIR at PostgreSQL ${String(server)} client tools` };
  }

  async restoreLatest(): Promise<RestoredInstance> {
    const compatible = await this.compatibility();
    if (!compatible.ok) {
      throw new RestoreToolError(compatible.reason);
    }
    await mkdir(this.options.workDir, { recursive: true });
    const snapshot = `snapshot-${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}-${randomUUID().slice(0, 8)}.dump`;
    const dump = path.join(this.options.workDir, snapshot);
    const scratch = `tp_restore_${randomUUID().replaceAll('-', '')}`;
    const source = libpq(this.options.sourceUrl);
    const admin = libpq(this.options.adminUrl);
    const target = libpq(this.options.adminUrl, scratch);
    const destroy = async () => {
      await withClient(this.options.adminUrl, (client) => client.query(`DROP DATABASE IF EXISTS ${scratch} WITH (FORCE)`));
      await rm(dump, { force: true });
    };
    try {
      await run(this.tool('pg_dump'), ['--format=custom', '--file', dump, '--dbname', source.uri], source.password);
      await withClient(this.options.adminUrl, (client) => client.query(`CREATE DATABASE ${scratch}`));
      await run(this.tool('pg_restore'), ['--exit-on-error', '--dbname', target.uri, dump], admin.password);
    } catch (error) {
      await destroy();
      throw error;
    }
    const url = new URL(this.options.adminUrl);
    url.pathname = `/${scratch}`;
    return { snapshotRef: `pg_dump:${snapshot}`, targetRef: `database:${scratch}`, databaseUrl: url.toString(), destroy };
  }
}
