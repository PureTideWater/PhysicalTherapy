import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { repositoryRoot } from './content-files';

/** Where `pnpm test:golden --report` asks the golden tests to write their differences. */
export const GOLDEN_REPORT_PATH = path.join('fixtures', 'golden', '.report');

export interface GoldenInvocation {
  readonly vitestArgs: readonly string[];
  readonly env: Readonly<Record<string, string>>;
}

/**
 * `pnpm test:golden [--report]` runs the Vitest "golden" project (files named *.golden.test.ts).
 * With --report, the golden tests write every difference to fixtures/golden/.report (the
 * golden-diff skill reads it); they never touch the fixtures themselves.
 */
export function goldenInvocation(argv: readonly string[]): GoldenInvocation {
  const report = argv.includes('--report');
  const rest = argv.filter((arg) => arg !== '--report');
  return {
    vitestArgs: ['run', '--project', 'golden', '--passWithNoTests', ...rest],
    env: report ? { TP_GOLDEN_REPORT: path.join(repositoryRoot, GOLDEN_REPORT_PATH) } : {},
  };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const invocation = goldenInvocation(process.argv.slice(2));
  const result = spawnSync('vitest', invocation.vitestArgs, {
    cwd: repositoryRoot,
    stdio: 'inherit',
    env: { ...process.env, ...invocation.env },
  });
  process.exitCode = result.status ?? 1;
}
