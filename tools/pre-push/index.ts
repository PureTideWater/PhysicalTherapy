import { readFileSync } from 'node:fs';

import { repositoryRoot } from '../content-files';
import { prePush } from './pre-push';

/**
 * The pre-push hook's program (`.githooks/pre-push` runs it; docs/adr/0063): git's ref updates on standard input,
 * the remote's name (or URL) as the first argument, and the working tree's top as the directory. It prints what it
 * checked, or every refusal, and exits 1 to stop the push.
 */
const remote = process.argv[2] ?? '';
const result = prePush({ root: process.cwd(), checkout: repositoryRoot, remote, input: readFileSync(0, 'utf8'), env: process.env });
for (const line of result.lines) {
  process.stderr.write(`${line}\n`);
}
process.exitCode = result.allowed ? 0 : 1;
