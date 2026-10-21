export const meta = {
  name: 'co-001-governance-round-2',
  description: 'Governance round 2: merge the CI pin, pin approval-of-record, the founder rulings of 2026-10-20 (one required approval, audit #20 b-f); two reviews, fix, fresh-clone verify',
  phases: [
    { title: 'Merge' },
    { title: 'Build' },
    { title: 'Review' },
    { title: 'Fix' },
    { title: 'Verify' },
  ],
}

const WT = '/home/user/governance'
const BR = 'co-001/governance'
const SCRATCH = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/gov-r2'
const REPORT = '/tmp/claude-0/-home-user-PhysicalTherapy/32de87b7-30ec-5c00-8f16-6ecf80418ed3/scratchpad/best-option-audit/combined-report.md'
const ACTIONLINT_NOTE = `actionlint: download the 1.7.7 release binary into ${SCRATCH}/actionlint and check its sha256 against the release's checksums file if one is not there.`
const ENV = `Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. gitleaks is /tmp/claude-0/gitleaks/gitleaks. ${ACTIONLINT_NOTE} Postgres 18 is postgres://postgres:test@localhost:5433/postgres and Postgres 16 is on 5432 (never stop either server). Name scratch databases tp_gov2_<role>_<n> and drop them. e2e: E2E_PORT=4601 E2E_DATABASE=tp_gov2_e2e. Logs go in ${SCRATCH}/. The machine has 4 CPUs shared with other runs: a timing-bound test that fails only under load and passes alone is not this PR's failure, but say so with the evidence.`
const ATTR = `Every commit message ends with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_014R3xHbQ6gkeorGunia7amR`

const CONTEXT = `Context. Repository puretidewater/physicaltherapy (PaidWhole). Worktree ${WT}, branch ${BR}, head 19a47f6 (pushed), built on claude/build-platform at fe470c1. It is the governance pull request (ADR 0063): CODEOWNERS, approvers.json format 2, the approval-of-record workflow and tool, the domain-model --summary-since generator, the protective hooks in .claude/settings.json (protect-content, fixture-guard, protect-approval, protect-github, typecheck.sh), two CLAUDE.md lines and the founder's click-by-click guide docs/runbooks/github-governance.md. Two reviews, a fix round and a fresh-clone verification already passed at 19a47f6. The pull request is not open yet.

Since then:
1. PR #24 merged into claude/build-platform as 262d37d. It pins every workflow job to 'runs-on: ubuntu-24.04' and adds a test in tools/test/workflows.test.ts that refuses any '-latest' or unversioned runner. Merging it here conflicts in 4 hunks in ci.yml and supply-chain.yml, where this branch added timeout-minutes with comments. Keep #24's pin comment lines and 'runs-on: ubuntu-24.04' first, then this branch's timeout comment and timeout-minutes, and drop the old runs-on line. This branch's .github/workflows/approval-of-record.yml (line 27) still says ubuntu-latest and must be pinned to ubuntu-24.04.
2. On 2026-10-20 the founder adopted the combined best-option audit in full (${REPORT}; item #20 "Make your approval, the CI gate and the repository's settings real" is the one for this PR). The founder's rulings that bind this PR:
   - Every pull request into main and claude/build-platform requires one approval, by the founder, before it merges, once the build agent has its own GitHub identity (runbook step 3). This replaces D4 (a) "Claude merges when CI is green" from that point. Until the identity exists, D4 (a) continues. ADR 0063 set zero required approvals outside the code-owned paths; it now sets one on every PR. The build still performs the merge after the founder's approval and green checks (this also settles the PRD section 17 'merge by hand' wording: the founder approves by hand, the build merges).
   - The running costs are accepted, including a GitHub organization on the Team plan. The repository moves to a company GitHub organization on the Team plan and becomes private before PR 7's red team.
   - Audit #20's other parts, all in this PR: (b) rewrite change-management rule 1 and the SOC 2 controls map (packages/compliance and the policy docs; find them) so they describe exactly what the ruleset enforces, add a quarterly independent review of a sample of merged PRs as a recorded control, and add .github/pull_request_template.md that carries the reviewer agents' findings and the freeze-exception answer; (c) write down the launch switch: the build branch merges into main through one reviewed PR, Dependabot's target-branch lines are removed, main stays the protected default; (d) the visibility and organization move as founder steps in the runbook, with what it changes for the build (the repository's owner in URLs, the Claude GitHub App installation on the new organization, the session's repository access) and before PR 7; (e) a committed pre-push hook that runs the fixture check and gitleaks over the commits being pushed, because today a real file copied into the tree reaches GitHub before CI looks; (f) a security.txt (RFC 9116, served at /.well-known/security.txt) and a public vulnerability-disclosure page served by the web app.
3. Open items the verification left that this round settles in the docs: the ADR quotes 8 to 11 s for typecheck.sh in apps/web, but an edit of a widely imported module such as apps/web/src/lib/server/config.ts takes 27 to 33 s (state both); the ADR leaves open how publish-content pushes to main once main's ruleset refuses direct pushes (decide it, best option, and write it down); the runbook says main gets a ruleset with no required checks until launch and that approval-of-record becomes a fifth required check on claude/build-platform (make the ADR and runbook agree with each other and with the one-approval ruling); Dependabot reads .github/dependabot.yml from main, so the grouping and limits on this branch take effect only when main's copy changes. The founder's standing rule is that no pull request goes into main until launch, except one the founder rules on; do not open one: write in the runbook exactly what main's copy needs and that it waits for the founder's ruling.

Rules that bind every agent: the four rules and the "Never" list in CLAUDE.md; no schema change, no migration, nothing under packages/pricing, packages/ledger or content/, and docs/product/domain-model.md stays byte-identical; never write or change the approval line; never open a pull request or push to main; no PHI anywhere; the founder is "the founder" or "they"; write plainly, the way the repo's docs already read. Main is the launch branch.`

const RESULT = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    head: { type: 'string' },
    checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
    open_items: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'head', 'checks'],
}
const FINDINGS = {
  type: 'object',
  properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      title: { type: 'string' }, file: { type: 'string' }, line: { type: 'number' },
      severity: { type: 'string', enum: ['blocking', 'should_fix', 'nit'] },
      failure_path: { type: 'string' }, fix: { type: 'string' } }, required: ['title', 'file', 'severity', 'failure_path', 'fix'] } },
    verdict: { type: 'string' },
  },
  required: ['findings', 'verdict'],
}

phase('Merge')
const merge = await agent(`${CONTEXT}

${ENV}

Your task: bring claude/build-platform (262d37d) into ${BR} with a merge commit (never rebase, amend or force-push), resolve the 4 hunks as described, pin approval-of-record.yml to ubuntu-24.04, and make tools/test/workflows.test.ts (both #24's tests and this branch's) pass. Run: pnpm install --frozen-lockfile; pnpm typecheck; vitest for tools/test/workflows.test.ts and tools/test/codeowners.test.ts with ACTIONLINT set to the binary; actionlint over every workflow; gitleaks over origin/claude/build-platform..HEAD. Commit the merge with a message in the repository's style ("Merge claude/build-platform into co-001/governance: ..."), then the pin as its own commit if it is not part of the resolution. ${ATTR} Push with git push -u origin ${BR}, retrying after 2, 4, 8 and 16 s on network failure. Do nothing else in this task. Return the summary, the pushed head and every check.`, { label: 'merge build branch, pin approval-of-record', phase: 'Merge', schema: RESULT })
if (!merge) throw new Error('merge failed')

phase('Build')
const SHARED = `You and one other builder share ${WT} (head ${merge.head}). Stage only your own paths and commit with 'git commit -m ... -- <paths>'; retry if the index is locked; pull nothing; push with the 2/4/8/16 s retry after each commit (if the push is rejected because the other builder pushed first, 'git pull --no-rebase origin ${BR}' and push again; never force). Repo-wide typecheck or lint failures in the other builder's files are reported, not fixed. Read ${REPORT}, item #20, and ADR 0063 before writing.`
const builds = await parallel([
  () => agent(`${CONTEXT}

${ENV}

${SHARED}

Your part: the rulings in the documents and policy code.
- ADR 0063: the one required approval on every PR once the agent has its identity (and why: separation of duties for SOC 2 change management and acquirer diligence), the build merging after the founder's approval, the launch switch, the publish-content path to main, the organization move on the Team plan before PR 7, the typecheck timings stated both ways, and what changed since the first version (a dated amendment section, the way the repo's ADRs record amendments). Keep it consistent with ADR 0059 and the reconciliation documents; amend reconciliation-001's D4 entry if it records D4 (a) as standing.
- docs/runbooks/github-governance.md: the click-by-click steps updated for a company organization on the Team plan (create it, transfer the repository, make it private, install the Claude GitHub App on the organization, what the build then needs from the founder to keep access), the ruleset requiring one approval and Code Owners review, the five required checks, and the Dependabot note for main. Keep it readable on a phone, one line per step on what it protects against.
- The change-management policy and the SOC 2 controls map (find where they live: packages/compliance, docs/policies or similar): rule 1 rewritten to describe exactly what the ruleset enforces, and a quarterly independent review of a sample of merged PRs as a recorded control with its evidence. Update any test that pins the controls map.
- .github/pull_request_template.md: sections for what changes, why, what it does not change, checks, the reviewer agents' findings and how each was resolved, the freeze-exception answer, the domain-model SHA-256 when a migration changes it, and the founder's approval. Make sure the PR template is not picked up by any lint or copy rule in a way that fails CI.
- CLAUDE.md: one line for the approval ruling if the existing approval-of-record line does not already say it; keep CLAUDE.md short.
Run the checks your files touch (pnpm typecheck, pnpm lint with NODE_OPTIONS=--max-old-space-size=8192, pnpm lint:copy, the compliance package's tests, tools/test). Return the summary, your last pushed head and every check.`, { label: 'build: ADR, runbook, policy, PR template', phase: 'Build', schema: RESULT }),
  () => agent(`${CONTEXT}

${ENV}

${SHARED}

Your part: the pre-push hook and the security disclosure surfaces.
- A committed pre-push hook (for example .githooks/pre-push, activated by a script the repo's install already runs, if the repo has one; otherwise documented in the README and the runbook). For the commits being pushed (the ranges git passes on stdin, including a new branch and a deleted ref), it runs the fixture check the repo already has (pnpm check:fixtures or the guard it uses, limited to what is fast) and gitleaks over exactly those commits with the repo's .gitleaks.toml. It fails closed when gitleaks is missing, with a message that says how to install it or how to point GITLEAKS at a binary. It must work for a push of a commit-tree object to a salvage branch (git push origin <sha>:refs/heads/salvage/x) and from a linked worktree. Test it in tools/hooks or tools/test in the repo's idiom, with a synthetic leak and a synthetic non-SYNTHSENDER X12 header, both refused, and a clean push allowed. Say in the README how a contributor turns it on.
- security.txt per RFC 9116 at /.well-known/security.txt from apps/web (a route handler or static file, whichever the app's structure and its security headers allow), with Contact, Expires (computed or set so a test fails before it lapses), Policy pointing at the disclosure page, Preferred-Languages and Canonical. The contact address and the public origin come from the app's configuration, not hard-coded; if the repo has a placeholder mechanism (tools/test/placeholders.test.ts), use it so a release cannot ship a placeholder.
- A public vulnerability-disclosure page in apps/web (no sign-in, no PHI, no forms that collect anything): how to report, what to include, what not to do (no access to other people's data, no denial of service, no social engineering), the response the reporter can expect, and a good-faith research statement marked in the code and in the legal-surfaces list as needing counsel's review before launch (the audit's legal-surfaces PR). Follow the app's existing public pages for layout and copy rules (BRAND.md, the copy lint). Add an e2e check that both are served and that security.txt parses.
Run: pnpm typecheck, pnpm lint (8 GiB heap), pnpm lint:copy, pnpm lint:logs, the hook tests, the web unit tests you touch, and the e2e spec you add (E2E_PORT=4601 E2E_DATABASE=tp_gov2_e2e). Return the summary, your last pushed head and every check.`, { label: 'build: pre-push hook, security.txt, disclosure page', phase: 'Build', schema: RESULT }),
])
const built = builds.filter(Boolean)
if (built.length < 2) throw new Error('a builder failed')
const head = built.map(b => b.head).join(', ')

phase('Review')
const reviewBrief = `${CONTEXT}

${ENV}

The round-2 builders pushed to ${BR}; heads reported: ${head}. Builders' summaries (claims, not proof):
${built.map(b => b.summary).join('\n\n---\n\n')}

You are an independent adversarial reviewer. Review 'git diff ${'19a47f6'}...origin/${BR}' minus the build-branch merge's own content (compare against what 262d37d brought). Do not edit, stage or commit in ${WT}; clone into ${SCRATCH}/<your-label> if you need to run anything. Report each finding with file, line, a concrete failure path and a fix. If nothing is wrong, say so with what you checked.`
const reviews = await parallel([
  () => agent(`${reviewBrief}

Your angle: the rulings and the documents. Does every document (ADR 0063, the runbook, CLAUDE.md, reconciliation-001, the change-management policy, the controls map, the PR template) say the same thing about the one required approval, who merges, the launch switch, publish-content's path to main, the organization move, the required checks and Dependabot? Does any document claim a control the ruleset or CI does not enforce? Does the runbook work click by click on a phone, in the order a person can do it, with no step that locks the build out before its replacement access exists? Is anything here a decision the founder did not make? Is the merge resolution correct (every job pinned, every timeout kept)?`, { label: 'review: rulings and documents', phase: 'Review', schema: FINDINGS }),
  () => agent(`${reviewBrief}

Your angle: security and CI. Can the pre-push hook be bypassed by accident (a worktree, a detached head, a new branch, a tag, a deletion, a push of many branches at once, a missing gitleaks, a path with spaces) or does it block a legitimate push? Does it scan exactly the pushed commits and not miss the first push of a new branch? Is security.txt valid per RFC 9116 (field names, Expires format, Canonical matching where it is served, line endings) and served with the right content type and security headers through the app's middleware? Can the disclosure page or security.txt leak configuration or break the app's CSP? Is any placeholder able to ship? Would any of this turn a CI job red (lint:copy on the new page, the e2e, coverage thresholds, the workflows test, the codeowners test)?`, { label: 'review: hook, security.txt, CI', phase: 'Review', schema: FINDINGS }),
])
const all = reviews.filter(Boolean).flatMap(r => r.findings)
log(`${all.length} review findings`)

phase('Fix')
const fix = await agent(`${CONTEXT}

${ENV}

You are the fix round for ${BR} in ${WT}. Two independent reviewers reported the findings below. Each is a claim to verify, not an order: reproduce it or trace a realistic path; fix the real ones in proportion; for each one you do not fix, say why. Anything that would need a decision the founder has not made goes in open_items, worded as a question with the recommended answer first.

Findings:
${JSON.stringify(all, null, 2)}

Verdicts: ${reviews.filter(Boolean).map(r => r.verdict).join(' | ')}

Then rerun: pnpm typecheck; pnpm lint (8 GiB heap); pnpm lint:copy; pnpm lint:logs; pnpm test (CI=true; if a timing-bound test unrelated to this PR fails under load, rerun that file alone and report both); the hook tests; tools/test with ACTIONLINT set; actionlint; gitleaks over origin/claude/build-platform..HEAD; the new e2e spec. Commit in the repository's style with the attribution lines (${ATTR}) and push with the 2/4/8/16 s retry. Return the summary, the head, every check and the open items.`, { label: 'fix review findings', phase: 'Fix', schema: RESULT })
if (!fix) throw new Error('fix failed')

phase('Verify')
const verify = await agent(`${CONTEXT}

${ENV}

You are the fresh-clone verification for ${BR}. Expected head: ${fix.head}. Do not use or edit ${WT}.
1. Clone the repository from the URL 'git -C ${WT} remote get-url origin' prints into ${SCRATCH}/verify (remove any old copy), check out origin/${BR} and confirm HEAD is ${fix.head}. Confirm the merge base with origin/claude/build-platform is 262d37d.
2. Confirm the scope: no migration, schema, pricing, ledger, content/ or tools/verify-content change; docs/product/domain-model.md byte-identical to the base; the approval line untouched; every commit carries the two trailers.
3. Run from the clean clone: pnpm install --frozen-lockfile; pnpm check:fixtures; pnpm typecheck; pnpm lint (8 GiB heap); pnpm lint:logs; pnpm lint:copy; gitleaks over origin/claude/build-platform..HEAD; pnpm verify-content; tools/check-releases-immutable.sh origin/claude/build-platform; pnpm test (CI=true, coverage); pnpm test:golden; pnpm test:oracle; on a fresh PG18 database pnpm db:migrate, pnpm db:domain-model --check --strict --require-approval and pnpm test:db; pnpm test:e2e (E2E_PORT=4611 E2E_DATABASE=tp_gov2_e2e_verify); pnpm build; actionlint over every workflow; the workflows and codeowners tests with ACTIONLINT set.
4. Prove the new pieces: install the pre-push hook in the clone and push to a local bare remote (a) a clean commit (allowed), (b) a commit with a synthetic leak (refused), (c) a commit with a non-SYNTHSENDER X12 header (refused), (d) a new branch whose first commit leaks (refused), (e) with gitleaks absent from PATH and GITLEAKS unset (refused with the install message). Fetch /.well-known/security.txt and the disclosure page from the built app and check the RFC 9116 fields.
5. Read the runbook as the founder would, on a phone: list any step that is out of order, ambiguous, or would lock the build out.
6. Drop every scratch database you made and delete the clone. Commit nothing.
For a timing-bound test that fails only under load, rerun that file alone and report both results. Return the summary, the head you verified, every check and the open items.`, { label: 'fresh-clone verification', phase: 'Verify', schema: RESULT })

return { merge, builds, reviews, fix, verify }
