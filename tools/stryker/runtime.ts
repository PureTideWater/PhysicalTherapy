import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { repositoryRoot } from '../content-files';
import type { Runtime } from './canary/verdict';

/**
 * The runtime every mutation job is held to (docs/adr/0066, Part 7; test matrix CI-29): the Node, Unicode and ICU
 * tools/stryker/unicode.json's recorded equivalents were checked on (its checkedOn, the Node every mutation job pins),
 * and the pnpm the root manifest's packageManager names. A pin change can move each: setup-node the Node and its
 * Unicode and ICU data, pnpm/action-setup the pnpm. The gate holds every shard's canary verdict to them, the shard's
 * own view prints them, and the changes job checks its own before it decides anything.
 *
 * `pnpm -s exec tsx tools/stryker/runtime.ts --pnpm "$(pnpm --version)"` is that check: it prints this process's
 * runtime and fails, naming each difference, unless its Node, Unicode, ICU and pnpm are the pins. It runs through the
 * same pnpm and tsx shims as every later step, so a `node` bin a dependency links into the root's node_modules/.bin, or
 * another pnpm, fails the job.
 *
 * pnpm has two legs, and each must be the pin. The user agent pnpm sets for the step it runs can be set by an `.npmrc`
 * `user-agent` or a workspace `userAgent`; both are global to the classifier (`.npmrc` a global input, `userAgent`
 * outside WORKSPACE_INERT_KEYS), so such a change runs every shard and is in the founder's review. `--pnpm` is what
 * the pnpm on the step's PATH prints for `pnpm --version`, run by the step's shell before `pnpm exec` puts any
 * node_modules/.bin first, which no user-agent setting changes. npm_execpath is no leg: `pnpm exec` leaves it unset.
 */

/** The pins: Node as checkedOn writes it (no `v`), its Unicode and ICU data, and pnpm's version. */
export interface Pins {
  readonly node: string;
  readonly unicode: string;
  readonly icu: string;
  readonly pnpm: string;
}

/** What the CLI prints, and its exit status. */
export interface RuntimeCheck {
  readonly lines: readonly string[];
  readonly status: number;
}

/** The recorded equivalents that rest on the engine's Unicode data, and the runtime they were checked on. */
export const UNICODE_FILE = 'tools/stryker/unicode.json';

/** The root packageManager the pins accept: pnpm at an exact version, with pnpm's optional integrity hash. */
export const PACKAGE_MANAGER = /^pnpm@(\d+\.\d+\.\d+)(\+sha(?:1|224|256|384|512)\.[0-9a-f]+)?$/;

/** The pnpm version a packageManager value names; '' for any other form (another manager, a range, a tag). */
export function packageManagerVersion(value: unknown): string {
  return typeof value === 'string' ? (PACKAGE_MANAGER.exec(value)?.[1] ?? '') : '';
}

/** The pnpm version the user agent pnpm sets for a step it runs names (`pnpm/10.34.8 npm/? node/v24.22.0 linux x64`); '' for none. */
export function pnpmOfUserAgent(agent: string | undefined): string {
  return /^pnpm\/(\S+) /.exec(agent ?? '')?.[1] ?? '';
}

const withoutV = (version: string) => (version.startsWith('v') ? version.slice(1) : version);
const shown = (value: string) => (value === '' ? '(none)' : value);
const shownNode = (value: string) => (value === '' ? '(none)' : `v${withoutV(value)}`);

/** A runtime as the logs print it. */
export function describeRuntime(runtime: Runtime): string {
  return `Node ${shownNode(runtime.node)} (Unicode ${shown(runtime.unicode)}, ICU ${shown(runtime.icu)}) and pnpm ${shown(runtime.pnpm)}`;
}

/**
 * Each leg of a runtime that is not the pinned one, naming its value, the pin and where the pin comes from. Node is
 * compared without its `v` (process.version writes one, checkedOn none); an empty value or pin never matches.
 */
export function runtimeProblems(runtime: Runtime, pins: Pins): string[] {
  const legs = [
    ['Node', withoutV(runtime.node), withoutV(pins.node), shownNode(runtime.node), shownNode(pins.node), `${UNICODE_FILE}'s checkedOn.node`],
    ['Unicode', runtime.unicode, pins.unicode, shown(runtime.unicode), shown(pins.unicode), `${UNICODE_FILE}'s checkedOn.unicode`],
    ['ICU', runtime.icu, pins.icu, shown(runtime.icu), shown(pins.icu), `${UNICODE_FILE}'s checkedOn.icu`],
    ['pnpm', runtime.pnpm, pins.pnpm, shown(runtime.pnpm), shown(pins.pnpm), "the root package.json's packageManager"],
  ] as const;
  return legs.filter(([, value, pin]) => value === '' || pin === '' || value !== pin).map(([leg, , , value, pin, source]) => `${leg} ${value}, not the pinned ${pin} (${source})`);
}

/**
 * The pins, read from the repository at `root`: tools/stryker/unicode.json's checkedOn and the root packageManager.
 * Throws, naming the value, on a checkedOn that is not three versions or a packageManager PACKAGE_MANAGER refuses, so
 * no job is ever held to a pin it cannot read.
 */
export function readPins(root: string = repositoryRoot): Pins {
  const listing = JSON.parse(readFileSync(path.join(root, UNICODE_FILE), 'utf8')) as { checkedOn?: Record<string, unknown> } | null;
  const checkedOn = listing?.checkedOn;
  const { node, unicode, icu } = checkedOn ?? {};
  if (typeof node !== 'string' || !/^\d+\.\d+\.\d+$/.test(node) || typeof unicode !== 'string' || unicode === '' || typeof icu !== 'string' || icu === '') {
    throw new Error(`${UNICODE_FILE}'s checkedOn is ${String(JSON.stringify(checkedOn))}, not { node: <x.y.z>, unicode, icu }: the mutation jobs' runtime cannot be pinned to it`);
  }
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as { packageManager?: unknown } | null;
  const packageManager = manifest?.packageManager;
  const pnpm = packageManagerVersion(packageManager);
  if (pnpm === '') throw new Error(`package.json's packageManager is ${String(JSON.stringify(packageManager))}, not pnpm@<x.y.z> with an optional +sha<n>.<hex>: the mutation jobs' pnpm cannot be pinned to it`);
  return { node, unicode, icu, pnpm };
}

/** What a job's check holds beside its runtime: the version `pnpm --version` printed, when the step gives one. */
export interface Checks {
  readonly pnpmVersion?: string | undefined;
}

/**
 * A job's check: the runtime, then every leg that is not the pinned one as an error, exit 1 on any. A `pnpm --version`
 * the step gives is a second pnpm leg, held to the same pin; an empty one (pnpm printed nothing) is no pnpm.
 */
export function checkRuntime(runtime: Runtime, pins: Pins, checks: Checks = {}): RuntimeCheck {
  const problems = runtimeProblems(runtime, pins);
  const lines = [`runtime: ${describeRuntime(runtime)}`];
  const printed = checks.pnpmVersion?.trim();
  if (printed !== undefined) {
    lines.push(`runtime: pnpm --version prints ${shown(printed)}`);
    if (printed === '' || printed !== pins.pnpm) problems.push(`pnpm --version prints ${shown(printed)}, not the pinned ${shown(pins.pnpm)} (the root package.json's packageManager)`);
  }
  if (problems.length === 0) {
    lines.push(`runtime: the pinned one (Node, Unicode and ICU as ${UNICODE_FILE}'s checkedOn, pnpm as the root package.json's packageManager${printed === undefined ? '' : ', by its user agent and by pnpm --version'})`);
    return { lines, status: 0 };
  }
  lines.push(...problems.map((problem) => `::error::The runtime is not the pinned one: ${problem}`));
  return { lines, status: 1 };
}

/** This process's runtime: its Node and the Unicode and ICU data it holds, and the pnpm that started it. */
export function processRuntime(env: NodeJS.ProcessEnv = process.env): Runtime {
  return { node: process.version, unicode: process.versions.unicode ?? '', icu: process.versions.icu ?? '', pnpm: pnpmOfUserAgent(env.npm_config_user_agent) };
}

if (process.argv[1] !== undefined && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const { values } = parseArgs({ options: { pnpm: { type: 'string' } }, strict: true, allowPositionals: false });
  const { lines, status } = checkRuntime(processRuntime(), readPins(), { pnpmVersion: values.pnpm });
  process.stdout.write(`${lines.join('\n')}\n`);
  process.exitCode = status;
}
