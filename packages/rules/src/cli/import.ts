import path from 'node:path';
import { parseArgs } from 'node:util';

import { importRuleFile } from '../import';
import { IMPORTABLE_TYPES, RuleImportError, isImportableType } from '../parsers';

/**
 * pnpm rules:import --type <type> --year <year> --file <path>
 *   [--second-pass <path>] [--url <url>] [--title <title>] [--retrieved YYYY-MM-DD]
 *   [--effective-from YYYY-MM-DD] [--effective-to YYYY-MM-DD|open]
 */
const USAGE = `usage: pnpm rules:import --type <${IMPORTABLE_TYPES.join('|')}> --year <year> --file <path>
         [--second-pass <path>] [--url <download url>] [--title <title>] [--retrieved YYYY-MM-DD]
         [--effective-from YYYY-MM-DD] [--effective-to YYYY-MM-DD|open]`;

const root = path.resolve(import.meta.dirname, '../../../..');
const today = new Date().toISOString().slice(0, 10);

function fail(message: string, code = 1): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

let values: Record<string, string | undefined>;
try {
  ({ values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      type: { type: 'string' },
      year: { type: 'string' },
      file: { type: 'string' },
      'second-pass': { type: 'string' },
      url: { type: 'string' },
      title: { type: 'string' },
      retrieved: { type: 'string' },
      'effective-from': { type: 'string' },
      'effective-to': { type: 'string' },
    },
    strict: true,
    allowPositionals: false,
  }));
} catch {
  fail(USAGE, 2);
}

const { type, year, file } = values;
if (type === undefined || year === undefined || file === undefined || !isImportableType(type) || !/^\d{4}$/.test(year)) {
  fail(USAGE, 2);
}

try {
  const effectiveTo = values['effective-to'];
  const result = importRuleFile({
    root,
    type,
    year: Number.parseInt(year, 10),
    file: path.resolve(process.env.INIT_CWD ?? process.cwd(), file),
    ...(values['second-pass'] === undefined ? {} : { secondPass: path.resolve(process.env.INIT_CWD ?? process.cwd(), values['second-pass']) }),
    url: values.url ?? null,
    ...(values.title === undefined ? {} : { title: values.title }),
    retrieved: values.retrieved ?? today,
    ...(values['effective-from'] === undefined ? {} : { effectiveFrom: values['effective-from'] }),
    ...(effectiveTo === undefined ? {} : { effectiveTo: effectiveTo === 'open' ? null : effectiveTo }),
    today,
  });
  const lines = [
    `rules:import: ${String(result.records)} ${type} records drafted at verification L1.`,
    `  source  ${result.source} (sha256 ${result.sha256})`,
    ...(result.secondPassSource === null ? [] : [`  second  ${result.secondPassSource}`]),
    `  draft   ${result.draft}`,
    `  review  ${result.review}`,
    ...result.notes.map((note) => `  note    ${note}`),
    '',
    'Questions a reviewer must answer for L2:',
    ...result.questions.map((question, index) => `  ${String(index + 1)}. ${question}`),
    '',
    'Run pnpm verify-content next.',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
} catch (error) {
  if (error instanceof RuleImportError) {
    fail(`rules:import: ${error.message}`);
  }
  if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
    fail(`rules:import: cannot read ${'path' in error && typeof error.path === 'string' ? error.path : 'the file'}`);
  }
  throw error;
}
