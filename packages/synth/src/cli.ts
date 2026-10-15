import path from 'node:path';

import { SynthUsageError, parseSynthArgs } from './args';
import { LARGE_FIXTURE_PATH, writeLargeFixture } from './cases/large';
import { ALL_CASES, findCase } from './cases/registry';
import { writeCases } from './write';

/**
 * `pnpm synth --all | --case <id> | --large`: writes fixtures/synthetic/<case>/ for every test-matrix
 * case and oracle variant, or for one, or the 10,000-claim PAR-29 file into its ignored path.
 * Generation is deterministic, so running it on a clean checkout changes nothing.
 */
const root = path.resolve(import.meta.dirname, '../../../fixtures/synthetic');
try {
  const request = parseSynthArgs(process.argv.slice(2));
  if (request.kind === 'large') {
    await writeLargeFixture(root);
    process.stdout.write(`synth: wrote fixtures/synthetic/${LARGE_FIXTURE_PATH} (ignored by git).\n`);
    process.exit(0);
  }
  let definitions = ALL_CASES;
  if (request.kind === 'case') {
    const found = findCase(request.caseId);
    if (!found) {
      throw new SynthUsageError(`no case ${request.caseId} in the registry (docs/product/test-matrix.md lists the cases)`);
    }
    definitions = [found];
  }
  const result = writeCases(root, definitions.map((definition) => definition.generate()), request.kind === 'all' ? 'all' : 'cases');
  for (const file of result.written) {
    process.stdout.write(`wrote fixtures/synthetic/${file}\n`);
  }
  for (const file of result.removed) {
    process.stdout.write(`removed fixtures/synthetic/${file}\n`);
  }
  process.stdout.write(`synth: ${String(definitions.length)} case(s); ${String(result.written.length)} file(s) written, ${String(result.unchanged)} unchanged, ${String(result.removed.length)} removed.\n`);
} catch (error) {
  if (!(error instanceof SynthUsageError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
