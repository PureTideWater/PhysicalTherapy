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
import { addContractSet, addNarrativeSet } from '../eval/cases';

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
