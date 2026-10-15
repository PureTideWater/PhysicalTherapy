import { copyFileSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { MANIFEST_FILE, RELEASE_NOTES_FILE, type RuleRecord, buildManifest, compareText, secondPassPathFor, serializeManifest, sha256 } from '@tp/rules';
import { fileSha256, isRecordFile, listContentFiles, readRecordFile } from '@tp/rules/content';

import { checkContentSet, contentSetAt } from '../verify-content/check';
import { ReleaseToolError } from './commands';
import { impactLines } from './impact';

/**
 * `pnpm release:assemble <n>` (the load-release skill, steps 1 and 2): copies the drafts into
 * content/outgoing/<n>/ with RELEASE.md and MANIFEST.json. A release is a complete snapshot that
 * pricing runs pin, so it is all or nothing: the drafts must pass the content checker, and if any
 * record is still at L1 (or lacks a source hash) nothing is assembled. content/releases is never
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
  readonly manifestSha256: string;
}

interface ReleaseNotesInput {
  readonly title: string;
  /** Who prepared it, when, and where it goes next. */
  readonly summary: string;
  readonly records: readonly RuleRecord[];
  readonly impact: readonly string[];
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
    '## Impact on existing runs',
    '',
    ...input.impact,
    '',
  ].join('\n');
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
  const refused: string[] = [];
  for (const file of recordFiles) {
    const contents = readRecordFile(path.join(draftsDir, file), file);
    for (const { record, where } of contents.records) {
      if (record.verification.level === 'L1') {
        refused.push(`${where}: verification L1 (${record.record_type})`);
      } else if (!/^[0-9a-f]{64}$/.test(record.source.sha256)) {
        refused.push(`${where}: no source hash`);
      } else {
        records.push(record);
      }
    }
  }
  if (refused.length > 0) {
    throw new ReleaseToolError(
      [
        `release ${String(release)} not assembled: ${String(refused.length)} draft record(s) are not verified to L2 or lack a source hash, and a release must be complete.`,
        'Verify them against their sources (L2), or move them out of content/drafts until they are:',
        ...refused.slice(0, 20).map((line) => `  ${line}`),
        ...(refused.length > 20 ? [`  ...and ${String(refused.length - 20)} more`] : []),
      ].join('\n'),
    );
  }
  if (records.length === 0) {
    throw new ReleaseToolError('there are no drafts in content/drafts to assemble');
  }

  const impact = impactLines(root, release, records);
  const dir = path.join(root, relativeDir);
  try {
    const copied: string[] = [];
    for (const file of recordFiles) {
      for (const name of [file, secondPassPathFor(file)]) {
        if (existsSync(path.join(draftsDir, name))) {
          mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
          copyFileSync(path.join(draftsDir, name), path.join(dir, name));
          copied.push(name);
        }
      }
    }
    const notes = releaseNotes({
      title: `Content release ${String(release)}`,
      summary: [
        `Prepared ${request.today} by \`pnpm release:assemble ${String(release)}\` from content/drafts. On merge, CI publishes it to`,
        `\`content/releases/${String(release)}\` and tags \`content-release-${String(release)}\` (docs/adr/0003-content-release-manifest.md).`,
      ].join('\n'),
      records,
      impact,
    });
    const manifestSha256 = sealRelease(dir, release, notes);
    const verify = checkContentSet(root, contentSetAt(root, relativeDir));
    if (verify.problems.length > 0) {
      throw new ReleaseToolError(['the assembled release does not verify:', ...verify.problems.slice(0, 20).map((problem) => `  ${problem}`)].join('\n'));
    }
    return { dir: relativeDir, files: [RELEASE_NOTES_FILE, ...copied, MANIFEST_FILE], records: records.length, manifestSha256 };
  } catch (error) {
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }
}
