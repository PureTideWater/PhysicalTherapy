import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { z } from 'zod';

import { ageWords, excludeWindowProblems, expiredExclude, type KnownTime } from '../check-toolchain/exclude-window';
import { compareVersions, MINUTE_MS } from '../check-toolchain/policy';
import { AGE_EXCEPTIONS, AGE_FILE, type BaseState } from './base';
import { armoredFingerprints, dearmor } from './keys';
import { childEnv, NetworkError, pool, rateLimitWait, withRetries, type Answer, type GitObject, type Headers, type Refs, type Transport } from './network';
import { actionUses, parsePin, VERSION, versionsByRef, type WorkflowText } from './workflows';

/**
 * The age rule (docs/adr/0066, Part 5; test matrix CI-21, CI-23): an action pin new against the base enters only when
 * its commit is on the upstream's default branch, its release tag still names it, and it is at least the workspace's
 * release age old (pnpm-workspace.yaml's minimumReleaseAge, three days or more) by the youngest of every time read, one
 * of them a time GitHub recorded. Each commit is aged once, whatever refs use it, from what is read of the commit itself:
 * - git (fetchRefs, on every run): the default branch and the tag, the committer and author dates, an annotated tag's
 *   tagger date while the tag names the pin, and the web-flow signature, checked with `gpgv` against
 *   github-web-flow.asc (the current key; the retired 2017 key only for a signature made before it expired);
 * - GitHub's API, on CI only (GITHUB_ACTIONS=true, with the job's read-only token): `verification.verified_at`, the
 *   release's `published_at` and `immutable`, and, best effort, the push that brought the pin onto the default branch.
 * GitHub-recorded means, on CI, a non-null `verified_at` or an immutable release's `published_at`; locally, where the API
 * is not read, a web-flow signature stands in. A dated, exact exclude in age-exceptions.json waives one requirement and
 * nothing else: `security-fix` the floor, inside F2 (b)'s window; `age-unprovable` the need for a GitHub-recorded time;
 * `off-default-branch` the ancestry rule. A pin a reasoned exclude admits is still held to the floor by every time read.
 * On a push every finding is a warning: the pull request was the gate.
 */

/** How many commits are aged at once. */
export const AGE_CONCURRENCY = 4;
/** The REST API version every request names (E7): the same fields for every endpoint read, and no end of support. */
export const API_VERSION = '2026-03-10';
export const USER_AGENT = 'check-action-pins';
/** Where GitHub publishes its web-flow keys; a push run compares their fingerprints with the committed file's. */
export const WEB_FLOW_URL = 'https://github.com/web-flow.gpg';

/** The web-flow keys a signature is checked against: the armored keyring, the current key, and the retired one with its expiry. */
export interface WebFlowKeys {
  readonly armored: string;
  readonly current: string;
  readonly retired: { readonly fingerprint: string; readonly expired: string };
  /** The file the keys came from, as messages name it. */
  readonly file: string;
}

/** GitHub's web-flow signer: the current key, made 2024-01-16T18:05:42Z, and the 2017 key, expired 2024-01-16T20:00:00Z. */
export const WEB_FLOW = {
  current: '968479A1AFF927E37D1A566BB5690EEEBB952194',
  retired: { fingerprint: '5DE3E0509C47EA3CF04A42D34AEE18F83AFDEB23', expired: '2024-01-16T20:00:00Z' },
} as const;

/** The committed web-flow keys (github-web-flow.asc, beside this file). */
export function webFlowKeys(): WebFlowKeys {
  const file = new URL('./github-web-flow.asc', import.meta.url);
  return { armored: readFileSync(file, 'utf8'), ...WEB_FLOW, file: 'tools/check-action-pins/github-web-flow.asc' };
}

const GHSA = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/;
/** An exclude names one commit of one repository: no path, no tag, no pattern. */
const COMMIT_PIN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/;
const instant = z.iso.datetime({ offset: false });
const KINDS = ['security-fix', 'age-unprovable', 'off-default-branch'] as const;
export type AgeExceptionKind = (typeof KINDS)[number];

/** tools/check-action-pins/age-exceptions.json. */
export const ageExceptionsSchema = z.strictObject({
  $comment: z.string().optional(),
  entries: z.array(
    z.strictObject({
      pin: z.string(),
      version: z.string(),
      kind: z.enum(KINDS),
      advisory: z.string().nullable(),
      reason: z.string().min(20),
      added: instant,
      expires: instant,
    }),
  ),
});
export type AgeException = z.infer<typeof ageExceptionsSchema>['entries'][number];

/** The list's entries, or why it cannot be read; an absent list is empty. */
function parseExceptions(text: string | undefined): { entries: AgeException[]; problems: string[] } {
  if (text === undefined) return { entries: [], problems: [] };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    return { entries: [], problems: [`${AGE_EXCEPTIONS} is not JSON (${error instanceof Error ? error.message : String(error)})`] };
  }
  const parsed = ageExceptionsSchema.safeParse(raw);
  if (!parsed.success) return { entries: [], problems: [`${AGE_EXCEPTIONS}: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`] };
  return { entries: parsed.data.entries, problems: [] };
}

/**
 * The offline rule over age-exceptions.json: each entry one exact pin (owner/repo@<40 hex>) with its release version, a
 * `security-fix` naming its GHSA advisory and a reasoned kind none, and no pin excused twice for one kind.
 */
export function exceptionProblems(text: string | undefined): string[] {
  const { entries, problems } = parseExceptions(text);
  const seen = new Set<string>();
  for (const entry of entries) {
    const subject = `${AGE_EXCEPTIONS}: ${entry.pin} (${entry.kind})`;
    if (!COMMIT_PIN.test(entry.pin)) problems.push(`${subject}: not one exact pin (owner/repo@<40 hex>); a pattern, a tag or a path is refused, so each exclude names one commit`);
    if (!VERSION.test(entry.version)) problems.push(`${subject}: the version ${entry.version} is not a release version (vX.Y.Z)`);
    if (entry.kind === 'security-fix' && (entry.advisory === null || !GHSA.test(entry.advisory))) {
      problems.push(`${subject}: a security-fix exclude names its advisory, a GHSA id (it is ${JSON.stringify(entry.advisory)})`);
    }
    if (entry.kind !== 'security-fix' && entry.advisory !== null) problems.push(`${subject}: an ${entry.kind} exclude takes no advisory (null); it rests on its reason`);
    const key = `${entry.pin} ${entry.kind}`;
    if (seen.has(key)) problems.push(`${subject}: listed twice; one entry per pin and kind`);
    seen.add(key);
  }
  return problems;
}

/** The furthest a date reaches either side of 1970, in milliseconds (ECMAScript's time value range). */
const DATE_RANGE_MS = 8.64e15;
const inRange = (ms: number) => Number.isFinite(ms) && Math.abs(ms) <= DATE_RANGE_MS;

/**
 * An instant as messages print it: ISO 8601 in UTC, whole seconds without the zero milliseconds; one past the range
 * of a date is named as such rather than thrown on (the security review's N3).
 */
const iso = (ms: number) => {
  if (inRange(ms)) return new Date(ms).toISOString().replace(/\.000Z$/, 'Z');
  if (Number.isNaN(ms)) return 'no instant';
  return ms > 0 ? 'past +275760-09-13T00:00:00Z, the last instant a date holds' : 'before -271821-04-20T00:00:00Z, the first instant a date holds';
};

/** A time read for a pin: where it came from, as read, and whether GitHub recorded it. */
interface Signal {
  readonly source: string;
  readonly at: string;
  readonly ms: number;
  readonly recorded: boolean;
}

/** The commits the rule ages, each with the refs that use it and its version. */
interface Group {
  readonly key: string;
  readonly repo: string;
  readonly sha: string;
  readonly version: string;
  readonly refs: readonly string[];
}

/** What was read of one commit. */
interface Facts extends Group {
  branch?: string;
  tag?: 'names' | 'moved' | 'missing';
  tagCommit?: string;
  onBranch?: boolean;
  served?: boolean;
  readonly signals: Signal[];
  /** What was read, in order, for the commit's note. */
  readonly read: string[];
  /** Reads that failed: the pin fails closed with these, and no age verdict is given. */
  readonly faults: string[];
  /** Times read that no date can hold: each a finding, since no outage makes one (the security review's N3). */
  readonly unreadable: string[];
}

export interface AgeInput {
  readonly transport: Transport;
  readonly workflows: readonly WorkflowText[];
  /** The merge base's state, or undefined when no BASE was given (every pin is aged). */
  readonly state: BaseState | undefined;
  readonly push: boolean;
  /** The instant ages are measured at. */
  readonly now: Date;
  /** The clock a rate limit's reset is measured against. */
  readonly clock: () => number;
  /** The floor, in minutes (releaseAgeMinutes of pnpm-workspace.yaml). */
  readonly floor: number;
  /** On CI: the API reads are made, with the token. */
  readonly ci: boolean;
  readonly token: string | undefined;
  readonly apiUrl: string;
  readonly keys: WebFlowKeys;
  /** The head's age-exceptions.json, or undefined when it has none. */
  readonly exceptions: string | undefined;
  /** Refs whose verify read failed: their fault is already reported, so they are not aged again. */
  readonly failed: ReadonlySet<string>;
  /** The deadline the age reads share with the builder's. */
  readonly signal: AbortSignal;
  readonly deadlineMs: number;
  /** The gpgv binary. */
  readonly gpgv: string;
}

export interface AgeResult {
  readonly errors: string[];
  readonly warnings: string[];
  readonly notes: string[];
  /** How many commits were read. */
  readonly read: number;
}

/** The pins to age and why: every one without a BASE or when the merge base has no age rule (bootstrapping), else the new ones. */
export function ageSet(workflows: readonly WorkflowText[], state: BaseState | undefined): { refs: string[]; why: string | undefined } {
  const pins = (texts: readonly WorkflowText[]) => new Set(texts.flatMap(({ file, text }) => actionUses(file, text).map((use) => use.uses)).filter((ref) => parsePin(ref) !== undefined));
  const head = [...pins(workflows)].sort();
  if (state === undefined) return { refs: head, why: 'no BASE: every pin is aged' };
  if (!state.hasAge) return { refs: head, why: `the merge base ${state.mergeBase.slice(0, 12)} has no ${AGE_FILE}, so every pin is aged (bootstrapping)` };
  const before = pins(state.workflows);
  return { refs: head.filter((ref) => !before.has(ref)), why: undefined };
}

/** The commits of these refs, each once (E10), with every ref that uses it. */
function groupsOf(refs: readonly string[], versions: ReadonlyMap<string, string>): Group[] {
  const groups = new Map<string, { repo: string; sha: string; version: string; refs: string[] }>();
  for (const ref of refs) {
    const pin = parsePin(ref);
    const version = versions.get(ref);
    if (pin === undefined || version === undefined) continue;
    const key = `${pin.repo}@${pin.sha}`;
    const group = groups.get(key) ?? { repo: pin.repo, sha: pin.sha, version, refs: [] };
    group.refs.push(ref);
    groups.set(key, group);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, group]) => ({ key, ...group }));
}

/** A git object's headers (the first of each name), its signature when it carries one, and the bytes the signature covers. */
export function splitObject(raw: Buffer): { headers: Map<string, string>; signature: string | undefined; payload: Buffer } {
  const text = raw.toString('latin1');
  const end = text.indexOf('\n\n');
  const head = end === -1 ? text : text.slice(0, end + 1);
  const rest = end === -1 ? '' : text.slice(end + 1);
  const headers = new Map<string, string>();
  const kept: string[] = [];
  const signature: string[] = [];
  let signing = false;
  for (const line of head.split('\n').slice(0, -1)) {
    if (line.startsWith(' ')) {
      if (signing) signature.push(line.slice(1));
      else kept.push(line);
      continue;
    }
    signing = line.startsWith('gpgsig ');
    if (signing) {
      signature.push(line.slice('gpgsig '.length));
      continue;
    }
    kept.push(line);
    const space = line.indexOf(' ');
    const name = space === -1 ? line : line.slice(0, space);
    if (!headers.has(name)) headers.set(name, line.slice(space + 1));
  }
  return { headers, signature: signature.length === 0 ? undefined : `${signature.join('\n')}\n`, payload: Buffer.from(kept.map((line) => `${line}\n`).join('') + rest, 'latin1') };
}

/**
 * The time of an author, committer or tagger header: `Name <email> <epoch seconds> <zone>`, or the epoch as written when
 * it lies past the range of a date (git accepts any digits there), or undefined when the header has no time.
 */
function identityTime(value: string | undefined): { readonly ms: number } | { readonly epoch: string } | undefined {
  const match = value === undefined ? null : /\s(\d+)\s[+-]\d{4}$/.exec(value);
  if (match === null) return undefined;
  const digits = match[1] ?? '';
  const ms = Number(digits) * 1000;
  return inRange(ms) ? { ms } : { epoch: digits.length > 20 ? `${digits.slice(0, 20)}…` : digits };
}

const execFileAsync = promisify(execFile);

/** Signatures checked with gpgv against the web-flow keys, in a scratch keyring made once and removed by close(). */
class SignatureReader {
  private dir: string | undefined;
  private count = 0;

  constructor(
    private readonly keys: WebFlowKeys,
    private readonly gpgv: string,
  ) {}

  /** The web-flow signature's time, or why the signature gives none; `missing` when gpgv is not installed. */
  async read(signature: string, payload: Buffer, signal?: AbortSignal): Promise<{ readonly at?: number; readonly said: string } | 'missing'> {
    if (this.dir === undefined) {
      this.dir = mkdtempSync(path.join(os.tmpdir(), 'tp-action-pins-gpgv-'));
      writeFileSync(path.join(this.dir, 'web-flow.gpg'), dearmor(this.keys.armored));
    }
    this.count += 1;
    const signatureFile = path.join(this.dir, `${String(this.count)}.sig`);
    const payloadFile = path.join(this.dir, `${String(this.count)}.payload`);
    writeFileSync(signatureFile, signature, 'latin1');
    writeFileSync(payloadFile, payload);
    let status: string;
    try {
      status = (await execFileAsync(this.gpgv, ['--homedir', this.dir, '--status-fd', '1', '--keyring', path.join(this.dir, 'web-flow.gpg'), signatureFile, payloadFile], { timeout: 30_000, signal, env: childEnv() })).stdout;
    } catch (error) {
      const failed = error as { code?: unknown; killed?: unknown; stdout?: unknown };
      if (failed.code === 'ENOENT') return 'missing';
      // Stopped by the deadline or its own limit: no answer, which is not "no signature".
      if (failed.code === 'ABORT_ERR' || failed.killed === true || signal?.aborted === true) throw new Error('gpgv did not finish (stopped by the deadline or its 30 s limit); re-run the check', { cause: error });
      // gpgv exits non-zero for a signature it cannot check; its status lines still say why.
      status = typeof failed.stdout === 'string' ? failed.stdout : '';
    }
    const lines = status.split('\n').filter((line) => line.startsWith('[GNUPG:] '));
    const valid = lines.find((line) => line.startsWith('[GNUPG:] VALIDSIG '))?.split(' ');
    if (valid === undefined) {
      // The most telling status first: a key gpgv does not have, a bad signature, then any error.
      const why = ['NO_PUBKEY', 'BADSIG', 'EXPSIG', 'ERRSIG'].flatMap((status) => lines.filter((line) => line.startsWith(`[GNUPG:] ${status} `)))[0]?.split(' ');
      return { said: `signed, but by no web-flow key (${why === undefined ? 'gpgv found no signature it could check' : `${why[1] ?? ''} ${why[2] ?? ''}`})` };
    }
    const primary = valid[11] ?? valid[2] ?? '';
    const stamp = valid[4] ?? '';
    const at = /^\d+$/.test(stamp) ? Number(stamp) * 1000 : Date.parse(stamp.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/, '$1-$2-$3T$4:$5:$6Z'));
    const expired = lines.some((line) => line.startsWith('[GNUPG:] EXPKEYSIG '));
    const revoked = lines.some((line) => line.startsWith('[GNUPG:] REVKEYSIG '));
    if (!inRange(at)) return { said: `signed, but gpgv gave no signature time a date holds (${stamp})` };
    if (!revoked && primary === this.keys.current) return { at, said: `key ${primary}` };
    if (!revoked && primary === this.keys.retired.fingerprint && expired && at < Date.parse(this.keys.retired.expired)) return { at, said: `the retired key ${primary}, before its expiry ${this.keys.retired.expired}` };
    if (primary === this.keys.retired.fingerprint) return { said: `signed ${iso(at)} by the retired web-flow key ${primary}, after its expiry ${this.keys.retired.expired}: no signal` };
    return { said: `signed ${iso(at)} by ${primary}, no web-flow key: no signal` };
  }

  close(): void {
    if (this.dir !== undefined) rmSync(this.dir, { recursive: true, force: true });
  }
}

/** The shared context of one run's reads. */
interface Context {
  readonly input: AgeInput;
  readonly signatures: SignatureReader;
  readonly api: string;
  readonly apiHost: string;
  readonly headers: Headers;
}

const failure = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A refused API answer, tried again: a server error or a rate limit. */
function apiRefusal(answer: Answer): string | undefined {
  if (answer.status >= 500) return `HTTP ${String(answer.status)}`;
  if (answer.status === 429 || (answer.status === 403 && (answer.headers['retry-after'] !== undefined || answer.headers['x-ratelimit-remaining'] === '0'))) return `HTTP ${String(answer.status)} (rate limited)`;
  return undefined;
}

/** One API read under the retries, the rate limit's wait and the deadline; a 3xx is an answer, never followed (E20). */
async function apiGet(context: Context, url: string, what: string, refuse: (answer: Answer) => string | undefined = apiRefusal): Promise<Answer> {
  const { input } = context;
  return withRetries(
    input.transport,
    context.apiHost,
    `GET ${url} (${what})`,
    () => input.transport.get(url, input.signal, context.headers),
    refuse,
    input.signal,
    (answer) => rateLimitWait(answer, input.clock()),
  );
}

/** Why an API answer is not the 200 a read needs: a move named as one, any other status as a failed read. */
function apiProblem(context: Context, answer: Answer, url: string, repo: string): string {
  if (answer.status >= 300 && answer.status < 400) {
    const to = answer.headers.location;
    return `${context.apiHost} answers HTTP ${String(answer.status)} for ${repo}${to === undefined ? '' : ` (to ${to})`}: the repository moved; pin it under its new name`;
  }
  return `${context.apiHost}: GET ${url} answered HTTP ${String(answer.status)}; the check fails closed`;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The verification's reason when GitHub's signature service failed: a failed read, tried again (S9). */
function verificationRefusal(answer: Answer): string | undefined {
  const refused = apiRefusal(answer);
  if (refused !== undefined || answer.status !== 200) return refused;
  try {
    const body: unknown = JSON.parse(answer.text);
    const reason = isRecord(body) && isRecord(body.verification) ? body.verification.reason : undefined;
    if (reason === 'gpgverify_error' || reason === 'gpgverify_unavailable') return `verification.reason ${reason}, GitHub's signature service failing`;
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * What the fetch says of a commit an activity entry names: it holds it with the pin among its ancestors (`carries`) or
 * without (`lacks`), it does not hold it (`absent`), or a read failed (`unread`, with why). It never throws: the arrival
 * read is best effort (E12; the ci-infra review's N1).
 */
type Held = { readonly state: 'carries' | 'lacks' | 'absent' } | { readonly state: 'unread'; readonly why: string };
async function pinIn(transport: Transport, repo: string, pin: string, commit: string, signal: AbortSignal): Promise<Held> {
  try {
    if ((await transport.object(repo, commit, signal)) === undefined) return signal.aborted ? { state: 'unread', why: 'stopped by the deadline' } : { state: 'absent' };
    return { state: (await transport.isAncestor(repo, pin, commit, signal)) ? 'carries' : 'lacks' };
  } catch (error) {
    return { state: 'unread', why: failure(error).split('\n')[0] ?? '' };
  }
}

const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** The `next` page of a Link header, on the API's own origin only, so the token is never sent elsewhere. */
function nextPage(link: string | undefined, api: string): string | undefined {
  const next = link?.split(',').find((part) => /;\s*rel="next"/.test(part));
  const url = next === undefined ? undefined : /<([^>]+)>/.exec(next)?.[1];
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin === new URL(api).origin ? url : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The arrival read (E12): the newest push or merge inside the floor's window whose `after` the fetch holds with the pin
 * as an ancestor and whose `before` it holds without the pin, the `before` fetched by its SHA when the branch's fetch
 * does not hold it (a force push's); a `before` that cannot be fetched or read still counts, since an arrival only makes
 * the pin younger. Best effort: one try a page, at most three pages, no wait; any outcome but an arrival is a note,
 * since an absent entry proves nothing.
 */
async function arrival(context: Context, facts: Facts, branch: string): Promise<{ note: string; signal?: Signal }> {
  const { input } = context;
  const start = input.now.getTime() - input.floor * MINUTE_MS;
  let url: string | undefined = `${context.api}/repos/${facts.repo}/activity?ref=${encodeURIComponent(`refs/heads/${branch}`).replaceAll('%2F', '/')}&per_page=100`;
  let entries = 0;
  for (let page = 0; page < 3 && url !== undefined; page++) {
    let answer: Answer;
    try {
      answer = await input.transport.get(url, input.signal, context.headers);
    } catch (error) {
      return { note: `activity: not read (${failure(error).split('\n')[0] ?? ''}); the arrival on ${branch} is not known` };
    }
    if (answer.status !== 200) return { note: `activity: not read (HTTP ${String(answer.status)}); the arrival on ${branch} is not known` };
    let listed: unknown;
    try {
      listed = JSON.parse(answer.text);
    } catch {
      return { note: `activity: an answer that is not JSON; the arrival on ${branch} is not known` };
    }
    if (!Array.isArray(listed)) return { note: `activity: an answer that is not a list; the arrival on ${branch} is not known` };
    for (const entry of listed as unknown[]) {
      entries += 1;
      if (!isRecord(entry) || typeof entry.timestamp !== 'string' || Number.isNaN(Date.parse(entry.timestamp))) {
        return { note: `activity: an entry without a timestamp; the arrival on ${branch} is not known` };
      }
      const at = Date.parse(entry.timestamp);
      if (at < start) return { note: `activity: no push brought the pin onto ${branch} since ${iso(start)} (${String(entries)} entries read)` };
      if (typeof entry.after !== 'string' || !COMMIT_SHA.test(entry.after)) continue;
      const after = await pinIn(input.transport, facts.repo, facts.sha, entry.after, input.signal);
      if (after.state === 'unread') return { note: `activity: the commit ${entry.after.slice(0, 12)} an entry names could not be read (${after.why}); the arrival on ${branch} is not known` };
      if (after.state !== 'carries') continue;
      const named = typeof entry.before === 'string' && COMMIT_SHA.test(entry.before) && !/^0{40}$/.test(entry.before) ? entry.before : undefined;
      let before: Held = named === undefined ? { state: 'absent' } : await pinIn(input.transport, facts.repo, facts.sha, named, input.signal);
      if (named !== undefined && before.state === 'absent') {
        // A force push's before is off the branch the fetch holds: fetched by its SHA, one try, so a rewritten history
        // that already carried the pin is no arrival (the ci-infra review's N7).
        const why = await input.transport.fetchSha(facts.repo, named, input.signal).then(
          (served) => (served ? undefined : 'github.com does not serve it by its SHA'),
          (error: unknown) => failure(error).split('\n')[0] ?? '',
        );
        before = why === undefined ? await pinIn(input.transport, facts.repo, facts.sha, named, input.signal) : { state: 'unread', why };
        if (before.state === 'absent') before = { state: 'unread', why: 'not held after its fetch' };
      }
      if (before.state === 'carries') continue;
      const kind = typeof entry.activity_type === 'string' ? entry.activity_type : 'push';
      // A before that cannot be read still counts: the arrival can only make the pin younger, the safe direction.
      const unread = before.state === 'unread' && named !== undefined ? `; its before ${named.slice(0, 12)} could not be read (${before.why}), so the entry counts as the arrival (the safe direction)` : '';
      return {
        note: `activity: the pin arrived on ${branch} at ${entry.timestamp} (${kind} ${String(entry.before).slice(0, 12)}..${entry.after.slice(0, 12)})${unread}`,
        signal: { source: `arrival on ${branch}`, at: entry.timestamp, ms: at, recorded: false },
      };
    }
    url = nextPage(answer.headers.link, context.api);
  }
  return url === undefined
    ? { note: `activity: no push brought the pin onto ${branch} in the ${String(entries)} entries GitHub lists` }
    : { note: `activity: three pages (${String(entries)} entries) end before ${iso(start)}; the arrival on ${branch} is not known` };
}

/** Reads one commit: its refs and branch, its own times and signature, and on CI what GitHub recorded. */
async function readFacts(context: Context, group: Group): Promise<Facts> {
  const { input } = context;
  const { transport, signal } = input;
  const facts: Facts = { ...group, signals: [], read: [], faults: [], unreadable: [] };
  const fault = (error: unknown) => {
    facts.faults.push(error instanceof NetworkError ? `${error.message}; re-run the check` : failure(error));
  };
  let refs: Refs;
  try {
    refs = await withRetries(transport, 'github.com', `git ls-remote --symref and fetch of ${group.repo} (HEAD, ${group.version})`, () => transport.fetchRefs(group.repo, group.version, signal), undefined, signal);
  } catch (error) {
    fault(error);
    return facts;
  }
  if (refs.branch === undefined || refs.head === undefined) {
    facts.faults.push(`github.com lists no default branch (HEAD) for ${group.repo}`);
    return facts;
  }
  const branch = refs.branch;
  facts.branch = branch;
  facts.tag = refs.tag === undefined ? 'missing' : refs.tag.commit === group.sha ? 'names' : 'moved';
  facts.tagCommit = refs.tag?.commit;

  // The pinned commit: held when the branch or the tag brought it, else fetched by its SHA only to say whether github.com serves it.
  let commit: GitObject | undefined;
  try {
    commit = await transport.object(group.repo, group.sha, signal);
    if (commit === undefined) {
      facts.served = await withRetries(transport, 'github.com', `git fetch of ${group.repo}@${group.sha} by its SHA`, () => transport.fetchSha(group.repo, group.sha, signal), undefined, signal);
      if (!facts.served) {
        facts.onBranch = false;
        return facts;
      }
      commit = await transport.object(group.repo, group.sha, signal);
    } else {
      facts.served = true;
    }
    if (commit?.type !== 'commit') {
      facts.faults.push(`${group.sha} is ${commit === undefined ? 'not held after its fetch' : `a ${commit.type}, not a commit`}`);
      return facts;
    }
    facts.onBranch = await transport.isAncestor(group.repo, group.sha, refs.head, signal);
  } catch (error) {
    fault(error);
    return facts;
  }
  facts.read.push(facts.onBranch ? `on ${branch}` : `not on ${branch}`);
  facts.read.push(facts.tag === 'names' ? `the tag ${group.version} names it` : facts.tag === 'moved' ? `the tag ${group.version} names ${facts.tagCommit ?? ''}` : `no tag ${group.version}`);

  /** A time read, kept among the signals and printed where it was read, with what it says beside it. */
  const signalOf = (source: string, at: string, ms: number, recorded: boolean, beside = '') => {
    facts.signals.push({ source, at, ms, recorded });
    facts.read.push(`${source} ${at}${beside}`);
  };
  /** A git identity's time: a signal, or, past the range of a date, a finding naming the epoch as written. */
  const identity = (source: string, time: ReturnType<typeof identityTime>) => {
    if (time === undefined) return;
    if ('ms' in time) {
      signalOf(source, iso(time.ms), time.ms, false);
      return;
    }
    facts.unreadable.push(`the ${source} (epoch ${time.epoch}) is past the range of a date`);
    facts.read.push(`${source} unreadable (epoch ${time.epoch})`);
  };
  const own = splitObject(commit.raw);
  for (const [header, source] of [
    ['committer', 'committer date'],
    ['author', 'author date'],
  ] as const) {
    identity(source, identityTime(own.headers.get(header)));
  }
  try {
    if (facts.tag === 'names' && refs.tag !== undefined && refs.tag.object !== refs.tag.commit) {
      // The fetch brought the tag's object with the tag, so an object not read is a failed read, never "no tagger date".
      const tag = await transport.object(group.repo, refs.tag.object, signal);
      if (tag === undefined) {
        facts.faults.push(`the annotated tag ${group.version} (${refs.tag.object}) could not be read after its fetch, so its tagger date is not known; re-run the check`);
        return facts;
      }
      const at = identityTime(splitObject(tag.raw).headers.get('tagger'));
      if (at === undefined) facts.read.push('the annotated tag gives no tagger date');
      else identity('tagger date', at);
    }
    if (own.signature === undefined) {
      facts.read.push('unsigned');
    } else if (!own.signature.startsWith('-----BEGIN PGP SIGNATURE-----')) {
      facts.read.push(`signed with ${own.signature.startsWith('-----BEGIN SSH SIGNATURE-----') ? 'SSH' : 'a signature other than OpenPGP'}: no web-flow signal`);
    } else {
      const checked = await context.signatures.read(own.signature, own.payload, signal);
      if (checked === 'missing') {
        facts.faults.push(`gpgv is not installed, so the commit's signature cannot be checked; install it (apt-get install gpgv) and re-run`);
        return facts;
      }
      if (checked.at === undefined) facts.read.push(checked.said);
      else signalOf('web-flow signature', iso(checked.at), checked.at, !input.ci, ` (${checked.said})`);
    }
  } catch (error) {
    fault(error);
    return facts;
  }

  if (input.ci) {
    try {
      const url = `${context.api}/repos/${group.repo}/git/commits/${group.sha}`;
      const answer = await apiGet(context, url, 'verification', verificationRefusal);
      if (answer.status !== 200) {
        facts.faults.push(apiProblem(context, answer, url, group.repo));
        return facts;
      }
      const body: unknown = JSON.parse(answer.text);
      const verification = isRecord(body) && isRecord(body.verification) ? body.verification : {};
      const at = typeof verification.verified_at === 'string' ? verification.verified_at : null;
      const reason = typeof verification.reason === 'string' ? verification.reason : 'none given';
      if (at === null || Number.isNaN(Date.parse(at))) facts.read.push(`verified_at ${at ?? 'null'} (reason ${reason})`);
      else signalOf('verified_at', at, Date.parse(at), true, ` (reason ${reason})`);
      if (facts.tag === 'names') {
        const releaseUrl = `${context.api}/repos/${group.repo}/releases/tags/${group.version}`;
        const release = await apiGet(context, releaseUrl, 'release');
        if (release.status === 404) {
          facts.read.push('no release');
        } else if (release.status !== 200) {
          facts.faults.push(apiProblem(context, release, releaseUrl, group.repo));
          return facts;
        } else {
          const published: unknown = JSON.parse(release.text);
          const at = isRecord(published) && typeof published.published_at === 'string' && !Number.isNaN(Date.parse(published.published_at)) ? published.published_at : null;
          // `immutable` is optional in the release schema: absent reads as false (D4).
          const immutable = isRecord(published) && published.immutable === true;
          if (at === null) facts.read.push(`release published_at null (immutable ${String(immutable)}): no signal`);
          else signalOf(immutable ? 'immutable release published_at' : 'release published_at', at, Date.parse(at), immutable, ` (immutable ${String(immutable)})`);
        }
      }
    } catch (error) {
      fault(error);
      return facts;
    }
    // Best effort: whatever fails in it is a note, never a throw out of the pool (the ci-infra review's N1).
    const arrived = await arrival(context, facts, branch).catch((error: unknown) => ({ note: `activity: not read (${failure(error).split('\n')[0] ?? ''}); the arrival on ${branch} is not known`, signal: undefined }));
    facts.read.push(arrived.note);
    if (arrived.signal !== undefined) facts.signals.push(arrived.signal);
  }
  return facts;
}

const signalList = (signals: readonly Signal[]) => signals.map((signal) => `${signal.source} ${signal.at}`).join(', ');

const REMEDY =
  'wait until then, or, for a security fix, add it to tools/check-action-pins/age-exceptions.json with its advisory, the date added and an expiry (docs/runbooks/dependency-upgrades.md)';

/** The verdict on one commit's facts under the live excludes that name it. */
function judge(input: AgeInput, facts: Facts, entries: readonly AgeException[]): { errors: string[]; notes: string[]; known: KnownTime | null } {
  const errors: string[] = [];
  const notes: string[] = [`age: ${facts.key} ${facts.version} (${facts.refs.join(', ')}): ${facts.read.join('; ') || 'nothing read'}`];
  const name = `${facts.key} ${facts.version}`;
  const now = input.now.getTime();
  const live = (kind: AgeExceptionKind) => entries.find((entry) => entry.pin === facts.key && entry.kind === kind && Date.parse(entry.added) <= now && Date.parse(entry.expires) > now);
  const youngest = facts.signals.reduce<Signal | undefined>((found, signal) => (found === undefined || signal.ms > found.ms ? signal : found), undefined);
  const known = youngest === undefined ? null : { what: 'the pin', at: youngest.at, as: youngest.source };
  if (facts.faults.length > 0) return { errors: facts.faults.map((fault) => `${name}: ${fault}`), notes, known };
  for (const unreadable of facts.unreadable) errors.push(`${name}: ${unreadable}, so the pin's age cannot be read from it; choose another release`);

  if (facts.tag === 'missing') errors.push(`${name}: no tag ${facts.version} in ${facts.repo} (git ls-remote), so the pin names no release; pin a release's commit`);
  if (facts.tag === 'moved') errors.push(`${name}: tag moved: the tag ${facts.version} of ${facts.repo} names ${facts.tagCommit ?? ''}, not the pin ${facts.sha}; its tagger date is not counted, and the pin is aged from its own commit`);
  const branch = facts.branch ?? 'the default branch';
  if (facts.served === false) {
    errors.push(`${name}: not on ${branch}, the default branch of ${facts.repo}, and github.com does not serve the commit by its SHA`);
    return { errors, notes, known };
  }
  const offBranch = live('off-default-branch');
  if (facts.onBranch === false) {
    if (offBranch === undefined) {
      errors.push(`${name}: not on ${branch}, the default branch of ${facts.repo} (git merge-base --is-ancestor): a tag moved to a commit outside the default branch is how an impostor commit enters; choose a release on ${branch}, or, for a release made on a maintenance branch, add an off-default-branch exclude with its reason (it waives only this rule)`);
    } else {
      notes.push(`age: ${facts.key}: not on ${branch}, admitted by its off-default-branch exclude until ${offBranch.expires} (${offBranch.reason}); every other rule still holds`);
    }
  } else if (offBranch !== undefined) {
    errors.push(`${name}: an off-default-branch exclude, but the pin is on ${branch}; remove the entry`);
  }

  for (const signal of facts.signals.filter((candidate) => candidate.ms > now)) {
    errors.push(`${name}: the ${signal.source} ${signal.at} is in the future, so the pin counts as young until ${iso(signal.ms + input.floor * MINUTE_MS)}; no exclude clears a time in the future: choose another release`);
  }

  const recorded = facts.signals.filter((signal) => signal.recorded);
  const unprovable = live('age-unprovable');
  if (recorded.length === 0) {
    if (unprovable === undefined) {
      const why = input.ci
        ? 'GitHub recorded no time for it (verified_at null or absent, and no immutable release)'
        : 'no web-flow signature, and the API, where GitHub may have recorded a time (verified_at, an immutable release), is read on CI only';
      errors.push(
        `${name}: age unprovable: ${why}; read: ${signalList(facts.signals) || 'no time'}; choose a release GitHub signed or published immutable, or add an age-unprovable exclude with its reason to tools/check-action-pins/age-exceptions.json (it waives only this; the pin is still held to ${ageWords(input.floor)} by every time read)`,
      );
    } else {
      notes.push(`age: ${facts.key}: no time GitHub recorded, admitted by its age-unprovable exclude until ${unprovable.expires} (${unprovable.reason}); it is still held to ${ageWords(input.floor)} by every time read`);
    }
  } else if (unprovable !== undefined) {
    errors.push(`${name}: an age-unprovable exclude, but GitHub recorded a time for it (${signalList(recorded)}); remove the entry`);
  }

  if (youngest !== undefined) {
    const matureAt = youngest.ms + input.floor * MINUTE_MS;
    if (matureAt > now) {
      const fix = live('security-fix');
      if (fix === undefined) {
        const others = facts.signals.filter((signal) => signal !== youngest);
        const late = youngest.source === 'verified_at' && others.length > 0 && others.every((signal) => youngest.ms - signal.ms > input.floor * MINUTE_MS);
        errors.push(
          `${name}: under ${ageWords(input.floor)} old: the youngest time read is the ${youngest.source} ${youngest.at}, so it is old enough from ${iso(matureAt)}; read: ${signalList(facts.signals)}; ${
            late
              ? `verified_at is more than ${ageWords(input.floor)} after every other time read, as when GitHub verifies an older commit's signature late (it records verified_at the next time it verifies one): re-run the check after ${iso(matureAt)}`
              : REMEDY
          }`,
        );
      } else {
        notes.push(`age: ${facts.key}: under ${ageWords(input.floor)} old (old enough from ${iso(matureAt)}), admitted by its security-fix exclude for ${fix.advisory ?? ''} until ${fix.expires}`);
      }
    } else {
      notes.push(`age: ${facts.key}: the youngest time read, the ${youngest.source} ${youngest.at}, is ${((now - youngest.ms) / 86_400_000).toFixed(2)} days old; old enough from ${iso(matureAt)}`);
    }
  }
  return { errors, notes, known };
}

/** Whether a GHSA vulnerable range (`>= 1.0.0, < 1.4.2`, `= 2.0.0`, `< 3`) holds a version; an unread constraint holds nothing. */
export function ghsaRangeHolds(range: string, version: string): boolean {
  const normal = (text: string) => {
    const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(-[0-9A-Za-z.-]+)?$/.exec(text.trim());
    return match === null ? undefined : `${match[1] ?? '0'}.${match[2] ?? '0'}.${match[3] ?? '0'}${match[4] ?? ''}`;
  };
  const target = normal(version);
  if (target === undefined) return false;
  const constraints = range.split(',').map((part) => part.trim());
  if (constraints.length === 0 || constraints.some((part) => part === '')) return false;
  return constraints.every((constraint) => {
    const match = /^(>=|<=|>|<|=)?\s*(\S+)$/.exec(constraint);
    const bound = match === null ? undefined : normal(match[2] ?? '');
    if (match === null || bound === undefined) return false;
    const order = compareVersions(target, bound);
    switch (match[1] ?? '=') {
      case '>=':
        return order >= 0;
      case '<=':
        return order <= 0;
      case '>':
        return order > 0;
      case '<':
        return order < 0;
      default:
        return order === 0;
    }
  });
}

/**
 * E11: a security-fix exclude this change adds names a GHSA advisory GitHub's database holds, unwithdrawn, with a
 * vulnerability in the actions ecosystem for the pin's repository whose range covers the version the base pins and not
 * the pin's own. An action the base does not pin is refused, since no advisory against what we run can be fixed by it.
 */
async function advisoryProblems(context: Context, entry: AgeException, subject: string): Promise<{ errors: string[]; notes: string[] }> {
  const { input } = context;
  const repo = entry.pin.split('@')[0] ?? '';
  const purpose = 'an exclude is only for the fix of an advisory against what we run (docs/runbooks/dependency-upgrades.md)';
  const baseVersions = new Set<string>();
  for (const [ref, version] of versionsByRef(input.state?.workflows ?? [])) if (parsePin(ref)?.repo === repo) baseVersions.add(version);
  if (baseVersions.size === 0) return { errors: [`${subject}: the base pins no other commit of ${repo}, so no advisory against what we run can be fixed by it; ${purpose}`], notes: [] };
  if (!input.ci) return { errors: [], notes: [`age: ${subject}: ${entry.advisory ?? ''} is checked against GitHub's advisory database on CI only; not read locally`] };
  const url = `${context.api}/advisories/${entry.advisory ?? ''}`;
  let answer: Answer;
  try {
    answer = await apiGet(context, url, 'advisory');
  } catch (error) {
    return { errors: [`${subject}: ${failure(error)}; re-run the check`], notes: [] };
  }
  if (answer.status === 404) return { errors: [`${subject}: GitHub's advisory database has no ${entry.advisory ?? ''}`], notes: [] };
  if (answer.status !== 200) return { errors: [`${subject}: ${apiProblem(context, answer, url, repo)}`], notes: [] };
  let body: unknown;
  try {
    body = JSON.parse(answer.text);
  } catch {
    return { errors: [`${subject}: GitHub's answer for ${entry.advisory ?? ''} is not JSON; the check fails closed`], notes: [] };
  }
  const advisory = isRecord(body) ? body : {};
  if (typeof advisory.withdrawn_at === 'string') return { errors: [`${subject}: ${entry.advisory ?? ''} was withdrawn ${advisory.withdrawn_at}; ${purpose}`], notes: [] };
  const ranges = (Array.isArray(advisory.vulnerabilities) ? (advisory.vulnerabilities as unknown[]) : []).flatMap((vulnerability) => {
    const pkg = isRecord(vulnerability) && isRecord(vulnerability.package) ? vulnerability.package : {};
    const name = typeof pkg.name === 'string' ? pkg.name.toLowerCase() : '';
    const range = isRecord(vulnerability) && typeof vulnerability.vulnerable_version_range === 'string' ? vulnerability.vulnerable_version_range : undefined;
    return pkg.ecosystem === 'actions' && (name === repo.toLowerCase() || name.startsWith(`${repo.toLowerCase()}/`)) && range !== undefined ? [range] : [];
  });
  if (ranges.length === 0) return { errors: [`${subject}: ${entry.advisory ?? ''} lists no vulnerability in the actions ecosystem for ${repo}; ${purpose}`], notes: [] };
  const errors: string[] = [];
  const before = [...baseVersions].sort(compareVersions);
  if (!before.some((version) => ranges.some((range) => ghsaRangeHolds(range, version)))) {
    errors.push(`${subject}: ${entry.advisory ?? ''}'s vulnerable range for ${repo} (${ranges.join('; ')}) does not cover ${before.join(', ')}, the version the base pins; ${purpose}`);
  }
  if (ranges.some((range) => ghsaRangeHolds(range, entry.version))) errors.push(`${subject}: ${entry.advisory ?? ''}'s vulnerable range for ${repo} (${ranges.join('; ')}) covers ${entry.version} itself, so it is not the fix`);
  return { errors, notes: errors.length === 0 ? [`age: ${subject}: ${entry.advisory ?? ''} covers ${before.join(', ')}, which the base pins, and not ${entry.version}`] : [] };
}

/** The age rule over the head's workflows. */
export async function ageRule(input: AgeInput): Promise<AgeResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const notes: string[] = [];
  const set = ageSet(input.workflows, input.state);
  if (set.why !== undefined) notes.push(`age: ${set.why}`);
  const versions = versionsByRef(input.workflows);
  const ageKeys = new Set(groupsOf(set.refs, versions).map((group) => group.key));
  const groups = groupsOf(
    set.refs.filter((ref) => !input.failed.has(ref)),
    versions,
  );
  if (set.refs.length === 0) notes.push('age: no pin new against the base, nothing read');
  else if (groups.length === 0) notes.push(`age: no pin aged: the verify reads of ${set.refs.join(', ')} failed above`);
  if (!input.ci && groups.length > 0) notes.push("age: GitHub's API (verified_at, the release, the arrival on the default branch, an exclude's advisory) is read on CI only; locally a web-flow signature stands in for a time GitHub recorded");

  const head = parseExceptions(input.exceptions);
  const base = parseExceptions(input.state?.ageExceptions);
  const api = (input.apiUrl === '' ? 'https://api.github.com' : input.apiUrl).replace(/\/+$/, '');
  if (input.ci && (input.token === undefined || input.token === '') && (groups.length > 0 || head.entries.length > 0)) {
    return { errors: ['GITHUB_TOKEN is not set: on CI the age rule reads GitHub’s API with the job’s token (ci.yml’s Action pins step); the check fails closed'], warnings, notes, read: 0 };
  }
  const context: Context = {
    input,
    signatures: new SignatureReader(input.keys, input.gpgv),
    api,
    apiHost: new URL(api).host,
    headers: { Authorization: `Bearer ${input.token ?? ''}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': API_VERSION, 'User-Agent': USER_AGENT },
  };
  const verdicts = new Map<string, { known: KnownTime | null }>();
  const unread = new Set(groups.map((group) => group.key));
  try {
    const read = new Map<string, Facts>();
    await pool(groups, AGE_CONCURRENCY, input.signal, async (group) => {
      const facts = await readFacts(context, group);
      // A read the deadline stopped stays unread, for the one finding below.
      if (input.signal.aborted && facts.faults.length > 0) return;
      read.set(group.key, facts);
      unread.delete(group.key);
    });
    for (const group of groups) {
      const facts = read.get(group.key);
      if (facts === undefined) continue;
      const verdict = judge(input, facts, head.entries);
      errors.push(...verdict.errors);
      notes.push(...verdict.notes);
      verdicts.set(group.key, { known: verdict.known });
    }
    if (unread.size > 0) {
      const hosts = input.ci ? `github.com and ${context.apiHost}` : 'github.com';
      const message = `the age reads stopped at their ${String(input.deadlineMs / 1000)} s deadline with ${String(unread.size)} of ${String(groups.length)} commit(s) unread (${[...unread].join(', ')}): ${hosts} did not answer in time`;
      if (input.push) warnings.push(`${message}; the pins still run the commits they name`);
      else errors.push(`${message}; re-run the check`);
    }

    // The excludes: each used, its version the pin's, an added one inside its kind's window, an expired one removed.
    const used = new Map<string, string>();
    for (const [ref, version] of versions) {
      const pin = parsePin(ref);
      if (pin !== undefined) used.set(`${pin.repo}@${pin.sha}`, version);
    }
    const baseEntries = new Set(base.entries.map((entry) => JSON.stringify(entry)));
    const edited = JSON.stringify(head.entries.map((entry) => JSON.stringify(entry)).sort()) !== JSON.stringify([...baseEntries].sort());
    for (const entry of head.entries) {
      const subject = `${entry.pin} (${entry.kind})`;
      const version = used.get(entry.pin);
      if (version === undefined) warnings.push(`${subject}: no workflow pins ${entry.pin}; remove the entry from ${AGE_EXCEPTIONS} (the weekly triage)`);
      else if (version !== entry.version) errors.push(`${subject}: the entry says ${entry.version}, but the workflows label ${entry.pin} ${version}`);
      if (!baseEntries.has(JSON.stringify(entry))) {
        if (version !== undefined && !ageKeys.has(entry.pin)) errors.push(`${subject}: ${entry.pin} is not new against the base, so its age is never read and the entry admits nothing; remove it`);
        if (entry.kind === 'security-fix') {
          errors.push(...excludeWindowProblems(subject, entry, { kind: 'security-fix', known: verdicts.get(entry.pin)?.known ?? null, minutes: input.floor }, input.now));
          const advised = await advisoryProblems(context, entry, subject);
          errors.push(...advised.errors);
          notes.push(...advised.notes);
        } else {
          errors.push(...excludeWindowProblems(subject, entry, { kind: 'reasoned' }, input.now));
        }
      }
      const expired = expiredExclude(subject, entry.expires, input.now, { event: input.push ? 'push' : 'pull_request', edited, list: AGE_EXCEPTIONS });
      if (expired !== null) (expired.level === 'error' ? errors : warnings).push(expired.message);
    }

    // A push run that read a signature compares GitHub's published web-flow keys with the committed ones (a rotation).
    if (input.push && read.size > 0) {
      try {
        const published = await input.transport.get(WEB_FLOW_URL, input.signal);
        if (published.status !== 200) {
          notes.push(`age: ${WEB_FLOW_URL} answered HTTP ${String(published.status)}; the key rotation check did not run`);
        } else {
          const theirs = new Set(armoredFingerprints(published.text));
          const ours = new Set(armoredFingerprints(input.keys.armored));
          if (theirs.size !== ours.size || [...theirs].some((fingerprint) => !ours.has(fingerprint))) {
            warnings.push(`the web-flow keys at ${WEB_FLOW_URL} (${[...theirs].sort().join(', ')}) differ from ${input.keys.file} (${[...ours].sort().join(', ')}): GitHub may have rotated its signing key; add the new key to the file (docs/adr/0066, Part 5)`);
          } else {
            notes.push(`age: ${WEB_FLOW_URL} holds the committed web-flow keys`);
          }
        }
      } catch (error) {
        notes.push(`age: ${WEB_FLOW_URL} could not be read (${failure(error).split('\n')[0] ?? ''}); the key rotation check did not run`);
      }
    }
    // On a push every finding warns: the pull request was the gate, and a red build branch blocks every lane.
    if (input.push) warnings.push(...errors.splice(0));
    return { errors, warnings, notes, read: read.size };
  } finally {
    context.signatures.close();
  }
}
