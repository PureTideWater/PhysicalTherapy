import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { FILES, type Tree } from './check';

/**
 * The two trees check-toolchain compares: the checkout (this commit) and the base, the commit where it left BASE
 * (`git merge-base <BASE> HEAD`, as the engine freeze reduces the range step's base), read with `git show`. ci.yml's
 * static job checks out the whole history, so the base is always present there.
 */

/** BASE when CI gives none: the build branch, as a local run would compare against it. */
export const DEFAULT_BASE = 'origin/claude/build-platform';

function git(root: string, args: readonly string[]): { readonly status: number | null; readonly stdout: string; readonly stderr: string } {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The commit where HEAD left `base`; throws, naming the ref, when there is none. */
export function mergeBase(root: string, base: string): string {
  const result = git(root, ['merge-base', base, 'HEAD']);
  const commit = result.stdout.trim();
  if (result.status !== 0 || !/^[0-9a-f]{40,64}$/.test(commit)) {
    throw new Error(`check-toolchain: no merge base between BASE=${base} and HEAD (${result.stderr.trim() || 'git merge-base found none'})`);
  }
  return commit;
}

/** The Dockerfiles of the apps, root-relative: apps/<name>/Dockerfile. */
export function dockerfilePaths(root: string): string[] {
  const apps = path.join(root, 'apps');
  if (!existsSync(apps)) {
    return [];
  }
  return readdirSync(apps, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(path.join(apps, entry.name, 'Dockerfile')))
    .map((entry) => `apps/${entry.name}/Dockerfile`)
    .sort();
}

/** The checkout's files. */
export function readWorkingTree(root: string): Tree {
  const read = (file: string) => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : undefined);
  const files = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
  return { ...files, dockerfiles: Object.fromEntries(dockerfilePaths(root).map((file) => [file, read(file) ?? ''])) };
}

/** The same files at a commit; a file the commit does not hold is absent. */
export function readTreeAt(root: string, commit: string): Tree {
  const read = (file: string) => {
    const result = git(root, ['show', `${commit}:${file}`]);
    return result.status === 0 ? result.stdout : undefined;
  };
  return Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
}
