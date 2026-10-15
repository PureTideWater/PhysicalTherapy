import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  type ImportableType,
  MANIFEST_FILE,
  PARSERS,
  RELEASE_NOTES_FILE,
  type RuleRecord,
  buildManifest,
  buildParsedRecords,
  decodeSourceText,
  serializeManifest,
  serializeRecords,
  sha256,
} from '@tp/rules';
import { isRecordFile, listContentFiles, readRecordFile } from '@tp/rules/content';

import { repositoryRoot } from '../content-files';
import { releaseNotes } from './assemble';

/**
 * Builds the SYNTHETIC test release in fixtures/synthetic/rules/release-synth-900001: the parsed records
 * come from the synthetic CMS- and X12-format files in fixtures/synthetic/cms through the same
 * parsers as real imports; the hand-typed records (thresholds, assistant, sequestration, the MPPR
 * percentage, windows, prompt pay, a denial category) and their second passes are committed by hand
 * beside them. RELEASE.md and MANIFEST.json cover both. A unit test keeps the committed files equal
 * to what this produces; run `tsx tools/release/synthetic.ts` after changing a synthetic source.
 */
export const SYNTHETIC_RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900001';
export const SYNTHETIC_RELEASE_NUMBER = 900_001;
const SYNTHETIC_SOURCES_DIR = 'fixtures/synthetic/cms';
const BUILT_ON = '2026-10-15';

const PARSED_SOURCES: readonly { readonly type: ImportableType; readonly file: string }[] = [
  { type: 'pfs_rvu', file: 'PPRRVU_SYNTHETIC.csv' },
  { type: 'pfs_gpci', file: 'GPCI_SYNTHETIC.csv' },
  { type: 'locality_map', file: 'ZIP5_SYNTHETIC.txt' },
  { type: 'conversion_factor', file: 'conversion-factor-SYNTHETIC-pass-1.csv' },
  { type: 'mppr_rate', file: 'MPPR_SYNTHETIC.csv' },
  { type: 'ncci_ptp', file: 'NCCI_PTP_SYNTHETIC.txt' },
  { type: 'ncci_mue', file: 'NCCI_MUE_SYNTHETIC.csv' },
  { type: 'carc', file: 'CARC_SYNTHETIC.csv' },
  { type: 'rarc', file: 'RARC_SYNTHETIC.csv' },
  { type: 'claim_status_code', file: 'CLAIM_STATUS_SYNTHETIC.csv' },
];

function parsedRecordFile(root: string, type: ImportableType, file: string): { path: string; records: RuleRecord[] } {
  const parser = PARSERS[type];
  const sourcePath = `${SYNTHETIC_SOURCES_DIR}/${file}`;
  const bytes = readFileSync(path.join(root, sourcePath));
  const outcome = parser.parse(decodeSourceText(bytes), { year: 2026, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' });
  const records = buildParsedRecords({
    parser,
    rows: outcome.rows,
    source: { title: `SYNTHETIC ${parser.title} (invented values)`, url: null, path: sourcePath, retrieved: BUILT_ON, sha256: sha256(bytes), synthetic: true },
    checkedBy: 'SYNTHETIC fixture builder (tools/release/synthetic.ts)',
    checkedOn: BUILT_ON,
  });
  return { path: `${type}/2026/${file.replace(/\.[^.]*$/, '')}.json`, records };
}

/** Every generated file of the synthetic release (relative path to content), given the hand-typed files on disk. */
export function renderSyntheticRelease(root: string = repositoryRoot): Map<string, string> {
  const dir = path.join(root, SYNTHETIC_RELEASE_DIR);
  const generated = new Map<string, string>();
  const records: RuleRecord[] = [];
  for (const { type, file } of PARSED_SOURCES) {
    const parsed = parsedRecordFile(root, type, file);
    generated.set(parsed.path, serializeRecords(parsed.records));
    records.push(...parsed.records);
  }
  const committed = listContentFiles(dir)
    .map((file) => file.path)
    .filter((file) => file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE && !generated.has(file));
  for (const file of committed.filter(isRecordFile)) {
    records.push(...readRecordFile(path.join(dir, file), file).records.map((located) => located.record));
  }
  generated.set(
    RELEASE_NOTES_FILE,
    releaseNotes({
      title: `SYNTHETIC test release ${String(SYNTHETIC_RELEASE_NUMBER)}`,
      summary: [
        `Built ${BUILT_ON} by \`tsx tools/release/synthetic.ts\` from fixtures/synthetic/cms. Invented values for tests: never published,`,
        'never loaded outside a scratch test database, never used to price a real line.',
      ].join('\n'),
      records,
      impact: ['SYNTHETIC fixture: loaded only into scratch test databases, where no pricing runs exist.'],
    }),
  );
  const hashes = new Map<string, string>([
    ...[...generated.entries()].map(([file, text]): [string, string] => [file, sha256(text)]),
    ...committed.map((file): [string, string] => [file, sha256(readFileSync(path.join(dir, file)))]),
  ]);
  generated.set(MANIFEST_FILE, serializeManifest(buildManifest(SYNTHETIC_RELEASE_NUMBER, hashes)));
  return generated;
}

/**
 * The SYNTHETIC "release 2" of the re-run tests (test matrix PRC-19; docs/adr/0037): every file of
 * release 900001 unchanged but its relative values, parsed by the same parser from
 * fixtures/synthetic/cms/PPRRVU_SYNTHETIC_900004.csv, which differs from PPRRVU_SYNTHETIC.csv in one
 * value only: the 97110 work RVU, 0.31 in 900001 and 0.41 here. Its other relative-value records keep
 * their values and windows under a new source hash, as a re-sourced CMS file's would.
 */
export const RERUN_RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900004';
export const RERUN_RELEASE_NUMBER = 900_004;
const RERUN_RVU = { type: 'pfs_rvu' as const, file: 'PPRRVU_SYNTHETIC_900004.csv', replaces: 'pfs_rvu/2026/PPRRVU_SYNTHETIC.json' };

/** Every file of release 900004, from release 900001 on disk and the changed relative-value file. */
export function renderRerunRelease(root: string = repositoryRoot): Map<string, string> {
  const first = path.join(root, SYNTHETIC_RELEASE_DIR);
  const generated = new Map<string, string>();
  const records: RuleRecord[] = [];
  const carried = listContentFiles(first)
    .map((file) => file.path)
    .filter((file) => file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE && file !== RERUN_RVU.replaces);
  for (const file of carried) {
    generated.set(file, readFileSync(path.join(first, file), 'utf8'));
    if (isRecordFile(file)) {
      records.push(...readRecordFile(path.join(first, file), file).records.map((located) => located.record));
    }
  }
  const rvu = parsedRecordFile(root, RERUN_RVU.type, RERUN_RVU.file);
  generated.set(rvu.path, serializeRecords(rvu.records));
  records.push(...rvu.records);
  generated.set(
    RELEASE_NOTES_FILE,
    releaseNotes({
      title: `SYNTHETIC test release ${String(RERUN_RELEASE_NUMBER)}`,
      summary: [
        `Built ${BUILT_ON} by \`tsx tools/release/synthetic.ts\`: every file of release 900001 unchanged but its relative values, re-parsed`,
        'from fixtures/synthetic/cms/PPRRVU_SYNTHETIC_900004.csv, where the 97110 work RVU is 0.41 instead of 0.31 and nothing else',
        'differs. The "release 2" of the re-run tests (PRC-19). Invented values for tests: never published, never loaded outside a',
        'scratch test database, never used to price a real line.',
      ].join('\n'),
      records,
      impact: ['SYNTHETIC fixture: loaded only into scratch test databases; the re-run tests price under it there.'],
    }),
  );
  const hashes = new Map<string, string>([...generated.entries()].map(([file, text]): [string, string] => [file, sha256(text)]));
  generated.set(MANIFEST_FILE, serializeManifest(buildManifest(RERUN_RELEASE_NUMBER, hashes)));
  return generated;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  for (const [dir, files] of [
    [SYNTHETIC_RELEASE_DIR, renderSyntheticRelease()],
    [RERUN_RELEASE_DIR, renderRerunRelease()],
  ] as const) {
    for (const [file, text] of files) {
      const target = path.join(repositoryRoot, dir, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    process.stdout.write(`synthetic release written to ${dir}\n`);
  }
}
