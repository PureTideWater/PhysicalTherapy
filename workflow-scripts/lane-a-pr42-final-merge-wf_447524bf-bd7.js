export const meta = {
  name: 'pr42-final-merge',
  description: 'PR 6b-4 (#42) after the founder approved: merge the latest base, the checks the delta needs, one push; fresh-clone verification reading CI; summary refreshed',
  phases: [
    { title: 'Merge', detail: 'fast-forward to the founder commit, merge 88708069 or later, generators, checks the delta needs, one push' },
    { title: 'Verify', detail: 'independent fresh-clone verification + CI on the head; description summary refreshed' },
  ],
}
const WT = '/home/user/pr6b4'
const BR = 'co-001/pr-06b-mail-streams'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/b44a103e-64fa-5094-8b17-09d1b9f5409a/scratchpad'
const OPS = '/home/user/ops'
const HASH = 'b23fed0e…2518' // archived copy: shortened for gitleaks
const SESSION = 'https://claude.ai/code/session_01FcouKMmYaqDNXbqJyagW8u'
const ATTR = `End every commit message with these two lines, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it exists when you start, an earlier run was interrupted: read it and continue from where it stopped.`
const CTX = `Repository PureTideWater/PhysicalTherapy. You work for the session acting as Lane A on PR 6b-4: draft PR #42 into claude/build-platform, branch ${BR}, worktree ${WT}. Its head on origin is 9426a8d1: the founder's (Tyler Williams) commit of the approval line on docs/product/domain-model.md line 7334 ("Approved by: Tyler Williams  Date: 2026-11-01  Document SHA-256: \`${HASH}\`"), on top of 6c28d6a2 (verified on 2026-11-01: full local suite green, CI green except the then-missing approval line, fresh-clone verification pass; records ${SP}/progress/pr42h-*.md).
NEVER edit, regenerate or touch docs/product/domain-model.md, packages/db/domain-model/approvers.json, packages/db/functions or any migration. A base merge without a migration leaves the document and its hash unchanged; if anything would change the document or its hash, STOP and report: the approval would be void.
Base delta since 43565235 (6c28d6a2's base): claude/build-platform took #83, #92 (UX PR 6: sign-in steps), #93 (ux-home-figures) and #90 (deps-anthropic-sdk-1: packages/model-gateway/package.json and pnpm-lock.yaml); now at 88708069 or later.
Pacing (the co-founder, 2026-11-02 02:10 UTC; the account's 7-day limit is at its warning level): spend nothing that does not change the outcome. CI runs the full suite on the pushed head; locally run what the merge delta needs, decided from the file list, and say why each heavy check was or was not run.
Environment: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command. PostgreSQL 18 on 5433 (postgres:test; DATABASE_URL=postgres://postgres:test@localhost:5433/postgres); databases tp_pr6b4i_<role>_<n>, dropped when done. Heavy commands one at a time under flock /tmp/laneb-heavy.lock. Never a foreground sleep; wait on background commands with a polling loop, and never return while a command you started still runs. If PostgreSQL is down: bash /tmp/setup-container.sh ${BR}:${WT}.
Rules: CLAUDE.md; LANES.md rule 6 (generated files by their generators; shared documents keep both sides). Never skip or loosen a test; never force-push or --no-verify; never write files through the GitHub connector; no model name or identifier in files, commits or PR text (the attribution trailer below is the sessions' required form); never approve, request changes or merge.`
const CHECK = { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, counts: { type: 'string' }, note: { type: 'string' } }, required: ['command', 'passed'] }

phase('Merge')
const m = await agent(`${CTX}

1. In ${WT}: git fetch origin ${BR} claude/build-platform; the worktree must be clean at 6c28d6a2; git merge --ff-only origin/${BR} (must land on 9426a8d1). Confirm git diff 6c28d6a2 9426a8d1 is the approval line alone.
2. Merge origin/claude/build-platform with a merge commit in 6c28d6a2's message style ("Merge claude/build-platform (<short>, #83, #92, #93, #90) into PR 6b-4: …", what joins, how each file both sides changed was merged). A migration or a change to docs/product/domain-model.md in the delta: STOP and report.
3. Generators: under the lock, pnpm install --frozen-lockfile (the lockfile is the base's; it must not change); pnpm exec tsx tools/screening-capacity/watched.ts --write; pnpm -s synth --all; commit only what they write; nothing untracked under fixtures/.
4. Checks, decided from git diff --name-only 9426a8d1 HEAD (always): pnpm typecheck; NODE_OPTIONS=--max-old-space-size=6144 pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check (a manifest and the lockfile changed); CI=true pnpm test with the unit step's env (ENGINE_FREEZE_BASE = the new merge base, GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks; exactly 1 skip, rules content.test.ts:179); apps/web/src/app/tables.test.ts (AFTER_42 1/2/1 still holds; never loosen; if a count moved, find the cause); tools/stryker/affected.ts --event pull_request --base 9426a8d1 (run any shard it names + the gate); a fresh database: pnpm db:migrate, then pnpm db:domain-model --check --require-approval must exit 0 with SHA-256 ${HASH} (the founder's line now present). Then only if the delta needs it: test:db shards whose files the delta's code reaches; build + e2e if the merge combined files both sides changed under apps/web, or if any web file #42 changes is touched by the delta; the capacity smoke S1,S4 binding with a fresh --out only if screening-capacity.yml's watched-path matching hits on 9426a8d1..HEAD. Record each decision and why.
5. Push ONCE: git push origin ${BR} (never force, never --no-verify; a hook refusal: report and stop), then git push origin HEAD:refs/heads/co-001/wip-pr42-final (new name). git ls-remote to confirm.
${ATTR}
${SAVE('pr42i-merge.md', 'each step, decision, check with counts, the push')}
Return the pushed head, pushed, base sha, the --require-approval result, every check, decisions, notes.`, { label: 'merge base, checks, push', phase: 'Merge', schema: { type: 'object', properties: { head: { type: 'string' }, pushed: { type: 'boolean' }, base: { type: 'string' }, require_approval_ok: { type: 'boolean' }, sha256: { type: 'string' }, checks: { type: 'array', items: CHECK }, decisions: { type: 'string' }, notes: { type: 'string' } }, required: ['head', 'pushed', 'require_approval_ok', 'checks'] } })
if (!m || !m.pushed) { log('no push; stopping'); return { m } }
if (!m.require_approval_ok) { log('approval check not ok; stopping'); return { m } }
const H = m.head

phase('Verify')
const [verify, body] = await parallel([
  () => agent(`${CTX}

#42's new head is ${H} (the merge agent's report: ${JSON.stringify(m).slice(0, 5000)}). You are the fresh-clone verification, independent of it: trust nothing; check. Try to find a reason NOT to merge.
1. Fresh clone (git clone -q https://github.com/PureTideWater/PhysicalTherapy ${SP}/pr42i-verify; fetch ${BR} and claude/build-platform; detach at ${BR}'s head): HEAD is ${H}; origin/claude/build-platform is its ancestor; 9426a8d1 is an ancestor.
2. Since 9426a8d1: only the base merge plus generator outputs (for the merge, every file only the base changed equals the base blob; files both sides changed equal a clean git merge-file of the three sides). docs/product/domain-model.md, approvers.json, packages/db/functions and packages/db/migrations unchanged since 9426a8d1; the screening code, legal-surfaces and data-retention unchanged since be63bdc2. No model name, PHI or secret-like hex added by the new merge beyond the base's own.
3. On the clone under the lock: pnpm install --frozen-lockfile; pnpm typecheck; fresh database tp_pr6b4i_v_1: pnpm db:migrate, pnpm db:domain-model --check --require-approval must exit 0 naming SHA-256 ${HASH}; drop it.
4. CI on ${H}: wait until every check run finishes (background poll of gh api repos/PureTideWater/PhysicalTherapy/commits/${H}/check-runs --paginate, up to 90 minutes). EVERY job must be success (or skipped for notify): domain model, all green, mutation, screening-capacity gate, approval-of-record, images included. Any red: read its log to the first error (MCP get_job_logs) and report whether it is #42's.
${SAVE('pr42i-verify.md', 'each step and result, each CI job')}
Return verdict pass only when all holds; the CI jobs; problems.`, { label: 'verify: fresh clone + CI', phase: 'Verify', schema: { type: 'object', properties: { verdict: { type: 'string', enum: ['pass', 'fail'] }, ci: { type: 'array', items: { type: 'object', properties: { job: { type: 'string' }, conclusion: { type: 'string' } }, required: ['job', 'conclusion'] } }, problems: { type: 'array', items: { type: 'string' } }, notes: { type: 'string' } }, required: ['verdict', 'ci', 'problems'] } }),
  () => agent(`${CTX}

#42's new head is ${H}. Refresh the PR description: it opens with the domain-model summary (acting-Lane-A brief section 5), regenerated after a base change.
1. Wait until CI on ${H} has finished (background poll, up to 90 minutes).
2. In ${WT} (HEAD ${H}): git fetch origin claude/build-platform; pnpm -s db:domain-model --summary-since origin/claude/build-platform --function-diffs list (a database may be needed: use a fresh tp_pr6b4i_s_1 if so, dropped after).
3. Read the live body (gh api repos/PureTideWater/PhysicalTherapy/pulls/42 --jq .body; also ${SP}/pr42h/body.md). Replace ONLY: the summary block at the top with the new output, whole and unedited; the head and CI lines in the Checks section (head ${H}; the new base merge; CI's state on ${H} per job); the Domain model / founder's approval section's status (the founder committed the line on 2026-11-01 as 9426a8d1; --check --require-approval passes). Keep everything else byte for byte. Count with Python len(): under 65,536.
4. Send with the MCP update_pull_request (owner PureTideWater, repo PhysicalTherapy, pullNumber 42, body; keep draft true) and read back byte for byte (gh api …/pulls/42 --jq .body; length and SHA-256 equal). Save the text to ${SP}/pr42i/body.md.
${SAVE('pr42i-body.md', 'the summary, each replaced part, length, send, readback')}
Return updated, readback_identical, length, sha256.`, { label: 'describe: refresh summary + CI', phase: 'Verify', schema: { type: 'object', properties: { updated: { type: 'boolean' }, readback_identical: { type: 'boolean' }, length: { type: 'number' }, sha256: { type: 'string' }, notes: { type: 'string' } }, required: ['updated', 'readback_identical', 'length'] } }),
])
return { m, verify, body }