export const meta = {
  name: 'lane-b-contract-phi-check-integrate',
  description: 'Integrate #120 (contract PHI check, ADR 0070 Part 3): settle the parts, docs, the full local suite once, commits (no push)',
  phases: [
    { title: 'Settle', detail: 'code open items between the parts; docs (parallel)' },
    { title: 'Suite', detail: 'synth, eval, full local suite once, commits' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6db0c9fb-15c4-5a12-8595-d500f968b368/scratchpad/phi'
const WT = '/home/user/contract-phi-check'
const DOC = '/home/user/ops/designs/lane-b-model-eval-gate.md'
const NOTES = '/home/user/ops/approval-summaries/lane-b-model-eval-gate-phi-build.md'
const STATUS = '/home/user/ops/approval-summaries/lane-b-model-eval-gate-status.md'
const BASE = 'e908c214'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RULES = `You work on Lane B's PR for #120 (the contract PHI check before the model, ADR 0070 Part 3, test-matrix MOD-12) on branch co-001/contract-phi-check, worktree ${WT}. Its HEAD is a merge commit (862c9dc8) of claude/build-platform at ${BASE} into the builders' work (d7447adb: the screen 5196f92a, the call paths fc74ee16, the upload panel d7447adb). Work ONLY in ${WT} (and ${SP} for notes). Read: the design ${DOC} "Session rulings" (1, 3, 4, 8), section 5 (PR C) whole, Appendix A.3, and the review dispositions M7, M8, M9, M12, m3, m9, m14, m15; the builders' notes ${NOTES} (three parts: screen, paths, upload; each lists its adaptations and open items); the handoff section of ${STATUS}. The base moved 171 commits since the builders (e.g. #48 ci-deps, #50, #51, #52, #56 and others): build on today's code, keep its behaviour.
Rules:
- export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH:/opt/node22/bin in every shell command.
- Every heavy command (install, build, typecheck, lint, any test, pnpm synth, eval) under flock /tmp/laneb-heavy.lock, one at a time; another agent shares this 4-CPU machine. Database tests: DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (migrate first if empty: pnpm db:migrate with that URL), e.g. pnpm exec vitest run --project db <files>.
- CLAUDE.md binds: synthetic identifiers only; never log or put in an error message a member ID, claim number, PCN, name or document text; no migration (if one seems needed, stop and say so); no model name or identifier in any file; never touch PR #42's non-shared files (LANES.md "Not while #42 is open", /home/user/ops/LANES.md; and apps/web/e2e/{env,mail-cutoff.spec,mail-notices.spec,mail,prepare,screening.spec,screening}.ts); only the shared docs test-matrix.md, reconciliation-001.md, ADRs, synth matrix.ts and registry.ts may change, watched-paths.txt only by regeneration (pnpm exec tsx tools/screening-capacity/watched.ts --write), pnpm-lock.yaml only by pnpm install.
- Match the surrounding code's style and its long precise doc comments; documents in the repository's plain, exact voice (.claude/rules/brand.md for any wording a person sees).
- Improve as you go inside this PR's files; name improvements outside them in your result.
- Long commands: run_in_background and wait for the notification; the Bash tool refuses a long foreground sleep.`

phase('Settle')
const [code, docs] = await parallel([
  () => agent(`${RULES}

PART settle-code (you edit code and tests; you do NOT commit, stash, reset or checkout; the docs agent edits docs/ and the synth matrix/registry in parallel, leave those to it). Settle every open item and proposal the three builders' notes list that is inside this PR's files, taking the recommended option (security: the safer one), e.g.: apps/web contract-proposals.ts should call recordContractScreenRequested / screenAuditRequestId from @tp/model-gateway so the two request IDs cannot drift; export what that needs; decide the permitted run's refused_rose question (keep fail-closed, recommended, and say where it is documented); check every caller of proposeContractTerms / ContractPagesInput compiles and that apps/web/e2e (models.spec.ts and the specs that upload through the contracts or reconciliation panels, NOT #42's e2e files) choose a kind where the uploader now starts with none, and that the e2e practice's records do not make the e2e contracts refuse (read the e2e seed: would any e2e contract page text contain a stored identifier at or above its floor? if so, say so and fix the fixture or the seed, synthetic only). Read the whole branch diff against ${BASE} (git diff ${BASE}...HEAD minus the merge, i.e. git diff ${BASE} HEAD) adversarially for bugs, PHI leaks (logs, errors, URLs), skip paths around the screen, and tenant isolation, and fix what you find with a test that fails without the fix. Run the narrow tests of everything you touch (model-gateway unit and db, apps/web models and uploads tests, apps/worker permitted tests) and pnpm typecheck.
${SAVE('settle-code.md', 'items settled, files changed, tests run and results')}
Write ${SP}/settle-code.md (each item and how it was settled, files changed, tests and results, anything for the docs agent such as adaptations to record in ADR 0070 Part 3) and return it.`, { label: 'settle-code', phase: 'Settle' }),
  () => agent(`${RULES}

PART docs (you edit documents and the synth matrix/registry only; you do NOT commit, stash, reset or checkout; another agent edits code in parallel). Write:
1. ADR 0070 Part 3 (docs/adr/0070-*.md; read Parts 1-2 first and keep their form): the decision; where the check runs and why no caller can skip it (the issued-check registry, the required input, the practice match, the gateway order: serving, prepare, the variant check, then the screen, before the idempotency key, budget and call); the algorithm (stored-side floors and rules, the tokenizer, whole-token match); the bound SCREEN_MAX_IDENTIFIERS = 50,000 failing closed (rulings 3 and 4, with who made them and when: the build session under the co-founder's standing ruling of 2026-10-26 ~00:20 UTC); read as the service screen actor with the person's contract_screen_requested event joined by request ID; what is recorded and logged (practice_id and the code only: m15's departure); the refusal wording (m14); every gap it gives up; the false-refusal measurement by collision class (take the numbers from the builders' notes and the golden test; if a number is missing, run the measurement the screen builder describes, under the lock); every adaptation of the design the builders' notes list; F3 and F4 as Lane A's migrations (proposed, not built); the test rows.
2. The ADR 0054 amendment for the screen step (as ADR amendments are written in this repository).
3. PRD 14 and PRD 16 lines the design names (section 5.1 and N13; docs/product/PRD.md).
4. reconciliation-001 item 16 (PR 16's red team gains the screen's attacks: a misfiled EOB, a spaced or hyphenated identifier, a forged or foreign check, the bound).
5. docs/product/test-matrix.md row MOD-12, word for word as packages/synth/src/cases/matrix.ts holds it (the screen builder's notes quote it), and update the note under the table that reserved MOD-12; synth registry.ts consistent; run pnpm --filter @tp/synth test (or the synth fixtures test) to prove the matrix and the doc agree.
6. Any runbook that describes the permitted run's refusals or contract proposals (grep docs/runbooks), if it needs a line.
Rule 6 applies: these are shared documents; keep every other lane's text intact.
${SAVE('docs.md', 'documents written and what is left')}
Write ${SP}/docs.md (files, what each says, anything the code agent must confirm) and return it.`, { label: 'docs', phase: 'Settle' }),
])

phase('Suite')
const suite = await agent(`${RULES}

PART suite (you DO commit; never push). Read ${SP}/settle-code.md and ${SP}/docs.md (the two agents before you) and settle anything left between them (e.g. an adaptation the code agent made that the ADR must state). Then:
1. pnpm synth --all twice (the second writes nothing); the eval gate (pnpm --filter @tp/model-gateway eval, or the package's eval script) passes on the committed baseline (re-record through the CLI only if the set or report changed, never by hand; then /root/.cache/paidwhole/gitleaks/8.24.3/gitleaks dir packages/model-gateway/eval --no-banner); regenerate watched-paths.txt (keep only if it changed).
2. The full local suite once, each step under the lock, in this order: pnpm typecheck; pnpm lint; pnpm lint:logs; pnpm lint:copy; pnpm test; pnpm test:golden; pnpm test:oracle; pnpm test:db in 4 shards one after another as .github/workflows/ci.yml runs them (each on its own fresh migrated database at localhost:5433); pnpm build; tools/stryker/affected.ts --event pull_request --base ${BASE} and run any affected mutation shard, then the gate as ci.yml does; pnpm check:fixtures; pnpm verify-content; tools/engine-freeze/check.ts against ${BASE}; pnpm actions:check only if a workflow, manifest or lockfile changed. E2E: Playwright's pinned Chromium is not installed (the proxy refuses storage.googleapis.com); first try bash /tmp/setup-container.sh co-001/contract-phi-check:/home/user/contract-phi-check once (under the lock) in case the host is now allowed; if the browser is still missing, do NOT substitute another browser and do NOT skip a test: record "e2e: CI is the record (browser unavailable locally)" and move on. If the browser is there: commit first, stamp BUILD_COMMIT as ci.yml does, then E2E_PREBUILT=1 pnpm test:e2e --workers=2 with DATABASE_URL set. Take test counts from the runners' printed totals. A failure that also fails on a clean ${BASE} checkout (git worktree add under ${SP}) is not this PR's: record it with evidence. Fix every one that is this PR's, with a test, and rerun its step.
3. git diff --stat ${BASE} HEAD (with your work): only this PR's files; none of #42's non-shared files; no migration; no model identifier in added lines (grep the added lines for model-name words and Bedrock model ID patterns); no PHI-shaped data (all identifiers synthetic).
4. Commit in logical commits on top of the merge (e.g. "the parts settled" for the code, "docs: ADR 0070 Part 3 ..." for the docs, generated files with their cause), each message plain, ending after a blank line with exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_017SNqG4nQbbt6xqEG1ZDKe6
Then run the pre-push checks without pushing: /root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git --log-opts="${BASE}..HEAD" --no-banner in ${WT} (and the fixture check the .githooks/pre-push hook runs, if it can be run standalone). Fix any finding by amending only these unpushed commits (never 862c9dc8 or earlier).
${SAVE('suite.md', 'each step and its result with the runner totals')}
Write ${SP}/suite.md: each step's command and totals as printed, failures not this PR's with evidence, adaptations from the design, every piece of wording a person sees that this PR adds (exact strings, file:line), the commit list (hash and subject), the diff stat, open items. Return it.`, { label: 'suite', phase: 'Suite' })
return { code, docs, suite }
