import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { FILES, type Tree } from './check';

/**
 * The two trees check-toolchain compares: the checkout (this commit) and the base, the commit where it left BASE
 * (`git merge-base <BASE> HEAD`, as the engine freeze reduces the range step's base), read with `git show`. ci.yml's
 * static job checks out the whole history, so the base is always present there. Each tree holds the same things: the
 * files of FILES, the apps' Dockerfiles, the workflows, and the paths of the image files the image rule refuses
 * (docs/adr/0066, Part 5), so the image rule can tell a digest the change adds from one the base already ran.
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

/** An app's Dockerfile, the one form of Dockerfile the image rule reads. */
const APP_DOCKERFILE = /^apps\/[^/]+\/Dockerfile$/;

/** Where GitHub reads workflows: every .yml and .yaml file directly in it. */
export const WORKFLOWS_DIR = '.github/workflows';
const WORKFLOW = /\.ya?ml$/;

/** A source, document or ignore file's extension: dockerfile.ts or Dockerfile.dockerignore names no image (CI-S2). */
const NOT_AN_IMAGE_FILE = /\.(?:[cm]?[jt]sx?|json|mdx?|txt|snap|dockerignore)$/i;

/**
 * Whether a tracked file can define an image outside the three the image rule reads (each apps/<name>/Dockerfile and
 * docker-compose.yml), so the rule refuses it (S6). Docker's own names only, in any case, at any depth (CI-S2):
 * - Dockerfile or Containerfile alone, with a suffix (Dockerfile.dev) or as one (web.Dockerfile); release.yml and
 *   release-dry-run.yml compute `file:`, so any of them can be built. A source, document or ignore file is none, so
 *   dockerfile.ts and Dockerfile.dockerignore pass;
 * - compose.y(a)ml and docker-compose.y(a)ml, which Compose prefers in that order, with a `.<x>` part (the
 *   `.override` file it merges, compose.prod.yaml) or, for docker-compose, a `-<x>` one (docker-compose-dev.yml).
 * Names that merely begin like these (dockerfiles.md, containerfile-notes.md, compose-email.yml) are ordinary files.
 */
export function isImageFile(file: string): boolean {
  const name = file.slice(file.lastIndexOf('/') + 1);
  const dockerfile = (/^(?:dockerfile|containerfile)(?:\.[^/]+)?$/i.test(name) && !NOT_AN_IMAGE_FILE.test(name)) || /^[^/]+\.(?:dockerfile|containerfile)$/i.test(name);
  const compose = /^(?:docker-)?compose(?:\.[^/]+)?\.ya?ml$/i.test(name) || /^docker-compose-[^/]+\.ya?ml$/i.test(name);
  return (dockerfile || compose) && !APP_DOCKERFILE.test(file) && file !== FILES.compose;
}

/** Splits git's NUL-terminated list of paths. */
const paths = (stdout: string) => stdout.split('\0').filter((file) => file !== '');

/** The checkout's files. */
export function readWorkingTree(root: string): Tree {
  const read = (file: string) => (existsSync(path.join(root, file)) ? readFileSync(path.join(root, file), 'utf8') : undefined);
  const files = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)]));
  const workflowDir = path.join(root, WORKFLOWS_DIR);
  const workflows = existsSync(workflowDir)
    ? readdirSync(workflowDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && WORKFLOW.test(entry.name))
        .map((entry) => `${WORKFLOWS_DIR}/${entry.name}`)
        .sort()
    : [];
  // Tracked files only: what the change commits, as the base's are what it committed.
  const tracked = git(root, ['ls-files', '-z']);
  if (tracked.status !== 0) {
    throw new Error(`check-toolchain: git ls-files failed in ${root} (${tracked.stderr.trim() || `status ${String(tracked.status)}`}), so the image files cannot be listed`);
  }
  return {
    ...files,
    dockerfiles: Object.fromEntries(dockerfilePaths(root).map((file) => [file, read(file) ?? ''])),
    workflows: Object.fromEntries(workflows.map((file) => [file, read(file) ?? ''])),
    imageFiles: paths(tracked.stdout)
      .filter((file) => isImageFile(file) && existsSync(path.join(root, file)))
      .sort(),
  };
}

/** The same files at a commit; a file the commit does not hold is absent. */
export function readTreeAt(root: string, commit: string): Tree {
  const read = (file: string) => {
    const result = git(root, ['show', `${commit}:${file}`]);
    return result.status === 0 ? result.stdout : undefined;
  };
  const listed = git(root, ['ls-tree', '-r', '-z', '--name-only', commit]);
  if (listed.status !== 0) {
    throw new Error(`check-toolchain: git ls-tree of ${commit} failed (${listed.stderr.trim() || `status ${String(listed.status)}`})`);
  }
  const files = paths(listed.stdout).sort();
  const at = (selected: readonly string[]) => Object.fromEntries(selected.map((file) => [file, read(file) ?? '']));
  return {
    ...Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, read(file)])),
    // The base's Dockerfiles, as the checkout's are read: without them every digest would read as new (review B1).
    dockerfiles: at(files.filter((file) => APP_DOCKERFILE.test(file))),
    workflows: at(files.filter((file) => file.startsWith(`${WORKFLOWS_DIR}/`) && !file.slice(WORKFLOWS_DIR.length + 1).includes('/') && WORKFLOW.test(file))),
    imageFiles: files.filter(isImageFile),
  };
}
