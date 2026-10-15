import path from 'node:path';

import { repositoryRoot } from '../content-files';
import { checkContent } from './check';

/**
 * `pnpm verify-content [dir...]`: the content checker of PRD section 9 (see check.ts). With no
 * arguments it checks content/drafts and every release under content/outgoing and content/releases;
 * given directories (for example fixtures/synthetic/rules/release-synth-1) it checks those instead.
 */
const dirs = process.argv.slice(2).map((dir) => path.resolve(process.env.INIT_CWD ?? process.cwd(), dir));
const result = checkContent(repositoryRoot, dirs);
if (result.ok) {
  process.stdout.write(`${result.message}\n`);
} else {
  process.stderr.write(`${result.message}\n`);
  process.exitCode = 1;
}
