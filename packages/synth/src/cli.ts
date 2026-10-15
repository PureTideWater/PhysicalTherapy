import { SynthUsageError, parseSynthArgs } from './args';

/**
 * `pnpm synth --all | --case <id>`. The generators arrive in milestone 2; until then this accepts
 * the same arguments, generates nothing and exits 0 so CI's `pnpm synth --all` step runs.
 */
try {
  const request = parseSynthArgs(process.argv.slice(2));
  const target = request.kind === 'all' ? 'every test-matrix case' : `case ${request.caseId}`;
  process.stdout.write(
    `synth: no generators yet (they arrive with milestone 2); nothing generated for ${target}.\n`,
  );
} catch (error) {
  if (!(error instanceof SynthUsageError)) {
    throw error;
  }
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 2;
}
