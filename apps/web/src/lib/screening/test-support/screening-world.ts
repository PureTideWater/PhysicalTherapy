import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';

import { type DatabaseClient, type DatabasePool, LocalKeyProvider, databaseClient, openPool, readDatabaseUrl } from '@tp/db';
import { type MigratedDatabase, addMembership, createMigratedDatabase, createOrganization, createUser, endPool } from '@tp/db/testing';
import { cents } from '@tp/money';
import { createLogger } from '@tp/observability';
import { loadRelease } from '@tp/rules/loader';
import { type MailMessage, MemoryMailSender, type SweepResult, sweepScreeningRuns } from '@tp/worker/runtime';
import { SCREENING_MIN_CLAIM_LINES, type ScreeningPayerProduct, type ScreeningRow, encodeScreeningRows } from '@tp/worker/screening';

import { DevAuthProvider } from '../../auth/dev-provider';
import { MemoryDevStore } from '../../auth/dev-store';
import { Sealer } from '../../auth/seal';
import type { CookieJar, Outcome, Route, RouteRequest } from '../../http/route';
import { type Services, createServices } from '../../server/services';
import { type JobQueue, MemoryQueue } from '../../uploads/queue';

/**
 * Test support for the free screening's routes (docs/adr/0062), against a scratch database with SYNTHETIC release
 * 900001 loaded and a place-of-service split a contract specialist approved: services as the web app builds them
 * (a memory queue), the routes called as a browser on the application's page would call them, the minute's sweep
 * run as the platform worker runs it, and the emails it sends kept in memory. Synthetic data only: invented
 * practices at the SYNTHETIC ZIPs 00011 and 00012, addresses at synthetic.test domains.
 */

export const SCREENING_ORIGIN = 'http://localhost:3100';
export const SCREENING_SPLIT = { '11': 'non_facility', '22': 'facility' } as const;
const RELEASE_DIR = path.resolve(import.meta.dirname, '../../../../../../fixtures/synthetic/rules/release-synth-900001');

/** The header a clean upload has, in the format's own spellings. */
export const SCREENING_HEADERS = ['procedure_code', 'modifiers', 'units', 'place_of_service', 'payer_product', 'service_band', 'allowed_total', 'claim_count'] as const;

class MemoryJar implements CookieJar {
  private readonly values: Map<string, string>;
  constructor(initial: Readonly<Record<string, string>> = {}) {
    this.values = new Map(Object.entries(initial));
  }
  get(name: string) {
    return this.values.get(name);
  }
  set(name: string, value: string) {
    this.values.set(name, value);
  }
  delete(name: string) {
    this.values.delete(name);
  }
}

/** A row of totals, written short: 11 claim lines (the fewest a row may sum) unless told otherwise. */
export function screeningRow(
  procedureCode: string,
  payerProduct: ScreeningPayerProduct,
  options: { readonly modifiers?: readonly string[]; readonly units?: number; readonly place?: string; readonly band?: string; readonly allowedCents?: bigint; readonly claims?: number } = {},
): ScreeningRow {
  return {
    procedureCode,
    modifiers: [...(options.modifiers ?? [])].sort(),
    units: options.units ?? 1,
    placeOfService: options.place ?? '11',
    payerProduct,
    serviceBand: options.band ?? '2026-Q1',
    allowedCents: cents(options.allowedCents ?? 10_000n),
    claimCount: options.claims ?? SCREENING_MIN_CLAIM_LINES,
  };
}

/** A small clean upload: priced, contract-required and not-screened rows, each of at least 11 claim lines. */
export const SAMPLE_ROWS: readonly ScreeningRow[] = [
  screeningRow('97110', 'medicare_ffs', { modifiers: ['GP'], units: 2, allowedCents: 44_000n, claims: 11 }),
  screeningRow('97110', 'ma_noncontracted', { modifiers: ['GP'], units: 2, band: '2026-Q2', allowedCents: 54_000n, claims: 12 }),
  screeningRow('97140', 'medicare_ffs', { modifiers: ['CQ', 'GP'], place: '22', band: '2026-Q3', allowedCents: 11_000n, claims: 11 }),
  screeningRow('97530', 'ma_contracted', { units: 3, allowedCents: 120_000n, claims: 12 }),
  screeningRow('97112', 'commercial', { allowedCents: 55_000n, claims: 11 }),
  screeningRow('97116', 'medicaid', { allowedCents: 33_000n, claims: 11 }),
  screeningRow('97035', 'other', { allowedCents: 7_700n, claims: 11 }),
];

export interface SubmitOverrides {
  readonly practiceName?: string;
  readonly state?: string;
  readonly zip?: string;
  readonly contactEmail?: string;
  readonly headers?: readonly string[];
  readonly rows?: readonly ScreeningRow[] | string;
  readonly rowCount?: string;
  /** What the browser says it left out (rows of fewer than 11 claim lines); none unless given. */
  readonly leftOut?: { readonly rows: number | string; readonly claimLines: number | string; readonly allowedCents: bigint | string };
}

/**
 * A practice name of its own (letters only, so the form's patient-information check passes it): a practice keeps one
 * accepted screening at a time, so a test's screening replaces another's only when the test gives the same name.
 */
export function practiceName(): string {
  const letters = randomUUID()
    .replace(/-/g, '')
    .slice(0, 10)
    .replace(/[0-9]/g, (digit) => 'ghijklmnop'.charAt(Number(digit)));
  return `Synthetic Therapy Group ${letters}`;
}

/**
 * The form the upload page sends for these rows: no byte of the file and no hash of it; its header cells, count and
 * canonical rows, and the three numbers of what it left out.
 */
export function submitInput(overrides: SubmitOverrides = {}): Record<string, string> {
  const rows = overrides.rows ?? SAMPLE_ROWS;
  const text = typeof rows === 'string' ? rows : encodeScreeningRows(rows);
  const count = typeof rows === 'string' ? (text === '' ? 0 : text.split('\n').length) : rows.length;
  return {
    practiceName: overrides.practiceName ?? practiceName(),
    state: overrides.state ?? 'MN',
    zip: overrides.zip ?? '00011',
    contactEmail: overrides.contactEmail ?? `prospect.${randomUUID().slice(0, 8)}@clinic-${randomUUID().slice(0, 6)}.synthetic.test`,
    headers: JSON.stringify(overrides.headers ?? SCREENING_HEADERS),
    rowCount: overrides.rowCount ?? String(count),
    rows: text,
    leftOutRows: String(overrides.leftOut?.rows ?? 0),
    leftOutClaimLines: String(overrides.leftOut?.claimLines ?? 0),
    leftOutAllowedCents: String(overrides.leftOut?.allowedCents ?? 0),
  };
}

export interface CallOptions {
  readonly params?: Record<string, unknown>;
  readonly input?: Record<string, unknown>;
  /** The client's address, as the trusted proxy names it (the per-IP limit), or none. */
  readonly address?: string | null;
  /** The browser's cookies (the attribution cookie, audit #57). */
  readonly cookies?: Readonly<Record<string, string>>;
}

export class ScreeningWorld {
  readonly mail = new MemoryMailSender();

  private constructor(
    readonly database: MigratedDatabase,
    readonly owner: DatabaseClient,
    /** The application's login, as every request uses it. */
    readonly app: DatabasePool,
    /** The operator's login (the superuser here; every platform transaction switches to tp_operator). */
    readonly operator: DatabasePool,
    readonly services: Services,
    readonly specialistId: string,
    /** The jobs the routes queued (unless the world was given another queue). */
    readonly queue: MemoryQueue,
    /** The services' log lines, parsed. */
    readonly logLines: Record<string, unknown>[],
  ) {}

  /** A migrated database with the release loaded, and (unless `open` is false) the split approved. */
  static async create(options: { readonly open?: boolean; readonly queue?: JobQueue } = {}): Promise<ScreeningWorld> {
    const database = await createMigratedDatabase(readDatabaseUrl());
    const owner = databaseClient(database.url);
    await owner.connect();
    await loadRelease(owner, RELEASE_DIR, { release: 900001, allowSyntheticFixtureForTests: true });
    const internal = await createOrganization(owner, 'internal');
    const specialistId = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, specialistId, 'contract_specialist');
    const app = openPool(database.appUrl, 4);
    const operator = openPool(database.url, 4);
    const sealer = new Sealer(randomBytes(32));
    const lines: Record<string, unknown>[] = [];
    const memory = new MemoryQueue();
    const services = createServices({
      origin: SCREENING_ORIGIN,
      pool: app,
      provider: new DevAuthProvider({
        store: new MemoryDevStore(),
        sealer: sealer.derive('dev-provider'),
        webauthn: { rpId: 'localhost', rpName: 'Test', origin: SCREENING_ORIGIN },
        deliverInvitation: () => Promise.resolve(),
        scryptCost: { n: 1024, r: 8, p: 1 },
      }),
      keys: LocalKeyProvider.random(),
      sealer,
      logger: createLogger({ sink: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) }),
      queue: options.queue ?? memory,
    });
    const world = new ScreeningWorld(database, owner, app, operator, services, specialistId, memory, lines);
    if (options.open !== false) {
      await world.approveSplit(SCREENING_SPLIT);
    }
    return world;
  }

  /** The contract specialist approves a split, as the console's action does, in the application role. */
  async approveSplit(settings: object): Promise<string> {
    const client = await this.app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.actor_id', $1, true), set_config('app.practice_ids', '{}', true)", [this.specialistId]);
      const { rows } = await client.query<{ id: string }>('SELECT console_approve_screening_split($1) AS id', [JSON.stringify(settings)]);
      await client.query('COMMIT');
      return rows[0]?.id ?? '';
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /** Calls a route as the application's own page would: same origin, no session. */
  call<R>(route: Route<R>, options: CallOptions = {}): Promise<Outcome<R>> {
    const request: RouteRequest = {
      cookies: new MemoryJar(options.cookies),
      params: options.params ?? {},
      input: options.input,
      requestId: `test-${randomUUID()}`,
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/141.0',
      origin: SCREENING_ORIGIN,
      fetchSite: 'same-origin',
      clientAddress: options.address ?? null,
    };
    return route.invoke(request, this.services);
  }

  /** The minute's sweep, as the platform worker runs it, taking every queued run at once. */
  price(): Promise<SweepResult> {
    return sweepScreeningRuns({ operator: this.operator, mail: this.mail, appOrigin: SCREENING_ORIGIN, logger: this.services.logger, jobId: randomUUID() }, { minQueuedAgeSeconds: 0 });
  }

  /** The token of the last result link emailed to `to`. */
  tokenFor(to: string): string {
    const message = [...this.mail.sent].reverse().find((sent: MailMessage) => sent.to.includes(to.toLowerCase()) && sent.subject === 'Your screening is ready');
    const link = message?.links[0];
    if (link === undefined) {
      throw new Error('no result link was emailed to that address');
    }
    return new URL(link).pathname.split('/').at(-1) ?? '';
  }

  /** As the superuser with triggers off for the transaction: moves a screening's dates back past what a test can wait for. */
  async age(days: number): Promise<void> {
    await this.owner.query('BEGIN');
    try {
      await this.owner.query('SET LOCAL session_replication_role = replica');
      const shift = `${String(days)} days`;
      for (const table of ['screening_prospect', 'screening_upload', 'screening_run']) {
        await this.owner.query(`UPDATE ${table} SET created_at = created_at - $1::interval, expires_at = expires_at - $1::interval`, [shift]);
      }
      await this.owner.query('COMMIT');
    } catch (error) {
      await this.owner.query('ROLLBACK');
      throw error;
    }
  }

  async close(): Promise<void> {
    await endPool(this.app);
    await endPool(this.operator);
    await this.owner.end();
    await this.database.drop();
  }
}
