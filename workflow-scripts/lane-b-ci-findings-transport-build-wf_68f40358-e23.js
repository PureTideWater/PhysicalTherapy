export const meta = {
  name: 'lane-b-ci-findings-transport-build',
  description: 'ci-findings-transport build: re-read the design at #86 fix-round head, an adversarial check of the re-read, the builder (red first, then green, then documents), a whole-diff adversary with one repair loop',
  phases: [
    { title: 'Reread', detail: 'the design against d257fe6d, then an adversarial check' },
    { title: 'Build', detail: 'commit 1 red, commit 2 green, commit 3 documents; checks; WIP push' },
    { title: 'Adversary', detail: 'whole-diff adversary; repair loop up to 1' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5f876a7c-a55b-5a96-9dbf-94dcd8222a6b/scratchpad'
const OUT = SP + '/findings-transport-build'
const DESIGN = '/home/user/ops/designs/lane-b-ci/ci-findings-transport.md'
const WT = '/home/user/ci-findings-transport'
const SAVE = (file, what) => `Save as you go: keep ${OUT}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust it unless git and the files say otherwise, and continue from where it stopped.`
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy (public); CLAUDE.md is in your context. You work for the Lane B item session that owns ci-findings-transport (session_01FcouKQ3BjYKaME5uBLn8Lz). The folded design is ${DESIGN} (its review ${DESIGN.replace('.md', '-review.md')}, its local proof /home/user/ops/designs/lane-b-ci/ci-findings-transport/proof/). It was written against base 83d71fd6 plus #86's PR head 83167b8f. The build worktree is ${WT} on the local+origin branch co-001/wip-ci-findings-transport, cut at d257fe6d = #86's fix-round WIP (co-001/wip-ci-images-digest: base 43565235 merged in, then #86's D1-D10: T6 cites producers structurally with fingerprints instead of line numbers (8681adb9), mapping-key expressions refused (330deea0), a byte sum per environment string (c1e80912), the content calendar's over-limit value held to its exact sites (9ac28806), T5 (6adc518f), the $GITHUB_ENV map (a7ccead0), DOCKER_BUILD_RECORD_UPLOAD (19cc7bf5), the findings row says over 1 MB as UTF-16 (91910da1), ADR 0066 N32 and docs (d5f987a4, f89770ca, d257fe6d)). #86 has not merged and has not pushed its final R3; this branch becomes co-001/ci-findings-transport after #86 merges (the session merges the base in then). node_modules is installed in ${WT}; PostgreSQL is up.
Rulings: every choice its recommended option, security the safer (the co-founder, 2026-10-26); wording within .claude/rules/brand.md, reported (2026-10-25); no migration; no new ADR; CI-30/CI-31 NOT taken (the design §9); no other number. Never touch docs/product/domain-model.md, migrations, packages/pricing, packages/ledger, packages/db, apps/, content/.
Rules for you:
- Synthetic data only; no PHI; no model name or identifier in any file, commit or comment.
- Every shell command starts with: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH
- Heavy commands (install, typecheck, lint, tests, builds) only under: flock /tmp/laneb-heavy.lock <command>.
- Commits one concern each, every message ending with a blank line and then exactly:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01FcouKQ3BjYKaME5uBLn8Lz
  Commit subjects in the repository's style (git log at d257fe6d: "test: ...", "ci: ...", "docs: ..." with the reason in the sentence). Never amend, rebase, reset --hard, force or --no-verify. Generated files never hand-edited (fixtures/synthetic by pnpm synth --all).
- Long commands: run_in_background and wait, or a Monitor until-loop; no long foreground sleep.
- Improve as you go: an improvement inside this item's files goes in with its test and is named in your result; others as proposals.
- Change nothing under /home/user/ops except the files your task names.`

phase('Reread')
const reread = await agent(`${COMMON}

You RE-READ the design against the build head d257fe6d (read files from ${WT} or git show d257fe6d:<path>). The base files of this item (content-calendar.yml, tools/content-calendar/**, ADR 0071, docs/runbooks/content-updates.md) should be as at 83d71fd6: check with git diff --stat 83d71fd6 d257fe6d -- those paths. Then map every place the design cites tools/test/workflows.test.ts, ADR 0066, docs/runbooks/ci.md, reconciliation-001, test-matrix/matrix.ts/registry.ts at 83167b8f or 83d71fd6 to d257fe6d: T3's unboundedValueProblems (now returning sites), T6's new structural table (how a row names its producer, fingerprints, the over-limit content-calendar rows and their exact-site pinning from 9ac28806 and 91910da1, and how to remove them and the over field cleanly), the new per-env-string byte sum (c1e80912: does the new notify env and the handoff job pass it; what bound does it need for any new value such as RUNNER_TEMP paths or the artifact), the mapping-key rule, expectQuietNotify and release-capacity's use, notifyStep/runNotify, the CI-10 timeout table, the jobs list, T2's E2BIG test, ADR 0066 N32's sentence naming ci-findings-transport (it replaces the design's "Part 3 sentence :982-983" edit), and ci.md's E2BIG wording. Write a new section "## 16. Re-read at d257fe6d (2026-11-02)" at the end of the design in place (a builder-ready delta: per §5/§6/§8 item, what changes on this head, with file:line at d257fe6d and exact new text where text changed), and amend nothing else except to point from §11 to §16. Say whether anything in the choice (§4) changes (it should not unless the head forces it).
${SAVE('reread.md', 'each cited place mapped')}
Return a short summary of the deltas.`, { label: 'reread', phase: 'Reread' })

const GAPS = { type: 'object', properties: { gaps: { type: 'array', items: { type: 'object', properties: { what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['what', 'evidence', 'fix'] } } }, required: ['gaps'] }
const rereadCheck = await agent(`${COMMON}

You are the ADVERSARIAL CHECKER of section 16 ("Re-read at d257fe6d") of ${DESIGN}. Its author's summary: ${reread}
Assume it is wrong somewhere: verify every line number and quoted text yourself at d257fe6d; look for any test on d257fe6d that the design's changes would turn red and §16 does not mention (grep the whole tools/test/workflows.test.ts for content-calendar, findings, FINDINGS_B64, notify, handoff, actions: read, upload-artifact, and every table keyed by workflow or job); check that the per-env-string sum and the structural T6 rules admit the new steps; check T-E/T-P/T-H/T-N/T-K/T-O/T-R can still fail first on this head. Return only real gaps.`, { label: 'reread-check', phase: 'Reread', schema: GAPS })
let rereadFix = null
if (rereadCheck && rereadCheck.gaps && rereadCheck.gaps.length) {
  rereadFix = await agent(`${COMMON}\n\nYou maintain section 16 of ${DESIGN}. The checker found these gaps (JSON): ${JSON.stringify(rereadCheck.gaps)}\nVerify each at d257fe6d and fix every real one in §16 in place; add a short "Checker" list at the end of §16 with each gap's disposition. ${SAVE('reread-fix.md', 'each gap dispositioned')} Return a short summary.`, { label: 'reread-fix', phase: 'Reread' })
}

phase('Build')
const build = await agent(`${COMMON}

You are the BUILDER, in ${WT} on co-001/wip-ci-findings-transport (at d257fe6d). Build the design exactly: §5 (c1-c4), §6 (tests, failing first), §8 (documents), §9, §11 (builders' steps) as amended by §16 ("Re-read at d257fe6d", which governs where it differs). Re-read summary: ${reread}${rereadFix ? `\nRe-read fixes: ${rereadFix}` : ''}
Steps:
1. Commit 1 (red): §6's tests only. Run under the lock: pnpm exec vitest run --project unit tools/content-calendar tools/test/workflows.test.ts (find the project flag the repository uses). Save the log to ${OUT}/logs/red.log with the command and UTC time. Record each failing test and its reason: T-E's must be E2BIG on the 98,293-byte file; CI-10's timeout table's the missing handoff; every red must be red on behaviour (not a syntax or import error).
2. Commit 2 (green): c1 to c3 (handoff between check and notify). Same tests green (log ${OUT}/logs/green.log), then under the lock pnpm typecheck, pnpm lint, pnpm lint:logs, and actionlint over .github/workflows/*.yml with the flags #86 uses (see ci.yml or docs/runbooks/ci.md; at least -shellcheck= -pyflakes= -ignore 'label "ubuntu-26\\.04" is unknown').
3. Commit 3 (documents): §8 and §16's documents (ADR 0071 amendment with the <merge date, UTC> placeholder as the design says, ADR 0066 N32's sentence, ci.md, content-updates.md, reconciliation-001), matrix.ts with test-matrix.md (RCC-08's clause), then pnpm synth --all and commit fixtures/synthetic/RCC-08/expected.json in the same commit; git diff --stat fixtures/synthetic must show that file alone; any other drift is reported, not committed. Then pnpm test under the lock (record files, passed, failed, skipped).
4. BASE=origin/claude/build-platform pnpm actions:check and BASE=origin/claude/build-platform pnpm toolchain:check (networked; record the output; no new pin).
5. Run the design's local proof script against the built workflow's real notify and handoff run: blocks if it can take them (node /home/user/ops/designs/lane-b-ci/ci-findings-transport/proof/scripts/prove.mjs with a work dir in ${OUT}/proof, adapting it to read the built yml), and save its output to ${OUT}/proof/local-proof-built.txt.
6. Push the WIP ref: git push origin co-001/wip-ci-findings-transport (the hook runs; never --no-verify or force; a refused push: git reset --soft origin/co-001/wip-ci-findings-transport, remove the flagged text, commit again in the same split, push).
7. Write ${OUT}/build-summary.md: commits (sha, subject), the red/green tables, every check with numbers, the scope check (files changed vs d257fe6d; none outside the item's and the shared documents), deviations from the design and why, proposals.
${SAVE('build.md', 'each step, commits, logs, check results')}
Return the build summary's text.`, { label: 'builder', phase: 'Build' })

phase('Adversary')
const ADV = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['B', 'S', 'N'] }, what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'severity', 'what', 'evidence', 'fix'] } } }, required: ['findings'] }
const adv = await agent(`${COMMON}

You are the WHOLE-DIFF ADVERSARY of the build (git -C ${WT} diff d257fe6d..HEAD; the builder's report: ${build}). Read only; do not commit. Check against the design (§16 governs): does the workflow really do what §5 says on a GitHub-hosted runner (artifact name, retention, overwrite, if-no-files-found, the gh run download lines word for word in notify and handoff, the three tries, the size refusal, every failure into "check failing", permissions exactly as specified, no uses: in notify or handoff, no \${{ in run:, every value through env, the env byte sum); do the tests fail first for the right reason (check the red log); is anything in the design missing or anything extra; any security issue (token scope, artifact content, path traversal on extract, a pull request influencing notify); docs consistent with code. Run what you need under the lock. Return real findings only (B blocking, S should fix, N nit), each with evidence and a fix.`, { label: 'adversary', phase: 'Adversary', schema: ADV })
let repair = null
const real = (adv && adv.findings || []).filter(f => f.severity !== 'N' || true)
if (real.length) {
  repair = await agent(`${COMMON}\n\nYou are the builder, back in ${WT}. The whole-diff adversary found (JSON): ${JSON.stringify(real)}\nVerify each; fix every real one in a small commit each with its test (re-run the affected tests and typecheck/lint under the lock); for any you reject, give evidence. Push the WIP ref the same way. Append a "Adversary round" section to ${OUT}/build-summary.md with each finding's disposition and the new head. ${SAVE('repair.md', 'each finding dispositioned')} Return the dispositions and the new head sha.`, { label: 'repair', phase: 'Adversary' })
}
return { reread, rereadCheck, rereadFix, build, adv, repair }
