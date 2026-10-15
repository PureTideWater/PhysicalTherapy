import { repositoryRoot } from '../content-files';
import { checkContent } from './check';

/**
 * `pnpm verify-content`: the content checker of PRD section 9. Milestone 0 part B adds the rule
 * record schema (packages/rules/src/schema.ts) and the checks; until then it passes only while
 * there is no content to check, so a draft can never slip through unchecked.
 */
const result = checkContent(repositoryRoot);
if (result.ok) {
  process.stdout.write(`${result.message}\n`);
} else {
  process.stderr.write(`${result.message}\n`);
  process.exitCode = 1;
}
