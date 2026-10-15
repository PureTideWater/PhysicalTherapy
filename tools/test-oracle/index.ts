import { repositoryRoot } from '../content-files';
import { findOracleFixtures } from './fixtures';

/**
 * `pnpm test:oracle`: compares packages/edi835 with pyx12 on every synthetic 835 fixture, segment
 * by segment, amount by amount (PRD section 18, the 835 oracle). The fixtures and the comparison
 * arrive together in milestone 2. Until then it passes only while no X12 fixture exists, so a
 * fixture can never sit in the repository without the oracle reading it.
 */
const fixtures = findOracleFixtures(repositoryRoot);
if (fixtures.length === 0) {
  process.stdout.write('test:oracle: no synthetic 835 fixtures yet (milestone 2); nothing to compare with pyx12.\n');
} else {
  process.stderr.write(
    `test:oracle: ${String(fixtures.length)} X12 fixture(s) found under fixtures/synthetic, but the pyx12 comparison is not implemented yet.\n`,
  );
  process.exitCode = 1;
}
