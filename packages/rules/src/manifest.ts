import { z } from 'zod';

import { compareText } from './records';
import { isRepositoryPath, sha256Hex } from './schema';

/**
 * A release's MANIFEST.json (docs/adr/0003-content-release-manifest.md):
 * `{ "release": <n>, "files": { "<path relative to the release directory>": "<sha256 hex>" } }`,
 * listing every file in the directory except itself.
 */
export const MANIFEST_FILE = 'MANIFEST.json';
export const RELEASE_NOTES_FILE = 'RELEASE.md';

export const manifestSchema = z.strictObject({
  release: z.number().int().positive(),
  files: z
    .record(z.string().refine((file) => isRepositoryPath(file) && file !== MANIFEST_FILE, 'must be a path inside the release, other than MANIFEST.json'), sha256Hex)
    .refine((files) => Object.keys(files).length > 0, 'must list at least one file'),
});
export type Manifest = z.infer<typeof manifestSchema>;

/** Builds the manifest for a release from the SHA-256 of each file, paths in sorted order. */
export function buildManifest(release: number, hashes: ReadonlyMap<string, string>): Manifest {
  const files = Object.fromEntries([...hashes.entries()].sort(([a], [b]) => compareText(a, b)));
  return { release, files };
}

export function serializeManifest(manifest: Manifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/**
 * Compares a manifest with the files actually present (path to SHA-256, MANIFEST.json excluded)
 * and returns one line per problem: a file missing, a file not listed, or a hash that differs.
 */
export function compareManifest(manifest: Manifest, present: ReadonlyMap<string, string>): string[] {
  const problems: string[] = [];
  for (const [file, expected] of Object.entries(manifest.files)) {
    const actual = present.get(file);
    if (actual === undefined) {
      problems.push(`${file} is listed in ${MANIFEST_FILE} but missing`);
    } else if (actual !== expected) {
      problems.push(`${file} does not match its SHA-256 in ${MANIFEST_FILE}`);
    }
  }
  for (const file of present.keys()) {
    if (!Object.hasOwn(manifest.files, file)) {
      problems.push(`${file} is not listed in ${MANIFEST_FILE}`);
    }
  }
  return problems.sort(compareText);
}
