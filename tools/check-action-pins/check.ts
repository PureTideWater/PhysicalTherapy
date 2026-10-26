import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { baseState, selectPins } from './base';
import { builderOf, checkBuilder } from './buildkit';
import { tagCommit, type Transport } from './network';
import { ActionReader, verifyPin } from './verify';
import { actionUses, consistencyProblems, formProblems, parsePin, versionsByRef, type WorkflowText } from './workflows';

/**
 * `pnpm actions:check` (docs/adr/0066, Part 2; test matrix CI-11): the pin policy over every workflow. Offline on every
 * run: every action pinned to a full commit SHA with its release version, one commit and one version per action.
 * Networked, for the pins the base does not already vouch for (base.ts): the tag, the inputs, the nested actions and
 * release.yml's nested caches (verify.ts). On a push run, every other pin's tag is read again, and a tag that moved or
 * could not be read is a warning, never a failure: a SHA pin runs what it names whatever its tag does. Those re-reads
 * run PUSH_CONCURRENCY at a time under one deadline for them all (the ci-infra review's S1): a github.com that accepts
 * and never answers stops them at PUSH_DEADLINE_MS, and every tag still unread is named in one warning, so the push
 * run's `static` (timeout-minutes: 15) cannot time out on them.
 */

/** How many unchanged tags a push run reads at once. */
export const PUSH_CONCURRENCY = 4;
/**
 * The one deadline for all of a push run's re-reads: two minutes, well inside `static`'s fifteen, and longer than one
 * read's three tries at their 30-second limit with the pauses between them (97 s), so a single slow tag is read.
 */
export const PUSH_DEADLINE_MS = 120_000;

export interface CheckOptions {
  readonly root: string;
  /** The range step's base; undefined reads every pin. */
  readonly base: string | undefined;
  /** GITHUB_EVENT_NAME: on a push, the unchanged pins' tags are read for warnings. */
  readonly event: string | undefined;
  readonly transport: Transport;
  /** The offline rules alone. */
  readonly offline?: boolean;
  /** The push run's deadline for its re-reads (PUSH_DEADLINE_MS; shorter in the tests). */
  readonly pushDeadlineMs?: number;
  /** The time the builder's release age is measured from (now; fixed in the tests). */
  readonly now?: Date;
}

/** Runs each task with at most `limit` in flight, starting none after the signal aborts. */
async function pool<T>(items: readonly T[], limit: number, signal: AbortSignal, task: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      const item = items[next] as T;
      next += 1;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
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
  const builder = builderOf(workflows);
  const errors = [...formProblems(workflows), ...consistencyProblems(workflows), ...builder.problems];
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
      warnings.push(...verdict.warnings);
    } catch (error) {
      errors.push(`${ref}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (verify.size === 0) notes.push('no pin is new or used with changed inputs: no action read from the network');

  // The BuildKit builder, on every networked run: Dependabot never updates it, so this read is what notices a release.
  if (builder.builder !== undefined) {
    const before = base === undefined ? undefined : builderOf(base).builder;
    const isNew = before === undefined || before.version !== builder.builder.version || before.digest !== builder.builder.digest;
    const verdict = await checkBuilder(options.transport, builder.builder, { isNew, now: options.now ?? new Date() });
    errors.push(...verdict.errors);
    warnings.push(...verdict.warnings);
    notes.push(...verdict.notes);
  }

  if (options.event === 'push') {
    notes.push(`a push: the tags of ${String(unchanged.size)} unchanged pin(s) read again, a moved or unreadable one a warning`);
    const deadlineMs = options.pushDeadlineMs ?? PUSH_DEADLINE_MS;
    const deadline = new AbortController();
    const timer = setTimeout(() => {
      deadline.abort();
    }, deadlineMs);
    const pins = [...unchanged].sort().flatMap((ref) => {
      const pin = parsePin(ref);
      const version = versions.get(ref);
      return pin === undefined || version === undefined ? [] : [{ ref, pin, version }];
    });
    const unread = new Set(pins.map(({ ref }) => ref));
    const found = new Map<string, string>();
    try {
      await pool(pins, PUSH_CONCURRENCY, deadline.signal, async ({ ref, pin, version }) => {
        try {
          const tagged = await tagCommit(options.transport, pin.repo, version, deadline.signal);
          if (tagged !== pin.sha) found.set(ref, `${ref}: the tag ${version} of ${pin.repo} ${tagged === undefined ? 'no longer exists' : `now names ${tagged}`}; the pin still runs the commit it names, and the next actions update moves it`);
        } catch (error) {
          // A read the deadline stopped stays unread, for the one warning below.
          if (deadline.signal.aborted) return;
          found.set(ref, `${ref}: its tag could not be read again (${error instanceof Error ? error.message : String(error)})`);
        }
        unread.delete(ref);
      });
    } finally {
      clearTimeout(timer);
    }
    // In the pins' order, whatever order the reads finished in.
    for (const { ref } of pins) {
      const warning = found.get(ref);
      if (warning !== undefined) warnings.push(warning);
    }
    if (unread.size > 0) {
      warnings.push(`the push run's re-read of unchanged tags stopped at its ${String(deadlineMs / 1000)} s deadline with ${String(unread.size)} of ${String(pins.length)} unread (${[...unread].join(', ')}); the pins still run the commits they name`);
    }
  }
  return { errors, warnings, notes };
}
