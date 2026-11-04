import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { PINNED_RELEASES, type BaseState } from './base';
import { tagCommit, type Transport } from './network';

/**
 * The release pins of PINNED_RELEASES as the age rule reads them (docs/adr/0066, Part 5): a release.txt whose version
 * is new against the base (or every one, without a BASE or before the base has the age rule) is aged as an action pin
 * is, by the commit its upstream tag `v<version>` names, through ageRule's own reads and verdict. A version whose tag
 * the upstream does not list names no release (a compromised release's tag is deleted upstream, as v0.69.4's was), and
 * a list that cannot be read fails closed after three tries.
 */

/** A release.txt's version: its line `version <major>.<minor>.<patch>`, or undefined. */
export function releaseVersion(text: string): string | undefined {
  return /^version (\d+\.\d+\.\d+)$/m.exec(text)?.[1];
}

/** A release pin the age rule reads: the commit the tag names, as `owner/repo@sha`, and the tag. */
export interface ReleasePin {
  readonly file: string;
  readonly ref: string;
  readonly version: string;
}

export interface ReleasePins {
  readonly pins: ReleasePin[];
  readonly errors: string[];
  readonly notes: string[];
}

export async function releasePins(root: string, state: BaseState | undefined, transport: Transport, signal?: AbortSignal): Promise<ReleasePins> {
  const pins: ReleasePin[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  for (const { file, repo } of PINNED_RELEASES) {
    const where = path.join(root, file);
    if (!existsSync(where)) continue;
    const version = releaseVersion(readFileSync(where, 'utf8'));
    if (version === undefined) {
      errors.push(`${file}: no line "version <major>.<minor>.<patch>", so the release it pins cannot be aged`);
      continue;
    }
    const before = state?.releases[file];
    if (state !== undefined && state.hasAge && before !== undefined && releaseVersion(before) === version) {
      notes.push(`age: ${file} names ${repo} v${version}, as the base does: not aged`);
      continue;
    }
    const tag = `v${version}`;
    let commit: string | undefined;
    try {
      commit = await tagCommit(transport, repo, tag, signal);
    } catch (error) {
      errors.push(`${file}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (commit === undefined) {
      errors.push(`${file}: no tag ${tag} in ${repo} (git ls-remote), so version ${version} names no release (as when a compromised release's tag is deleted upstream); pin another release`);
      continue;
    }
    notes.push(`age: ${file} names ${repo} ${tag}, new against the base: aged as ${repo}@${commit}, the commit its tag names`);
    pins.push({ file, ref: `${repo}@${commit}`, version: tag });
  }
  return { pins, errors, notes };
}
