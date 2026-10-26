import { parse } from 'yaml';

import { actionFile, tagCommit, type Transport } from './network';
import { parsePin, type ActionUse } from './workflows';

/**
 * The networked checks of one pin (docs/adr/0066, Part 2; test matrix CI-11), each read at the pinned commit, which
 * never changes:
 * - the release tag its comment names points at that commit (git ls-remote, the annotated tag peeled);
 * - every input a step gives is one the action declares, and every input it requires with no default is given;
 * - an action that runs as a composite pins every action among its steps to a full commit SHA, followed recursively,
 *   so no tag or branch runs inside a pinned action;
 * - in release.yml, every actions/cache use the action nests, at any depth, is gated by an input that release.yml's
 *   step sets to false, so a tag's run restores and saves nothing another run left (docs/adr/0062);
 * - a warning, not a failure, when the action runs on a Node.js runtime GitHub has deprecated (node20 or older), which
 *   the runner forces onto a newer Node.js today and will one day refuse.
 */

/** The newest Node.js runtime GitHub has deprecated for actions; an action on it or older is warned about. */
export const DEPRECATED_NODE_UP_TO = 20;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** An action's metadata at a commit: its inputs and, for a composite, its steps. */
export interface ActionMeta {
  readonly file: string;
  readonly using: string;
  readonly inputs: Readonly<Record<string, { readonly required: boolean; readonly default: unknown; readonly hasDefault: boolean }>>;
  readonly steps: readonly { readonly uses?: string; readonly if?: string; readonly with: Readonly<Record<string, unknown>> }[];
}

export function parseActionMeta(file: string, text: string): ActionMeta {
  const parsed: unknown = parse(text);
  if (!isRecord(parsed) || !isRecord(parsed.runs) || typeof parsed.runs.using !== 'string') throw new Error(`${file} declares no runs.using`);
  const inputs = Object.fromEntries(
    Object.entries(isRecord(parsed.inputs) ? parsed.inputs : {}).map(([name, spec]) => {
      const body = isRecord(spec) ? spec : {};
      return [name, { required: body.required === true || body.required === 'true', default: body.default, hasDefault: 'default' in body }];
    }),
  );
  const steps = Array.isArray(parsed.runs.steps)
    ? (parsed.runs.steps as unknown[]).filter(isRecord).map((step) => ({
        ...(typeof step.uses === 'string' ? { uses: step.uses } : {}),
        ...(typeof step.if === 'string' || typeof step.if === 'boolean' ? { if: String(step.if) } : {}),
        with: isRecord(step.with) ? step.with : {},
      }))
    : [];
  return { file, using: parsed.runs.using, inputs, steps };
}

/** Reads action metadata at a commit, once per action and commit. */
export class ActionReader {
  private readonly cache = new Map<string, Promise<ActionMeta | undefined>>();

  constructor(private readonly transport: Transport) {}

  read(repo: string, path: string, sha: string): Promise<ActionMeta | undefined> {
    const key = `${repo}/${path}@${sha}`;
    let found = this.cache.get(key);
    if (found === undefined) {
      found = actionFile(this.transport, repo, path, sha).then((file) => (file === undefined ? undefined : parseActionMeta(`${repo}@${sha}:${file.name}`, file.text)));
      this.cache.set(key, found);
    }
    return found;
  }
}

/** Why a step's inputs do not fit the action: an input it does not declare, or a required one left out. */
export function inputProblems(meta: ActionMeta, given: Readonly<Record<string, unknown>>): string[] {
  const unknown = Object.keys(given).filter((name) => !(name in meta.inputs));
  const missing = Object.entries(meta.inputs)
    .filter(([name, spec]) => spec.required && !spec.hasDefault && !(name in given))
    .map(([name]) => name);
  return [
    ...unknown.map((name) => `gives the input ${name}, which ${meta.file} does not declare (it declares: ${Object.keys(meta.inputs).join(', ') || 'none'})`),
    ...missing.map((name) => `leaves out the input ${name}, which ${meta.file} requires and gives no default`),
  ];
}

/** A digest-pinned image a composite may run directly. */
const DOCKER_DIGEST = /^docker:\/\/[^@\s]+@sha256:[0-9a-f]{64}$/;

/**
 * Every action a composite runs, pinned by full SHA at every depth; a tag, a branch, a local path or an image by tag
 * fails, naming the chain of actions down to it.
 */
export async function nestedProblems(reader: ActionReader, meta: ActionMeta, chain: readonly string[], seen = new Set<string>()): Promise<string[]> {
  if (meta.using !== 'composite') return [];
  const problems: string[] = [];
  for (const step of meta.steps) {
    if (step.uses === undefined) continue;
    const path = [...chain, step.uses].join(' > ');
    if (DOCKER_DIGEST.test(step.uses)) continue;
    const pin = parsePin(step.uses);
    if (pin === undefined) {
      problems.push(`${path}: a nested action not pinned to a full commit SHA`);
      continue;
    }
    if (seen.has(step.uses)) continue;
    seen.add(step.uses);
    const nested = await reader.read(pin.repo, pin.path, pin.sha);
    if (nested === undefined) {
      problems.push(`${path}: the nested action has no action.yml or action.yaml at that commit`);
      continue;
    }
    problems.push(...(await nestedProblems(reader, nested, [...chain, step.uses], seen)));
  }
  return problems;
}

/** actions/cache and its restore and save actions, at any ref. */
const CACHE_ACTION = /^actions\/cache(?:\/(?:restore|save))?@/;

/** A binding of a nested action's input to the calling action's own input: `${{ inputs.<name> }}`. */
const INPUT_BINDING = /^\$\{\{\s*inputs\.([A-Za-z0-9_-]+)\s*\}\}$/;

/** The input whose 'true' a step's condition requires, when the condition is a conjunction this check can read. */
export function gateOf(condition: string | undefined): string | undefined {
  if (condition === undefined) return undefined;
  const expression = condition.trim().replace(/^\$\{\{([\s\S]*)\}\}$/, '$1').trim();
  if (expression.includes('||') || expression.includes('!(')) return undefined;
  for (const part of expression.split('&&')) {
    const match = /^\(?\s*inputs\.([A-Za-z0-9_-]+)\s*==\s*'true'\s*\)?$/.exec(part.trim());
    if (match !== null) return match[1];
  }
  return undefined;
}

const isOff = (value: unknown) => value === false || value === 'false';

/** A nested cache and the top-level input that gates it, or why none does. */
export type CacheGate = { readonly chain: string; readonly input: string } | { readonly chain: string; readonly off: string } | { readonly chain: string; readonly problem: string };

/**
 * Every actions/cache use an action nests, followed through composites, each traced to the action's own input that
 * gates it: a cache step's condition must require `inputs.<name> == 'true'`, and a composite that nests one must bind
 * that input to one of its own (`${{ inputs.<name> }}`), or set it to false, or leave it at a false default.
 */
export async function cacheGates(reader: ActionReader, meta: ActionMeta, chain: readonly string[], depth = 0): Promise<CacheGate[]> {
  if (meta.using !== 'composite' || depth > 8) return [];
  const gates: CacheGate[] = [];
  for (const step of meta.steps) {
    if (step.uses === undefined) continue;
    const here = [...chain, step.uses].join(' > ');
    if (CACHE_ACTION.test(step.uses)) {
      const input = gateOf(step.if);
      gates.push(input === undefined ? { chain: here, problem: `a nested cache whose condition (${step.if ?? 'none'}) is not gated by an input this check can read` } : { chain: here, input });
      continue;
    }
    const pin = parsePin(step.uses);
    if (pin === undefined) continue;
    const nested = await reader.read(pin.repo, pin.path, pin.sha);
    if (nested === undefined) continue;
    for (const gate of await cacheGates(reader, nested, [...chain, step.uses], depth + 1)) {
      if (!('input' in gate)) {
        gates.push(gate);
        continue;
      }
      const bound = step.with[gate.input];
      if (bound === undefined) {
        const fallback = nested.inputs[gate.input]?.default;
        gates.push(isOff(fallback) ? { chain: gate.chain, off: `${step.uses} leaves ${gate.input} at its default, false` } : { chain: gate.chain, problem: `${step.uses} leaves ${gate.input} at its default (${String(fallback)}), which no input of the caller can turn off` });
      } else if (isOff(bound)) {
        gates.push({ chain: gate.chain, off: `${step.uses} sets ${gate.input}: false` });
      } else {
        const binding = typeof bound === 'string' ? INPUT_BINDING.exec(bound.trim()) : null;
        gates.push(binding === null ? { chain: gate.chain, problem: `${step.uses} sets ${gate.input} to ${JSON.stringify(bound)}, which no input of the caller can turn off` } : { chain: gate.chain, input: binding[1] ?? '' });
      }
    }
  }
  return gates;
}

/** Why a release.yml step leaves a nested cache on: each gate's top-level input must be set to false in the step. */
export function releaseCacheProblems(gates: readonly CacheGate[], given: Readonly<Record<string, unknown>>): { problems: string[]; notes: string[] } {
  const problems: string[] = [];
  const notes: string[] = [];
  for (const gate of gates) {
    if ('problem' in gate) problems.push(`${gate.chain}: ${gate.problem}`);
    else if ('off' in gate) notes.push(`${gate.chain}: off (${gate.off})`);
    else if (isOff(given[gate.input])) notes.push(`${gate.chain}: off (release.yml sets ${gate.input}: false)`);
    else problems.push(`${gate.chain}: gated by the input ${gate.input}, which release.yml's step must set to false (it is ${given[gate.input] === undefined ? 'not set' : JSON.stringify(given[gate.input])})`);
  }
  return { problems, notes };
}

/** One pin's networked verdict over every step that uses it. */
export interface PinVerdict {
  readonly ref: string;
  readonly problems: string[];
  readonly notes: string[];
  readonly warnings: string[];
}

/** The warning for an action on a deprecated Node.js runtime, if it is on one. */
export function runtimeWarning(ref: string, version: string, using: string): string | undefined {
  const node = /^node(\d+)$/.exec(using);
  if (node === null || Number(node[1]) > DEPRECATED_NODE_UP_TO) return undefined;
  return `${ref}: ${version} runs on ${using}, a Node.js runtime GitHub has deprecated; move to a release that runs on node24`;
}

/**
 * Verifies one pin: its tag, its inputs in every step that uses it, its nested actions, and, for the steps of
 * release.yml, its nested caches.
 */
export async function verifyPin(transport: Transport, reader: ActionReader, ref: string, version: string | undefined, uses: readonly ActionUse[]): Promise<PinVerdict> {
  const pin = parsePin(ref);
  if (pin === undefined) return { ref, problems: [`${ref}: not a pinned reference`], notes: [], warnings: [] };
  if (version === undefined) return { ref, problems: [`${ref}: no release version to verify the commit against`], notes: [], warnings: [] };
  const problems: string[] = [];
  const notes: string[] = [];
  const tagged = await tagCommit(transport, pin.repo, version);
  if (tagged === undefined) problems.push(`${ref}: ${pin.repo} has no tag ${version}`);
  else if (tagged !== pin.sha) problems.push(`${ref}: the tag ${version} of ${pin.repo} is the commit ${tagged}, not ${pin.sha}`);
  else notes.push(`${ref}: ${version} is this commit`);
  const job = uses.filter((use) => use.step === -1);
  if (job.length > 0) notes.push(`${ref}: called as a reusable workflow; its tag is checked, its inputs are not read`);
  const steps = uses.filter((use) => use.step !== -1);
  if (steps.length === 0) return { ref, problems, notes, warnings: [] };
  const meta = await reader.read(pin.repo, pin.path, pin.sha);
  if (meta === undefined) return { ref, problems: [...problems, `${ref}: no action.yml or action.yaml at that commit`], notes, warnings: [] };
  for (const use of steps) {
    problems.push(...inputProblems(meta, use.with).map((problem) => `${use.file} ${use.job} step ${String(use.step + 1)} (${ref}): ${problem}`));
  }
  problems.push(...(await nestedProblems(reader, meta, [ref])));
  const release = steps.filter((use) => use.file === 'release.yml');
  if (release.length > 0) {
    const gates = await cacheGates(reader, meta, [ref]);
    for (const use of release) {
      const verdict = releaseCacheProblems(gates, use.with);
      problems.push(...verdict.problems.map((problem) => `release.yml ${use.job} step ${String(use.step + 1)}: ${problem}`));
      notes.push(...verdict.notes.map((note) => `release.yml ${use.job} step ${String(use.step + 1)}: ${note}`));
    }
  }
  notes.push(`${ref}: ${meta.using}, ${String(steps.length)} step(s), inputs declared`);
  const runtime = runtimeWarning(ref, version, meta.using);
  return { ref, problems, notes, warnings: runtime === undefined ? [] : [runtime] };
}
