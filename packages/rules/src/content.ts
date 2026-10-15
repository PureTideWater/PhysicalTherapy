import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { MANIFEST_FILE, type Manifest, compareManifest, manifestSchema } from './manifest';
import { type Located, isSecondPassFile, sha256 } from './records';
import { type RuleRecord, type SecondPass, describeIssues, parseRuleRecord, secondPassSchema } from './schema';

/**
 * Reading content sets from disk: the draft directory, a prepared or published release, or a
 * fixture release. Shared by the content checker, the release tools and the loader.
 */

export interface ContentFile {
  /** Path relative to the content set's directory, with forward slashes. */
  readonly path: string;
  readonly symlink: boolean;
}

/** Every file below `dir`, sorted, with forward slashes. A missing directory yields nothing. */
export function listContentFiles(dir: string): ContentFile[] {
  const found: ContentFile[] = [];
  const walk = (relative: string) => {
    let entries;
    try {
      entries = readdirSync(path.join(dir, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const child = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        found.push({ path: child, symlink: true });
      } else if (entry.isDirectory()) {
        walk(child);
      } else if (entry.isFile()) {
        found.push({ path: child, symlink: false });
      }
    }
  };
  walk('');
  return found.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** True when `file` is a record file: JSON, not a second pass and not the manifest. */
export function isRecordFile(file: string): boolean {
  return file.endsWith('.json') && !isSecondPassFile(file) && path.posix.basename(file) !== MANIFEST_FILE;
}

export interface RecordFileContents {
  readonly records: Located<RuleRecord>[];
  readonly problems: string[];
}

function parseJson(text: string, where: string, problems: string[]): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    problems.push(`${where}: is not valid JSON`);
    return undefined;
  }
}

/** Reads one record file (a JSON array of records), validating every record. `where` labels messages. */
export function readRecordFile(file: string, where: string): RecordFileContents {
  const problems: string[] = [];
  const records: Located<RuleRecord>[] = [];
  const data = parseJson(readFileSync(file, 'utf8'), where, problems);
  if (data === undefined) {
    return { records, problems };
  }
  if (!Array.isArray(data)) {
    problems.push(`${where}: must be a JSON array of rule records`);
    return { records, problems };
  }
  data.forEach((item: unknown, index) => {
    const label = `${where} record ${String(index + 1)}`;
    const result = parseRuleRecord(item);
    if (result.ok) {
      records.push({ record: result.value, where: label });
    } else {
      problems.push(...result.issues.map((issue) => `${label}: ${issue}`));
    }
  });
  if (data.length === 0) {
    problems.push(`${where}: holds no records`);
  }
  return { records, problems };
}

export function readSecondPassFile(file: string, where: string): { secondPass?: SecondPass; problems: string[] } {
  const problems: string[] = [];
  const data = parseJson(readFileSync(file, 'utf8'), where, problems);
  if (data === undefined) {
    return { problems };
  }
  const result = secondPassSchema.safeParse(data);
  if (!result.success) {
    return { problems: describeIssues(result.error).map((issue) => `${where}: ${issue}`) };
  }
  return { secondPass: result.data, problems };
}

export function fileSha256(file: string): string {
  return sha256(readFileSync(file));
}

export interface ReleaseContents {
  readonly manifest: Manifest;
  /** SHA-256 of MANIFEST.json's bytes: what `rule_release.manifest_sha256` records. */
  readonly manifestSha256: string;
  readonly records: Located<RuleRecord>[];
  readonly problems: string[];
}

/**
 * Reads a release directory: verifies MANIFEST.json against every file present (nothing missing,
 * nothing extra, every hash matching, no symbolic links) and parses every record file it lists.
 */
export function readRelease(dir: string): ReleaseContents {
  const problems: string[] = [];
  const manifestPath = path.join(dir, MANIFEST_FILE);
  let manifestBytes: Buffer;
  try {
    manifestBytes = readFileSync(manifestPath);
  } catch {
    return { manifest: { release: 0, files: {} }, manifestSha256: '', records: [], problems: [`${MANIFEST_FILE} is missing`] };
  }
  const parsed = manifestSchema.safeParse(parseJson(manifestBytes.toString('utf8'), MANIFEST_FILE, problems));
  if (!parsed.success) {
    problems.push(...describeIssues(parsed.error).map((issue) => `${MANIFEST_FILE}: ${issue}`));
    return { manifest: { release: 0, files: {} }, manifestSha256: '', records: [], problems };
  }
  const present = new Map<string, string>();
  for (const file of listContentFiles(dir)) {
    if (file.path === MANIFEST_FILE) {
      continue;
    }
    if (file.symlink) {
      problems.push(`${file.path} is a symbolic link`);
      continue;
    }
    present.set(file.path, fileSha256(path.join(dir, file.path)));
  }
  problems.push(...compareManifest(parsed.data, present));
  const records: Located<RuleRecord>[] = [];
  for (const file of present.keys()) {
    if (isRecordFile(file)) {
      const contents = readRecordFile(path.join(dir, file), file);
      records.push(...contents.records);
      problems.push(...contents.problems);
    }
  }
  return { manifest: parsed.data, manifestSha256: sha256(manifestBytes), records, problems };
}
