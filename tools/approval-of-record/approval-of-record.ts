import { appendFileSync, readFileSync } from 'node:fs';

/**
 * approval-of-record (.github/workflows/approval-of-record.yml; docs/adr/0063): the founder's GitHub review is
 * the approval of record. A pull request that changes the "Approved by:" line of docs/product/domain-model.md or
 * packages/db/domain-model/approvers.json, relative to its base branch's tip, needs an APPROVED review of its
 * latest commit from an approver on the BASE branch's list who is not its author: from the login of the person
 * the head's line names, or from any listed login when the line names no one. A reviewer's state is their latest
 * review that approves, requests changes or is dismissed; a comment changes nothing. A base branch with no approver
 * list at all (main, until the launch merge brings it one) takes the list on the protected build branch,
 * claude/build-platform, never the head's. Every file is read at a commit: the base branch's tip, resolved as a branch
 * (refs/heads/, so no tag of the same name stands in for it), and the head commit the event names, the one this
 * run's check belongs to.
 *
 * Until the repository variable APPROVAL_REVIEW_REQUIRED is `true` (in any case) the job passes and says that the
 * requirement is not yet enforced, why, and what it would decide; `false` or unset is the same; any other value
 * fails it. Enforced, it fails a pull request the rule refuses and any error reading the API.
 *
 * Run by Node 24 directly (`node tools/approval-of-record/approval-of-record.ts`), with no dependency and no
 * install: it uses only Node's own modules and erasable TypeScript. It reads the workflow token from
 * GITHUB_TOKEN and sends it only in the Authorization header; nothing it prints holds it. Its two readers of the
 * repository's files (approvalLineOf, parseApprovers) are held to packages/db's by approval-of-record.test.ts.
 */
export const DOCUMENT = 'docs/product/domain-model.md';
export const APPROVERS = 'packages/db/domain-model/approvers.json';
export const VARIABLE = 'APPROVAL_REVIEW_REQUIRED';
export const APPROVERS_FORMAT = 'tp-domain-model-approvers/2';
/** The protected build branch, whose approver list decides for a base branch that has none (docs/adr/0063). */
export const BUILD_BRANCH = 'claude/build-platform';
const RUNBOOK = 'docs/runbooks/github-governance.md, step 5';

/** A GitHub login as GitHub issues them (packages/db's GITHUB_LOGIN). */
const LOGIN = /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/;
const APPROVAL_PREFIX = 'Approved by:';
const APPROVAL_LINE = /^Approved by: (.+?) {2}Date: (\S+) {2}Document SHA-256: `([0-9a-f]{64})`$/;

export interface Approver {
  readonly name: string;
  readonly github: string;
}

/** A review as GET /repos/{owner}/{repo}/pulls/{number}/reviews returns it (the fields read). */
export interface Review {
  readonly user: { readonly login: string } | null;
  readonly state: string;
  readonly commit_id: string | null;
  readonly submitted_at?: string | null;
}

/** The files the decision reads, at the base branch's tip and at the head commit; null where a file does not exist. */
export interface Side {
  readonly document: string | null;
  readonly approvers: string | null;
}

export interface DecisionInput {
  readonly author: string;
  readonly headSha: string;
  readonly base: Side;
  readonly head: Side;
  readonly reviews: readonly Review[];
  /** The build branch's approver list, read only when the base branch has none (and is not the build branch). */
  readonly buildBranchApprovers?: string | null;
}

export interface Decision {
  /** The pull request changes the approval line or the approver list, so it needs the review of record. */
  readonly required: boolean;
  /** No review is needed, or a review that qualifies is there. */
  readonly satisfied: boolean;
  /** What was found, one finding per line, for the log and the job summary. */
  readonly findings: readonly string[];
}

export type Enforcement = { readonly kind: 'enforced' } | { readonly kind: 'not enforced'; readonly value: string } | { readonly kind: 'invalid'; readonly value: string };

/**
 * The repository variable: `true` enforces; unset, empty or `false` does not, in any case (a phone's keyboard
 * capitalises the first letter); anything else is refused.
 */
export function readEnforcement(value: string | undefined): Enforcement {
  const v = (value ?? '').trim();
  if (v.toLowerCase() === 'true') return { kind: 'enforced' };
  if (v === '' || v.toLowerCase() === 'false') return { kind: 'not enforced', value: v };
  return { kind: 'invalid', value: v };
}

/** Text from a pull request's files, made safe for one log line: no control characters, at most 120 characters. */
export function shown(text: string): string {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what is taken out
  const clean = text.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ');
  return clean.length > 120 ? `${clean.slice(0, 120)}…` : clean;
}

/**
 * The document's approval line: its last line that is not empty, when that starts with "Approved by:"
 * (packages/db's approvalLineOf); otherwise null, and null for a document that does not exist.
 */
export function approvalLineOf(text: string | null): string | null {
  if (text === null) return null;
  const lines = text.split('\n');
  let last = lines.length - 1;
  while (last >= 0 && lines[last] === '') last--;
  const line = last >= 0 ? (lines[last] ?? '') : '';
  return line.startsWith(APPROVAL_PREFIX) ? line : null;
}

/** The name an approval line signs, or null when it signs no one (awaiting, removed, or in another shape). */
export function signedName(line: string | null): string | null {
  const m = line === null ? null : APPROVAL_LINE.exec(line);
  const name = (m?.[1] ?? '').trim();
  return m === null || name === '' || /^_+$/.test(name) ? null : name;
}

/**
 * The approver list in its second format (packages/db's readApproverRecords), or why it cannot be read: the
 * first format names no login, so a base branch still on it has no approver whose review can count.
 */
export function parseApprovers(text: string | null): { readonly approvers: readonly Approver[]; readonly problem: string | null } {
  if (text === null) return { approvers: [], problem: `the base branch has no ${APPROVERS}` };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { approvers: [], problem: `the base branch's ${APPROVERS} is not JSON` };
  }
  const list = typeof json === 'object' && json !== null && !Array.isArray(json) ? (json as Record<string, unknown>) : null;
  if (list?.format !== APPROVERS_FORMAT) {
    return { approvers: [], problem: `the base branch's ${APPROVERS} is not in the format ${APPROVERS_FORMAT}, which names each approver's GitHub login` };
  }
  const entries = Array.isArray(list.approvers) ? (list.approvers as unknown[]) : null;
  if (entries === null) return { approvers: [], problem: `the base branch's ${APPROVERS} has no list of approvers` };
  const approvers: Approver[] = [];
  for (const entry of entries) {
    const record = typeof entry === 'object' && entry !== null ? (entry as Record<string, unknown>) : {};
    const { name, github } = record;
    if (typeof name !== 'string' || typeof github !== 'string' || !LOGIN.test(github) || name.trim() === '' || name !== name.trim()) {
      return { approvers: [], problem: `the base branch's ${APPROVERS} has an entry that is not a name and a GitHub login` };
    }
    approvers.push({ name, github });
  }
  if (approvers.length === 0) return { approvers, problem: `the base branch's ${APPROVERS} lists no approver` };
  return { approvers, problem: null };
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();
const short = (sha: string | null): string => (sha ?? 'none').slice(0, 7);

/** A reviewer's state: their latest review that approves, requests changes or is dismissed (a comment changes nothing). */
export function reviewerState(reviews: readonly Review[], login: string): Review | null {
  let state: Review | null = null;
  for (const review of reviews) {
    if (review.user !== null && same(review.user.login, login) && ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'].includes(review.state)) state = review;
  }
  return state;
}

/** The rule (see the module comment), as a pure function of what the API returned. */
export function decide(input: DecisionInput): Decision {
  const baseLine = approvalLineOf(input.base.document);
  const headLine = approvalLineOf(input.head.document);
  const lineChanged = baseLine !== headLine;
  const listChanged = input.base.approvers !== input.head.approvers;
  if (!lineChanged && !listChanged) {
    return { required: false, satisfied: true, findings: [`This pull request changes neither the approval line of ${DOCUMENT} nor ${APPROVERS}, so it needs no review of record.`] };
  }
  const findings: string[] = [];
  const name = signedName(headLine);
  if (lineChanged) {
    const to = headLine === null ? 'removes it' : name === null ? 'leaves it awaiting approval' : `makes it an approval by ${shown(name)}`;
    findings.push(`This pull request changes the approval line of ${DOCUMENT}: it ${to}.`);
  }
  if (listChanged) findings.push(`This pull request changes ${APPROVERS}, the list of who may approve.`);

  let listed = input.base.approvers;
  if (listed === null && input.buildBranchApprovers !== undefined && input.buildBranchApprovers !== null) {
    // main before the launch merge: no list of its own, so the protected build branch's decides (never the head's).
    findings.push(`The base branch has no ${APPROVERS}, so the approvers are those on ${BUILD_BRANCH}, the protected build branch, at its tip.`);
    listed = input.buildBranchApprovers;
  }
  const { approvers, problem } = parseApprovers(listed);
  if (problem !== null) return { required: true, satisfied: false, findings: [...findings, `No review can count: ${problem}.`] };
  let eligible: readonly Approver[] = approvers;
  if (name !== null) {
    eligible = approvers.filter((a) => a.name === name);
    if (eligible.length === 0) {
      return { required: true, satisfied: false, findings: [...findings, `The line names ${shown(name)}, who is not on the base branch's approver list, so no review can make it the approval of record.`] };
    }
  }
  const reviewers = eligible.filter((a) => !same(a.github, input.author));
  if (reviewers.length === 0) {
    return {
      required: true,
      satisfied: false,
      findings: [...findings, `Its review must come from ${eligible.map((a) => `@${a.github}`).join(' or ')}, who authored it; GitHub does not let an author approve their own pull request.`],
    };
  }
  findings.push(`It needs an APPROVED review of its latest commit, ${short(input.headSha)}, from ${reviewers.map((a) => `@${a.github} (${a.name})`).join(' or ')}.`);
  for (const reviewer of reviewers) {
    const state = reviewerState(input.reviews, reviewer.github);
    if (state === null) {
      findings.push(`@${reviewer.github} has not reviewed it.`);
    } else if (state.state === 'APPROVED' && state.commit_id === input.headSha) {
      return { required: true, satisfied: true, findings: [...findings, `@${reviewer.github} approved commit ${short(input.headSha)}: this is the approval of record.`] };
    } else if (state.state === 'APPROVED') {
      findings.push(`@${reviewer.github} approved commit ${short(state.commit_id)}, not the latest commit, ${short(input.headSha)}.`);
    } else if (state.state === 'CHANGES_REQUESTED') {
      findings.push(`@${reviewer.github} requested changes.`);
    } else {
      findings.push(`@${reviewer.github}'s review was dismissed.`);
    }
  }
  return { required: true, satisfied: false, findings };
}

/** A response, as much of the Fetch API's as the run reads. */
export interface ApiResponse {
  readonly status: number;
  text(): Promise<string>;
}
export type Fetch = (url: string, init: { readonly headers: Readonly<Record<string, string>> }) => Promise<ApiResponse>;

export interface RunOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch: Fetch;
  readonly readFile: (file: string) => string;
  /** One line of the log. */
  readonly log: (line: string) => void;
  /** Markdown for the job summary. */
  readonly summary: (markdown: string) => void;
}

/** A workflow command's message: GitHub reads %, CR and LF in it as escapes. */
const command = (kind: 'error' | 'warning' | 'notice', message: string): string => `::${kind}::${message.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')}`;

class ApiError extends Error {
  override readonly name = 'ApiError';
}

/** Reads what the decision needs through the GitHub API, decides, reports, and returns the exit code. */
export async function run(options: RunOptions): Promise<number> {
  const { env, log } = options;
  const enforcement = readEnforcement(env[VARIABLE]);
  if (enforcement.kind === 'invalid') {
    log(command('error', `The repository variable ${VARIABLE} is "${shown(enforcement.value)}"; set it to true to enforce the approval of record, or delete it (${RUNBOOK}).`));
    options.summary(`## approval-of-record\n\nThe repository variable \`${VARIABLE}\` must be \`true\` or unset; it is neither, so this check fails.\n`);
    return 1;
  }
  let decision: Decision;
  try {
    decision = await read(options);
  } catch (error) {
    const why = error instanceof ApiError ? error.message : 'an unexpected error';
    if (enforcement.kind === 'enforced') {
      log(command('error', `approval-of-record could not read the pull request (${why}), so it fails.`));
      options.summary(`## approval-of-record\n\nIt could not read the pull request (${why}), so it fails.\n`);
      return 1;
    }
    log(command('warning', `approval-of-record could not read the pull request (${why}); the review requirement is not yet enforced, so it passes.`));
    options.summary(`## approval-of-record\n\nIt could not read the pull request (${why}). The review requirement is not yet enforced, so it passes.\n`);
    return 0;
  }
  for (const finding of decision.findings) log(finding);
  const verdict = !decision.required ? 'needs no review of record' : decision.satisfied ? 'has its approval of record' : 'does not have its approval of record';
  const lines = ['## approval-of-record', '', ...decision.findings.map((f) => `- ${f}`), ''];
  if (enforcement.kind === 'not enforced') {
    const why =
      `The review requirement is not yet enforced: the repository variable ${VARIABLE} is ${enforcement.value === '' ? 'unset' : 'false'}. ` +
      "Until the build agent has its own GitHub identity, the founder's account authors every pull request and cannot review its own, so the requirement would block every approval. " +
      `Set ${VARIABLE} to true once the agent works under its own login (${RUNBOOK}).`;
    log(command('notice', `${why} If it were enforced, this pull request ${verdict}.`));
    options.summary([...lines, `**Not yet enforced.** ${why} If it were enforced, this pull request ${verdict}.`, ''].join('\n'));
    return 0;
  }
  if (decision.satisfied) {
    log(`This pull request ${verdict}.`);
    options.summary([...lines, `**Passes:** this pull request ${verdict}.`, ''].join('\n'));
    return 0;
  }
  log(command('error', `This pull request ${verdict}.`));
  options.summary([...lines, `**Fails:** this pull request ${verdict}.`, ''].join('\n'));
  return 1;
}

async function read(options: RunOptions): Promise<Decision> {
  const { env } = options;
  const token = env.GITHUB_TOKEN ?? '';
  const repository = env.GITHUB_REPOSITORY ?? '';
  const api = (env.GITHUB_API_URL ?? 'https://api.github.com').replace(/\/$/, '');
  if (token === '') throw new ApiError('GITHUB_TOKEN is not set');
  if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(repository)) throw new ApiError('GITHUB_REPOSITORY is not owner/name');
  let number: unknown;
  let eventHead: unknown;
  try {
    const event = JSON.parse(options.readFile(env.GITHUB_EVENT_PATH ?? '')) as { pull_request?: { number?: unknown; head?: { sha?: unknown } } };
    number = event.pull_request?.number;
    eventHead = event.pull_request?.head?.sha;
  } catch {
    throw new ApiError('the event payload could not be read');
  }
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0) throw new ApiError('the event is not about a pull request');
  // The head commit the event names: this run's check belongs to it, so it is the commit judged, whatever the
  // pull request's head is by the time the API answers.
  if (typeof eventHead !== 'string' || !/^[0-9a-f]{40}$/.test(eventHead)) throw new ApiError('the event names no head commit');
  const headSha = eventHead;

  const get = async (path: string, accept = 'application/vnd.github+json'): Promise<ApiResponse> => {
    const response = await options.fetch(`${api}/repos/${repository}${path}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'approval-of-record' },
    });
    return response;
  };
  const json = async (path: string, what: string): Promise<unknown> => {
    const response = await get(path);
    if (response.status !== 200) throw new ApiError(`${what}: HTTP ${String(response.status)}`);
    return JSON.parse(await response.text()) as unknown;
  };
  /** A file's text at a ref, or null when the ref has no such file. */
  const file = async (path: string, ref: string): Promise<string | null> => {
    const response = await get(`/contents/${path}?ref=${encodeURIComponent(ref)}`, 'application/vnd.github.raw+json');
    if (response.status === 404) return null;
    if (response.status !== 200) throw new ApiError(`${path} at ${short(ref)}: HTTP ${String(response.status)}`);
    return response.text();
  };

  /** A branch's tip, resolved as a branch (refs/heads/), so a tag of the same name cannot stand in for it. */
  const tip = async (branch: string): Promise<string | null> => {
    const response = await get(`/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`);
    if (response.status === 404) return null;
    if (response.status !== 200) throw new ApiError(`the branch ${shown(branch)}: HTTP ${String(response.status)}`);
    const sha = (JSON.parse(await response.text()) as { object?: { sha?: unknown } }).object?.sha;
    if (typeof sha !== 'string' || !/^[0-9a-f]{40}$/.test(sha)) throw new ApiError(`the branch ${shown(branch)}: unexpected shape`);
    return sha;
  };

  const pull = (await json(`/pulls/${String(number)}`, `pull request #${String(number)}`)) as {
    user?: { login?: unknown } | null;
    base?: { ref?: unknown };
  };
  const author = pull.user?.login;
  const baseRef = pull.base?.ref;
  if (typeof author !== 'string' || typeof baseRef !== 'string' || baseRef === '') {
    throw new ApiError(`pull request #${String(number)}: unexpected shape`);
  }
  const reviews: Review[] = [];
  for (let page = 1; page <= 50; page++) {
    const batch = await json(`/pulls/${String(number)}/reviews?per_page=100&page=${String(page)}`, 'its reviews');
    if (!Array.isArray(batch)) throw new ApiError('its reviews: unexpected shape');
    reviews.push(...(batch as Review[]));
    if (batch.length < 100) break;
  }
  const baseSha = await tip(baseRef);
  if (baseSha === null) throw new ApiError(`the base branch ${shown(baseRef)} does not exist`);
  const base: Side = { document: await file(DOCUMENT, baseSha), approvers: await file(APPROVERS, baseSha) };
  const head: Side = { document: await file(DOCUMENT, headSha), approvers: await file(APPROVERS, headSha) };
  let buildBranchApprovers: string | null | undefined;
  if (base.approvers === null && baseRef !== BUILD_BRANCH) {
    const buildSha = await tip(BUILD_BRANCH);
    buildBranchApprovers = buildSha === null ? null : await file(APPROVERS, buildSha);
  }
  return decide({ author, headSha, base, head, reviews, ...(buildBranchApprovers === undefined ? {} : { buildBranchApprovers }) });
}

if (import.meta.main) {
  const summaryFile = process.env.GITHUB_STEP_SUMMARY;
  process.exitCode = await run({
    env: process.env,
    fetch: (url, init) => fetch(url, { headers: init.headers }),
    readFile: (file) => readFileSync(file, 'utf8'),
    log: (line) => {
      process.stdout.write(`${line}\n`);
    },
    summary: (markdown) => {
      if (summaryFile !== undefined && summaryFile !== '') appendFileSync(summaryFile, markdown);
    },
  });
}
