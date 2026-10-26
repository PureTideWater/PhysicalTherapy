import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { baseState, selectPins } from './base';
import { tagCommit, type Transport } from './network';
import { ActionReader, verifyPin } from './verify';
import { actionUses, consistencyProblems, formProblems, parsePin, versionsByRef, type WorkflowText } from './workflows';

/**
 * `pnpm actions:check` (docs/adr/0066, Part 2; test matrix CI-11): the pin policy over every workflow. Offline on every
 * run: every action pinned to a full commit SHA with its release version, one commit and one version per action.
 * Networked, for the pins the base does not already vouch for (base.ts): the tag, the inputs, the nested actions and
 * release.yml's nested caches (verify.ts). On a push run, every other pin's tag is read again, and a tag that moved or
 * could not be read is a warning, never a failure: a SHA pin runs what it names whatever its tag does.
 */

export interface CheckOptions {
  readonly root: string;
  /** The range step's base; undefined reads every pin. */
  readonly base: string | undefined;
  /** GITHUB_EVENT_NAME: on a push, the unchanged pins' tags are read for warnings. */
  readonly event: string | undefined;
  readonly transport: Transport;
  /** The offline rules alone. */
  readonly offline?: boolean;
}

export interface CheckResult {
  readonly errors: string[];
  readonly warnings: string[];
  readonly notes: string[];
}

/** The workflow files of a tree, by name. */
export function readWorkflows(root: string): WorkflowText[] {
  const dir = path.join(root, '.github/workflows');
  return readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .map((file) => ({ file, text: readFileSync(path.join(dir, file), 'utf8') }));
}

export async function checkActionPins(options: CheckOptions): Promise<CheckResult> {
  const workflows = readWorkflows(options.root);
  const errors = [...formProblems(workflows), ...consistencyProblems(workflows)];
  const warnings: string[] = [];
  const notes: string[] = [];
  if (options.offline === true) return { errors, warnings, notes: ['offline: the networked checks did not run'] };

  let base: readonly WorkflowText[] | undefined;
  if (options.base === undefined || options.base === '') {
    notes.push('no BASE: every pin is read');
  } else {
    try {
      const state = baseState(options.root, options.base);
      if (state.everyPin === undefined) {
        base = state.workflows;
        notes.push(`against the merge base ${state.mergeBase.slice(0, 12)}: only pins new or with changed inputs are read`);
      } else {
        notes.push(`every pin is read: ${state.everyPin}`);
      }
    } catch (error) {
      return { errors: [...errors, error instanceof Error ? error.message : String(error)], warnings, notes };
    }
  }

  const { verify, unchanged } = selectPins(workflows, base);
  const versions = versionsByRef(workflows);
  const uses = workflows.flatMap(({ file, text }) => actionUses(file, text));
  const reader = new ActionReader(options.transport);
  for (const ref of [...verify].sort()) {
    // Rule (a) already refuses a reference that is not a pin; the network has nothing to say about it.
    if (parsePin(ref) === undefined) continue;
    try {
      const verdict = await verifyPin(
        options.transport,
        reader,
        ref,
        versions.get(ref),
        uses.filter((use) => use.uses === ref),
      );
      errors.push(...verdict.problems);
      notes.push(...verdict.notes);
    } catch (error) {
      errors.push(`${ref}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (verify.size === 0) notes.push('no pin is new or used with changed inputs: nothing read from the network');

  if (options.event === 'push') {
    notes.push(`a push: the tags of ${String(unchanged.size)} unchanged pin(s) read again, a moved or unreadable one a warning`);
    for (const ref of [...unchanged].sort()) {
      const pin = parsePin(ref);
      const version = versions.get(ref);
      if (pin === undefined || version === undefined) continue;
      try {
        const tagged = await tagCommit(options.transport, pin.repo, version);
        if (tagged !== pin.sha) warnings.push(`${ref}: the tag ${version} of ${pin.repo} ${tagged === undefined ? 'no longer exists' : `now names ${tagged}`}; the pin still runs the commit it names, and the next actions update moves it`);
      } catch (error) {
        warnings.push(`${ref}: its tag could not be read again (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }
  return { errors, warnings, notes };
}
