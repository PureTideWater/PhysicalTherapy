import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';

import { EvidenceResolver, RATE_RECORD_FIELDS, type WorkflowContext, addRateRecord, approveRateRecordField, approveVersion, createContract, createDraftVersion, mapPlan, signOffVersion } from '@tp/contracts';
import { documentPages } from '@tp/contracts/pages';
import { syntheticPdf } from '@tp/contracts/testing';
import { type DatabaseClient, type DatabasePool, LocalKeyProvider, type PracticeCipher, databaseClient, documentObjectKey, openPool, provisionPracticeKey, withJobScope, withPracticeScope } from '@tp/db';
import { type MigratedDatabase, type TenantWorld, addMembership, asOwner, createMigratedDatabase, createOrganization, createTenantWorld, createUser } from '@tp/db/testing';
import { createLogger } from '@tp/observability';
import { loadRelease, withdrawRelease } from '@tp/rules/loader';

import type { JobContext } from '../../jobs/handlers';
import { MemorySealedBytes } from '../../intake/test-support/memory-bytes';
import { parseHandler } from '../../parse/job';
import { DocumentStore } from '../../storage/documents';
import { createPricingRun } from '../create';
import { type ExecuteOptions } from '../execute';
import { priceHandler } from '../job';

/**
 * Test support for pricing runs against a scratch database (synthetic data only): a migrated database
 * with SYNTHETIC release 900001 loaded and a contract specialist; practices in the SYNTHETIC locality
 * with a billing manager and the specialist's support grant; SYNTHETIC 835s loaded through the
 * parse_835 job; contracts signed off and plans mapped through @tp/contracts' services by the people
 * the plan names; runs created in the billing manager's scope and executed by the price job.
 */

export const FIXTURES = path.resolve(import.meta.dirname, '../../../../../fixtures/synthetic');
export const RELEASE = 900001;
const RELEASE_DIR = path.join(FIXTURES, 'rules/release-synth-900001');
/** The SYNTHETIC "release 2" of the re-run tests: release 900001 with the 97110 work RVU changed (PRC-19). */
export const RERUN_RELEASE = 900004;
const RERUN_RELEASE_DIR = path.join(FIXTURES, 'rules/release-synth-900004');

/** The SYNTHETIC place-of-service split and default rounding of a practice's settings. */
export const SETTINGS = { place_of_service_settings: { '11': 'non_facility', '22': 'facility' }, default_rounding: 'HALF_UP_CENT' };

export const quoteAt = (percentage: string) => `Every covered service is paid at ${percentage}% of the Medicare fee schedule`;
const contractPages = (percentage: string) => [
  ['SYNTHETIC PROVIDER AGREEMENT - INVENTED TERMS', 'Compensation is set out in Exhibit A.'],
  ['SYNTHETIC EXHIBIT A FEE SCHEDULE', quoteAt(percentage)],
];
/** A general term (no codes): a percentage of the current Medicare fee schedule, flags off, timed units per code. */
export const termsAt = (percentage: string) => ({
  scope: {},
  method: 'PERCENT_OF_MEDICARE',
  parameters: { percentage, year_basis: 'CURRENT', locality_basis: { kind: 'PRACTICE' }, conversion_factor: 'non_qualifying_apm' },
  flags: { timed_units_rule: 'PER_CODE' },
});

export interface Practice {
  readonly world: TenantWorld;
  readonly practiceId: string;
  readonly manager: string;
  readonly cipher: PracticeCipher;
}

export interface SignedContract {
  readonly contractId: string;
  readonly versionId: string;
  readonly rateRecordId: string;
}

export class PricingWorld {
  private readonly keys = LocalKeyProvider.random();
  private readonly documents = new DocumentStore(new MemorySealedBytes());
  private readonly parse = parseHandler({ documents: this.documents, keys: this.keys });
  private readonly contractDocuments = new Map<string, Uint8Array>();

  private constructor(
    readonly database: MigratedDatabase,
    readonly owner: DatabaseClient,
    readonly app: DatabasePool,
    readonly specialist: string,
  ) {}

  static async open(adminUrl: string, poolSize = 8): Promise<PricingWorld> {
    const database = await createMigratedDatabase(adminUrl);
    const owner = databaseClient(database.url);
    await owner.connect();
    const app = openPool(database.appUrl, poolSize);
    await loadRelease(owner, RELEASE_DIR, { release: RELEASE, allowSyntheticFixtureForTests: true });
    const internal = await createOrganization(owner, 'internal', 'pricing');
    const specialist = await createUser(owner, { hardwareKeyRequired: true });
    await addMembership(owner, internal, specialist, 'contract_specialist');
    return new PricingWorld(database, owner, app, specialist);
  }

  async close(): Promise<void> {
    await this.app.end();
    await this.owner.end();
    await this.database.drop();
  }

  /** A practice in the SYNTHETIC locality with the given settings, a billing manager and the specialist's support grant. */
  async practice(label: string, settings: object = SETTINGS): Promise<Practice> {
    const { owner } = this;
    const world = await createTenantWorld(owner, label);
    const key = await provisionPracticeKey(this.keys, world.practiceId);
    await owner.query("UPDATE practice SET data_key_ref = $1, zip = '00011', settings = $3 WHERE id = $2", [key.dataKeyRef, world.practiceId, JSON.stringify(settings)]);
    const manager = await createUser(owner);
    await addMembership(owner, world.organizationId, manager, 'billing_manager');
    await asOwner(owner, [world.practiceId], () =>
      owner.query(`INSERT INTO support_grant (practice_id, user_id, ticket, reason, expires_at) VALUES ($1, $2, 'PR-1', 'SYNTHETIC ABSTRACTION', now() + interval '4 hours')`, [world.practiceId, this.specialist]),
    );
    return { world, practiceId: world.practiceId, manager, cipher: key.cipher };
  }

  /** A job's context for the practice: its own job ID, a logger writing to `logs`, and its one-practice scope. */
  jobContext(practiceId: string, logs: Record<string, unknown>[] = [], lastAttempt = false): JobContext {
    const jobId = randomUUID();
    return {
      jobId,
      logger: createLogger({ sink: (line) => logs.push(JSON.parse(line) as Record<string, unknown>) }),
      transaction: (work) => withJobScope(this.app, { jobId, practiceId }, work),
      enqueue: () => Promise.resolve(null),
      lastAttempt,
    };
  }

  /** Parses and loads a SYNTHETIC 835 (a path under fixtures/synthetic) into the practice, as intake and parse_835 leave it. */
  async load(target: Practice, fixture: string): Promise<void> {
    const { owner } = this;
    const content = readFileSync(path.join(FIXTURES, fixture));
    const id = randomUUID();
    await withPracticeScope(this.app, { actorId: target.manager, practiceIds: [target.practiceId] }, (scope) =>
      scope.client.query("INSERT INTO source_document (id, practice_id, kind, size_bytes, content_type, uploaded_by) VALUES ($1, $2, 'x12_835', $3, 'application/octet-stream', $4)", [
        id,
        target.practiceId,
        content.length,
        target.manager,
      ]),
    );
    await this.documents.write(target.cipher, documentObjectKey(target.practiceId, id), Readable.from([content]));
    await asOwner(owner, [target.practiceId], () =>
      owner.query("UPDATE source_document SET sha256 = $2, scan_status = 'clean', scan_at = now(), status = 'scanned' WHERE id = $1", [id, createHash('sha256').update(content).digest('hex')]),
    );
    await this.parse({ practice_id: target.practiceId, document_id: id }, this.jobContext(target.practiceId));
  }

  /** Runs `run` as `actorId` in the practice's request scope, with a resolver over the SYNTHETIC contract documents. */
  as<T>(target: Practice, actorId: string, run: (context: WorkflowContext) => Promise<T>): Promise<T> {
    return withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, (scope) =>
      run({
        scope,
        requestId: `test-${randomUUID()}`,
        evidence: new EvidenceResolver({
          pages: documentPages({
            read: (documentId) => {
              const pdf = this.contractDocuments.get(documentId);
              return pdf === undefined ? Promise.reject(new Error('no such synthetic document')) : Promise.resolve({ bytes: pdf, contentType: 'application/pdf' });
            },
          }),
        }),
      }),
    );
  }

  async one<T>(sql: string, values: unknown[]): Promise<T> {
    const { rows } = await this.owner.query<T & object>(sql, values);
    const [row] = rows;
    if (row === undefined) {
      throw new Error('expected a row');
    }
    return row;
  }

  async payerOf(target: Practice): Promise<string> {
    return (await this.one<{ id: string }>('SELECT id FROM payer WHERE practice_id = $1 ORDER BY created_at LIMIT 1', [target.practiceId])).id;
  }

  async planOf(target: Practice, key: string): Promise<string> {
    return (await this.one<{ id: string }>('SELECT id FROM plan WHERE practice_id = $1 AND plan_key = $2', [target.practiceId, key])).id;
  }

  /** A signed-off version of a new contract with the payer: one general term at a percentage of Medicare (110 unless said). */
  async signedContract(target: Practice, effectiveFrom: string, options: { effectiveTo?: string; disputeWindowDays?: number; percentage?: string; payerId?: string } = {}): Promise<SignedContract> {
    const { owner } = this;
    const percentage = options.percentage ?? '110';
    const documentId = randomUUID();
    await asOwner(owner, [target.practiceId], () =>
      owner.query(
        `INSERT INTO source_document (id, practice_id, kind, sha256, size_bytes, content_type, uploaded_by, scan_status, scan_at, status)
         VALUES ($1, $2, 'contract', $3, 1000, 'application/pdf', $4, 'clean', now(), 'stored')`,
        [documentId, target.practiceId, createHash('sha256').update(documentId).digest('hex'), target.manager],
      ),
    );
    this.contractDocuments.set(documentId, syntheticPdf(contractPages(percentage)));
    const payerId = options.payerId ?? (await this.payerOf(target));
    const { contractId, versionId } = await this.as(target, target.manager, async (context) => {
      const contract = await createContract(context, { practiceId: target.practiceId, payerId, title: 'SYNTHETIC COMMERCIAL AGREEMENT' });
      const version = await createDraftVersion(context, {
        practiceId: target.practiceId,
        contractId: contract.contractId,
        effectiveFrom,
        effectiveTo: options.effectiveTo ?? null,
        sourceDocumentIds: [documentId],
        disputeWindowDays: options.disputeWindowDays ?? null,
      });
      return { contractId: contract.contractId, versionId: version.versionId };
    });
    const rateRecordId = await this.as(target, this.specialist, async (context) => {
      const { rateRecordId: id } = await addRateRecord(context, { practiceId: target.practiceId, versionId, terms: termsAt(percentage), citation: { documentId, page: 2, quote: quoteAt(percentage) } });
      for (const field of RATE_RECORD_FIELDS) {
        await approveRateRecordField(context, { practiceId: target.practiceId, rateRecordId: id, field });
      }
      await approveVersion(context, { practiceId: target.practiceId, versionId });
      return id;
    });
    await this.as(target, target.manager, (context) => signOffVersion(context, { practiceId: target.practiceId, versionId }));
    return { contractId, versionId, rateRecordId };
  }

  async mapped(target: Practice, planId: string, kind: 'contract' | 'no_agreement' | 'ma_noncontracted', effectiveFrom: string, contractVersionId: string | null = null): Promise<string> {
    return (await this.as(target, target.manager, (context) => mapPlan(context, { practiceId: target.practiceId, planId, kind, contractVersionId, effectiveFrom }))).mappingId;
  }

  /** Loads SYNTHETIC release 900004 into the scratch database (once): from then on it is the release in force. */
  async loadRerunRelease(): Promise<void> {
    await loadRelease(this.owner, RERUN_RELEASE_DIR, { release: RERUN_RELEASE, allowSyntheticFixtureForTests: true });
  }

  /** A content rollback of the release in force, as `pnpm release:rollback` records it (the owner role). */
  async withdraw(releaseNo: number, reason = 'SYNTHETIC rollback in a test'): Promise<void> {
    await withdrawRelease(this.owner, { release: releaseNo, reason });
  }

  async createRun(target: Practice, periodFrom: string, periodTo: string, releaseNo = RELEASE, actorId = target.manager): Promise<string> {
    const created = await withPracticeScope(this.app, { actorId, practiceIds: [target.practiceId] }, (scope) =>
      createPricingRun(scope, { practiceId: target.practiceId, periodFrom, periodTo, releaseNo, requestId: `test-${randomUUID()}` }),
    );
    return created.pricingRunId;
  }

  async execute(target: Practice, pricingRunId: string, logs: Record<string, unknown>[] = [], options: ExecuteOptions = {}): Promise<void> {
    await priceHandler(options)({ practice_id: target.practiceId, pricing_run_id: pricingRunId }, this.jobContext(target.practiceId, logs));
  }
}

export async function errorOf(attempt: Promise<unknown>): Promise<unknown> {
  return attempt.then(
    () => undefined,
    (error: unknown) => error,
  );
}
