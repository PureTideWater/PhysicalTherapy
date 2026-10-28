import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { releaseAgeMinutes } from '../check-toolchain/exclude-window';
import { AGE_DEADLINE_MS, AGE_EXCEPTIONS, ageRule, exceptionProblems, webFlowKeys, type WebFlowKeys } from './age';
import { baseState, selectPins, type BaseState } from './base';
import { builderOf, checkBuilder } from './buildkit';
import { NetworkError, pool, tagCommit, type Transport } from './network';
import { ActionReader, verifyPin } from './verify';
import { actionUses, consistencyProblems, formProblems, parsePin, reusableWorkflowProblems, versionsByRef, type WorkflowText } from './workflows';

/**
 * `pnpm actions:check` (docs/adr/0066, Parts 2 and 5; test matrix CI-11, CI-21, CI-23): the pin policy over every
 * workflow. Offline on every run: no file in a subdirectory of .github/workflows, every action pinned to a full commit
 * SHA with its release version, one commit and one version per action, no reusable workflow of another repository, and
 * age-exceptions.json well formed. Networked, for
 * the pins the base does not already vouch for (base.ts): the tag, the inputs, the nested actions and release.yml's
 * nested caches (verify.ts); then the BuildKit builder (buildkit.ts) and the age rule (age.ts), under one deadline of
 * AGE_DEADLINE_MS. On a push run every finding about something read from upstream is a warning, since the pull request
 * was the gate and a red build branch blocks every lane: the verify loop's failed reads, moved tags and the refs its
 * deadline (PUSH_DEADLINE_MS) left unread, for every ref, new against the previous head or not (the ci-infra review's
 * S4; a problem in what was read, which no outage or upstream move makes, stays an error); the builder's faults; and
 * every age finding. A push run also reads every other pin's tag again, a
 * tag that moved or could not be read a warning: a SHA pin runs what it names whatever its tag does. Those re-reads run
 * PUSH_CONCURRENCY at a time under one deadline for them all (the ci-infra review's S1): a github.com that accepts and
 * never answers stops them at PUSH_DEADLINE_MS, and every tag still unread is named in one warning, so the push run's
 * `static` (timeout-minutes: 15) cannot time out on them.
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
  /** The push run's deadline for its verify loop and for its re-reads, each (PUSH_DEADLINE_MS; shorter in the tests). */
  readonly pushDeadlineMs?: number;
  /** The time ages are measured from (now; fixed in the tests). */
  readonly now?: Date;
  /** The release age, in minutes: releaseAgeMinutes of pnpm-workspace.yaml (index.ts); never under MINIMUM_RELEASE_AGE_MINUTES. */
  readonly floor?: number;
  /** On CI (GITHUB_ACTIONS=true): the age rule reads GitHub's API with the token. */
  readonly ci?: boolean;
  /** GITHUB_TOKEN: the job's read-only token, sent to the API alone. */
  readonly token?: string;
  /** GITHUB_API_URL (https://api.github.com). */
  readonly apiUrl?: string;
  /** The web-flow keys signatures are checked against (github-web-flow.asc; synthetic keys in the tests). */
  readonly keys?: WebFlowKeys;
  /** The deadline the builder's and the age rule's reads share (AGE_DEADLINE_MS; shorter in the tests). */
  readonly ageDeadlineMs?: number;
  /** The gpgv binary (gpgv). */
  readonly gpgv?: string;
}

export interface CheckResult {
  readonly errors: string[];
  readonly warnings: string[];
  readonly notes: string[];
}

const WORKFLOWS_DIR = '.github/workflows';

/** The workflow files of a tree, by name: the top level alone, the files GitHub runs. */
export function readWorkflows(root: string): WorkflowText[] {
  const dir = path.join(root, WORKFLOWS_DIR);
  return readdirSync(dir)
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .map((file) => ({ file, text: readFileSync(path.join(dir, file), 'utf8') }));
}

/**
 * The offline rule over .github/workflows' subdirectories: no file in one. GitHub never runs it and no rule here reads
 * it, so a pin parked there would vouch for nothing and enter a workflow later unread (the security review's S3).
 */
export function workflowDirectoryProblems(root: string): string[] {
  const dir = path.join(root, WORKFLOWS_DIR);
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => !entry.isDirectory() && path.resolve(entry.parentPath) !== path.resolve(dir))
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
    .sort()
    .map((file) => `${file}: a file in a subdirectory of ${WORKFLOWS_DIR}, which GitHub never runs and this check never reads, so a pin parked there would enter a workflow later without its age read; keep drafts outside ${WORKFLOWS_DIR}`);
}

/** A file of the checkout, or undefined when it has none. */
function readOptional(file: string): string | undefined {
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
}

/** A deadline: its signal aborts after `ms`, and `clear` stops the timer. */
function deadline(ms: number): { readonly signal: AbortSignal; clear(): void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, ms);
  return {
    signal: controller.signal,
    clear() {
      clearTimeout(timer);
    },
  };
}

export async function checkActionPins(options: CheckOptions): Promise<CheckResult> {
  const workflows = readWorkflows(options.root);
  const builder = builderOf(workflows);
  const exceptions = readOptional(path.join(options.root, AGE_EXCEPTIONS));
  const errors = [
    ...workflowDirectoryProblems(options.root),
    ...formProblems(workflows),
    ...reusableWorkflowProblems(workflows),
    ...consistencyProblems(workflows),
    ...builder.problems,
    ...exceptionProblems(exceptions),
  ];
  const warnings: string[] = [];
  const notes: string[] = [];
  if (options.offline === true) return { errors, warnings, notes: ['offline: the networked checks did not run'] };

  const push = options.event === 'push';
  let state: BaseState | undefined;
  let base: readonly WorkflowText[] | undefined;
  if (options.base === undefined || options.base === '') {
    notes.push('no BASE: every pin is read');
  } else {
    try {
      state = baseState(options.root, options.base);
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
  // The refs the base's workflows already ran, whatever `everyPin` says: a push's warning about an upstream fault says which.
  const ran = new Set((state?.workflows ?? []).flatMap(({ file, text }) => actionUses(file, text)).map((use) => use.uses));
  const reader = new ActionReader(options.transport);
  const failed = new Set<string>();
  const verifyDeadlineMs = options.pushDeadlineMs ?? PUSH_DEADLINE_MS;
  const verifyDeadline = push ? deadline(verifyDeadlineMs) : undefined;
  const unverified: string[] = [];
  const stopped = () => verifyDeadline?.signal.aborted === true;
  /** Why an upstream fault of this ref is a warning on a push. */
  const onPush = (ref: string) => (ran.has(ref) ? 'the base already ran this pin, so on a push this is a warning' : 'the pull request that added this pin was the gate, so on a push this is a warning');
  try {
    for (const ref of [...verify].sort()) {
      // Rule (a) already refuses a reference that is not a pin; the network has nothing to say about it.
      if (parsePin(ref) === undefined) continue;
      if (stopped()) {
        unverified.push(ref);
        failed.add(ref);
        continue;
      }
      try {
        const verdict = await verifyPin(
          options.transport,
          reader,
          ref,
          versions.get(ref),
          uses.filter((use) => use.uses === ref),
          verifyDeadline?.signal,
        );
        const moved = push ? (verdict.tagProblems ?? []) : [];
        errors.push(...verdict.problems.filter((problem) => !moved.includes(problem)));
        warnings.push(...moved.map((problem) => `${problem}; ${onPush(ref)}`));
        notes.push(...verdict.notes);
        warnings.push(...verdict.warnings);
      } catch (error) {
        failed.add(ref);
        if (stopped() && error instanceof NetworkError) {
          unverified.push(ref);
          continue;
        }
        const message = `${ref}: ${error instanceof Error ? error.message : String(error)}`;
        // A read that failed every try is an outage; anything else (an action.yml that does not parse) is in what was read.
        if (push && error instanceof NetworkError) warnings.push(`${message}; ${onPush(ref)}`);
        else errors.push(message);
      }
    }
  } finally {
    verifyDeadline?.clear();
  }
  if (unverified.length > 0) {
    const late = `the push run's verify reads stopped at their ${String(verifyDeadlineMs / 1000)} s deadline`;
    const old = unverified.filter((ref) => ran.has(ref));
    const fresh = unverified.filter((ref) => !ran.has(ref));
    if (old.length > 0) warnings.push(`${late} with ${String(old.length)} pin(s) the base already ran unread (${old.join(', ')}); they still run the commits they name`);
    if (fresh.length > 0) warnings.push(`${late} with ${String(fresh.length)} new pin(s) unread (${fresh.join(', ')}): github.com did not answer in time; the pull request that added them was the gate, so on a push this is a warning`);
  }
  if (verify.size === 0) notes.push('no pin is new or used with changed inputs: no action read from the network');

  // The builder and the age rule share one deadline (E3), so an outage cannot hold `static` past its timeout.
  const ageDeadlineMs = options.ageDeadlineMs ?? AGE_DEADLINE_MS;
  const ageDeadline = deadline(ageDeadlineMs);
  const now = options.now ?? new Date();
  // The floor as check-toolchain reads it, so a floor under the minimum or not a number reads as three days, never NaN.
  const floor = releaseAgeMinutes({ minimumReleaseAge: options.floor });
  try {
    // The BuildKit builder, on every networked run: Dependabot never updates it, so this read is what notices a release.
    // Its newness is read from the base's workflows, which a change that edits the checker leaves known (E4).
    if (builder.builder !== undefined) {
      const before = state === undefined ? undefined : builderOf(state.workflows).builder;
      const isNew = before === undefined || before.version !== builder.builder.version || before.digest !== builder.builder.digest;
      const verdict = await checkBuilder(options.transport, builder.builder, { isNew, now, signal: ageDeadline.signal, floor, push });
      errors.push(...verdict.errors);
      warnings.push(...verdict.warnings);
      notes.push(...verdict.notes);
    }

    const aged = await ageRule({
      transport: options.transport,
      workflows,
      state,
      push,
      now,
      clock: options.now === undefined ? Date.now : () => now.getTime(),
      floor,
      ci: options.ci === true,
      token: options.token,
      apiUrl: options.apiUrl ?? 'https://api.github.com',
      keys: options.keys ?? webFlowKeys(),
      exceptions,
      failed,
      signal: ageDeadline.signal,
      deadlineMs: ageDeadlineMs,
      gpgv: options.gpgv ?? 'gpgv',
    });
    errors.push(...aged.errors);
    warnings.push(...aged.warnings);
    notes.push(...aged.notes);
  } finally {
    ageDeadline.clear();
  }

  if (push) {
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
