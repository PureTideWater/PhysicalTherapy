import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  type ImportableType,
  MANIFEST_FILE,
  PARSERS,
  RELEASE_NOTES_FILE,
  type RuleRecord,
  RuleImportError,
  buildManifest,
  buildParsedRecords,
  compareConversionFactorPasses,
  decodeSourceText,
  serializeManifest,
  serializeRecords,
  sha256,
} from '@tp/rules';
import { isRecordFile, listContentFiles, readRecordFile } from '@tp/rules/content';

import { repositoryRoot } from '../content-files';
import { releaseNotes } from '../release/assemble';
import { SYNTHETIC_RELEASE_DIR } from '../release/synthetic';

/**
 * Builds the SYNTHETIC test release 900002 for the golden lines (fixtures/golden/README.md): every file
 * of release 900001 unchanged, plus a second fee-schedule year (2025 relative values, GPCIs and
 * conversion factors) parsed by the same parsers as real imports from the SYNTHETIC files in
 * fixtures/golden/sources. Percent-of-Medicare contracts locked to 2025 (PRC-04) price from it.
 * Release 900001 is never changed. A unit test keeps the committed release equal to what this
 * produces; run `tsx tools/golden-worksheet/synthetic-release.ts` after changing a source.
 */
export const SECOND_YEAR_RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900002';
export const SECOND_YEAR_RELEASE_NUMBER = 900_002;
export const SECOND_YEAR_SOURCES_DIR = 'fixtures/golden/sources';
const SECOND_YEAR = 2025;
const BUILT_ON = '2026-10-15';

const PARSED_SOURCES: readonly { readonly type: ImportableType; readonly file: string; readonly secondPass?: string }[] = [
  { type: 'pfs_rvu', file: 'PPRRVU_SYNTHETIC_2025.csv' },
  { type: 'pfs_gpci', file: 'GPCI_SYNTHETIC_2025.csv' },
  { type: 'conversion_factor', file: 'conversion-factor-SYNTHETIC-2025-pass-1.csv', secondPass: 'conversion-factor-SYNTHETIC-2025-pass-2.csv' },
];

function parsedRecordFile(root: string, type: ImportableType, file: string, secondPass: string | undefined): { path: string; records: RuleRecord[] } {
  const parser = PARSERS[type];
  const window = { year: SECOND_YEAR, effectiveFrom: `${String(SECOND_YEAR)}-01-01`, effectiveTo: `${String(SECOND_YEAR)}-12-31` };
  const sourcePath = `${SECOND_YEAR_SOURCES_DIR}/${file}`;
  const bytes = readFileSync(path.join(root, sourcePath));
  const outcome = parser.parse(decodeSourceText(bytes), window);
  if (secondPass !== undefined) {
    // The conversion-factor CSV is typed by a person, so it is prepared twice and both must agree.
    const second = parser.parse(decodeSourceText(readFileSync(path.join(root, SECOND_YEAR_SOURCES_DIR, secondPass))), window);
    const differences = compareConversionFactorPasses(outcome.rows, second.rows);
    if (differences.length > 0) {
      throw new RuleImportError(`${file} and ${secondPass} differ:\n  ${differences.join('\n  ')}`);
    }
  }
  const records = buildParsedRecords({
    parser,
    rows: outcome.rows,
    source: { title: `SYNTHETIC ${parser.title}, ${String(SECOND_YEAR)} (invented values)`, url: null, path: sourcePath, retrieved: BUILT_ON, sha256: sha256(bytes), synthetic: true },
    checkedBy: 'SYNTHETIC fixture builder (tools/golden-worksheet/synthetic-release.ts)',
    checkedOn: BUILT_ON,
  });
  return { path: `${type}/${String(SECOND_YEAR)}/${file.replace(/\.[^.]*$/, '')}.json`, records };
}

/** Every file of release 900002 (relative path to content), from release 900001 and the 2025 sources on disk. */
export function renderSecondYearRelease(root: string = repositoryRoot): Map<string, string> {
  const first = path.join(root, SYNTHETIC_RELEASE_DIR);
  const generated = new Map<string, string>();
  const records: RuleRecord[] = [];
  const carried = listContentFiles(first)
    .map((file) => file.path)
    .filter((file) => file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE);
  for (const file of carried) {
    generated.set(file, readFileSync(path.join(first, file), 'utf8'));
    if (isRecordFile(file)) {
      records.push(...readRecordFile(path.join(first, file), file).records.map((located) => located.record));
    }
  }
  for (const { type, file, secondPass } of PARSED_SOURCES) {
    const parsed = parsedRecordFile(root, type, file, secondPass);
    generated.set(parsed.path, serializeRecords(parsed.records));
    records.push(...parsed.records);
  }
  generated.set(
    RELEASE_NOTES_FILE,
    releaseNotes({
      title: `SYNTHETIC test release ${String(SECOND_YEAR_RELEASE_NUMBER)}`,
      summary: [
        `Built ${BUILT_ON} by \`tsx tools/golden-worksheet/synthetic-release.ts\`: every file of release 900001 unchanged, plus`,
        `${String(SECOND_YEAR)} relative values, GPCIs and conversion factors from ${SECOND_YEAR_SOURCES_DIR}, for the golden lines locked`,
        `to a prior fee-schedule year. Invented values for tests: never published, never loaded outside a scratch test database,`,
        'never used to price a real line.',
      ].join('\n'),
      records,
      impact: ['SYNTHETIC fixture: loaded only into scratch test databases, where no pricing runs exist.'],
    }),
  );
  const hashes = new Map<string, string>([...generated.entries()].map(([file, text]): [string, string] => [file, sha256(text)]));
  generated.set(MANIFEST_FILE, serializeManifest(buildManifest(SECOND_YEAR_RELEASE_NUMBER, hashes)));
  return generated;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  for (const [file, text] of renderSecondYearRelease()) {
    const target = path.join(repositoryRoot, SECOND_YEAR_RELEASE_DIR, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, text);
  }
  process.stdout.write(`synthetic release written to ${SECOND_YEAR_RELEASE_DIR}\n`);
}
