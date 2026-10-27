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
import { addContractSet, addContractSetV2, addNarrativeSet } from '../eval/cases';

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

/**
 * The milestones built so far. A case that completes in one of them names the tests that assert it
 * (assertedBy), and the fixtures test fails while one does not.
 */
export const BUILT_THROUGH_MILESTONE = 5;

/**
 * The milestones whose code is in the repository though their done check still waits on people
 * (milestones 6 and 7: the three hand-run audits and the specialist's review of the golden lines;
 * milestones 8 and 9 on top of them: packets, the workbench, the recovery ledger and reconciliation;
 * milestone 10: the model gateway and its evaluation, whose real gate needs a model run inside the PHI
 * boundary or with credentials; see the README). Their cases are traced to their tests all the same:
 * the fixtures test fails while a case completing in one of them names none.
 */
export const CODE_BUILT_THROUGH_MILESTONE = 10;

/** Every test-matrix case, by ID. */
const ENTRIES: Readonly<Record<string, Entry>> = {
  'PAR-01': { completesIn: 2, build: par.par01, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-02': { completesIn: 2, build: par.par02, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-03': { completesIn: 2, build: par.par03, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts'] },
  'PAR-04': { completesIn: 2, build: par.par04, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/intake/sniff.test.ts'] },
  'PAR-05': { completesIn: 2, build: par.par05, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts'] },
  'PAR-06': { completesIn: 2, build: par.par06, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'packages/db/src/documents.db.test.ts', 'apps/worker/src/intake/intake.db.test.ts'] },
  'PAR-07': { completesIn: 2, build: par.par07, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-08': { completesIn: 2, build: par.par08, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/parse/plan.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-09': { completesIn: 2, build: par.par09, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-10': { completesIn: 2, build: par.par10, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/parse/plan.test.ts'] },
  'PAR-11': { completesIn: 2, build: par.par11, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-12': { completesIn: 2, build: par.par12, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-13': { completesIn: 2, build: par.par13, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-14': { completesIn: 5, build: par.par14, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test/remittance-pricing.test.ts'] },
  'PAR-15': { completesIn: 5, build: par.par15, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test/remittance-pricing.test.ts'] },
  'PAR-16': { completesIn: 2, build: par.par16, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/parse/plan.test.ts'] },
  'PAR-17': { completesIn: 2, build: par.par17, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-18': { completesIn: 2, build: par.par18, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-19': { completesIn: 2, build: par.par19, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-20': { completesIn: 2, build: par.par20, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-21': { completesIn: 2, build: par.par21, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-22': { completesIn: 2, build: par.par22, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-23': { completesIn: 2, build: par.par23, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts'] },
  'PAR-24': { completesIn: 2, build: par.par24, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts', 'apps/worker/src/intake/sniff.test.ts'] },
  'PAR-25': { completesIn: 2, build: par.par25, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'PAR-26': { completesIn: 2, build: par.par26, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'tools/test-oracle/parser.test.ts'] },
  'PAR-27': { completesIn: 3, build: par.par27, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/intake/intake.db.test.ts', 'apps/worker/src/intake/zip.test.ts'] },
  'PAR-28': { completesIn: 3, build: par.par28, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'apps/worker/src/intake/intake.db.test.ts', 'apps/worker/src/intake/zip.test.ts'] },
  'PAR-29': { completesIn: 2, build: par29, assertedBy: ['packages/edi835/src/performance.test.ts', 'packages/synth/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts'] },
  'PAR-30': { completesIn: 2, build: par.par30, assertedBy: ['packages/edi835/src/fixtures.test.ts', 'apps/web/src/lib/routes/remittances.db.test.ts', 'packages/db/src/documents.db.test.ts', 'apps/worker/src/intake/intake.db.test.ts', 'apps/worker/src/parse/parse.db.test.ts'] },
  'MAP-01': { completesIn: 3, build: pricing.map01, assertedBy: ['packages/contracts/src/resolver.test.ts', 'packages/contracts/src/coverage.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'apps/web/e2e/mapping.spec.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'apps/worker/src/price/price.db.test.ts', 'apps/web/src/lib/routes/pricing-routes.db.test.ts'] },
  'MAP-02': { completesIn: 5, build: pricing.map02, assertedBy: ['packages/contracts/src/resolver.test.ts', 'packages/contracts/src/coverage.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'apps/worker/src/price/price.db.test.ts'] },
  'MAP-03': { completesIn: 7, build: pricing.map03, assertedBy: ['packages/contracts/src/resolver.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'apps/worker/src/price/price.db.test.ts', 'apps/web/src/lib/routes/pricing-routes.db.test.ts', 'apps/worker/src/price/rerun.db.test.ts'] },
  'MAP-04': { completesIn: 6, build: pricing.map04, assertedBy: ['packages/contracts/src/resolver.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'apps/worker/src/price/price.db.test.ts', 'apps/web/src/lib/routes/pricing-routes.db.test.ts'] },
  'MAP-05': { completesIn: 5, build: pricing.map05, assertedBy: ['packages/contracts/src/resolver.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'packages/pricing/src/engine.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'apps/worker/src/price/price.db.test.ts', 'apps/web/src/lib/routes/pricing-routes.db.test.ts', 'apps/web/e2e/pricing.spec.ts'] },
  'CON-01': { completesIn: 4, build: pricing.con01, assertedBy: ['packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'apps/web/e2e/contracts.spec.ts'] },
  'CON-02': { completesIn: 4, build: pricing.con02, assertedBy: ['packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'tools/golden-worksheet/engine.golden.test.ts'] },
  'CON-03': { completesIn: 4, build: pricing.con03, assertedBy: ['packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts'] },
  'CON-04': none(4, 'A rate record without a page reference is entered by hand against any version; no document of its own is involved.', ['packages/contracts/src/contracts.db.test.ts', 'packages/contracts/src/terms.test.ts', 'packages/contracts/src/evidence/evidence.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'apps/web/e2e/contracts.spec.ts']),
  'CON-05': { completesIn: 10, build: pricing.con05, assertedBy: ['packages/contracts/src/evidence/evidence.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'apps/web/e2e/contracts.spec.ts'] },
  'CON-06': { completesIn: 5, build: pricing.con06, assertedBy: ['packages/contracts/src/resolver.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'tools/golden-worksheet/engine.golden.test.ts'] },
  'CON-07': { completesIn: 5, build: pricing.con07, assertedBy: ['packages/contracts/src/resolver.test.ts', 'packages/contracts/src/contracts.db.test.ts', 'packages/pricing/src/engine.test.ts', 'apps/web/src/lib/routes/contracts-routes.db.test.ts', 'apps/web/e2e/contracts.spec.ts', 'tools/golden-worksheet/engine.golden.test.ts'] },
  'PRC-01': { completesIn: 5, build: pricing.prc01, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-02': { completesIn: 5, build: pricing.prc02, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-03': { completesIn: 5, build: pricing.prc03, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-04': { completesIn: 5, build: pricing.prc04, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-05': { completesIn: 7, build: pricing.prc05, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-06': { completesIn: 7, build: pricing.prc06, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-07': { completesIn: 7, build: pricing.prc07, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts', 'tools/golden-worksheet/triage.golden.test.ts', 'apps/worker/src/triage/triage.db.test.ts'] },
  'PRC-08': { completesIn: 5, build: pricing.prc08, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-09': { completesIn: 5, build: pricing.prc09, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-10': { completesIn: 7, build: pricing.prc10, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts'] },
  'PRC-11': { completesIn: 7, build: pricing.prc11, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts', 'tools/golden-worksheet/triage.golden.test.ts', 'apps/worker/src/triage/triage.db.test.ts'] },
  'PRC-12': { completesIn: 5, build: pricing.prc12, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/contracts/src/resolver.test.ts', 'apps/worker/src/price/price.db.test.ts'] },
  'PRC-13': { completesIn: 5, build: pricing.prc13, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts', 'packages/money/src/rounding.test.ts'] },
  'PRC-14': { completesIn: 6, build: pricing.prc14, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts', 'packages/pricing/src/properties.test.ts', 'apps/worker/src/price/price.db.test.ts', 'apps/worker/src/triage/triage.db.test.ts'] },
  'PRC-15': { completesIn: 6, build: pricing.prc15, assertedBy: ['tools/golden-worksheet/worksheet.golden.test.ts', 'tools/golden-worksheet/engine.golden.test.ts', 'packages/pricing/src/engine.test.ts', 'apps/worker/src/price/price.db.test.ts', 'apps/worker/src/triage/triage.db.test.ts'] },
  'PRC-16': none(5, 'Recomputes the trace of every golden line in fixtures/golden; no fixture of its own.', ['packages/pricing/src/recompute.test.ts', 'packages/pricing/src/properties.test.ts', 'tools/golden-worksheet/engine.golden.test.ts']),
  'PRC-17': none(7, 'A property test over generated line facts (fast-check), for the fixed and percent methods; no fixture.', ['packages/pricing/src/properties.test.ts']),
  'PRC-18': none(5, 'A property test over generated line facts and flag settings (fast-check); no fixture.', ['packages/pricing/src/properties.test.ts']),
  'PRC-19': { completesIn: 7, build: pricing.prc19, assertedBy: ['apps/worker/src/price/rerun.db.test.ts', 'tools/release/dry-run.db.test.ts', 'apps/web/src/lib/routes/reruns-routes.db.test.ts'] },
  'PRC-20': none(7, 'The 100,000 lines are generated in memory by the performance test; nothing is committed.', ['packages/pricing/src/performance.test.ts']),
  // Release 900006 and golden claims G196-G199 (docs/adr/0064); PR 6b-2's location.db.test.ts prices the ZIP+4 in the database.
  'PRC-21': {
    completesIn: 6,
    build: pricing.prc21,
    assertedBy: [
      'packages/pricing/src/engine.test.ts',
      'packages/pricing/src/recompute.test.ts',
      'packages/pricing/src/properties.test.ts',
      'tools/golden-worksheet/engine.golden.test.ts',
      'tools/release/release.test.ts',
      'packages/db/src/location.db.test.ts',
    ],
  },
  'PRC-22': none(6, 'A differential test over generated claims and the golden lines; no fixture.', ['tools/engine-freeze/differential.test.ts', 'tools/engine-freeze/check.test.ts', 'tools/engine-freeze/rule-tables.db.test.ts']),
  'PRC-23': none(6, 'Practices and their locations are set by the tests; the 835 is the monitoring fixture.', [
    'apps/worker/src/monitor/monitor.db.test.ts',
    'apps/worker/src/price/price.db.test.ts',
    'apps/worker/src/price/price.test.ts',
    'packages/contracts/src/location.test.ts',
    'packages/db/src/location.db.test.ts',
    'apps/web/src/lib/routes/settings-routes.db.test.ts',
    'apps/web/e2e/onboarding.spec.ts',
  ]),
  'PRC-24': none(6, 'A setting; any Medicare line will do.', [
    'apps/worker/src/price/settings.test.ts',
    'apps/worker/src/price/price.db.test.ts',
    'packages/db/src/location.db.test.ts',
    'apps/web/e2e/onboarding.spec.ts',
  ]),
  // Combined audit #10 (`co-001/superseded-rerun`; docs/adr/0037, amendment of 2026-10-26): an older re-run is not accepted over newer pricing.
  'PRC-25': none(7, 'No file of its own: SYNTHETIC 835s the pricing world already loads.', [
    'apps/worker/src/price/rerun.db.test.ts',
    'apps/worker/src/price/rerun-rule.property.test.ts',
    'apps/web/src/lib/routes/reruns-routes.db.test.ts',
    'apps/web/e2e/pricing.spec.ts',
  ]),
  'PRC-26': none(7, 'No file of its own: SYNTHETIC 835s the pricing world already loads.', [
    'apps/worker/src/price/rerun.db.test.ts',
    'apps/worker/src/price/rerun-rule.property.test.ts',
    'apps/web/src/lib/routes/reruns-routes.db.test.ts',
  ]),
  'PRC-27': none(7, 'No file of its own: SYNTHETIC 835s the pricing world already loads.', [
    'apps/worker/src/price/rerun.db.test.ts',
    'apps/worker/src/price/rerun-rule.property.test.ts',
    'apps/web/src/lib/routes/reruns-routes.db.test.ts',
  ]),
  'PRC-28': none(7, 'No file of its own: SYNTHETIC 835s the pricing world already loads.', [
    'apps/worker/src/price/rerun.db.test.ts',
    'apps/worker/src/price/rerun-rule.property.test.ts',
    'apps/web/src/lib/routes/reruns-routes.db.test.ts',
    'apps/web/e2e/pricing.spec.ts',
  ]),
  'CAS-01': { completesIn: 6, build: workflow.cas01, assertedBy: ['apps/worker/src/triage/triage.db.test.ts', 'packages/triage/src/anomaly.test.ts'] },
  'CAS-02': { completesIn: 6, build: workflow.cas02, assertedBy: ['apps/worker/src/triage/triage.db.test.ts', 'packages/triage/src/anomaly.test.ts', 'apps/worker/src/report/report.db.test.ts', 'apps/web/src/lib/routes/audit-e2e.db.test.ts'] },
  'CAS-03': { completesIn: 6, build: workflow.cas03, assertedBy: ['apps/worker/src/triage/triage.db.test.ts', 'packages/triage/src/patterns.test.ts', 'apps/worker/src/report/report.db.test.ts', 'apps/web/src/lib/routes/audit-e2e.db.test.ts'] },
  'CAS-04': { completesIn: 6, build: workflow.cas04, assertedBy: ['apps/worker/src/triage/triage.db.test.ts', 'packages/triage/src/patterns.test.ts', 'apps/web/src/lib/routes/audit-e2e.db.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts', 'apps/web/e2e/triage.spec.ts'] },
  'CAS-05': { completesIn: 6, build: workflow.cas05, assertedBy: ['apps/worker/src/triage/triage.db.test.ts', 'packages/triage/src/actionable.test.ts', 'apps/web/src/lib/routes/audit-e2e.db.test.ts'] },
  'CAS-06': none(6, 'Writes off a line of a case built from the CAS-03 fixture; no file of its own.', ['apps/worker/src/triage/triage.db.test.ts', 'packages/triage/src/cases.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts', 'apps/web/e2e/triage.spec.ts']),
  'CAS-07': none(6, 'Reopens a line written off in CAS-06; no file of its own.', ['apps/worker/src/triage/triage.db.test.ts', 'apps/worker/src/report/report.db.test.ts', 'packages/triage/src/stages.test.ts', 'apps/web/e2e/triage.spec.ts']),
  'CAS-08': { completesIn: 8, build: workflow.cas08, assertedBy: ['apps/worker/src/packets/packets.db.test.ts', 'packages/packets/src/verifier.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts', 'apps/web/e2e/packets.spec.ts'] },
  'CAS-09': none(8, 'The drafter of any packet attempts its approval: an action, no file.', ['apps/worker/src/packets/packets.db.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts', 'apps/web/e2e/packets.spec.ts']),
  'CAS-10': none(8, 'A practice with one user, a setting; any packet will do.', ['apps/worker/src/packets/packets.db.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts']),
  'CAS-11': none(8, 'Identifier placeholders belong to every draft built from the CAS-03 or CAS-08 lines; no file of its own.', [
    'apps/worker/src/packets/packets.db.test.ts',
    'packages/packets/src/placeholders.test.ts',
    'apps/web/src/lib/routes/workbench-routes.db.test.ts',
    'apps/web/e2e/packets.spec.ts',
  ]),
  'CAS-12': none(8, 'Exports any approved packet; the PDF and CSV are outputs, not fixtures.', ['apps/worker/src/packets/packets.db.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts', 'apps/web/e2e/packets.spec.ts']),
  'CAS-13': none(8, 'Edits any approved packet: an action, no file.', ['apps/worker/src/packets/packets.db.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts']),
  'CAS-14': none(8, 'A submission logged 45 days before the test date with no response: dates, no file.', ['apps/worker/src/packets/packets.db.test.ts', 'apps/web/src/lib/routes/workbench-routes.db.test.ts']),
  'CAS-15': { completesIn: 8, build: workflow.cas15, assertedBy: ['apps/worker/src/packets/packets.db.test.ts', 'packages/packets/src/interest.test.ts'] },
  // Audit item #37 part 1 (the founder's rulings of 2026-10-20; ADR 0061): the payer's copy, the contact, the reference.
  'CAS-26': none(8, 'Prints any approved packet as the payer receives it: an output, not a fixture.', [
    'apps/worker/src/packets/export.test.ts',
    'apps/worker/src/packets/payer-copy.db.test.ts',
    'apps/web/src/lib/routes/workbench-routes.db.test.ts',
    'apps/web/e2e/packets.spec.ts',
  ]),
  'CAS-27': none(8, 'A practice setting with no contact: no file.', [
    'apps/worker/src/packets/export-attempts.db.test.ts',
    'apps/worker/src/packets/packets.db.test.ts',
    'apps/web/src/lib/routes/payer-copy-routes.db.test.ts',
    'apps/web/e2e/packets.spec.ts',
  ]),
  'CAS-28': none(8, 'Looks up any approved packet by its reference: no file.', ['packages/packets/src/reference.test.ts', 'apps/web/src/lib/routes/payer-copy-routes.db.test.ts', 'apps/web/e2e/packets.spec.ts']),
  // The founder's ruling of 2026-10-20 (ADR 0061): a stale export sent before its attestation is logged unattested.
  'CAS-29': none(8, 'Prices CAS-08 again after its export: an action on its lines, no file of its own.', [
    'apps/worker/src/packets/unattested-submission.db.test.ts',
    'apps/web/src/lib/routes/unattested-submission-routes.db.test.ts',
    'apps/web/src/lib/packets/unattested.test.ts',
    'apps/web/e2e/unattested.spec.ts',
  ]),
  // Combined audit #38 (adopted by the founder on 2026-10-20; ADR 0072): every figure explained in words, from the stored trace.
  'CAS-30': none(8, 'Words any priced or unpriced line from its stored trace: an output, not a fixture.', [
    'packages/packets/src/explain/line.test.ts',
    'packages/packets/src/explain/figures.property.test.ts',
    'packages/packets/src/explain/golden.test.ts',
    'apps/web/src/components/pricing/line-words.test.tsx',
    'apps/web/src/lib/routes/line-words-routes.db.test.ts',
    'apps/web/e2e/pricing.spec.ts',
  ]),
  'CAS-31': none(8, 'Opens any line’s trace as a viewer: a role, no file.', [
    'apps/web/src/lib/routes/pricing-routes.db.test.ts',
    'apps/web/src/lib/routes/line-words-routes.db.test.ts',
    'apps/web/src/components/pricing/line-words.test.tsx',
    'apps/web/e2e/viewer-phi.spec.ts',
  ]),
  'CAS-32': none(8, 'Reviews and exports any approved packet from its stored traces: an output, not a fixture.', [
    'packages/packets/src/explain.test.ts',
    'apps/worker/src/packets/export.test.ts',
    'apps/worker/src/packets/export-attempts.db.test.ts',
    'apps/web/src/lib/routes/payer-copy-routes.db.test.ts',
    'apps/web/e2e/packets.spec.ts',
  ]),
  'CAS-33': none(8, 'Renders from any percent-of-Medicare or Medicare Advantage line’s trace: an output, not a fixture.', [
    'packages/packets/src/explain/worksheet.test.ts',
    'packages/packets/src/explain/golden.test.ts',
    'apps/worker/src/packets/export.test.ts',
  ]),
  'CAS-34': none(8, 'A code outside a closed list, set in a test’s trace: no file.', [
    'packages/packets/src/explain/words.test.ts',
    'apps/worker/src/packets/export.test.ts',
    'apps/web/src/components/packets/calculation-words.test.tsx',
    'apps/web/src/components/pricing/line-words.test.tsx',
  ]),
  // Lane B (co-001/materiality-cents): settings stored in cents are shown and entered in dollars, and a form saved unchanged keeps them.
  'CAS-38': none(8, 'A practice setting read and shown: no file.', ['apps/web/src/components/settings/defaults.test.tsx', 'apps/web/src/lib/routes/console-routes.db.test.ts', 'apps/web/e2e/triage.spec.ts']),
  'CAS-39': none(8, 'A practice setting read and saved: no file.', [
    'apps/web/src/lib/money-input.test.ts',
    'apps/web/src/lib/routes/defaults-routes.db.test.ts',
    'apps/web/src/lib/routes/console-routes.db.test.ts',
    'apps/web/e2e/triage.spec.ts',
  ]),
  'LED-01': none(9, 'A packet marked submitted: an action that must create no entry; no file.', ['apps/worker/src/packets/packets.db.test.ts', 'apps/worker/src/reconcile/ledger.db.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts', 'apps/web/e2e/packets.spec.ts']),
  'LED-02': { completesIn: 9, build: workflow.led02, assertedBy: ['apps/worker/src/reconcile/ledger.db.test.ts', 'packages/ledger/src/matching.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts', 'apps/web/src/lib/routes/reconciliation-routes.db.test.ts'] },
  'LED-03': { completesIn: 9, build: workflow.led03, assertedBy: ['apps/worker/src/reconcile/ledger.db.test.ts', 'packages/ledger/src/matching.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts'] },
  'LED-04': {
    completesIn: 9,
    build: workflow.led04,
    assertedBy: [
      'apps/worker/src/reconcile/ledger.db.test.ts',
      'packages/ledger/src/matching.test.ts',
      'packages/ledger/src/templates.test.ts',
      'packages/ledger/src/pairing.test.ts',
      'apps/worker/src/reconcile/lines.db.test.ts',
      'apps/worker/src/reconcile/exports.db.test.ts',
      'apps/worker/src/reconcile/chain.db.test.ts',
      'apps/web/src/lib/routes/reconciliation-routes.db.test.ts',
    ],
  },
  'LED-05': { completesIn: 9, build: workflow.led05, assertedBy: ['apps/worker/src/reconcile/ledger.db.test.ts', 'apps/worker/src/reconcile/ledger-oracle.db.test.ts', 'packages/ledger/src/matching.test.ts', 'packages/ledger/src/templates.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts', 'apps/web/src/lib/routes/reconciliation-routes.db.test.ts'] },
  'LED-06': { completesIn: 9, build: workflow.led06, assertedBy: ['apps/worker/src/reconcile/ledger.db.test.ts', 'apps/worker/src/reconcile/ledger-oracle.db.test.ts', 'packages/ledger/src/totals.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts', 'apps/web/src/lib/routes/reconciliation-routes.db.test.ts'] },
  'LED-07': {
    completesIn: 9,
    build: workflow.led07,
    assertedBy: [
      'apps/worker/src/reconcile/ledger.db.test.ts',
      'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
      'packages/ledger/src/totals.test.ts',
      'packages/ledger/src/stages.test.ts',
      'apps/worker/src/reconcile/chain.db.test.ts',
      'apps/web/src/lib/routes/reconciliation-routes.db.test.ts',
    ],
  },
  'LED-08': { completesIn: 9, build: workflow.led08, assertedBy: ['apps/worker/src/reconcile/ledger.db.test.ts', 'apps/worker/src/reconcile/ledger-oracle.db.test.ts', 'packages/ledger/src/templates.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts'] },
  'LED-09': {
    completesIn: 9,
    build: workflow.led09,
    assertedBy: [
      'apps/worker/src/reconcile/ledger.db.test.ts',
      'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
      'packages/ledger/src/allocation.test.ts',
      'packages/ledger/src/matching.test.ts',
      'apps/worker/src/reconcile/lines.db.test.ts',
      'apps/worker/src/reconcile/chain.db.test.ts',
    ],
  },
  'LED-10': none(9, 'A direct UPDATE or DELETE on ledger_entry by the application role: a database test, no file.', ['apps/worker/src/reconcile/ledger.db.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts']),
  'LED-11': none(9, 'Recomputes the ROI statement from the entries the LED-02 to LED-09 scenarios create; no file of its own.', ['apps/worker/src/reconcile/ledger.db.test.ts', 'packages/ledger/src/roi.test.ts', 'apps/worker/src/reconcile/chain.db.test.ts', 'apps/web/src/lib/routes/reconciliation-routes.db.test.ts', 'packages/ledger/src/statement.test.ts']),
  'LED-12': { completesIn: 9, build: workflow.led12, assertedBy: ['apps/worker/src/reconcile/ledger.db.test.ts', 'apps/worker/src/reconcile/ledger-oracle.db.test.ts'] },
  // CO-09's LED-13 is LED-06's recoupment after the deposit (reconciliation-001, section 18 and item 15).
  'LED-13': none(9, 'LED-06: its recoupment after the deposit is the later recoupment; no file of its own.', [
    'apps/worker/src/reconcile/ledger.db.test.ts',
    'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
    'packages/ledger/src/totals.test.ts',
    'apps/worker/src/reconcile/chain.db.test.ts',
    'apps/web/src/lib/routes/reconciliation-routes.db.test.ts',
  ]),
  // PR 15b (combined audit #12, docs/adr/0067): the payment-terms cases, each case line with a patient's share.
  'LED-14': {
    completesIn: 9,
    build: workflow.led14,
    assertedBy: [
      'apps/worker/src/reconcile/payment-terms.db.test.ts',
      'packages/ledger/src/payment.test.ts',
      'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
      'apps/web/e2e/ledger-patient-share.spec.ts',
    ],
  },
  'LED-15': {
    completesIn: 9,
    build: workflow.led15,
    assertedBy: [
      'apps/worker/src/reconcile/payment-terms.db.test.ts',
      'packages/ledger/src/payment.test.ts',
      'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
      'apps/web/e2e/ledger-patient-share.spec.ts',
    ],
  },
  'LED-16': {
    completesIn: 9,
    build: workflow.led16,
    assertedBy: [
      'apps/worker/src/reconcile/payment-terms.db.test.ts',
      'packages/ledger/src/payment.test.ts',
      'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
    ],
  },
  'LED-17': {
    completesIn: 9,
    build: workflow.led17,
    assertedBy: [
      'apps/worker/src/reconcile/payment-terms.db.test.ts',
      'packages/ledger/src/payment.test.ts',
      'apps/worker/src/reconcile/ledger-oracle.db.test.ts',
    ],
  },
  'LED-18': { completesIn: 9, build: workflow.led18, assertedBy: ['apps/worker/src/reconcile/payment-terms.db.test.ts', 'packages/ledger/src/payment.test.ts'] },
  'SEC-01': none(1, 'The catalog test reads the migrated schema.', ['packages/db/src/catalog.db.test.ts']),
  'SEC-02': none(1, 'Cross-tenant tests are generated from the schema catalog and the route registry.', ['packages/db/src/cross-tenant.db.test.ts', 'apps/web/src/lib/routes/route-tests/define.ts']),
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
  'SEC-15': none(1, 'Session expiry is a session and route property.', ['packages/db/src/identity.db.test.ts', 'apps/web/src/lib/routes/route-tests/define.ts', 'apps/web/e2e/sign-in.spec.ts']),
  'SEC-17': none(6, 'The screening tables are read from the migrated catalog; no file.', ['packages/db/src/screening.db.test.ts']),
  'SEC-18': none(6, "The mail scenarios run on synthetic addresses at SES's simulator and on the migrated catalog, built in memory; no file.", [
    'packages/db/src/mail.db.test.ts',
    'packages/db/src/hardening.db.test.ts',
    'packages/db/src/screening.db.test.ts',
    'infra/test/mail-streams.test.ts',
    'apps/worker/src/mail/mail.test.ts',
    'apps/worker/src/platform/mail-events.db.test.ts',
    'apps/web/src/lib/screening/validation.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
  ]),
  'SEC-19': none(6, "The notices and invitations are sent to synthetic administrators at SES's simulator by the tests and the journey; no file.", [
    'packages/db/src/mail.db.test.ts',
    'apps/worker/src/platform/support-notices.db.test.ts',
    'apps/worker/src/billing/billing.db.test.ts',
    'apps/web/src/components/monitoring/display.test.tsx',
    'apps/web/src/lib/routes/mail-routes.db.test.ts',
    'infra/test/monitoring.test.ts',
    'apps/web/e2e/mail-notices.spec.ts',
  ]),
  'SCR-01': none(6, 'A screening upload is built in memory by the tests from synthetic rows and refused headers; no file is committed.', [
    'apps/worker/src/screening/format.test.ts',
    'apps/web/src/lib/screening/parse.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-02': none(6, 'Screening rows are built in memory and priced under SYNTHETIC release 900001; no file.', [
    'apps/worker/src/screening/adapter.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/components/screening/result.test.tsx',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/src/lib/screening/screening.large.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-03': none(6, 'Expiry is a database and platform-job property; no file.', [
    'packages/db/src/screening.db.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-04': none(6, 'Rate limits are counted in the database per request; no file.', ['apps/web/src/lib/screening/rate.test.ts', 'apps/web/src/lib/screening/routes.db.test.ts']),
  'SCR-05': none(6, 'Wording is held by the copy lint and by tests of what the routes, components and emails return; no file.', [
    'tools/brand-copy/scan.test.ts',
    'apps/worker/src/screening/message.test.ts',
    'apps/web/src/components/screening/result.test.tsx',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-06': none(6, 'The conversion is a route and an audit event; no file.', [
    'packages/db/src/screening.db.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-07': none(6, 'Rows of fewer than 11 claim lines are built in memory by the tests from synthetic totals; no file is committed.', [
    'apps/worker/src/screening/format.test.ts',
    'apps/web/src/lib/screening/parse.test.ts',
    'apps/web/src/components/screening/result.test.tsx',
    'packages/db/src/screening.db.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-08': none(6, 'The capacity test builds its SYNTHETIC scale release and uploads outside the repository when it runs; no file is committed.', [
    'tools/screening-capacity/limits.test.ts',
    'tools/screening-capacity/env.test.ts',
    'tools/screening-capacity/report.test.ts',
    'tools/screening-capacity/uploads.test.ts',
    'tools/screening-capacity/measure.test.ts',
    'tools/screening-capacity/launch-check.test.ts',
    'tools/test/workflows.test.ts',
    'packages/synth/src/release/scale.test.ts',
    'packages/synth/src/screening/uploads.test.ts',
    'tools/release/scale.test.ts',
    'tools/release/load.db.test.ts',
    'tools/screening-capacity/watched.test.ts',
    'tools/test/workflows.test.ts',
    'apps/web/src/lib/screening/screening.large.db.test.ts',
    'apps/web/src/lib/screening/result-page.large.db.test.ts',
    'apps/web/src/components/screening/result.test.tsx',
    'apps/worker/src/screening/consumer.db.test.ts',
    'apps/worker/src/worker.test.ts',
  ]),
  'SCR-09': none(6, 'The release read is tested on a release built in memory from SYNTHETIC release 900001; no file.', [
    'apps/worker/src/price/keyed-release.test.ts',
    'apps/worker/src/screening/adapter.test.ts',
    'apps/worker/src/screening/oracle-imports.test.ts',
    'apps/worker/src/screening/release-cache.db.test.ts',
    'packages/db/src/screening-queue.db.test.ts',
  ]),
  'SCR-10': none(6, 'A screening outcome is written by the database from the rows the tests submit in memory; no file.', [
    'packages/db/src/screening.db.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-11': none(6, 'A kept summary is frozen by the database from a screening the tests run in memory; no file.', [
    'packages/db/src/screening.db.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/lib/screening/labels.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-12': none(6, 'Attribution is a landing URL, a cookie and form fields the tests send; no file.', [
    'apps/web/src/lib/http/attribution.test.ts',
    'apps/web/src/proxy.test.ts',
    'packages/db/src/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/src/lib/routes/onboarding-routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-13': none(6, 'The opened signal is a page script and a route the tests drive; no file.', [
    'apps/web/src/components/screening/opened-signal.test.tsx',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-14': none(6, 'A replacement is two screenings the tests submit in memory; no file.', ['packages/db/src/screening.db.test.ts']),
  'SCR-15': none(6, 'The prospect’s ZIP+4 is set by the tests under release 900006 and the scale release’s small shape.', [
    'packages/db/src/screening.db.test.ts',
    'apps/worker/src/price/keyed-release.test.ts',
    'apps/worker/src/screening/adapter.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'tools/screening-capacity/oracle.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/src/components/screening/result.test.tsx',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-16': none(6, 'A row with an earlier quarter; no file.', [
    'apps/worker/src/screening/format.test.ts',
    'packages/db/src/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-17': none(6, 'The tiers come from uploads the tests submit in memory under synthetic accounts; no file.', [
    'packages/db/src/screening-queue.db.test.ts',
    'apps/worker/src/jobs/enqueue.test.ts',
    'apps/worker/src/jobs/screening.test.ts',
    'apps/worker/src/screening/threads.test.ts',
    'apps/worker/src/worker.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'tools/screening-capacity/report.test.ts',
    'tools/screening-capacity/uploads.test.ts',
  ]),
  'SCR-18': none(6, 'The wait states are read from runs the tests submit in memory; no file.', [
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/src/lib/http/received.test.ts',
    'apps/web/src/proxy.test.ts',
    'apps/worker/src/screening/message.test.ts',
    'apps/web/e2e/screening.spec.ts',
  ]),
  'SCR-19': none(6, 'A consumer is killed mid-run over a screening the tests submit in memory; no file.', [
    'apps/worker/src/screening/consumer-lease.db.test.ts',
    'apps/worker/src/screening/consumer.db.test.ts',
    'apps/worker/src/screening/threads.test.ts',
    'apps/worker/src/jobs/enqueue.test.ts',
    'packages/db/src/screening-queue.db.test.ts',
  ]),
  'SCR-20': none(6, 'The launch check reads synthetic capacity reports and synthetic attestation verifications (gh’s JSON) built in memory; no file.', [
    'tools/screening-capacity/launch-check.test.ts',
    'tools/screening-capacity/report.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'infra/test/deploy-parameters.test.ts',
    'infra/test/compute.test.ts',
    'tools/test/workflows.test.ts',
  ]),
  'SCR-21': none(6, 'The cut-off is driven by synthetic mail records and simulator-shaped events the tests and the journey make; no file.', [
    'packages/db/src/mail.db.test.ts',
    'packages/db/src/screening.db.test.ts',
    'apps/worker/src/platform/mail-events.db.test.ts',
    'apps/worker/src/screening/screening.db.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/src/lib/routes/mail-routes.db.test.ts',
    'infra/test/mail-streams.test.ts',
    'apps/web/e2e/mail-cutoff.spec.ts',
  ]),
  'SCR-22': none(6, 'The checks run on synthetic addresses with a stand-in resolver and validation; no file.', [
    'apps/web/src/lib/screening/address.test.ts',
    'apps/web/src/lib/screening/validation.test.ts',
    'apps/web/src/lib/screening/routes.db.test.ts',
    'apps/web/src/lib/http/http.test.ts',
    'packages/db/src/screening.db.test.ts',
    'packages/db/src/mail.db.test.ts',
    'infra/test/monitoring.test.ts',
    'infra/test/application-role.test.ts',
  ]),
  'JOB-01': { completesIn: 3, build: workflow.job01, assertedBy: ['apps/worker/src/worker.db.test.ts', 'apps/worker/src/price/price.db.test.ts', 'apps/worker/src/monitor/monitor.db.test.ts', 'apps/web/e2e/monitoring.spec.ts'] },
  'JOB-02': none(7, 'Job failures are injected in the worker tests and in the monitoring chain run on synthetic files; the practice dashboard reads job_run.', [
    'apps/worker/src/worker.test.ts',
    'apps/worker/src/monitor/monitor.db.test.ts',
    'apps/web/src/lib/routes/monitoring-routes.db.test.ts',
    'apps/web/e2e/monitoring.spec.ts',
    'infra/test/monitoring.test.ts',
  ]),
  'JOB-03': none(7, 'A digest is built from counts and totals in the database; no file.', ['apps/worker/src/monitor/monitor.db.test.ts', 'apps/worker/src/digest/view.test.ts', 'apps/web/e2e/monitoring.spec.ts']),
  'JOB-04': none(1, 'Heartbeats are a contract between the worker and its alarm.', ['apps/worker/src/heartbeat.test.ts', 'infra/test/monitoring.test.ts']),
  'JOB-05': none(6, 'The events are synthetic EventBridge envelopes and simulator-shaped files the tests write; no file.', [
    'apps/worker/src/platform/mail-events.db.test.ts',
    'apps/worker/src/mail/events.test.ts',
    'packages/db/src/mail.db.test.ts',
    'infra/test/mail-streams.test.ts',
  ]),
  'MOD-01': {
    completesIn: 10,
    build: (b) => {
      workflow.mod01(b);
      addContractSet(b);
    },
    assertedBy: [
      'packages/model-gateway/src/fixtures.test.ts',
      'packages/model-gateway/src/functions/contract-terms.test.ts',
      'packages/model-gateway/eval/gate.golden.test.ts',
      'packages/model-gateway/eval/score.test.ts',
      'apps/web/src/lib/routes/models-routes.db.test.ts',
      'apps/web/e2e/models.spec.ts',
    ],
  },
  'MOD-02': { completesIn: 10, build: workflow.mod02, assertedBy: ['packages/model-gateway/src/fixtures.test.ts', 'packages/model-gateway/src/functions/contract-terms.test.ts', 'apps/web/src/lib/routes/models-routes.db.test.ts'] },
  'MOD-03': {
    completesIn: 10,
    build: addNarrativeSet,
    assertedBy: ['packages/model-gateway/eval/gate.golden.test.ts', 'packages/model-gateway/src/functions/narrative.test.ts', 'apps/web/src/lib/routes/models-routes.db.test.ts', 'apps/web/e2e/models.spec.ts'],
  },
  'MOD-04': { completesIn: 10, build: workflow.mod04, assertedBy: ['packages/model-gateway/src/fixtures.test.ts', 'packages/model-gateway/src/untrusted.test.ts', 'packages/model-gateway/src/gateway.db.test.ts'] },
  'MOD-05': none(10, 'A per-practice budget, a gateway setting; no file.', [
    'packages/model-gateway/src/gateway.test.ts',
    'packages/model-gateway/src/gateway.db.test.ts',
    'apps/web/src/lib/routes/models-routes.db.test.ts',
    'apps/web/src/lib/routes/console-routes.db.test.ts',
    'infra/test/monitoring.test.ts',
  ]),
  'MOD-06': none(10, 'The kill switch is a feature flag; the product runs on hand-entered records; no file.', [
    'packages/model-gateway/src/gateway.test.ts',
    'packages/model-gateway/src/gateway.db.test.ts',
    'apps/web/src/lib/routes/models-routes.db.test.ts',
    'apps/web/src/lib/routes/console-routes.db.test.ts',
    'apps/web/e2e/models.spec.ts',
  ]),
  // The model evaluation gate and per-feature serving (combined audit #84; docs/adr/0070 Parts 1 and 2).
  'MOD-07': none(10, 'The gate’s counting rule, scored on the MOD-09 set and on permitted examples; no file of its own.', [
    'packages/model-gateway/eval/score.test.ts',
    'packages/model-gateway/eval/gate.golden.test.ts',
    'packages/model-gateway/src/permitted.test.ts',
    'apps/worker/src/models/permitted.db.test.ts',
  ]),
  'MOD-08': none(10, 'Faults injected into the MOD-09 set’s reference answers.', ['packages/model-gateway/eval/gate.golden.test.ts', 'packages/model-gateway/src/functions/contract-terms.test.ts']),
  'MOD-09': { completesIn: 10, build: addContractSetV2, assertedBy: ['packages/model-gateway/eval/gate.golden.test.ts', 'packages/synth/src/eval/eval.test.ts'] },
  'MOD-10': none(10, 'The twins and decoys are cases of the MOD-09 set.', ['packages/model-gateway/eval/gate.golden.test.ts', 'packages/model-gateway/eval/score.test.ts']),
  'MOD-11': none(10, 'Serving is read from eval/baseline.json and eval/floors.json; no file.', [
    'packages/model-gateway/src/config.test.ts',
    'packages/model-gateway/src/gateway.test.ts',
    'packages/model-gateway/eval/gate.golden.test.ts',
    'apps/web/src/lib/routes/models-routes.db.test.ts',
  ]),
  // Milestone 11's billing (PRD 6, 15), as combined audit item 135 orders its payment methods (docs/adr/0073).
  'BIL-01': none(11, 'The Payment Element’s options and the confirmation’s notices are built from values the test passes in memory; Stripe’s form never renders; no file.', ['apps/web/src/components/billing/billing.test.tsx']),
  'BIL-02': none(11, 'The Stripe adapter runs against a mocked SDK client that records each request; no file.', ['packages/billing/src/stripe.test.ts', 'packages/billing/src/types.test.ts']),
  'BIL-03': none(11, 'The Payment method card is rendered from props the test passes, and the page from a synthetic organization on the local simulator; no file.', [
    'apps/web/src/components/billing/billing.test.tsx',
    'apps/web/e2e/billing.spec.ts',
    'apps/web/e2e/onboarding.spec.ts',
  ]),
  'BIL-04': none(11, 'A synthetic organization pays through the routes on the local simulator, by the simulator’s test card and bank account, and the simulator renews its plan; no file.', [
    'apps/web/src/lib/routes/billing-routes.db.test.ts',
    'packages/billing/src/local.test.ts',
  ]),
  'BIL-05': none(11, 'accountStanding and standingKind are pure functions of values the test passes in memory, and the routes read synthetic organizations; no file.', [
    'packages/billing/src/standing.test.ts',
    'apps/web/src/components/billing/account-standing.test.tsx',
    'apps/web/src/lib/routes/billing-routes.db.test.ts',
  ]),
  'BIL-06': none(11, 'A synthetic organization held suspended by the seed; no file.', [
    'apps/web/e2e/billing.spec.ts',
    'apps/web/src/lib/routes/billing-routes.db.test.ts',
    'apps/web/src/lib/routes/onboarding-routes.db.test.ts',
    'apps/web/scripts/seed.db.test.ts',
  ]),
  // SS-01: whose hold stops which work, PaidWhole's stored suspension and the dunning mail's truth (docs/adr/0080).
  'BIL-07': none(11, 'Synthetic organizations, people and grants the tests write as the owner on a migrated database, and the route world’s firm; no file.', [
    'packages/db/src/suspension.db.test.ts',
    'apps/web/src/lib/routes/route-tests/define.ts',
    'apps/worker/src/packets/export-attempts.db.test.ts',
    'apps/worker/src/worker.test.ts',
  ]),
  'BIL-08': none(11, 'The setter and the routes run on synthetic organizations and platform administrators the tests write; no file.', [
    'packages/db/src/organization-status.db.test.ts',
    'packages/db/src/hardening.db.test.ts',
    'apps/web/src/lib/routes/console-routes.db.test.ts',
  ]),
  'BIL-09': none(11, 'The words are pure functions of values the test passes in memory, and the journeys read a firm, a client practice and a console firm the seed holds; no file.', [
    'apps/web/src/components/console/suspension-text.test.ts',
    'apps/web/src/components/billing/account-standing.test.tsx',
    'apps/web/e2e/billing.spec.ts',
  ]),
  'BIL-10': none(11, 'dunningMessage is a pure function of values the test passes in memory, and the sends run on synthetic organizations and invoices; no file.', [
    'apps/worker/src/billing/dunning-words.test.ts',
    'apps/worker/src/billing/billing.db.test.ts',
  ]),
  // Milestone 0's "CI with every gate from section 18" (PRD 17), as the CI series rebuilds it (docs/adr/0066).
  'CI-01': none(0, 'The gate reads the results of the jobs it needs, which its test builds in memory; no file.', ['tools/test/ci-gate.test.ts', 'tools/test/workflows.test.ts']),
  'CI-02': none(0, 'The partition reads the route registry; no file.', ['apps/web/src/lib/routes/route-tests/partition.test.ts']),
  'CI-03': none(0, 'Both snapshots read two synthetic worlds the test builds on a scratch database; no file.', ['apps/web/src/lib/routes/route-tests/snapshot.db.test.ts']),
  'CI-04': none(0, 'The split is computed by vitest over the repository’s own db files, and the shard list from results built in memory; no file.', ['tools/test/db-shards.test.ts', 'tools/test/workflows.test.ts']),
  'CI-05': none(0, 'The guard is run with and without a browser in place; no file.', ['tools/test/ci-chromium.test.ts', 'tools/test/workflows.test.ts']),
  'CI-06': none(0, 'The stamp is written and read in a temporary directory; no file.', ['apps/web/scripts/build-stamp.test.ts', 'tools/test/workflows.test.ts']),
  'CI-07': none(0, 'The Playwright configuration is read, and a probe that passes only on its retry is written to a temporary directory and run there; no file.', ['apps/web/scripts/build-stamp.test.ts', 'tools/test/workflows.test.ts']),
  'CI-08': none(0, 'The groups and the scheduler are planned for hosts the test describes; no file.', ['tools/lint/groups.test.ts']),
  'CI-09': none(0, 'The workflow and the database suite are read; the drift case migrates a scratch database; no file.', ['tools/test/workflows.test.ts', 'packages/db/src/domain-model/domain-model.db.test.ts']),
  'CI-10': none(0, 'Every workflow file is read; no file.', ['tools/test/workflows.test.ts']),
  // The pins, Dependabot, the images and the toolchain (docs/adr/0066, Part 2).
  'CI-11': none(0, "Every workflow file is read; the actions' tags and files are synthetic ls-remote lines and action files the tests build in memory; no file.", ['tools/check-action-pins/check.test.ts', 'tools/check-action-pins/verify.test.ts', 'tools/check-action-pins/workflows.test.ts', 'tools/test/workflows.test.ts']),
  'CI-12': none(0, 'The Dependabot configuration is read, here and in a copy with every pin and digest rewritten in a temporary directory; no file.', ['tools/test/dependabot-config.test.ts', 'tools/test/workflows.test.ts']),
  'CI-13': none(0, 'The Dockerfiles, docker-compose.yml and the workflows are read; the Postgres script runs against a stub docker in a temporary directory; no file.', ['tools/test/workflows.test.ts', 'tools/test/no-duplicated-versions.test.ts', 'tools/ci/postgres.test.ts', 'tools/screening-capacity/measure.test.ts', 'tools/screening-capacity/watched.test.ts']),
  'CI-14': none(0, "The lockfile, the manifests and the exception lists are read; the registry's answers and the base's tree are built in memory; no file.", ['tools/check-toolchain/check.test.ts', 'tools/check-toolchain/registry.test.ts', 'tools/check-toolchain/tree.test.ts', 'tools/check-licenses/check.test.ts', 'tools/test/no-duplicated-versions.test.ts']),
  // The mutation workflow's (docs/adr/0066, Part 4).
  'CI-15': none(0, "The canary's five cases run under Stryker in every shard; their verdict is judged from reports built in memory; no file.", ['tools/stryker/canary/verdict.test.ts', 'tools/test/workflows.test.ts']),
  'CI-16': none(0, "The gate judges shards' reports and equivalents the test builds in memory; no file.", ['tools/stryker/gate.test.ts', 'tools/stryker/mutants.test.ts', 'tools/test/workflows.test.ts']),
  'CI-17': none(0, 'The closures are read from synthetic repositories the test writes to a temporary directory and from this one; no file.', ['tools/stryker/affected.test.ts', 'tools/stryker/shards.test.ts', 'tools/screening-capacity/watched.test.ts', 'tools/test/workflows.test.ts']),
  // The generated function files of the combined audit's item 111 (docs/adr/0068).
  'DBF-01': none(0, 'The function files are generated from a scratch database the drift file migrates; no file.', ['packages/db/src/domain-model/function-files.db.test.ts']),
  'DBF-02': none(0, 'A probe migration changes a function on a scratch database; no file.', ['packages/db/src/domain-model/domain-model-drift.db.test.ts']),
  'DBF-03': none(0, 'The files are rendered from catalog rows the test builds in memory, and from a scratch database; no file.', ['packages/db/src/domain-model/functions.test.ts', 'packages/db/src/domain-model/function-files.db.test.ts']),
  'DBF-04': none(0, 'The directory is written and checked in a temporary directory, and the CLI run against a scratch database; no file.', ['packages/db/src/domain-model/function-files.test.ts', 'packages/db/src/domain-model/function-files.db.test.ts']),
  'DBF-05': none(0, 'The files and the summary are rendered from catalog rows and directories the test builds; no file.', ['packages/db/src/domain-model/functions.test.ts', 'packages/db/src/domain-model/summary.test.ts']),
  // The release content checks (docs/adr/0071).
  'RCC-01': none(0, 'The files are written to a temporary root by the test; no file.', ['packages/rules/src/import.test.ts', 'packages/rules/src/parsers/parsers.test.ts']),
  'RCC-02': none(0, 'The content sets are written to temporary roots, and the fixture releases are read; no file.', ['tools/verify-content/check.test.ts', 'packages/rules/src/coverage.test.ts', 'tools/release/release.test.ts']),
  'RCC-03': none(0, 'Two numbered releases are written to a temporary root; no file.', ['tools/verify-content/check.test.ts', 'tools/release/release.test.ts', 'packages/rules/src/coverage.test.ts']),
  'RCC-04': none(7, 'The month is seeded in a scratch database under release 900007; no file.', ['apps/worker/src/price/content.db.test.ts', 'apps/worker/src/price/content.test.ts']),
  'RCC-05': none(7, 'The months are seeded in a scratch database; no file.', [
    'apps/worker/src/monitor/monitor.db.test.ts',
    'apps/web/src/lib/pricing/content.db.test.ts',
    'apps/web/src/lib/routes/coverage-content.db.test.ts',
    'apps/web/src/components/pricing/content.test.tsx',
    'apps/worker/src/price/content.db.test.ts',
  ]),
  'RCC-06': none(7, 'The priced lines are seeded in a scratch database; no file.', ['packages/triage/src/actionable.test.ts', 'apps/worker/src/triage/triage.db.test.ts', 'apps/worker/src/report/report.test.ts']),
  'RCC-07': none(7, 'The runs are seeded in a scratch database; the weekly run builds release 900110 outside the repository; no file.', [
    'apps/worker/src/price/keyed-release.test.ts',
    'apps/worker/src/price/release-source.db.test.ts',
    'tools/release-capacity/checks.test.ts',
    'tools/test/workflows.test.ts',
  ]),
  'RCC-08': none(0, 'The calendar is module data and the sources are written to a temporary root; no file.', [
    'packages/rules/src/calendar.test.ts',
    'tools/content-calendar/content-calendar.test.ts',
    'apps/web/src/lib/routes/console-routes.db.test.ts',
    'apps/web/src/lib/releases/content-through.db.test.ts',
    'apps/web/src/lib/routes/reruns-routes.db.test.ts',
    'apps/web/src/components/pricing/content.test.tsx',
    'tools/test/workflows.test.ts',
  ]),
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
  const module = (variant ? 'PAR' : id.slice(0, id.indexOf('-'))) as CaseModule;
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
  definition(
    variant.id,
    variant.title,
    'Parses; pyx12 reads the same segments, amounts and balances',
    { completesIn: 2, assertedBy: ['packages/edi835/src/fixtures.test.ts'] },
    `variants/${variant.id}-${variant.slug}`,
    true,
    variant.build,
  ),
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
