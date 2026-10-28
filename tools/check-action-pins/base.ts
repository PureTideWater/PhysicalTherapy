import { spawnSync } from 'node:child_process';

import { actionUses, type ActionUse, type WorkflowText } from './workflows';

/**
 * Which pins the networked checks read (docs/adr/0066, Part 2). An action's metadata at a commit never changes and a
 * moved tag cannot change what a SHA pin runs, so a pin is read only when it is new against the base, or used by a step
 * whose inputs changed; every pin is read when the base has no checker (the pull request that adds it) or when the change
 * touches the checker itself. The base is the range step's (ci.yml), reduced with git merge-base as the engine freeze
 * does, and the base's workflows are read with git show (the static job checks out the whole history).
 */

export const CHECKER_DIR = 'tools/check-action-pins';
const WORKFLOWS_DIR = '.github/workflows';

function git(root: string, args: readonly string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** What the base gives the selection: its workflows, and whether every pin must be read, and why. */
export interface BaseState {
  readonly mergeBase: string;
  readonly workflows: readonly WorkflowText[];
  /** Why every pin is read, or undefined when only new and changed ones are. */
  readonly everyPin: string | undefined;
  /** Whether the merge base has the age rule (tools/check-action-pins/age.ts); without it every pin is aged (bootstrapping). */
  readonly hasAge: boolean;
  /** The merge base's tools/check-action-pins/age-exceptions.json, or undefined when it has none. */
  readonly ageExceptions: string | undefined;
}

/** The merge base of BASE and HEAD, with the base's workflows and the checker's presence and change. */
export function baseState(root: string, base: string): BaseState {
  const merged = git(root, ['merge-base', base, 'HEAD']);
  if (merged.status !== 0) throw new Error(`BASE ${base} has no merge base with HEAD in this checkout (git merge-base: ${merged.stderr.trim() || `status ${String(merged.status)}`})`);
  const mergeBase = merged.stdout.trim();
  // The top level alone, as GitHub runs them and as the head's are read (check.ts): a file in a subdirectory runs
  // nowhere, so the base vouches for none of its pins (the security review's S3).
  const files = git(root, ['ls-tree', '-z', mergeBase, '--', `${WORKFLOWS_DIR}/`]);
  if (files.status !== 0) throw new Error(`git ls-tree of ${mergeBase} failed: ${files.stderr.trim()}`);
  const workflows = files.stdout
    .split('\0')
    .flatMap((entry) => {
      const tab = entry.indexOf('\t');
      const type = entry.slice(0, tab).split(' ')[1];
      const file = entry.slice(tab + 1);
      return tab !== -1 && type === 'blob' && !file.slice(WORKFLOWS_DIR.length + 1).includes('/') && /\.ya?ml$/.test(file) ? [file] : [];
    })
    .map((file) => {
      const shown = git(root, ['show', `${mergeBase}:${file}`]);
      if (shown.status !== 0) throw new Error(`git show ${mergeBase}:${file} failed: ${shown.stderr.trim()}`);
      return { file: file.slice(WORKFLOWS_DIR.length + 1), text: shown.stdout };
    });
  const hasChecker = git(root, ['cat-file', '-e', `${mergeBase}:${CHECKER_DIR}/index.ts`]).status === 0;
  const changed = git(root, ['diff', '--name-only', mergeBase, '--', CHECKER_DIR]);
  if (changed.status !== 0) throw new Error(`git diff against ${mergeBase} failed: ${changed.stderr.trim()}`);
  const everyPin = !hasChecker ? `the base ${mergeBase.slice(0, 12)} has no ${CHECKER_DIR}` : changed.stdout.trim() !== '' ? `this change edits ${CHECKER_DIR}` : undefined;
  const hasAge = git(root, ['cat-file', '-e', `${mergeBase}:${CHECKER_DIR}/age.ts`]).status === 0;
  const exceptions = git(root, ['show', `${mergeBase}:${CHECKER_DIR}/age-exceptions.json`]);
  return { mergeBase, workflows, everyPin, hasAge, ageExceptions: exceptions.status === 0 ? exceptions.stdout : undefined };
}

/** A use's signature: the pin and the inputs its step gives, with release.yml's steps apart (their caches are checked). */
function signature(use: ActionUse): string {
  const inputs = Object.keys(use.with)
    .sort()
    .map((name) => [name, use.with[name]]);
  return JSON.stringify([use.file === 'release.yml', use.step === -1, use.uses, inputs]);
}

/** The head's pins split into those the network must verify and those unchanged against the base. */
export function selectPins(head: readonly WorkflowText[], base: readonly WorkflowText[] | undefined): { verify: Set<string>; unchanged: Set<string> } {
  const headUses = head.flatMap(({ file, text }) => actionUses(file, text));
  const refs = new Set(headUses.map((use) => use.uses));
  if (base === undefined) return { verify: refs, unchanged: new Set() };
  const before = new Set(base.flatMap(({ file, text }) => actionUses(file, text)).map(signature));
  const verify = new Set(headUses.filter((use) => !before.has(signature(use))).map((use) => use.uses));
  return { verify, unchanged: new Set([...refs].filter((ref) => !verify.has(ref))) };
}
