/**
 * The case registry: one entry for every row of docs/product/test-matrix.md, plus the oracle variants.
 * Each entry says which milestone completes its expected outcome, which existing tests already assert
 * it, and either generates its files and expected.json or says why it needs no file.
 */
import { type CaseModule } from '../expected/types';
import { CODE_LIST_RELEASE } from '../expected/parse';
import { CaseBuilder, type GeneratedCase } from './builder';
import { LARGE_CLAIMS, LARGE_TRANSACTIONS, largeFixtureFacts } from './large';
import { TEST_MATRIX } from './matrix';
import * as par from './par';
import * as pricing from './pricing';
import { VARIANTS } from './variants';
import * as workflow from './workflow';

type Build = (b: CaseBuilder) => void;

interface Entry {
  readonly completesIn: number;
  readonly assertedBy?: readonly string[];
  /** Generates the case's files; absent with `noFile`. */
  readonly build?: Build;
  readonly noFile?: string;
}

const none = (completesIn: number, noFile: string, assertedBy?: readonly string[]): Entry => ({ completesIn, noFile, assertedBy });

function par29(b: CaseBuilder): void {
  const facts = largeFixtureFacts();
  b.noFiles(`The ${String(LARGE_CLAIMS)}-claim file is generated when a test needs it, by writeLargeFixture() from @tp/synth, into fixtures/synthetic/${facts.path} (ignored by git); its size, hash and counts are recorded here.`);
  b.generatedFile({ path: facts.path, sha256: facts.sha256, bytes: facts.bytes, description: `${String(LARGE_CLAIMS)} claims in ${String(LARGE_TRANSACTIONS)} transaction sets of one interchange, a line feed after every segment.`, oracle: { valid: true, rejections: [], summary: null, summarySha256: facts.summarySha256 } });
  b.scenario({ claims: facts.claims, lines: facts.lines, transactions: facts.transactions, paidCents: facts.paidCents, perTransaction: facts.perTransaction });
  b.outcome({ parse: `all ${String(LARGE_CLAIMS)} claims load, balanced`, target: '10,000 claims a minute on one worker vCPU (PRD section 10); memory bounded per transaction set' });
  b.addAuxiliary('.gitignore', 'generated/\n');
}

/** Every test-matrix case, by ID. */
const ENTRIES: Readonly<Record<string, Entry>> = {
  'PAR-01': { completesIn: 2, build: par.par01 },
  'PAR-02': { completesIn: 2, build: par.par02 },
  'PAR-03': { completesIn: 2, build: par.par03 },
  'PAR-04': { completesIn: 2, build: par.par04 },
  'PAR-05': { completesIn: 2, build: par.par05 },
  'PAR-06': { completesIn: 2, build: par.par06 },
  'PAR-07': { completesIn: 2, build: par.par07 },
  'PAR-08': { completesIn: 2, build: par.par08 },
  'PAR-09': { completesIn: 2, build: par.par09 },
  'PAR-10': { completesIn: 2, build: par.par10 },
  'PAR-11': { completesIn: 2, build: par.par11 },
  'PAR-12': { completesIn: 2, build: par.par12 },
  'PAR-13': { completesIn: 2, build: par.par13 },
  'PAR-14': { completesIn: 5, build: par.par14 },
  'PAR-15': { completesIn: 5, build: par.par15 },
  'PAR-16': { completesIn: 2, build: par.par16 },
  'PAR-17': { completesIn: 2, build: par.par17 },
  'PAR-18': { completesIn: 2, build: par.par18 },
  'PAR-19': { completesIn: 2, build: par.par19 },
  'PAR-20': { completesIn: 2, build: par.par20 },
  'PAR-21': { completesIn: 2, build: par.par21 },
  'PAR-22': { completesIn: 2, build: par.par22 },
  'PAR-23': { completesIn: 2, build: par.par23 },
  'PAR-24': { completesIn: 2, build: par.par24 },
  'PAR-25': { completesIn: 2, build: par.par25 },
  'PAR-26': { completesIn: 2, build: par.par26 },
  'PAR-27': { completesIn: 3, build: par.par27 },
  'PAR-28': { completesIn: 3, build: par.par28 },
  'PAR-29': { completesIn: 2, build: par29 },
  'PAR-30': { completesIn: 2, build: par.par30 },
  'MAP-01': { completesIn: 3, build: pricing.map01 },
  'MAP-02': { completesIn: 5, build: pricing.map02 },
  'MAP-03': { completesIn: 7, build: pricing.map03 },
  'MAP-04': { completesIn: 6, build: pricing.map04 },
  'MAP-05': { completesIn: 5, build: pricing.map05 },
  'CON-01': { completesIn: 4, build: pricing.con01 },
  'CON-02': { completesIn: 4, build: pricing.con02 },
  'CON-03': { completesIn: 4, build: pricing.con03 },
  'CON-04': none(4, 'A rate record without a page reference is entered by hand against any version; no document of its own is involved.'),
  'CON-05': { completesIn: 10, build: pricing.con05 },
  'CON-06': { completesIn: 5, build: pricing.con06 },
  'CON-07': { completesIn: 5, build: pricing.con07 },
  'PRC-01': { completesIn: 5, build: pricing.prc01 },
  'PRC-02': { completesIn: 5, build: pricing.prc02 },
  'PRC-03': { completesIn: 5, build: pricing.prc03 },
  'PRC-04': { completesIn: 5, build: pricing.prc04 },
  'PRC-05': { completesIn: 7, build: pricing.prc05 },
  'PRC-06': { completesIn: 7, build: pricing.prc06 },
  'PRC-07': { completesIn: 7, build: pricing.prc07 },
  'PRC-08': { completesIn: 5, build: pricing.prc08 },
  'PRC-09': { completesIn: 5, build: pricing.prc09 },
  'PRC-10': { completesIn: 7, build: pricing.prc10 },
  'PRC-11': { completesIn: 7, build: pricing.prc11 },
  'PRC-12': { completesIn: 5, build: pricing.prc12 },
  'PRC-13': { completesIn: 5, build: pricing.prc13 },
  'PRC-14': { completesIn: 6, build: pricing.prc14 },
  'PRC-15': { completesIn: 6, build: pricing.prc15 },
  'PRC-16': none(5, 'Recomputes the trace of every golden line in fixtures/golden; no fixture of its own.'),
  'PRC-17': none(7, 'A property test over generated line facts (fast-check), for the fixed and percent methods; no fixture.'),
  'PRC-18': none(5, 'A property test over generated line facts and flag settings (fast-check); no fixture.'),
  'PRC-19': { completesIn: 7, build: pricing.prc19 },
  'PRC-20': none(7, 'The 100,000 lines are generated in memory by the performance test; nothing is committed.'),
  'CAS-01': { completesIn: 6, build: workflow.cas01 },
  'CAS-02': { completesIn: 6, build: workflow.cas02 },
  'CAS-03': { completesIn: 6, build: workflow.cas03 },
  'CAS-04': { completesIn: 6, build: workflow.cas04 },
  'CAS-05': { completesIn: 6, build: workflow.cas05 },
  'CAS-06': none(8, 'Writes off a line of a case built from the CAS-03 fixture; no file of its own.'),
  'CAS-07': none(8, 'Reopens a line written off in CAS-06; no file of its own.'),
  'CAS-08': { completesIn: 8, build: workflow.cas08 },
  'CAS-09': none(8, 'The drafter of any packet attempts its approval: an action, no file.'),
  'CAS-10': none(8, 'A practice with one user, a setting; any packet will do.'),
  'CAS-11': none(8, 'Identifier placeholders belong to every draft built from the CAS-03 or CAS-08 lines; no file of its own.'),
  'CAS-12': none(8, 'Exports any approved packet; the PDF and CSV are outputs, not fixtures.'),
  'CAS-13': none(8, 'Edits any approved packet: an action, no file.'),
  'CAS-14': none(8, 'A submission logged 45 days before the test date with no response: dates, no file.'),
  'CAS-15': { completesIn: 8, build: workflow.cas15 },
  'LED-01': none(9, 'A packet marked submitted: an action that must create no entry; no file.'),
  'LED-02': { completesIn: 9, build: workflow.led02 },
  'LED-03': { completesIn: 9, build: workflow.led03 },
  'LED-04': { completesIn: 9, build: workflow.led04 },
  'LED-05': { completesIn: 9, build: workflow.led05 },
  'LED-06': { completesIn: 9, build: workflow.led06 },
  'LED-07': { completesIn: 9, build: workflow.led07 },
  'LED-08': { completesIn: 9, build: workflow.led08 },
  'LED-09': { completesIn: 9, build: workflow.led09 },
  'LED-10': none(9, 'A direct UPDATE or DELETE on ledger_entry by the application role: a database test, no file.'),
  'LED-11': none(9, 'Recomputes the ROI statement from the entries the LED-02 to LED-09 scenarios create; no file of its own.'),
  'SEC-01': none(1, 'The catalog test reads the migrated schema.', ['packages/db/src/catalog.db.test.ts']),
  'SEC-02': none(1, 'Cross-tenant tests are generated from the schema catalog and the route registry.', ['packages/db/src/cross-tenant.db.test.ts', 'apps/web/src/lib/routes/route-tests.db.test.ts']),
  'SEC-03': none(1, 'Grant expiry is a database and route property.', ['packages/db/src/access.db.test.ts', 'apps/web/src/lib/routes/revocation.db.test.ts']),
  'SEC-04': none(1, 'Grant revocation is a database and route property.', ['packages/db/src/access.db.test.ts', 'apps/web/src/lib/routes/revocation.db.test.ts']),
  'SEC-05': none(1, 'Support grants expire in the database; the notice is a worker job.', ['packages/db/src/access.db.test.ts', 'apps/worker/src/platform/support-notices.db.test.ts', 'apps/web/e2e/hardware-key.spec.ts']),
  'SEC-06': none(1, 'One practice per job is enforced by the job scope.', ['packages/db/src/authz/scope.test.ts']),
  'SEC-07': none(1, 'The log lint reads source; the canary test logs a synthetic record built in memory.', ['tools/lint-logs/scan.test.ts', 'packages/observability/src/logger.test.ts']),
  'SEC-08': none(1, 'URL and S3 key checks run on values built in the tests.', ['packages/observability/src/phi-guard.test.ts', 'apps/web/src/lib/routes/registry.test.ts']),
  'SEC-09': none(0, 'The lint rule is tested on files it builds in memory.', ['tools/test/eslint-rules.test.ts']),
  'SEC-10': none(1, 'Audit triggers are a database property.', ['packages/db/src/audit.db.test.ts']),
  'SEC-11': none(12, 'The deletion workflow runs on a practice seeded with synthetic data; its certificate arrives with milestone 12 (key destruction is tested now).', ['apps/worker/src/storage/practice-objects.db.test.ts', 'packages/db/src/crypto/practice-keys.db.test.ts']),
  'SEC-12': none(12, 'A legal hold is a lifecycle record; no file.'),
  'SEC-13': none(1, 'The restore drill restores a database and counts its rows.', ['apps/worker/src/platform/restore-drill.db.test.ts']),
  'SEC-14': none(2, 'The test builds a non-synthetic interchange in memory and hands it to the hook; it is never written as a file.', ['packages/synth/src/fixture-guard.test.ts']),
  'SEC-15': none(1, 'Session expiry is a session and route property.', ['packages/db/src/identity.db.test.ts', 'apps/web/src/lib/routes/route-tests.db.test.ts', 'apps/web/e2e/sign-in.spec.ts']),
  'JOB-01': { completesIn: 3, build: workflow.job01, assertedBy: ['apps/worker/src/worker.db.test.ts'] },
  'JOB-02': none(7, 'Job failures are injected in the worker tests; the dashboard that shows the last run arrives with milestone 7.', ['apps/worker/src/worker.test.ts', 'infra/test/monitoring.test.ts']),
  'JOB-03': none(7, 'A digest is built from counts and totals in the database; no file.'),
  'JOB-04': none(1, 'Heartbeats are a contract between the worker and its alarm.', ['apps/worker/src/heartbeat.test.ts', 'infra/test/monitoring.test.ts']),
  'MOD-01': { completesIn: 10, build: workflow.mod01 },
  'MOD-02': { completesIn: 10, build: workflow.mod02 },
  'MOD-03': none(10, 'The 300-case narrative evaluation set is generated in milestone 10 from the packet facts milestone 8 defines; nothing can be generated before that format exists.'),
  'MOD-04': { completesIn: 10, build: workflow.mod04 },
  'MOD-05': none(10, 'A per-practice budget, a gateway setting; no file.'),
  'MOD-06': none(10, 'The kill switch is a feature flag; the product runs on hand-entered records; no file.'),
};

export interface CaseDefinition {
  readonly id: string;
  readonly module: CaseModule;
  readonly title: string;
  readonly assertion: string;
  readonly completesIn: number;
  readonly assertedBy: readonly string[];
  /** Why the case has no file of its own, or null when it generates files. */
  readonly noFileReason: string | null;
  /** fixtures/synthetic/<dir>. */
  readonly dir: string;
  readonly variant: boolean;
  generate(): GeneratedCase;
}

function definition(id: string, title: string, assertion: string, entry: Entry, dir: string, variant: boolean, build: Build | undefined): CaseDefinition {
  const module = (variant ? 'PAR' : id.slice(0, 3)) as CaseModule;
  return {
    id,
    module,
    title,
    assertion,
    completesIn: entry.completesIn,
    assertedBy: entry.assertedBy ?? [],
    noFileReason: entry.noFile ?? null,
    dir,
    variant,
    generate() {
      const b = new CaseBuilder({ id, module, title, assertion, completesIn: entry.completesIn, assertedBy: entry.assertedBy, codeListRelease: module === 'PAR' || build !== undefined ? CODE_LIST_RELEASE : null }, dir);
      if (entry.noFile !== undefined) {
        b.noFiles(entry.noFile);
      }
      build?.(b);
      return b.build();
    },
  };
}

/** The test-matrix cases, in matrix order. */
export const CASES: readonly CaseDefinition[] = TEST_MATRIX.map((row) => {
  const entry = ENTRIES[row.id];
  if (!entry) {
    throw new Error(`the registry has no entry for ${row.id}`);
  }
  return definition(row.id, row.title, row.assertion, entry, row.id, false, entry.build);
});

/** The oracle variants, in fixtures/synthetic/variants/<id>-<slug>. */
export const VARIANT_CASES: readonly CaseDefinition[] = VARIANTS.map((variant) =>
  definition(variant.id, variant.title, 'Parses; pyx12 reads the same segments, amounts and balances', { completesIn: 2 }, `variants/${variant.id}-${variant.slug}`, true, variant.build),
);

export const ALL_CASES: readonly CaseDefinition[] = [...CASES, ...VARIANT_CASES];

/** Registry entries with no matrix row (a stale ID) would be a bug. */
export const REGISTRY_IDS: readonly string[] = Object.keys(ENTRIES);

export function findCase(id: string): CaseDefinition | undefined {
  return ALL_CASES.find((item) => item.id === id);
}

export function generateAll(): GeneratedCase[] {
  return ALL_CASES.map((item) => item.generate());
}
