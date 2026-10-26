import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  COVERAGE_FILE,
  COVERAGE_WITHDRAWN_FILE,
  type CoverageLoss,
  LOOK_BACK_YEARS,
  MANIFEST_FILE,
  RELEASE_NOTES_FILE,
  type ReleaseCoverage,
  type RuleRecord,
  type WithdrawnEntry,
  buildManifest,
  canonicalJson,
  compareText,
  contentGaps,
  contentSummaries,
  coverageMap,
  coverageRegression,
  coverageWithdrawnNoteSchema,
  dayAfter,
  describeIssues,
  lookBackCutoff,
  readJsonBlock,
  recordLabel,
  releaseCoverageSchema,
  renderCoverageFile,
  secondPassPathFor,
  serializeManifest,
  type RuleRecordOf,
  serializeRecords,
  sha256,
  zipFileQuarter,
} from '@tp/rules';
import { fileSha256, isRecordFile, listContentFiles, readRecordFile, readSecondPassFile } from '@tp/rules/content';

import { checkContentSet, contentSetAt } from '../verify-content/check';
import { ReleaseToolError } from './commands';
import { impactLines, previousReleaseNumber, releaseDirectory, releaseRecords } from './impact';

/**
 * `pnpm release:assemble <n>` (the load-release skill, steps 1 and 2): lists the drafts at L2 or
 * higher, refuses any record without a source hash, and copies them into content/outgoing/<n>/ with
 * RELEASE.md and MANIFEST.json. The drafts must pass the content checker first. Drafts still at L1
 * stay in content/drafts and RELEASE.md lists them under "Drafts not in this release", so a reader
 * sees what the release leaves out; the dry-run's diff shows any record type it drops against the
 * release before. A release whose ZIP5 records flag a ZIP that no ZIP9 record covers is refused
 * (plusFourGaps), as is one with a gap inside a content (audit #30 R4). The release may stop covering a code and date
 * its previous release covered only before the six-year look-back, where the source's own dates close it, or where
 * content/drafts/COVERAGE-WITHDRAWN.md withdraws it, signed by two people (R3, docs/adr/0071): COVERAGE.md records
 * each, the manifest seals it, and the note leaves the drafts once the release verifies. content/releases is never
 * written here; CI publishes on merge.
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
  /** The coverage against the previous release (assembled releases only; fixture releases pass none). */
  readonly coverage?: ReleaseNotesCoverage;
}

/** What RELEASE.md says of a release's coverage: COVERAGE.md holds the details. */
export interface ReleaseNotesCoverage {
  readonly previous: number | null;
  readonly beforeCutoff: number;
  readonly closedBySource: number;
  readonly withdrawn: readonly WithdrawnEntry[];
}

/** A coverage loss as the assembler and the checker name it: record type, canonical key and dates. */
function lossText(loss: CoverageLoss): string {
  return `${loss.record_type} ${canonicalJson(loss.key)} ${loss.from} to ${loss.to ?? 'open'}`;
}

function lossIdentity(loss: CoverageLoss): string {
  return canonicalJson({ record_type: loss.record_type, key: loss.key, from: loss.from, to: loss.to });
}

function compareLosses(a: CoverageLoss, b: CoverageLoss): number {
  return compareText(a.record_type, b.record_type) || compareText(canonicalJson(a.key), canonicalJson(b.key)) || compareText(a.from, b.from);
}

/** The section RELEASE.md gives the coverage, before the impact. */
function coverageLines(coverage: ReleaseNotesCoverage): string[] {
  if (coverage.previous === null) {
    return ['## Coverage', '', 'This is the first release: nothing to compare. Details in COVERAGE.md.', ''];
  }
  return [
    `## Coverage against release ${String(coverage.previous)}`,
    '',
    `- ${String(coverage.beforeCutoff)} range(s) before the look-back's cutoff, ${String(coverage.closedBySource)} closed by the source's own dates, ${String(coverage.withdrawn.length)} withdrawn by a signed note.`,
    ...coverage.withdrawn.map(
      (entry) => `- ${lossText(entry)}: ${entry.reason} (withdrawn by ${entry.withdrawn_by}, confirmed by ${entry.confirmed_by}, ${entry.withdrawn_on})`,
    ),
    '',
    'Details in COVERAGE.md.',
    '',
  ];
}

/** At most 20 lines of a refusal, indented, then how many more. */
function listedAtMost(lines: readonly string[]): string[] {
  const shown = lines.slice(0, 20).map((line) => `  ${line}`);
  return lines.length > 20 ? [...shown, `  and ${String(lines.length - 20)} more`] : shown;
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
    ...(input.coverage === undefined ? [] : coverageLines(input.coverage)),
    '## Impact on existing runs',
    '',
    ...input.impact,
    '',
  ].join('\n');
}

/**
 * The ZIP+4 completeness check (docs/adr/0064): every ZIP whose locality_map record needs its ZIP+4
 * (plus_four_required, the ZIP5 file's flag) has locality_map_plus_four records of that ZIP, from the same quarter's
 * ZIP9 file, in force on every date of the flagged record's window. Without them the engine stops each of the ZIP's
 * fee-schedule lines (ENGINE_ERROR no_locality_plus_four) though the practice gave its ZIP+4, so a release that would
 * do that is refused. "The same quarter's" is read from the files themselves: the year and quarter (YYYYQ, positions
 * 76-80) every line a record quotes carries must be the flagged ZIP5 line's, and the ZIP9 record's state the ZIP5
 * record's; a plus-four record in force during the flagged window that is of another quarter or state is named and
 * covers nothing, so a ZIP9 file of the wrong quarter never prices a split ZIP at another quarter's localities. One
 * problem per record found wanting, naming the first date left uncovered. Only real releases are checked: the
 * SYNTHETIC releases 900001 to 900005 flag 00012 with no ZIP9 file, on purpose.
 */
export function plusFourGaps(records: readonly RuleRecord[]): string[] {
  const splits = new Map<string, RuleRecordOf<'locality_map_plus_four'>[]>();
  for (const record of records) {
    if (record.record_type === 'locality_map_plus_four') {
      splits.set(record.key.zip, [...(splits.get(record.key.zip) ?? []), record]);
    }
  }
  const problems: string[] = [];
  for (const record of records) {
    if (record.record_type !== 'locality_map' || record.value.plus_four_required !== true) {
      continue;
    }
    const { zip } = record.key;
    const flagged = `ZIP ${zip} needs its ZIP+4 (its locality_map record from ${record.effective_from}, ${record.source.path})`;
    const quarter = quotedQuarter(record);
    if (quarter === null) {
      problems.push(`${flagged}, and that record quotes no one year and quarter at positions 76-80, so no ZIP9 file can be matched to its quarter`);
      continue;
    }
    const overlapping = (splits.get(zip) ?? []).filter(
      (split) => (record.effective_to === null || split.effective_from <= record.effective_to) && (split.effective_to === null || split.effective_to >= record.effective_from),
    );
    const matching: RuleRecordOf<'locality_map_plus_four'>[] = [];
    for (const split of overlapping) {
      const splitQuarter = quotedQuarter(split);
      if (split.value.state !== record.value.state) {
        problems.push(`${flagged}, in state ${record.value.state}, and its locality_map_plus_four record from ${split.effective_from} (${split.source.path}) is in state ${split.value.state}`);
      } else if (splitQuarter !== quarter) {
        problems.push(
          `${flagged}, of year and quarter ${quarter}, and its locality_map_plus_four record from ${split.effective_from} (${split.source.path}) is of ${splitQuarter ?? 'no one year and quarter'}: import the same quarter's ZIP9 file`,
        );
      } else {
        matching.push(split);
      }
    }
    // Walk the flagged window from its first day, each plus-four window that has started moving the walk past its end.
    const ordered = matching.map((split) => ({ from: split.effective_from, to: split.effective_to })).sort((a, b) => compareText(a.from, b.from));
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
      problems.push(`${flagged}, and no locality_map_plus_four record of that ZIP and quarter is in force on ${uncovered}: import the same quarter's ZIP9 file`);
    }
  }
  return problems;
}

/** The one year and quarter (YYYYQ) every line a record quotes carries at 76-80, or null when they carry none or several. */
function quotedQuarter(record: RuleRecord): string | null {
  const quarters = new Set(record.quotes.map((quote) => zipFileQuarter(quote)));
  const [only] = [...quarters];
  return quarters.size === 1 && only !== undefined ? only : null;
}

/** The prepared date a release's COVERAGE.md records, or null when it has none that reads (the checker reports that release). */
function preparedOnOf(dir: string): string | null {
  const file = path.join(dir, COVERAGE_FILE);
  if (!existsSync(file)) {
    return null;
  }
  const block = readJsonBlock(readFileSync(file, 'utf8'));
  const parsed = releaseCoverageSchema.safeParse(block.value);
  return block.problems.length === 0 && parsed.success ? parsed.data.prepared_on : null;
}

/** The release's COVERAGE.md, and the drafts' withdrawal note it consumes (null when there is none). */
interface PlannedCoverage {
  readonly coverage: ReleaseCoverage;
  readonly note: string | null;
}

/**
 * Audit #30 R3: what `records` as release `release` stops covering against the release before it, refused unless each
 * loss is older than the look-back, closed by the source's own dates, or withdrawn by the drafts' note. The previous
 * release's records are read into its coverage map and dropped at once (R5).
 */
function planCoverage(root: string, release: number, today: string, records: readonly RuleRecord[]): PlannedCoverage {
  const n = String(release);
  const previous = previousReleaseNumber(root, release);
  let previousMap = coverageMap([]);
  if (previous !== null) {
    const dir = releaseDirectory(root, previous);
    previousMap = coverageMap(releaseRecords(dir));
    const prepared = preparedOnOf(dir);
    if (prepared !== null && prepared > today) {
      throw new ReleaseToolError(`release ${n} not assembled: release ${String(previous)} was prepared on ${prepared}, after today (${today})`);
    }
  }
  const cutoff = lookBackCutoff(today);
  const regression = coverageRegression(previousMap, coverageMap(records), records, cutoff);

  const notePath = path.join(root, DRAFTS, COVERAGE_WITHDRAWN_FILE);
  const note = existsSync(notePath) ? notePath : null;
  let withdrawn: WithdrawnEntry[] = [];
  if (note !== null) {
    // The drafts check refuses a note that does not read (D1); this holds the assembler to it on its own.
    const block = readJsonBlock(readFileSync(note, 'utf8'));
    const parsed = coverageWithdrawnNoteSchema.safeParse(block.value);
    if (!parsed.success || block.problems.length > 0) {
      const problems = block.problems.length > 0 || parsed.success ? block.problems : describeIssues(parsed.error);
      throw new ReleaseToolError([`release ${n} not assembled: ${DRAFTS}/${COVERAGE_WITHDRAWN_FILE} does not read:`, ...listedAtMost(problems)].join('\n'));
    }
    if (parsed.data.previous_release !== previous) {
      throw new ReleaseToolError(
        `release ${n} not assembled: ${DRAFTS}/${COVERAGE_WITHDRAWN_FILE} names release ${String(parsed.data.previous_release)}, but the release before ${n} is ${previous === null ? 'none' : String(previous)}`,
      );
    }
    withdrawn = [...parsed.data.withdrawn].sort(compareLosses);
  }

  const entries = new Set(withdrawn.map(lossIdentity));
  const kept = regression.unexplained.filter((loss) => !entries.has(lossIdentity(loss)));
  if (kept.length > 0) {
    throw new ReleaseToolError(
      [
        `release ${n} not assembled: it stops covering what release ${String(previous)} covered:`,
        ...listedAtMost(kept.map(lossText)),
        `keep those records in content/drafts, or withdraw that coverage on purpose in ${DRAFTS}/${COVERAGE_WITHDRAWN_FILE}, signed by two people (content/sources/README.md, "Coverage")`,
      ].join('\n'),
    );
  }
  const losses = new Set(regression.unexplained.map(lossIdentity));
  const unmatched = withdrawn.filter((entry) => !losses.has(lossIdentity(entry)));
  if (unmatched.length > 0) {
    throw new ReleaseToolError(
      unmatched.map((entry) => `release ${n} not assembled: ${DRAFTS}/${COVERAGE_WITHDRAWN_FILE} withdraws ${lossText(entry)}, which release ${n} does not lose`).join('\n'),
    );
  }

  return {
    coverage: {
      format: 'tp-release-coverage/1',
      release,
      previous_release: previous,
      prepared_on: today,
      look_back_years: LOOK_BACK_YEARS,
      cutoff,
      contents: contentSummaries(records).map((summary) => ({ ...summary, windows: [...summary.windows] })),
      before_cutoff: regression.beforeCutoff,
      closed_by_source: regression.closedBySource,
      withdrawn,
    },
    note,
  };
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
  // R4: the drafts can be whole while their L2+ part has a hole (an L1 quarter between two verified ones).
  const holes = contentGaps(records);
  if (holes.length > 0) {
    throw new ReleaseToolError(
      [
        `release ${String(release)} not assembled: a content has dates with no record inside the dates it is loaded for:`,
        ...listedAtMost(holes.map((hole) => `${hole.content}: ${hole.from} to ${hole.to}`)),
      ].join('\n'),
    );
  }
  const planned = planCoverage(root, release, request.today, records);

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
      coverage: {
        previous: planned.coverage.previous_release,
        beforeCutoff: planned.coverage.before_cutoff.length,
        closedBySource: planned.coverage.closed_by_source.length,
        withdrawn: planned.coverage.withdrawn,
      },
    });
    writeFileSync(path.join(dir, COVERAGE_FILE), renderCoverageFile(planned.coverage));
    const manifestSha256 = sealRelease(dir, release, notes);
    const verify = checkContentSet(root, contentSetAt(root, relativeDir), undefined, { today: request.today });
    if (verify.problems.length > 0) {
      throw new ReleaseToolError(['the assembled release does not verify:', ...verify.problems.slice(0, 20).map((problem) => `  ${problem}`)].join('\n'));
    }
    // Only a release that verifies consumes the note; on any failure above it stays in the drafts.
    if (planned.note !== null) {
      rmSync(planned.note);
    }
    return { dir: relativeDir, files: [RELEASE_NOTES_FILE, COVERAGE_FILE, ...copied, MANIFEST_FILE], records: records.length, excluded: excluded.length, manifestSha256 };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
