export const meta = {
  name: 'lane-b-ci-mutation-trigger-integrate',
  description: '#96 P4: close the fix round (G2 round-3 run, G3 wording), then one base merge, the full local suite once with every mutation shard, the description drafted, the up-to-date check and one push',
  phases: [
    { title: 'Close', detail: 'G2 verification rerun (read only) beside the G3 wording fixes; one repair if G2 finds a real issue' },
    { title: 'Integrate', detail: 'base merge, #86 value rule on the merged tree, replay figures, full suite once, description draft, up-to-date check, one push' },
  ],
}
const PROG = '/home/user/ops/approval-summaries/lane-b-ci-mutation-trigger-wip/progress'
const SUM = '/home/user/ops/approval-summaries'
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/scratchpad/p4'
const LOGS = `${SP}/logs/integrate`
const WT = '/home/user/ci-mutation-trigger'
const WIP = 'co-001/wip-ci-mutation-trigger'
const FIX = '/tmp/claude-0/-home-user-PhysicalTherapy/84980be8-4825-5e0c-971b-13455480b76c/tasks/wjqwxcuzr.output'
const SESSION = 'https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3'
const SAVE = (f, w) => `Save as you go: keep ${PROG}/${f} up to date (${w}). If it exists when you start, an earlier run was interrupted: read it, check git status and log, and continue.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. You work for the acting Lane B session S3 that owns PR #96, CI follow-up P4, ci-mutation-trigger (draft; PR branch co-001/ci-mutation-trigger at 50029e64, untouched; the fix round's work is on the WIP ref ${WIP} at f23850fa, which descends from 50029e64). It narrows when the required mutation check runs Stryker (ADR 0066 Part 7; notices N43–N56; CI-27–CI-29). The fix round (workflow result in ${FIX}: result.report and result.checks) fixed every confirmed review finding; the reviews are ${SUM}/lane-b-ci-mutation-trigger-review-{ci-tooling-security,payment-engine}.md, the critic ${PROG}/critic.md, the fix progress ${PROG}/fix-*.md. Status: ${SUM}/lane-b-ci-deps-status.md. Design: /home/user/ops/designs/lane-b-ci/follow-up-p4-mutation-trigger.md.
The base claude/build-platform has moved since #96's base 43565235: among others #86 (ci-images-digest, merged 24531dc2) added tools/test/workflows.test.ts's value rule (T3–T6: every expression reaching a process from a closed list, run: producer fingerprints, file-command writes closed), and #104, #108, #109 merged after. #84 (packet-day-counts, which splits the packets shards into packets-roles and packets-words) has NOT merged: PE-S1 stays pending and #84 resolves it at its own base merge (the PR merged second resolves). GitHub enforces the ruleset's up-to-date rule: the pushed head must contain the base's tip.
Rules: every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH. Heavy commands (pnpm install, typecheck, lint, vitest, builds, test:db, e2e, stryker, synth) only under flock /tmp/laneb-heavy.lock; other sessions share it, so run batches under one lock hold where you can, and long ones with run_in_background. PostgreSQL 18 on port 5433 (if down: bash /tmp/setup-container.sh co-001/ci-mutation-trigger:${WT}). Synthetic data only; no PHI; no model name or identifier in any file or commit. Shorten hashes in approval-summaries files to 8 hex and an ellipsis. Never force, never --no-verify, never amend/rebase a pushed commit, never a .gitleaksignore entry; never write through the GitHub connector; never comment, review, approve, edit a PR body, mark ready or merge. Generated files only by their generators (pnpm install --frozen-lockfile; pnpm exec tsx tools/screening-capacity/watched.ts --write; pnpm synth --all). No migration. Logs under ${LOGS}/ (mkdir -p).`
const COMMIT_TAIL = `Commit messages in the repository's style, one concern per commit, each ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: ${SESSION}`
const VCHK = { type: 'object', properties: { resolved: { type: 'boolean' }, loosened: { type: 'boolean' },
  issues: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, where: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should', 'nit'] } }, required: ['what', 'where', 'evidence', 'fix', 'severity'] } },
  checked: { type: 'string' } }, required: ['resolved', 'loosened', 'issues', 'checked'] }

phase('Close')
const [g2, words] = await parallel([
  () => agent(`${COMMON}

YOUR TASK: the G2 round-3 verification the last run could not finish (the heavy lock was held by another session). Its record: ${PROG}/fix-check-G2-3.md; its scripts under ${SP}/g2adv3/ (batch1.sh, e2e.sh, scan.py, mut.py). Scope G2: S1 (control-character paths fail closed and print escaped; ** globs across line breaks), C-G1 (.gitattributes global), S2 and C-G2 (every named mutant killed). Fresh clone, read only: git clone --filter=blob:none https://github.com/PureTideWater/PhysicalTherapy.git /home/user/fx-p4-G2-4; fetch ${WIP}; check out f23850fa (must equal origin/${WIP}); install under the lock. Then under ONE lock hold run batch1.sh (the head suite tools/stryker + tools/test, 50029e64's tests at the head, the affected() dump at the head and at 50029e64), e2e.sh with scan.py over its outputs, and mut.py (S2 M01–M05 and M08–M16; C-G2 C01, C02, C04–C07, C13; own X1–X13 and Y1–Y10). Adapt the scripts' paths if they name the old clone. Also check the two open leads: whether any test covers runGit's success path where git's stderr goes through printable (try the mutant), and whether the module's CLI entry line is exercised (try the mutant). Prove each with output. Classify issues blocking / should / nit. Remove the clone. ${SAVE('fix-check-G2-4.md', 'each batch and result')}`, { label: 'check:G2:4', phase: 'Close', schema: VCHK }),
  () => agent(`${COMMON}

YOUR TASK: in ${WT} (on ${WIP}; git fetch and confirm HEAD equals origin/${WIP} at f23850fa), fix the wording the last check round left, each as its own commit:
1. (G3, should) ADR 0066 Part 7 "Measured", the bullet saying the figures predate the review's fixes (~line 1864, added in 2fefffd8): it says #46 "edits only the root .gitattributes", but #46 changed 377 files; reword to "#46, whose only global or money-path change is adding the root .gitattributes (linguist and eol attributes on packages/db/functions/*.sql), now runs every shard (N56), so its \\"none\\" becomes a full run." Check N56 and reconciliation-001 stay right.
2. (G3 nits) ci.md's sentence on error quoting ("So does every line of an error that holds one"): make it unambiguous and complete per what the code does; fix the ragged wraps ci.md got in repair 2 and in the runtime paragraph.
3. (whole nit) runtime.ts prints the --pnpm value and the user agent's pnpm through shown, which does not quote: print them JSON-quoted like affected.ts does, with a failing-first test.
Run flock /tmp/laneb-heavy.lock pnpm exec vitest run --project unit tools/stryker tools/test, pnpm typecheck and pnpm lint under one lock hold, then git push origin HEAD:refs/heads/${WIP} (fast-forward; the hook). Never push the PR branch; do not merge the base.
${COMMIT_TAIL}
${SAVE('fix-words.md', 'each fix, commit and check')}
Return the new head and per item what changed.`, { label: 'words', phase: 'Close' }),
])
if (!g2 || !words) throw new Error('a Close leg returned nothing; resume this run')
let repair = ''
const real = g2.issues.filter(x => x.severity !== 'nit')
if (!g2.resolved || g2.loosened || real.length || g2.issues.length) {
  repair = await agent(`${COMMON}

The G2 round-3 verification found: ${JSON.stringify(g2, null, 2)}
The wording fixes since: ${words}
In ${WT} at the WIP head (git fetch; confirm equal to origin/${WIP}), fix each real issue and each correct nit (a test that kills a surviving mutant, or the code), one commit each with red/green evidence; for anything you judge not real, say why with evidence. Never loosen a rule. Re-run tools/stryker + tools/test, typecheck and lint under one lock hold; push the WIP ref (fast-forward). Do not merge the base.
${COMMIT_TAIL}
${SAVE('fix-repair-3.md', 'each issue and what was done')}
Return the new head and per issue what changed or why not.`, { label: 'repair:3', phase: 'Close' })
  if (!repair || !String(repair).trim()) throw new Error('repair 3 returned nothing; resume this run')
}

phase('Integrate')
const integ = await agent(`${COMMON}

YOUR TASK: integrate #96 and push it ONCE. The Close stage: G2 verification ${JSON.stringify(g2)}; wording ${words}; repair ${repair || 'none needed'}.
${SAVE('integrate.md', 'each step, every check with its numbers, the pushed sha and the time')}
1. In ${WT}: git fetch origin ${WIP} claude/build-platform co-001/ci-mutation-trigger; confirm HEAD = origin/${WIP} and that it descends from origin/co-001/ci-mutation-trigger (50029e64).
2. Base merge once: git merge --no-ff origin/claude/build-platform -m "Merge claude/build-platform <short> (<PRs from git log --merges --first-parent>) into co-001/ci-mutation-trigger". Keep both sides of every conflict (rule 6): ADR 0066 (Part 7 after Part 5 and #86's Part 3 N32 and #107's Part 2 text; notice numbers must stay unique: check N43–N56 against every notice the base now has and renumber #96's in a separate commit if they collide, noting the commit messages keep the old numbers), reconciliation-001, test-matrix and the synth matrix and registry, ci.md, tools/test/workflows.test.ts (#86's value rule beside #96's mutation describe). The merge commit only resolves. Then the generators under the lock and commit what they write.
3. On the merged tree run the whole tools/test/workflows.test.ts: #86's T3/T5/T6 now hold #96's mutation.yml (the new runtime step in the changes job and in the gate job, the canary line, the --pnpm "$(pnpm --version)" and --commit "$GITHUB_SHA" arguments). Fix every failure in #96's own commit: a run: fingerprint #96's change legitimately moves is re-read (bound stated) and updated; a value #96 passes to a process must be on #86's closed list with its bound; the mutation describe's canary-command row is #96's own. Never loosen #86's rule. Then vitest --project unit tools/stryker tools/test.
4. Recompute the description's replay figures (acceptance 1: every pull request into the build branch replayed from its fork point to its head through this branch's affected() and through the base's; the 58 the re-read held, full runs 22 -> 15, narrowed / widened, runner-minutes saved, and every PR since #95 to the latest merged) with the final classifier, as the whole-diff check asked, since the review fixes (typescript, .gitattributes, control characters) widen some. Record the table; say which PRs changed and why.
5. The full local suite once, on the merged tree, under the lock, logs in ${LOGS}/suite/: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm verify-content; pnpm test (unit with coverage; files, passed, failed, skipped; name each local skip); pnpm test:golden; pnpm test:oracle; pnpm test:db in its four shards one after another on fresh PG18 databases on port 5433; pnpm build, the stamp, then E2E_PREBUILT=1 pnpm test:e2e --workers=2; tools/stryker/affected.ts against the merged base (it selects every shard: mutation.yml and tools/stryker changed), then every selected shard one at a time as the workflow runs them (pnpm -s exec tsx tools/stryker/stryker.ts run per the shard config, or the shards runner the workflow uses), then the gate with the pins and the commit; pnpm synth --all leaves status clean; pnpm actions:check --offline; BASE=origin/claude/build-platform pnpm actions:check; BASE=origin/claude/build-platform pnpm toolchain:check; actionlint -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown' .github/workflows/*.yml; pnpm -s exec tsx tools/stryker/runtime.ts as the workflow calls it. Fix anything red #96 causes with a small commit and its test; anything red on the base too is recorded with the base's evidence.
6. Draft the PR description from .github/pull_request_template.md (at the base) to ${SP}/pr-body-new.md: start from the live body (pull_request_read get #96) and update it: the reviews (two adversarial: CI tooling and security; payment engine; three skeptics each; the critic) with every finding and its resolution and commits; the fix round's checks and repairs; the open nits; the C-G3 corrected wording; the runtime check in both jobs with --pnpm and --commit; .gitattributes global; Stryker's core the root's direct link; N51–N56 (or their final numbers); PE-S1 pending for #84 with what #84 must do; the base merge and its conflicts; the recomputed replay table; the full suite with every number and every shard's result; what CI must prove on this head. Keep it under 60,000 characters, no model identifier, no PHI, ending with "🤖 Generated with [Claude Code](https://claude.com/claude-code)", a blank line, then ${SESSION}. Check its length.
7. Right before the push: git fetch origin claude/build-platform; if it is no longer an ancestor of HEAD, merge it again (same form, keep both sides), run the generators, the fast checks (typecheck, lint, lint:copy, lint:logs, check:fixtures, synth clean) and the whole workflows.test.ts plus vitest --project unit tools/stryker tools/test, and record it as a second base merge. Then git push origin HEAD:co-001/ci-mutation-trigger (fast-forward from 50029e64; the hook; never force) and push the WIP ref to the same sha. Record the sha and time and the new ci, mutation and screening-capacity run ids once they appear (a background until-loop of up to 5 minutes, actions_list).
${COMMIT_TAIL}
Return: the pushed sha and time, the base merge(s) and conflicts, step 3's fixes, the replay table, every suite number and shard result, the description file path and length, run ids, anything open.`, { label: 'integrate', phase: 'Integrate' })
if (!integ || !String(integ).trim()) throw new Error('integrator returned nothing')
return { g2, words, repair, integ }
