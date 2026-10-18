import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Where the local identity provider keeps what Cognito keeps in production: password hashes, TOTP
 * secrets and hardware-key credentials, keyed by subject. Never the database: in production the
 * database holds no credential either. Development and tests only; synthetic accounts only.
 */

export interface DevCredential {
  /** The credential ID, base64url. */
  readonly id: string;
  /** The COSE public key, base64url. */
  readonly publicKey: string;
  readonly counter: number;
  readonly transports?: readonly string[];
}

export interface DevUserRecord {
  readonly sub: string;
  readonly email: string;
  readonly passwordHash: string;
  /** A temporary password from an invitation: the first sign-in sets a new one. */
  readonly temporary: boolean;
  readonly totpSecret: string | null;
  /** The last TOTP step accepted, so a code is never accepted twice. */
  readonly totpLastStep: number;
  readonly credentials: readonly DevCredential[];
}

export interface DevCredentialStore {
  byEmail(email: string): Promise<DevUserRecord | undefined>;
  bySub(sub: string): Promise<DevUserRecord | undefined>;
  /** Adds or replaces the record for its subject. */
  put(record: DevUserRecord): Promise<void>;
  /** Replaces the subject's record with what `change` returns; undefined when there is none. */
  update(sub: string, change: (record: DevUserRecord) => DevUserRecord): Promise<DevUserRecord | undefined>;
}

function sameEmail(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Operations over a list of records, shared by both stores. */
abstract class ListStore implements DevCredentialStore {
  private queue: Promise<unknown> = Promise.resolve();

  protected abstract load(): DevUserRecord[];
  protected abstract save(records: DevUserRecord[]): void;

  /** Runs one operation at a time, so read-modify-write never interleaves. */
  private serial<T>(operation: () => T): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }

  byEmail(email: string): Promise<DevUserRecord | undefined> {
    return this.serial(() => this.load().find((record) => sameEmail(record.email, email)));
  }

  bySub(sub: string): Promise<DevUserRecord | undefined> {
    return this.serial(() => this.load().find((record) => record.sub === sub));
  }

  put(record: DevUserRecord): Promise<void> {
    return this.serial(() => {
      this.save([...this.load().filter((existing) => existing.sub !== record.sub), record]);
    });
  }

  update(sub: string, change: (record: DevUserRecord) => DevUserRecord): Promise<DevUserRecord | undefined> {
    return this.serial(() => {
      const records = this.load();
      const index = records.findIndex((record) => record.sub === sub);
      const current = records[index];
      if (current === undefined) {
        return undefined;
      }
      const changed = change(current);
      records[index] = changed;
      this.save(records);
      return changed;
    });
  }
}

export class MemoryDevStore extends ListStore {
  private records: DevUserRecord[] = [];

  protected load(): DevUserRecord[] {
    return [...this.records];
  }

  protected save(records: DevUserRecord[]): void {
    this.records = records;
  }
}

interface StoreFile {
  readonly version: 1;
  readonly users: DevUserRecord[];
}

/** A JSON file, written atomically (the seed writes it; the dev and e2e servers read and update it). */
export class FileDevStore extends ListStore {
  constructor(private readonly file: string) {
    super();
  }

  protected load(): DevUserRecord[] {
    let text: string;
    try {
      text = readFileSync(this.file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
    const parsed = JSON.parse(text) as StoreFile;
    return [...parsed.users];
  }

  protected save(records: DevUserRecord[]): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.${String(process.pid)}.tmp`;
    const body: StoreFile = { version: 1, users: records };
    writeFileSync(temporary, `${JSON.stringify(body, null, 2)}\n`, { mode: 0o600 });
    renameSync(temporary, this.file);
  }
}
