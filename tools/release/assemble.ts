import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  MANIFEST_FILE,
  RELEASE_NOTES_FILE,
  type RuleRecord,
  buildManifest,
  compareText,
  recordLabel,
  secondPassPathFor,
  serializeManifest,
  serializeRecords,
  sha256,
} from '@tp/rules';
import { fileSha256, isRecordFile, listContentFiles, readRecordFile, readSecondPassFile } from '@tp/rules/content';

import { checkContentSet, contentSetAt } from '../verify-content/check';
import { ReleaseToolError } from './commands';
import { impactLines } from './impact';

/**
 * `pnpm release:assemble <n>` (the load-release skill, steps 1 and 2): lists the drafts at L2 or
 * higher, refuses any record without a source hash, and copies them into content/outgoing/<n>/ with
 * RELEASE.md and MANIFEST.json. The drafts must pass the content checker first. Drafts still at L1
 * stay in content/drafts and RELEASE.md lists them under "Drafts not in this release", so a reader
 * sees what the release leaves out; the dry-run's diff shows any record type it drops against the
 * release before. A release whose ZIP5 records flag a ZIP that no ZIP9 record covers is refused
 * (plusFourGaps). content/releases is never written here; CI publishes on merge.
 */

const DRAFTS = 'content/drafts';

export interface AssembleRequest {
  readonly root: string;
  readonly release: number;
  readonly today: string;
}

export interface AssembleResult {
  readonly dir: string;
  readonly files: readonly string[];
  readonly records: number;
  /** Draft records left out because they are below L2 or lack a source hash. */
  readonly excluded: number;
  readonly manifestSha256: string;
}

/** A draft record left out of the release, and why. */
export interface ExcludedDraft {
  readonly where: string;
  readonly recordType: string;
  readonly reason: string;
}

interface ReleaseNotesInput {
  readonly title: string;
  /** Who prepared it, when, and where it goes next. */
  readonly summary: string;
  readonly records: readonly RuleRecord[];
  readonly impact: readonly string[];
  /** Drafts left out (assembled releases only; fixture releases leave nothing out). */
  readonly excluded?: readonly ExcludedDraft[];
}

/** One line per draft file with records left out: how many, of which type, and why. */
function excludedLines(excluded: readonly ExcludedDraft[]): string[] {
  if (excluded.length === 0) {
    return ['Every draft in content/drafts is in this release.'];
  }
  const byFile = new Map<string, { recordType: string; reasons: Map<string, number> }>();
  for (const draft of excluded) {
    const file = draft.where.replace(/ record \d+$/, '');
    const entry = byFile.get(file) ?? { recordType: draft.recordType, reasons: new Map<string, number>() };
    entry.reasons.set(draft.reason, (entry.reasons.get(draft.reason) ?? 0) + 1);
    byFile.set(file, entry);
  }
  return [
    `${String(excluded.length)} draft record(s) stay in content/drafts until they are verified to L2:`,
    '',
    ...[...byFile.entries()]
      .sort(([a], [b]) => compareText(a, b))
      .map(([file, entry]) => {
        const reasons = [...entry.reasons.entries()].map(([reason, count]) => `${String(count)} ${reason}`).join(', ');
        return `- \`content/drafts/${file}\` (\`${entry.recordType}\`): ${reasons}`;
      }),
  ];
}

function cellText(text: string): string {
  return text.replace(/\|/g, '\\|');
}

/** RELEASE.md: date, records by type, sources, who verified, and the impact on existing runs. */
export function releaseNotes(input: ReleaseNotesInput): string {
  const byType = new Map<string, RuleRecord[]>();
  for (const record of input.records) {
    const group = byType.get(record.record_type);
    if (group === undefined) {
      byType.set(record.record_type, [record]);
    } else {
      group.push(record);
    }
  }
  const typeRows = [...byType.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([type, records]) => {
      const starts = records.map((record) => record.effective_from).sort(compareText);
      const ends = records.map((record) => record.effective_to);
      const latestEnd = ends.includes(null) ? 'open' : (ends.filter((end): end is string => end !== null).sort(compareText).at(-1) ?? '');
      const levels = [...new Set(records.map((record) => record.verification.level))].sort(compareText).join(', ');
      return `| \`${type}\` | ${String(records.length)} | ${starts[0] ?? ''} | ${latestEnd} | ${levels} |`;
    });
  const sources = new Map<string, RuleRecord['source']>();
  for (const record of input.records) {
    sources.set(`${record.source.path} ${record.source.sha256}`, record.source);
  }
  const sourceRows = [...sources.values()]
    .sort((a, b) => compareText(a.path, b.path))
    .map((source) => `| ${cellText(source.title)} | \`${source.path}\` | ${source.url === null ? 'none' : cellText(source.url)} | ${source.retrieved} | \`${source.sha256}\` |`);
  const verifiers = new Map<string, Set<string>>();
  for (const record of input.records) {
    const who = `${record.verification.level} by ${record.verification.by} on ${record.verification.on}`;
    const types = verifiers.get(who) ?? new Set<string>();
    types.add(record.record_type);
    verifiers.set(who, types);
  }
  const verifierLines = [...verifiers.entries()]
    .sort(([a], [b]) => compareText(a, b))
    .map(([who, types]) => `- ${who}: ${[...types].sort(compareText).map((type) => `\`${type}\``).join(', ')}`);
  return [
    `# ${input.title}`,
    '',
    `${input.summary} ${String(input.records.length)} records.`,
    '',
    '## Records',
    '',
    '| Record type | Records | Earliest start | Latest end | Verification |',
    '| --- | --- | --- | --- | --- |',
    ...typeRows,
    '',
    '## Sources',
    '',
    '| Source | Stored at | Downloaded from | Retrieved | SHA-256 |',
    '| --- | --- | --- | --- | --- |',
    ...sourceRows,
    '',
    '## Who verified',
    '',
    ...verifierLines,
    '',
    ...(input.excluded === undefined ? [] : ['## Drafts not in this release', '', ...excludedLines(input.excluded), '']),
    '## Impact on existing runs',
    '',
    ...input.impact,
    '',
  ].join('\n');
}

/** The calendar day after a YYYY-MM-DD date. */
function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/**
 * The ZIP+4 completeness check (docs/adr/0064): every ZIP whose locality_map record needs its ZIP+4
 * (plus_four_required, the ZIP5 file's flag) has locality_map_plus_four records of that ZIP, from the same quarter's
 * ZIP9 file, in force on every date of the flagged record's window. Without them the engine stops each of the ZIP's
 * fee-schedule lines (ENGINE_ERROR no_locality_plus_four) though the practice gave its ZIP+4, so a release that would
 * do that is refused. One problem per flagged record, naming the first date left uncovered.
 * Only real releases are checked: the SYNTHETIC releases 900001 to 900005 flag 00012 with no ZIP9 file, on purpose.
 */
export function plusFourGaps(records: readonly RuleRecord[]): string[] {
  const windows = new Map<string, { from: string; to: string | null }[]>();
  for (const record of records) {
    if (record.record_type === 'locality_map_plus_four') {
      const list = windows.get(record.key.zip) ?? [];
      list.push({ from: record.effective_from, to: record.effective_to });
      windows.set(record.key.zip, list);
    }
  }
  const problems: string[] = [];
  for (const record of records) {
    if (record.record_type !== 'locality_map' || record.value.plus_four_required !== true) {
      continue;
    }
    const { zip } = record.key;
    // Walk the flagged window from its first day, each plus-four window that has started moving the walk past its end.
    const ordered = [...(windows.get(zip) ?? [])].sort((a, b) => compareText(a.from, b.from));
    let uncovered: string | null = record.effective_from;
    for (const window of ordered) {
      if (uncovered === null || (record.effective_to !== null && uncovered > record.effective_to)) {
        break;
      }
      if (window.from <= uncovered && (window.to === null || window.to >= uncovered)) {
        uncovered = window.to === null ? null : dayAfter(window.to);
      }
    }
    if (uncovered !== null && (record.effective_to === null || uncovered <= record.effective_to)) {
      problems.push(
        `ZIP ${zip} needs its ZIP+4 (its locality_map record from ${record.effective_from}, ${record.source.path}), and no locality_map_plus_four record of that ZIP is in force on ${uncovered}: import the same quarter's ZIP9 file`,
      );
    }
  }
  return problems;
}

/** Writes RELEASE.md and MANIFEST.json for the files already in `dir`, and returns the manifest's hash. */
export function sealRelease(dir: string, release: number, notes: string): string {
  writeFileSync(path.join(dir, RELEASE_NOTES_FILE), notes);
  const hashes = new Map(
    listContentFiles(dir)
      .filter((file) => file.path !== MANIFEST_FILE)
      .map((file) => [file.path, fileSha256(path.join(dir, file.path))]),
  );
  const manifest = serializeManifest(buildManifest(release, hashes));
  writeFileSync(path.join(dir, MANIFEST_FILE), manifest);
  return sha256(manifest);
}

export function assembleRelease(request: AssembleRequest): AssembleResult {
  const { root, release } = request;
  const relativeDir = `content/outgoing/${String(release)}`;
  for (const existing of [relativeDir, `content/releases/${String(release)}`]) {
    if (existsSync(path.join(root, existing))) {
      throw new ReleaseToolError(`${existing} already exists; a release number is used once`);
    }
  }

  const check = checkContentSet(root, contentSetAt(root, DRAFTS));
  if (check.problems.length > 0) {
    throw new ReleaseToolError(['the drafts do not pass pnpm verify-content:', ...check.problems.slice(0, 20).map((problem) => `  ${problem}`)].join('\n'));
  }

  const draftsDir = path.join(root, DRAFTS);
  const recordFiles = listContentFiles(draftsDir)
    .map((file) => file.path)
    .filter(isRecordFile);
  const records: RuleRecord[] = [];
  const excluded: ExcludedDraft[] = [];
  /** Per record file: the records it contributes, and whether that is all of them. */
  const selections = new Map<string, { included: RuleRecord[]; complete: boolean }>();
  for (const file of recordFiles) {
    const contents = readRecordFile(path.join(draftsDir, file), file);
    const included: RuleRecord[] = [];
    for (const { record, where } of contents.records) {
      if (record.verification.level === 'L1') {
        excluded.push({ where, recordType: record.record_type, reason: 'at verification L1' });
      } else if (!/^[0-9a-f]{64}$/.test(record.source.sha256)) {
        excluded.push({ where, recordType: record.record_type, reason: 'without a source hash' });
      } else {
        included.push(record);
      }
    }
    records.push(...included);
    selections.set(file, { included, complete: included.length === contents.records.length });
  }
  if (records.length === 0) {
    throw new ReleaseToolError(
      excluded.length === 0
        ? 'there are no drafts in content/drafts to assemble'
        : `release ${String(release)} not assembled: none of the ${String(excluded.length)} draft record(s) is verified to L2 or higher; verify them against their sources first`,
    );
  }
  const gaps = plusFourGaps(records);
  if (gaps.length > 0) {
    throw new ReleaseToolError([`release ${String(release)} not assembled: the ZIP5 file flags ZIPs that its quarter's ZIP9 file does not cover:`, ...gaps.slice(0, 20).map((gap) => `  ${gap}`)].join('\n'));
  }

  const impact = impactLines(root, release, records);
  const dir = path.join(root, relativeDir);
  try {
    const copied: string[] = [];
    const place = (name: string) => {
      mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      copied.push(name);
      return path.join(dir, name);
    };
    for (const file of recordFiles) {
      const selection = selections.get(file);
      if (selection === undefined || selection.included.length === 0) {
        continue;
      }
      const secondPath = secondPassPathFor(file);
      const hasSecond = existsSync(path.join(draftsDir, secondPath));
      if (selection.complete) {
        // The whole file is verified: copy it and its second pass unchanged.
        copyFileSync(path.join(draftsDir, file), place(file));
        if (hasSecond) {
          copyFileSync(path.join(draftsDir, secondPath), place(secondPath));
        }
        continue;
      }
      // Part of the file is verified: write those records, and the matching part of the second pass.
      writeFileSync(place(file), serializeRecords(selection.included));
      if (hasSecond) {
        const second = readSecondPassFile(path.join(draftsDir, secondPath), secondPath).secondPass;
        const labels = new Set(selection.included.filter((record) => record.source.method === 'hand_typed').map((record) => recordLabel(record)));
        const kept = second?.records.filter((record) => labels.has(recordLabel(record))) ?? [];
        if (second !== undefined && kept.length > 0) {
          writeFileSync(place(secondPath), `${JSON.stringify({ ...second, records: kept }, null, 2)}\n`);
        }
      }
    }
    const notes = releaseNotes({
      title: `Content release ${String(release)}`,
      summary: [
        `Prepared ${request.today} by \`pnpm release:assemble ${String(release)}\` from the drafts in content/drafts verified to L2 or higher. On merge, CI publishes it to`,
        `\`content/releases/${String(release)}\` and tags \`content-release-${String(release)}\` (docs/adr/0003-content-release-manifest.md).`,
      ].join('\n'),
      records,
      impact,
      excluded,
    });
    const manifestSha256 = sealRelease(dir, release, notes);
    const verify = checkContentSet(root, contentSetAt(root, relativeDir));
    if (verify.problems.length > 0) {
      throw new ReleaseToolError(['the assembled release does not verify:', ...verify.problems.slice(0, 20).map((problem) => `  ${problem}`)].join('\n'));
    }
    return { dir: relativeDir, files: [RELEASE_NOTES_FILE, ...copied, MANIFEST_FILE], records: records.length, excluded: excluded.length, manifestSha256 };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
