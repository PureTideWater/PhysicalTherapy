import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { MANIFEST_FILE, PARSERS, RELEASE_NOTES_FILE, type RuleRecord, buildManifest, buildParsedRecords, parseRuleRecord, serializeManifest, serializeRecords, sha256 } from '@tp/rules';
import { readRecordFile } from '@tp/rules/content';
import { SCALE_RELEASE_NUMBER, SCALE_RELEASE_SHAPE, SMALL_SCALE_RELEASE_SHAPE, type ScaleReleaseShape, scalePromptPayStates, scaleSourceFiles } from '@tp/synth';

import { repositoryRoot } from '../content-files';
import { SYNTHETIC_RELEASE_DIR } from './synthetic';

/**
 * Builds the production-shaped SYNTHETIC release 900100 (audit #53 part 1; docs/adr/0062, "Capacity under production
 * limits") OUTSIDE the repository, for the screening capacity test: the source files packages/synth writes
 * (release/scale.ts) run through the same parsers, record builder and manifest builder as tools/release/synthetic.ts
 * builds release 900001 with, and the hand-typed records (assistant modifiers, sequestration, therapy thresholds,
 * dispute windows, prompt pay, a denial category and the general MPPR rate) taken from release 900001 and dated
 * from the first year. Every record has source.synthetic true and says SYNTHETIC in its title; the release loads only
 * with the loader's synthetic test option, into a scratch database. The PTP table goes in files of at most 100,000
 * records (SCALE_RELEASE_SHAPE.ptpFileRecords says why). Nothing is written under the repository: the caller names the directory ($RUNNER_TEMP in CI).
 *
 *   tsx tools/release/scale.ts --out <dir> [--small]
 */

export const SCALE_RELEASE_DIR_NAME = `release-synth-${String(SCALE_RELEASE_NUMBER)}`;
const BUILT_ON = '2026-10-20';
const BUILDER = 'SYNTHETIC scale release builder (tools/release/scale.ts)';
const GENERATOR_PATH = 'packages/synth/src/release/scale.ts';

/** The hand-typed types of release 900001 carried into the scale release, and where their records are. */
const HAND_TYPED = ['assistant_modifier', 'sequestration', 'therapy_threshold', 'dispute_window', 'state_prompt_pay', 'denial_category', 'mppr_rate'] as const;

export interface ScaleReleaseSummary {
  readonly releaseNo: number;
  readonly dir: string;
  readonly manifestSha256: string;
  readonly records: number;
  readonly byType: Readonly<Record<string, number>>;
  readonly files: number;
}

/** A record of release 900001 re-dated and re-keyed for the scale release, checked against the schema. */
function carried(record: RuleRecord, changes: { readonly key?: object; readonly effective_from: string; readonly effective_to: string | null }): RuleRecord {
  const result = parseRuleRecord({ ...record, key: changes.key ?? record.key, effective_from: changes.effective_from, effective_to: changes.effective_to });
  if (!result.ok) {
    throw new Error(`a carried ${record.record_type} record is not valid: ${result.issues.join('; ')}`);
  }
  return result.value;
}

/** The hand-typed records, by the file they go in: release 900001's, open from the first year, one year's per year. */
function handTypedFiles(shape: ScaleReleaseShape, root: string): Map<string, RuleRecord[]> {
  const first = shape.years[0] ?? 2025;
  const files = new Map<string, RuleRecord[]>();
  for (const type of HAND_TYPED) {
    const records = readRecordFile(path.join(root, SYNTHETIC_RELEASE_DIR, type, '2026', 'records.json'), `${type}/2026/records.json`).records.map((located) => located.record);
    const out: RuleRecord[] = [];
    for (const record of records) {
      if (record.effective_to !== null) {
        // A year's record (the therapy thresholds): one for each year.
        for (const year of shape.years) {
          out.push(carried(record, { effective_from: `${String(year)}-01-01`, effective_to: `${String(year)}-12-31` }));
        }
      } else if (type === 'state_prompt_pay') {
        for (const state of scalePromptPayStates(shape)) {
          out.push(carried(record, { key: { state }, effective_from: `${String(first)}-01-01`, effective_to: null }));
        }
      } else {
        out.push(carried(record, { effective_from: `${String(first)}-01-01`, effective_to: null }));
      }
    }
    files.set(`${type}/${String(first)}/records.json`, out);
  }
  return files;
}

/**
 * Writes the scale release to `<out>/release-synth-900100` (replacing what is there) and returns what it holds. Each
 * source file is parsed and written before the next is generated, so the largest held at once is one PTP file's
 * records.
 */
export function writeScaleRelease(options: { readonly out: string; readonly shape?: ScaleReleaseShape; readonly root?: string }): ScaleReleaseSummary {
  const shape = options.shape ?? SCALE_RELEASE_SHAPE;
  const root = options.root ?? repositoryRoot;
  const dir = path.join(options.out, SCALE_RELEASE_DIR_NAME);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const hashes = new Map<string, string>();
  const byType: Record<string, number> = {};
  const write = (file: string, records: readonly RuleRecord[]): void => {
    const text = serializeRecords(records);
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
    hashes.set(file, sha256(text));
    for (const record of records) {
      byType[record.record_type] = (byType[record.record_type] ?? 0) + 1;
    }
  };
  for (const source of scaleSourceFiles(shape)) {
    const parser = PARSERS[source.type];
    const outcome = parser.parse(source.text, { year: source.year, effectiveFrom: source.effectiveFrom, effectiveTo: source.effectiveTo });
    const records = buildParsedRecords({
      parser,
      rows: outcome.rows,
      source: { title: `SYNTHETIC ${parser.title} (invented values, generated as ${source.name})`, url: null, path: GENERATOR_PATH, retrieved: BUILT_ON, sha256: sha256(source.text), synthetic: true },
      checkedBy: BUILDER,
      checkedOn: BUILT_ON,
    });
    write(`${source.type}/${String(source.year)}/${source.name.replace(/\.[^.]*$/, '')}.json`, records);
  }
  for (const [file, records] of handTypedFiles(shape, root)) {
    write(file, records);
  }
  const total = Object.values(byType).reduce((sum, count) => sum + count, 0);
  const notes = [
    `# SYNTHETIC scale release ${String(SCALE_RELEASE_NUMBER)}`,
    '',
    `Built by \`tsx tools/release/scale.ts\` from packages/synth/src/release/scale.ts on ${BUILT_ON}: invented values at the`,
    'sizes of CMS’s public files, for the screening capacity test (audit #53 part 1). Never published, never loaded outside',
    'a scratch database, never used to price a real line.',
    '',
    '| Type | Records |',
    '| --- | --- |',
    ...Object.entries(byType)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([type, count]) => `| \`${type}\` | ${String(count)} |`),
    `| all | ${String(total)} |`,
    '',
  ].join('\n');
  writeFileSync(path.join(dir, RELEASE_NOTES_FILE), notes);
  hashes.set(RELEASE_NOTES_FILE, sha256(notes));
  const manifest = serializeManifest(buildManifest(SCALE_RELEASE_NUMBER, hashes));
  writeFileSync(path.join(dir, MANIFEST_FILE), manifest);
  return { releaseNo: SCALE_RELEASE_NUMBER, dir, manifestSha256: sha256(manifest), records: total, byType, files: hashes.size };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const at = args.indexOf('--out');
  const out = at === -1 ? undefined : args[at + 1];
  if (out === undefined || out === '') {
    process.stderr.write('usage: tsx tools/release/scale.ts --out <dir> [--small]\n');
    process.exit(2);
  }
  const resolved = path.resolve(out);
  if (resolved === repositoryRoot || resolved.startsWith(`${repositoryRoot}${path.sep}`)) {
    process.stderr.write('the scale release is written outside the repository (it is never committed)\n');
    process.exit(2);
  }
  const summary = writeScaleRelease({ out: resolved, shape: args.includes('--small') ? SMALL_SCALE_RELEASE_SHAPE : SCALE_RELEASE_SHAPE });
  process.stdout.write(`${JSON.stringify(summary)}\n`);
}
