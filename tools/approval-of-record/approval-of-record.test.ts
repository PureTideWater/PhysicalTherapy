import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { approvalLineOf as dbApprovalLineOf } from '../../packages/db/src/domain-model/approval';
import { APPROVERS_FILE, readApproverRecords } from '../../packages/db/src/domain-model/sources';
import { repositoryRoot } from '../content-files';
import {
  APPROVERS,
  DOCUMENT,
  type DecisionInput,
  type Fetch,
  type Review,
  approvalLineOf,
  decide,
  parseApprovers,
  readEnforcement,
  reviewerState,
  run,
  shown,
  signedName,
} from './approval-of-record';

/**
 * The approval of record (docs/adr/0063), as a unit: the decision on recorded GitHub API shapes, and the run
 * against a fake API serving them. Logins and names are synthetic but the committed approver list's own.
 */
const HEAD = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const OLDER = '0f1e2d3c4b5a69788796a5b4c3d2e1f001234567';
const SHA = 'e'.repeat(64);

const list = (...approvers: readonly (readonly [string, string])[]): string =>
  `${JSON.stringify({ format: 'tp-domain-model-approvers/2', note: 'synthetic', approvers: approvers.map(([name, github]) => ({ name, github })) }, null, 2)}\n`;
const APPROVERS_BASE = list(['A. Signer', 'a-signer'], ['B. Second', 'b-second']);
const doc = (line: string): string => `# Domain model\n\n> Generated.\n\n- body\n\n## Approval\n\n${line}\n`;
const AWAITING = doc(`Approved by: ________  Date: ________  Document SHA-256: \`${SHA}\``);
const SIGNED = (name: string) => doc(`Approved by: ${name}  Date: 2026-10-20  Document SHA-256: \`${SHA}\``);

/** A review as GET /repos/{owner}/{repo}/pulls/{number}/reviews returns it (recorded shape, synthetic values). */
function review(login: string | null, state: string, commit: string | null = HEAD, id = 1): Review {
  const recorded = {
    id,
    node_id: `PRR_kwDOsynthetic${String(id)}`,
    user: login === null ? null : { login, id: 1000 + id, node_id: `U_synthetic${String(id)}`, type: 'User', site_admin: false },
    body: '',
    state,
    html_url: `https://github.com/example/repo/pull/7#pullrequestreview-${String(id)}`,
    pull_request_url: 'https://api.github.com/repos/example/repo/pulls/7',
    author_association: 'COLLABORATOR',
    submitted_at: `2026-10-20T15:0${String(id % 10)}:00Z`,
    commit_id: commit,
  };
  return recorded;
}

const input = (over: Partial<DecisionInput> = {}): DecisionInput => ({
  author: 'build-agent',
  headSha: HEAD,
  base: { document: AWAITING, approvers: APPROVERS_BASE },
  head: { document: SIGNED('A. Signer'), approvers: APPROVERS_BASE },
  reviews: [],
  ...over,
});

describe('the readers, held to packages/db', () => {
  it('approvalLineOf reads the same line as the generator’s on the committed document and on edge shapes', () => {
    const committed = readFileSync(path.join(repositoryRoot, DOCUMENT), 'utf8');
    for (const text of [committed, AWAITING, `${AWAITING}\n\n\n`, '# x\n\nno approval\n', 'Approved by: X\n\nlater line\n', '', 'Approved by: only']) {
      expect(approvalLineOf(text), JSON.stringify(text.slice(-60))).toBe(dbApprovalLineOf(text));
    }
    expect(approvalLineOf(null)).toBeNull();
  });

  it('parseApprovers reads the committed list as readApproverRecords does, and says why another cannot count', () => {
    expect(parseApprovers(readFileSync(APPROVERS_FILE, 'utf8'))).toEqual({ approvers: readApproverRecords(), problem: null });
    expect(readApproverRecords()).toContainEqual({ name: 'Tyler Williams', github: 'PureTideWater' });
    expect(parseApprovers(JSON.stringify({ format: 'tp-domain-model-approvers/1', note: 'x', approvers: ['A. Signer'] })).problem).toMatch(/not in the format tp-domain-model-approvers\/2/);
    expect(parseApprovers('{').problem).toMatch(/is not JSON$/);
    expect(parseApprovers(null).problem).toMatch(/has no packages\/db\/domain-model\/approvers\.json$/);
    expect(parseApprovers(list()).problem).toMatch(/lists no approver$/);
    expect(parseApprovers(list(['A. Signer', '-bad'])).problem).toMatch(/not a name and a GitHub login$/);
    expect(parseApprovers(list([' A. Signer', 'a'])).problem).toMatch(/not a name and a GitHub login$/);
  });

  it('signedName reads the name a line signs, and null for an awaiting line or another shape', () => {
    expect(signedName(approvalLineOf(SIGNED('A. Signer')))).toBe('A. Signer');
    expect(signedName(approvalLineOf(AWAITING))).toBeNull();
    expect(signedName('Approved by: A. Signer')).toBeNull();
    expect(signedName(null)).toBeNull();
  });

  it('shown keeps one log line one line', () => {
    expect(shown('a\nb\r::error::c')).toBe('a b ::error::c');
    expect(shown('x'.repeat(200))).toBe(`${'x'.repeat(120)}…`);
  });
});

describe('readEnforcement', () => {
  it('enforces only on true; unset, empty and false do not; anything else is refused', () => {
    expect(readEnforcement('true')).toEqual({ kind: 'enforced' });
    expect(readEnforcement(' true ')).toEqual({ kind: 'enforced' });
    expect(readEnforcement(undefined)).toEqual({ kind: 'not enforced', value: '' });
    expect(readEnforcement('')).toEqual({ kind: 'not enforced', value: '' });
    expect(readEnforcement('false')).toEqual({ kind: 'not enforced', value: 'false' });
    for (const value of ['TRUE', 'yes', '1', 'on']) expect(readEnforcement(value), value).toEqual({ kind: 'invalid', value });
  });
});

describe('decide', () => {
  it('needs no review when neither the approval line nor the list changes', () => {
    const same = decide(input({ head: { document: AWAITING.replace('- body', '- another body'), approvers: APPROVERS_BASE } }));
    expect(same).toEqual({ required: false, satisfied: true, findings: [expect.stringContaining('needs no review of record')] });
  });

  it('takes an APPROVED review of the latest commit from the login of the person the line names', () => {
    const approved = decide(input({ reviews: [review('a-signer', 'APPROVED')] }));
    expect(approved.required).toBe(true);
    expect(approved.satisfied).toBe(true);
    expect(approved.findings).toEqual([
      `This pull request changes the approval line of ${DOCUMENT}: it makes it an approval by A. Signer.`,
      'It needs an APPROVED review of its latest commit, a1b2c3d, from @a-signer (A. Signer).',
      '@a-signer approved commit a1b2c3d: this is the approval of record.',
    ]);
    // GitHub compares logins in any case.
    expect(decide(input({ reviews: [review('A-Signer', 'APPROVED')] })).satisfied).toBe(true);
  });

  it('refuses an approval of an earlier commit, another approver’s approval, a comment, a later change request and a dismissal', () => {
    const older = decide(input({ reviews: [review('a-signer', 'APPROVED', OLDER)] }));
    expect(older.satisfied).toBe(false);
    expect(older.findings).toContain('@a-signer approved commit 0f1e2d3, not the latest commit, a1b2c3d.');
    // The line names A. Signer: B. Second's approval is not A. Signer's.
    expect(decide(input({ reviews: [review('b-second', 'APPROVED')] })).satisfied).toBe(false);
    expect(decide(input({ reviews: [review('a-signer', 'COMMENTED')] })).findings).toContain('@a-signer has not reviewed it.');
    const changes = decide(input({ reviews: [review('a-signer', 'APPROVED', HEAD, 1), review('a-signer', 'CHANGES_REQUESTED', HEAD, 2)] }));
    expect(changes.satisfied).toBe(false);
    expect(changes.findings).toContain('@a-signer requested changes.');
    expect(decide(input({ reviews: [review('a-signer', 'DISMISSED')] })).findings).toContain("@a-signer's review was dismissed.");
    // The latest decisive review counts: a change request then an approval approves; a later comment changes nothing.
    expect(decide(input({ reviews: [review('a-signer', 'CHANGES_REQUESTED', OLDER, 1), review('a-signer', 'APPROVED', HEAD, 2), review('a-signer', 'COMMENTED', HEAD, 3)] })).satisfied).toBe(true);
    // A review by an account since deleted names no one.
    expect(decide(input({ reviews: [review(null, 'APPROVED')] })).satisfied).toBe(false);
  });

  it('refuses the author’s own approval: the reason the requirement waits for the build agent’s own identity', () => {
    const own = decide(input({ author: 'a-signer', reviews: [review('a-signer', 'APPROVED')] }));
    expect(own.satisfied).toBe(false);
    expect(own.findings).toContain('Its review must come from @a-signer, who authored it; GitHub does not let an author approve their own pull request.');
  });

  it('reads the approvers from the base branch: a name the head adds, or a login it changes, does not count', () => {
    const added = list(['A. Signer', 'a-signer'], ['B. Second', 'b-second'], ['C. Newcomer', 'c-newcomer']);
    const newcomer = decide(input({ head: { document: SIGNED('C. Newcomer'), approvers: added }, reviews: [review('c-newcomer', 'APPROVED')] }));
    expect(newcomer.satisfied).toBe(false);
    expect(newcomer.findings).toEqual([
      `This pull request changes the approval line of ${DOCUMENT}: it makes it an approval by C. Newcomer.`,
      `This pull request changes ${APPROVERS}, the list of who may approve.`,
      "The line names C. Newcomer, who is not on the base branch's approver list, so no review can make it the approval of record.",
    ]);
    const remapped = list(['A. Signer', 'someone-else'], ['B. Second', 'b-second']);
    expect(decide(input({ head: { document: SIGNED('A. Signer'), approvers: remapped }, reviews: [review('someone-else', 'APPROVED')] })).satisfied).toBe(false);
    expect(decide(input({ head: { document: SIGNED('A. Signer'), approvers: remapped }, reviews: [review('a-signer', 'APPROVED')] })).satisfied).toBe(true);
  });

  it('takes any listed approver but the author for a change to the list alone, or to a line that names no one', () => {
    const listOnly = input({ base: { document: AWAITING, approvers: APPROVERS_BASE }, head: { document: AWAITING, approvers: list(['A. Signer', 'a-signer']) } });
    expect(decide({ ...listOnly, reviews: [review('b-second', 'APPROVED')] }).satisfied).toBe(true);
    expect(decide({ ...listOnly, author: 'b-second', reviews: [review('b-second', 'APPROVED')] }).satisfied).toBe(false);
    const reset = decide(input({ base: { document: SIGNED('A. Signer'), approvers: APPROVERS_BASE }, head: { document: AWAITING, approvers: APPROVERS_BASE }, reviews: [review('b-second', 'APPROVED')] }));
    expect(reset.findings[0]).toBe(`This pull request changes the approval line of ${DOCUMENT}: it leaves it awaiting approval.`);
    expect(reset.satisfied).toBe(true);
    const removed = decide(input({ base: { document: SIGNED('A. Signer'), approvers: APPROVERS_BASE }, head: { document: null, approvers: APPROVERS_BASE } }));
    expect(removed.findings[0]).toBe(`This pull request changes the approval line of ${DOCUMENT}: it removes it.`);
    expect(removed.satisfied).toBe(false);
  });

  it('counts no review while the base branch’s list names no login (its first format)', () => {
    const first = JSON.stringify({ format: 'tp-domain-model-approvers/1', note: 'x', approvers: ['A. Signer'] });
    const decision = decide(input({ base: { document: AWAITING, approvers: first }, head: { document: SIGNED('A. Signer'), approvers: APPROVERS_BASE }, reviews: [review('a-signer', 'APPROVED')] }));
    expect(decision.satisfied).toBe(false);
    expect(decision.findings.at(-1)).toMatch(/^No review can count: the base branch's packages\/db\/domain-model\/approvers\.json is not in the format/);
  });

  it('on the committed list today: the founder authors every pull request, so the founder cannot be its review of record', () => {
    const committed = readFileSync(APPROVERS_FILE, 'utf8');
    const today = decide(input({ author: 'PureTideWater', base: { document: AWAITING, approvers: committed }, head: { document: SIGNED('Tyler Williams'), approvers: committed } }));
    expect(today.satisfied).toBe(false);
    expect(today.findings).toContain('Its review must come from @PureTideWater, who authored it; GitHub does not let an author approve their own pull request.');
    const after = decide(input({ author: 'build-agent', base: { document: AWAITING, approvers: committed }, head: { document: SIGNED('Tyler Williams'), approvers: committed }, reviews: [review('PureTideWater', 'APPROVED')] }));
    expect(after.satisfied).toBe(true);
  });

  it('reviewerState is the latest approval, change request or dismissal', () => {
    const reviews = [review('a-signer', 'APPROVED', OLDER, 1), review('b-second', 'APPROVED', HEAD, 2), review('a-signer', 'COMMENTED', HEAD, 3)];
    expect(reviewerState(reviews, 'a-signer')?.commit_id).toBe(OLDER);
    expect(reviewerState(reviews, 'nobody')).toBeNull();
  });
});

describe('run, against recorded API responses', () => {
  const TOKEN = 'synthetic-workflow-token-never-printed-0001';
  const API = 'https://api.github.com';
  const REPO = 'example/repo';
  /** GET /repos/{owner}/{repo}/pulls/{number} (recorded shape, synthetic values). */
  const pull = {
    url: `${API}/repos/${REPO}/pulls/7`,
    id: 7000,
    node_id: 'PR_kwDOsynthetic',
    number: 7,
    state: 'open',
    draft: false,
    title: 'Synthetic pull request',
    user: { login: 'build-agent', id: 2, node_id: 'U_agent', type: 'User', site_admin: false },
    head: { label: 'example:co-001/pr-07', ref: 'co-001/pr-07', sha: HEAD, user: { login: 'example' }, repo: { full_name: REPO } },
    base: { label: 'example:claude/build-platform', ref: 'claude/build-platform', sha: OLDER, user: { login: 'example' }, repo: { full_name: REPO } },
    author_association: 'COLLABORATOR',
  };

  interface Served {
    readonly status: number;
    readonly body: string;
  }

  /** A fake API: each URL its recorded response, every request kept. */
  function api(routes: Readonly<Record<string, Served>>): { readonly fetch: Fetch; readonly requests: { url: string; headers: Readonly<Record<string, string>> }[] } {
    const requests: { url: string; headers: Readonly<Record<string, string>> }[] = [];
    return {
      requests,
      fetch: (url, init) => {
        requests.push({ url, headers: init.headers });
        const served = routes[url] ?? { status: 404, body: '{"message":"Not Found"}' };
        return Promise.resolve({ status: served.status, text: () => Promise.resolve(served.body) });
      },
    };
  }

  const ok = (body: unknown): Served => ({ status: 200, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const content = (file: string, ref: string) => `${API}/repos/${REPO}/contents/${file}?ref=${encodeURIComponent(ref)}`;
  const routes = (reviews: readonly Review[], over: Record<string, Served> = {}): Record<string, Served> => ({
    [`${API}/repos/${REPO}/pulls/7`]: ok(pull),
    [`${API}/repos/${REPO}/pulls/7/reviews?per_page=100&page=1`]: ok(reviews),
    [content(DOCUMENT, 'claude/build-platform')]: ok(AWAITING),
    [content(APPROVERS, 'claude/build-platform')]: ok(APPROVERS_BASE),
    [content(DOCUMENT, HEAD)]: ok(SIGNED('A. Signer')),
    [content(APPROVERS, HEAD)]: ok(APPROVERS_BASE),
    ...over,
  });

  async function runWith(variable: string | undefined, served: Record<string, Served>, event: unknown = { action: 'submitted', pull_request: { number: 7 } }) {
    const fake = api(served);
    const log: string[] = [];
    const summary: string[] = [];
    const code = await run({
      env: { GITHUB_TOKEN: TOKEN, GITHUB_REPOSITORY: REPO, GITHUB_API_URL: API, GITHUB_EVENT_PATH: '/event.json', APPROVAL_REVIEW_REQUIRED: variable },
      fetch: fake.fetch,
      readFile: (file) => {
        expect(file).toBe('/event.json');
        return JSON.stringify(event);
      },
      log: (line) => log.push(line),
      summary: (markdown) => summary.push(markdown),
    });
    const printed = [...log, ...summary].join('\n');
    // The token goes in the Authorization header of each request and nowhere else.
    expect(printed).not.toContain(TOKEN);
    expect(printed).not.toContain(TOKEN.slice(4, 20));
    for (const request of fake.requests) {
      expect(request.url.startsWith(`${API}/repos/${REPO}/`)).toBe(true);
      expect(request.url).not.toContain(TOKEN);
      expect(request.headers.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(Object.entries(request.headers).filter(([, value]) => value.includes(TOKEN)).map(([key]) => key)).toEqual(['Authorization']);
    }
    return { code, log, summary: summary.join(''), requests: fake.requests };
  }

  it('enforced: passes with the approval of record and fails without it', async () => {
    const pass = await runWith('true', routes([review('a-signer', 'APPROVED')]));
    expect(pass.code).toBe(0);
    expect(pass.log.at(-1)).toBe('This pull request has its approval of record.');
    expect(pass.summary).toContain('**Passes:**');
    const fail = await runWith('true', routes([review('a-signer', 'APPROVED', OLDER)]));
    expect(fail.code).toBe(1);
    expect(fail.log.at(-1)).toBe('::error::This pull request does not have its approval of record.');
    expect(fail.summary).toContain('- @a-signer approved commit 0f1e2d3, not the latest commit, a1b2c3d.');
  });

  it('not enforced: passes, and says it is not yet enforced, why, and what it would decide', async () => {
    for (const variable of [undefined, '', 'false']) {
      const result = await runWith(variable, routes([]));
      expect(result.code, String(variable)).toBe(0);
      const notice = result.log.at(-1) ?? '';
      expect(notice.startsWith('::notice::The review requirement is not yet enforced: the repository variable APPROVAL_REVIEW_REQUIRED is ')).toBe(true);
      expect(notice).toContain("the founder's account authors every pull request and cannot review its own");
      expect(notice).toContain('docs/runbooks/github-governance.md, step 5');
      expect(notice).toContain('If it were enforced, this pull request does not have its approval of record.');
      expect(result.summary).toContain('**Not yet enforced.**');
    }
  });

  it('reads the base branch by name and the head by its commit, every page of reviews, and a missing file as none', async () => {
    const hundred = Array.from({ length: 100 }, (_, i) => review('b-second', 'COMMENTED', HEAD, i + 10));
    const served = routes([], {
      [`${API}/repos/${REPO}/pulls/7/reviews?per_page=100&page=1`]: ok(hundred),
      [`${API}/repos/${REPO}/pulls/7/reviews?per_page=100&page=2`]: ok([review('a-signer', 'APPROVED')]),
    });
    const result = await runWith('true', served);
    expect(result.code).toBe(0);
    expect(result.requests.map((r) => r.url)).toEqual([
      `${API}/repos/${REPO}/pulls/7`,
      `${API}/repos/${REPO}/pulls/7/reviews?per_page=100&page=1`,
      `${API}/repos/${REPO}/pulls/7/reviews?per_page=100&page=2`,
      content(DOCUMENT, 'claude/build-platform'),
      content(APPROVERS, 'claude/build-platform'),
      content(DOCUMENT, HEAD),
      content(APPROVERS, HEAD),
    ]);
    expect(result.requests[3]?.headers.Accept).toBe('application/vnd.github.raw+json');
    // A base branch without the document (404) compares as none: the head's new approval line is a change.
    const missing = await runWith('true', routes([review('a-signer', 'APPROVED')], { [content(DOCUMENT, 'claude/build-platform')]: { status: 404, body: '{"message":"Not Found"}' } }));
    expect(missing.code).toBe(0);
  });

  it('fails when enforced, and passes with a warning when not, on any error reading the API', async () => {
    const broken = routes([], { [`${API}/repos/${REPO}/pulls/7`]: { status: 500, body: '{"message":"Server Error"}' } });
    const enforced = await runWith('true', broken);
    expect(enforced.code).toBe(1);
    expect(enforced.log).toEqual(['::error::approval-of-record could not read the pull request (pull request #7: HTTP 500), so it fails.']);
    const relaxed = await runWith(undefined, broken);
    expect(relaxed.code).toBe(0);
    expect(relaxed.log[0]).toMatch(/^::warning::approval-of-record could not read the pull request \(pull request #7: HTTP 500\)/);
    const forbidden = await runWith('true', routes([], { [content(APPROVERS, HEAD)]: { status: 403, body: '{"message":"Forbidden"}' } }));
    expect(forbidden.code).toBe(1);
    const noEvent = await runWith('true', routes([]), { action: 'opened' });
    expect(noEvent.log[0]).toContain('the event is not about a pull request');
  });

  it('fails on a variable that is neither true nor unset, before any request', async () => {
    const result = await runWith('yes', routes([review('a-signer', 'APPROVED')]));
    expect(result.code).toBe(1);
    expect(result.requests).toEqual([]);
    expect(result.log[0]).toBe('::error::The repository variable APPROVAL_REVIEW_REQUIRED is "yes"; set it to true to enforce the approval of record, or delete it (docs/runbooks/github-governance.md, step 5).');
  });
});
