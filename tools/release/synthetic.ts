import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  type ImportWindow,
  type ImportableType,
  MANIFEST_FILE,
  PARSERS,
  RELEASE_NOTES_FILE,
  type RuleRecord,
  SYNTHETIC_CARRIER,
  SYNTHETIC_STATE,
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

/** The window every synthetic source is parsed for unless a release says otherwise: the year 2026. */
const FULL_YEAR: ImportWindow = { year: 2026, effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31' };

function parsedRecordFile(
  root: string,
  type: ImportableType,
  file: string,
  builtOn: string = BUILT_ON,
  window: ImportWindow = FULL_YEAR,
): { path: string; records: RuleRecord[] } {
  const parser = PARSERS[type];
  const sourcePath = `${SYNTHETIC_SOURCES_DIR}/${file}`;
  const bytes = readFileSync(path.join(root, sourcePath));
  const outcome = parser.parse(decodeSourceText(bytes), window);
  const records = buildParsedRecords({
    parser,
    rows: outcome.rows,
    source: { title: `SYNTHETIC ${parser.title} (invented values)`, url: null, path: sourcePath, retrieved: builtOn, sha256: sha256(bytes), synthetic: true },
    checkedBy: 'SYNTHETIC fixture builder (tools/release/synthetic.ts)',
    checkedOn: builtOn,
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

/**
 * The SYNTHETIC release of the deadline tests (reconciliation-001 D17 a; docs/adr/0061): every file of release
 * 900001 unchanged but its dispute windows. The three Medicare records there (timely filing, redetermination and
 * reconsideration) keep their values, source and quotes, are raised to L2 by a SYNTHETIC second reader who read
 * them against fixtures/synthetic/cms/synthetic-rules.md, and carry that reader's independent second pass. A
 * Medicare or Medicare Advantage line priced under it has a verified deadline; releases 900001 to 900004 stay as
 * they are (110 of the golden claims pin 900001's manifest, and a record's level is part of its hash). Only the
 * tests that need it load it, since current_rule_release() picks the highest release loaded.
 */
export const DEADLINE_RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900005';
export const DEADLINE_RELEASE_NUMBER = 900_005;
const DEADLINE_WINDOWS = 'dispute_window/2026/records.json';
const DEADLINE_READ_ON = '2026-10-18';
const SECOND_READER = 'SYNTHETIC second reader (an invented person, for the deadline tests)';

/** A hand-typed file as the fixtures write them: two-space JSON and a final newline. */
const handTyped = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Every file of release 900005, from release 900001 on disk with its Medicare dispute windows read at L2. */
export function renderDeadlineRelease(root: string = repositoryRoot): Map<string, string> {
  const first = path.join(root, SYNTHETIC_RELEASE_DIR);
  const generated = new Map<string, string>();
  const records: RuleRecord[] = [];
  const windowsSecondPass = DEADLINE_WINDOWS.replace(/\.json$/, '.second-pass.json');
  const carried = listContentFiles(first)
    .map((file) => file.path)
    .filter((file) => file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE && file !== DEADLINE_WINDOWS && file !== windowsSecondPass);
  for (const file of carried) {
    generated.set(file, readFileSync(path.join(first, file), 'utf8'));
    if (isRecordFile(file)) {
      records.push(...readRecordFile(path.join(first, file), file).records.map((located) => located.record));
    }
  }
  const windows = (JSON.parse(readFileSync(path.join(first, DEADLINE_WINDOWS), 'utf8')) as Record<string, unknown>[]).map((record) => ({
    ...record,
    verification: {
      level: 'L2',
      by: SECOND_READER,
      on: DEADLINE_READ_ON,
      questions: ['SYNTHETIC fixture: read against its synthetic source by an invented second reader, never by a specialist, and never used to price a real line.'],
    },
  }));
  generated.set(DEADLINE_WINDOWS, handTyped(windows));
  records.push(...readRecordFile(path.join(first, DEADLINE_WINDOWS), DEADLINE_WINDOWS).records.map((located) => ({ ...located.record, verification: windows[0]?.verification as RuleRecord['verification'] })));
  const secondPass = JSON.parse(readFileSync(path.join(first, windowsSecondPass), 'utf8')) as Record<string, unknown>;
  generated.set(windowsSecondPass, handTyped({ ...secondPass, transcribed_by: `${SECOND_READER}, independent second pass`, transcribed_on: DEADLINE_READ_ON }));
  generated.set(
    RELEASE_NOTES_FILE,
    releaseNotes({
      title: `SYNTHETIC test release ${String(DEADLINE_RELEASE_NUMBER)}`,
      summary: [
        `Built ${BUILT_ON} by \`tsx tools/release/synthetic.ts\`: every file of release 900001 unchanged but its dispute windows, whose three`,
        `Medicare records keep their values, source and quotes and are read at L2 by a SYNTHETIC second reader on ${DEADLINE_READ_ON}, with that`,
        'reader’s independent second pass. The release of the deadline tests (D17 a): a Medicare or Medicare Advantage line priced under it has a',
        'verified deadline. Invented values for tests: never published, never loaded outside a scratch test database, never used to price a real line.',
      ].join('\n'),
      records,
      impact: ['SYNTHETIC fixture: loaded only into scratch test databases, by the tests that judge a verified Medicare deadline.'],
    }),
  );
  const hashes = new Map<string, string>([...generated.entries()].map(([file, text]): [string, string] => [file, sha256(text)]));
  generated.set(MANIFEST_FILE, serializeManifest(buildManifest(DEADLINE_RELEASE_NUMBER, hashes)));
  return generated;
}

/**
 * The SYNTHETIC release of the ZIP+4 tests (test matrix PRC-21; docs/adr/0064): every file of release 900001
 * unchanged but its GPCIs, parsed from fixtures/synthetic/cms/GPCI_SYNTHETIC_900006.csv (900001's locality 01 and a
 * second one, 02), and a ZIP+4 file, fixtures/synthetic/cms/ZIP9_SYNTHETIC.txt, for the ZIP 00012 that the ZIP5 file
 * flags: codes 0000-4999 in locality 01 and 5000-8999 in locality 02, while 9000-9999 are not listed (the gap the
 * tests of an unlisted ZIP+4 use). Releases 900001 to 900005 stay as they are, without a ZIP+4 record: there, 00012
 * with any ZIP+4 is ENGINE_ERROR no_locality_plus_four. No database loads 900006 before PR 6b-2, whose
 * migration lets rule_record hold the new record type (the founder's answer to PR 6b's Q3 (a)).
 */
export const PLUS_FOUR_RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900006';
export const PLUS_FOUR_RELEASE_NUMBER = 900_006;
const PLUS_FOUR_BUILT_ON = '2026-10-21';
const PLUS_FOUR_GPCI = { type: 'pfs_gpci' as const, file: 'GPCI_SYNTHETIC_900006.csv', replaces: 'pfs_gpci/2026/GPCI_SYNTHETIC.json' };
const PLUS_FOUR_ZIP9 = { type: 'locality_map_plus_four' as const, file: 'ZIP9_SYNTHETIC.txt' };
export const ZIP9_SYNTHETIC_FILE = `${SYNTHETIC_SOURCES_DIR}/${PLUS_FOUR_ZIP9.file}`;
/** The ZIP+4 codes of ZIP9_SYNTHETIC.txt, all of the ZIP 00012: [first code, last code, locality]. */
const ZIP9_SYNTHETIC_RANGES = [
  [0, 4999, '01'],
  [5000, 8999, '02'],
] as const;

/**
 * The text of fixtures/synthetic/cms/ZIP9_SYNTHETIC.txt: one 80-character line per code, in the ZIP9 layout that
 * docs/adr/0064 records (one code per line). Positions 1-21 are the ZIP5 file's line for 00012 with the range's
 * locality (state ZZ, ZIP 00012, carrier 99999, locality, rural indicator R, the lab locality, the plus-four flag
 * 1), the code is at 22-25, and the year and quarter (20261) at 76-80, as in ZIP5_SYNTHETIC.txt. A file of 9,000
 * lines is not typed by hand: it is rendered here, and a unit test holds the committed file equal to it.
 */
export function renderZip9Synthetic(): string {
  const lines: string[] = [];
  for (const [first, last, locality] of ZIP9_SYNTHETIC_RANGES) {
    for (let code = first; code <= last; code += 1) {
      const positions = `${SYNTHETIC_STATE}00012${SYNTHETIC_CARRIER}${locality}R${locality}   1${String(code).padStart(4, '0')}`;
      lines.push(`${positions.padEnd(75, ' ')}20261`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Every file of release 900006, from release 900001 on disk, the GPCI file with a second locality and the ZIP9 file. */
export function renderPlusFourRelease(root: string = repositoryRoot): Map<string, string> {
  const first = path.join(root, SYNTHETIC_RELEASE_DIR);
  const generated = new Map<string, string>();
  const records: RuleRecord[] = [];
  const carried = listContentFiles(first)
    .map((file) => file.path)
    .filter((file) => file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE && file !== PLUS_FOUR_GPCI.replaces);
  for (const file of carried) {
    generated.set(file, readFileSync(path.join(first, file), 'utf8'));
    if (isRecordFile(file)) {
      records.push(...readRecordFile(path.join(first, file), file).records.map((located) => located.record));
    }
  }
  for (const source of [PLUS_FOUR_GPCI, PLUS_FOUR_ZIP9]) {
    const parsed = parsedRecordFile(root, source.type, source.file, PLUS_FOUR_BUILT_ON);
    generated.set(parsed.path, serializeRecords(parsed.records));
    records.push(...parsed.records);
  }
  generated.set(
    RELEASE_NOTES_FILE,
    releaseNotes({
      title: `SYNTHETIC test release ${String(PLUS_FOUR_RELEASE_NUMBER)}`,
      summary: [
        `Built ${PLUS_FOUR_BUILT_ON} by \`tsx tools/release/synthetic.ts\`: every file of release 900001 unchanged but its GPCIs, re-parsed from`,
        'fixtures/synthetic/cms/GPCI_SYNTHETIC_900006.csv, which adds a second locality (99999-02), and a ZIP+4 file,',
        'fixtures/synthetic/cms/ZIP9_SYNTHETIC.txt, for the ZIP 00012 the ZIP5 file flags: codes 0000-4999 in locality 01 and 5000-8999 in',
        'locality 02, while 9000-9999 are not listed. The release of the ZIP+4 tests (PRC-21; docs/adr/0064). Invented values for tests:',
        'never published, never loaded outside a scratch test database, never used to price a real line.',
      ].join('\n'),
      records,
      impact: ['SYNTHETIC fixture: loaded only into scratch test databases, by the tests that price a ZIP+4; none loads it before PR 6b-2.'],
    }),
  );
  const hashes = new Map<string, string>([...generated.entries()].map(([file, text]): [string, string] => [file, sha256(text)]));
  generated.set(MANIFEST_FILE, serializeManifest(buildManifest(PLUS_FOUR_RELEASE_NUMBER, hashes)));
  return generated;
}

/**
 * The SYNTHETIC release of the content tests (audit #7; docs/adr/0071): every file of release 900001 unchanged but its
 * per-code MPPR list and its MUE, re-parsed by the same parsers from the same files for 2026-01-01 to 2026-09-30, so a
 * Medicare line after the third quarter reads content the release has not loaded. Its records keep their values,
 * source and quotes; only their windows end earlier. The hand-typed general practice-expense reduction stays open.
 * Only the tests that need it load it, since current_rule_release() picks the highest release loaded.
 */
export const CONTENT_GAP_RELEASE_DIR = 'fixtures/synthetic/rules/release-synth-900007';
export const CONTENT_GAP_RELEASE_NUMBER = 900_007;
const CONTENT_GAP_BUILT_ON = '2026-10-26';
const CONTENT_GAP_WINDOW: ImportWindow = { year: 2026, effectiveFrom: '2026-01-01', effectiveTo: '2026-09-30' };
const CONTENT_GAP_SOURCES = [
  { type: 'mppr_rate' as const, file: 'MPPR_SYNTHETIC.csv', replaces: 'mppr_rate/2026/MPPR_SYNTHETIC.json' },
  { type: 'ncci_mue' as const, file: 'NCCI_MUE_SYNTHETIC.csv', replaces: 'ncci_mue/2026/NCCI_MUE_SYNTHETIC.json' },
];

/** Every file of release 900007, from release 900001 on disk and its MPPR and MUE files parsed for the shorter window. */
export function renderContentGapRelease(root: string = repositoryRoot): Map<string, string> {
  const first = path.join(root, SYNTHETIC_RELEASE_DIR);
  const generated = new Map<string, string>();
  const records: RuleRecord[] = [];
  const replaced = new Set(CONTENT_GAP_SOURCES.map((source) => source.replaces));
  const carried = listContentFiles(first)
    .map((file) => file.path)
    .filter((file) => file !== MANIFEST_FILE && file !== RELEASE_NOTES_FILE && !replaced.has(file));
  for (const file of carried) {
    generated.set(file, readFileSync(path.join(first, file), 'utf8'));
    if (isRecordFile(file)) {
      records.push(...readRecordFile(path.join(first, file), file).records.map((located) => located.record));
    }
  }
  for (const source of CONTENT_GAP_SOURCES) {
    // Built on 900001's day, so each record differs from 900001's in its end date alone.
    const parsed = parsedRecordFile(root, source.type, source.file, BUILT_ON, CONTENT_GAP_WINDOW);
    generated.set(parsed.path, serializeRecords(parsed.records));
    records.push(...parsed.records);
  }
  generated.set(
    RELEASE_NOTES_FILE,
    releaseNotes({
      title: `SYNTHETIC content-gap release ${String(CONTENT_GAP_RELEASE_NUMBER)}`,
      summary: [
        `Built ${CONTENT_GAP_BUILT_ON} by \`tsx tools/release/synthetic.ts\`: every file of release 900001 unchanged but its per-code MPPR list and its MUE,`,
        're-parsed from fixtures/synthetic/cms/MPPR_SYNTHETIC.csv and NCCI_MUE_SYNTHETIC.csv for 2026-01-01 to 2026-09-30, so a Medicare line',
        'after 2026-09-30 reads content this release has not loaded. The release of the content tests (audit #7; docs/adr/0071). Invented',
        'values for tests: never published, never loaded outside a scratch test database, never used to price a real line.',
      ].join('\n'),
      records,
      impact: ['SYNTHETIC fixture: loaded only into scratch test databases, by the tests of months waiting on Medicare content.'],
    }),
  );
  const hashes = new Map<string, string>([...generated.entries()].map(([file, text]): [string, string] => [file, sha256(text)]));
  generated.set(MANIFEST_FILE, serializeManifest(buildManifest(CONTENT_GAP_RELEASE_NUMBER, hashes)));
  return generated;
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  // The ZIP9 source first: release 900006 is parsed from it.
  writeFileSync(path.join(repositoryRoot, ZIP9_SYNTHETIC_FILE), renderZip9Synthetic());
  process.stdout.write(`synthetic ZIP9 source written to ${ZIP9_SYNTHETIC_FILE}\n`);
  for (const [dir, files] of [
    [SYNTHETIC_RELEASE_DIR, renderSyntheticRelease()],
    [RERUN_RELEASE_DIR, renderRerunRelease()],
    [DEADLINE_RELEASE_DIR, renderDeadlineRelease()],
    [PLUS_FOUR_RELEASE_DIR, renderPlusFourRelease()],
    [CONTENT_GAP_RELEASE_DIR, renderContentGapRelease()],
  ] as const) {
    for (const [file, text] of files) {
      const target = path.join(repositoryRoot, dir, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, text);
    }
    process.stdout.write(`synthetic release written to ${dir}\n`);
  }
}
