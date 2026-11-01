export const meta = {
  name: 'lane-b-ux-payer-response-fix-round',
  description: '#85 fix round: apply the 13 verified review findings and critic nits n1-n8, adversarial re-review until dry, after-shot retake and UX delta review, then the full local suite once',
  phases: [{ title: 'Fix' }, { title: 'Re-review' }, { title: 'Fix 2' }, { title: 'Capture' }, { title: 'UX review' }, { title: 'Fix 3' }, { title: 'Suite' }],
}
const WIP = '/home/user/ops/approval-summaries/lane-b-ux-payer-response-wip'
const WT = '/home/user/ux-payer-response'
const BASE = '83d71fd62c6d419be61fd7aaa5b9033ef5c18b56'
const HEAD0 = '90ec40ababcf98a81519ff30e5208186065b88c8'
const FINDINGS = '/home/user/ops/approval-summaries/lane-b-ux-payer-response-review-findings.json'
const SAVE = (file, what) => `Save as you go: keep ${WIP}/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust it unless the code says otherwise, and continue from where it stopped. Do not commit in /home/user/ops unless told.`
const RULES = `RESUMED 2026-11-01 ~19:20 UTC after the account's 5-hour limit stopped every agent: read your progress file and the worktree's uncommitted changes (git -C /home/user/ux-payer-response status / diff) first and continue from them; PostgreSQL was restarted. Rules: export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command; every heavy command (install, build, typecheck, lint, test, test:db, e2e, Stryker, the screen tour's build and server) under "flock /tmp/laneb-heavy.lock <cmd>", never holding it across commands; long ones run_in_background and waited on; never a foreground sleep; never pkill -f a pattern your own shell matches. Local test:db and e2e on PostgreSQL 18 at 5433 (postgres:test). eslint may need NODE_OPTIONS=--max-old-space-size=6144. Synthetic data only. No model name or identifier in any file. No migration, nothing under packages/pricing, no file on LANES.md's "Not while #42 is open" list (/home/user/ops/LANES.md) beyond the shared documents: anything needing one is recorded "For Lane A" and the rest is built. Never push (the session pushes once at the end). Improve as you go: a real defect found in files this PR touches is fixed and reported.`
const COMMIT = `When your changes are complete and checked, commit them locally in ${WT} (git add -A; a message describing the change, then a blank line and the two lines "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: https://claude.ai/code/session_01FcouKNxBLBBy2FVM7bfSvj"). Never push, never amend a pushed commit.`
const CONTEXT = `PR #85 (PureTideWater/PhysicalTherapy, branch co-001/ux-payer-response in the worktree ${WT}, pushed head ${HEAD0}, the PR's own diff git diff ${BASE} HEAD): "the payer's answer and the write-off reason start unchosen; the payer's letter is uploaded in its response" (UX PR 10: UX-035, UX-007; ADR 0085 docs/adr/0085-*.md; CAS-45 to CAS-48). Design: /home/user/ops/designs/lane-b-ux-payer-response.md (6.1 strings; 9 dispositions; 3.9 and 7.2 what it leaves open and hands to Lane A). Brand: .claude/rules/brand.md, docs/brand/BRAND.md, CO-11. Wording and visible changes are taken without asking within those (the co-founder's standing direction) and reported.`
const FIX_SCHEMA = { type: 'object', required: ['applied', 'notApplied', 'tests', 'commit', 'visibleChanges'], properties: { applied: { type: 'string' }, notApplied: { type: 'string' }, tests: { type: 'string' }, commit: { type: 'string', description: 'the local commit sha, or "none"' }, visibleChanges: { type: 'array', items: { type: 'string' }, description: 'shot ids (tour) whose screen changes' } } }
const REVIEW_SCHEMA = { type: 'object', required: ['verdict', 'findings'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', required: ['severity', 'title', 'detail', 'fix'], properties: { severity: { type: 'string', enum: ['blocking', 'should-fix', 'polish'] }, title: { type: 'string' }, detail: { type: 'string' }, reproduction: { type: 'string' }, fix: { type: 'string' } } } } } }
const VERDICT = { type: 'object', required: ['real', 'reasoning'], properties: { real: { type: 'boolean' }, reasoning: { type: 'string' } } }
const verified = async (findings, label) => {
  const out = await parallel(findings.map((f, i) => () => parallel([0, 1].map((k) => () => agent(`${CONTEXT}
Adversarially verify this re-review finding on ${WT} at its local HEAD (read-only): try to REFUTE it (${k === 0 ? 'reproduce it in the code; if it cannot happen it is not real' : 'is it a real defect with a consequence, introduced or left by this PR, and not a recorded design decision?'}). Default real=false if you cannot establish it.
${JSON.stringify(f)}
${RULES}`, { label: `${label}-v${k + 1}:${i}`, phase: 'Re-review', schema: VERDICT }))).then((vs) => (vs.filter(Boolean).filter((v) => v.real).length === 2 ? f : null))))
  return out.filter(Boolean)
}

phase('Fix')
const fix1 = await agent(`${CONTEXT}
Fix round. Apply every finding with "real": true in ${FINDINGS} (13: S2-N1, S2-N2, S2-N3, ux85-1, ux85-2, ux85-5, ux85-7 and U2-ux85-r2-1, -2, -3, -5, -6, -7; read each finding's detail, proposedFix and its three verifiers' votes and fixes) and the design critic's nits n1 to n8 in ${WIP}/pay-critic.md (n8, the tour and PR description, is done elsewhere: note it). Take the recommended fix (security: the safer one). Specific guidance:
- S2-N1: the words under Response must be true for every answer, per packages/db/functions/case_rules.sql (Denied without reopening marks the case Resolved; info requested / a reopening denial keep it awaiting; acceptances as now); keep it short and plain, and use the quotation style the write-off hint uses (U2-r2-5).
- S2-N2: "Received on" must not pre-answer a date nobody chose: start it empty with required (the route refuses an empty date on its field, as the other choices), unless the verifiers found a reason it must default; the next window and deadline are computed from it.
- ux85-1 and U2-r2-1: when uploads are paused or not allowed, the response card and panels must say so truly (no "upload it here" when it cannot), and a suspended organization's panel words must be right for that state.
- ux85-2 and U2-r2-2: no clipped option text at 390 px (shorter labels with the distinguishing part first, or a select that wraps/sizes; the brand's 16 px controls).
- Others: as each finding's proposedFix.
For every change: update design-facing records in the repo (ADR 0085 if a decision changes; CAS-45 to CAS-48 rows in docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts word for word, then pnpm synth --all), add or update tests (unit, browser, route db tests, e2e where the act changes: apps/web/e2e/{triage,packets,unattested}.spec.ts) proving each fix. Check: typecheck; eslint on touched files; pnpm lint:copy; pnpm lint:logs; the touched packages' unit and browser tests; the route db tests that cover changed routes; pnpm synth --all and watched.ts --write leave no diff after staging.
${COMMIT}
${SAVE('pay-fix1.md', 'each finding: applied or not and why; commands and results')}
${RULES}
Return visibleChanges: the tour shot ids (see /home/user/ops/approval-summaries/lane-b-ux-payer-response-wip/shots85.md and /home/user/screens85-after/shots.json) whose screens your changes alter.`, { label: 'fixer', phase: 'Fix', schema: FIX_SCHEMA })

phase('Re-review')
let fixes = [fix1]
let pending = []
for (let round = 1; round <= 3; round++) {
  const last = fixes[fixes.length - 1]
  const lenses = [
    ['correctness-security-money', `Lens: correctness, security and money (.claude/agents/security-reviewer.md and payment-engine-reviewer.md: tenancy, authorization, the letter check and its lock, no stage/approval/ledger record a person did not choose, the write-off refusal, the words under Response true to case_rules.sql and reconcile).`],
    ['ux-brand-tests', `Lens: UX, brand and tests (.claude/agents/ux-brand-reviewer.md on the code: words against brand.md and CO-11, WCAG 2.1 AA + 2.2, focus, live regions, error association, 390 px; and whether each fix is proven by a test that would fail without it).`],
  ]
  const found = (await parallel(lenses.map(([k, lens]) => () => agent(`${CONTEXT}
Adversarial re-review, round ${round}, of the fix round on ${WT} at its local HEAD (read-only for you: probes only as temporary files you delete). ${lens}
The original findings: ${FINDINGS}; the critic nits: ${WIP}/pay-critic.md. The fixers' accounts so far: ${JSON.stringify(fixes).slice(0, 12000)}.
Confirm each finding and nit is truly fixed (re-run its failure scenario), then try hard to find what the fixes broke or missed (git diff ${HEAD0} HEAD). Report only real defects; none is a fine answer.
${SAVE(`pay-rerev-${round}-${k}.md`, 'each item checked and each finding')}
${RULES}`, { label: `re-review-${round}:${k}`, phase: 'Re-review', schema: REVIEW_SCHEMA })))).filter(Boolean).flatMap((r) => r.findings)
  const real = found.length ? await verified(found, `rr${round}`) : []
  log(`re-review round ${round}: ${found.length} reported, ${real.length} verified real`)
  if (!real.length) break
  phase('Fix 2')
  const fx = await agent(`${CONTEXT}
Fix pass ${round + 1}. Apply these verified re-review findings (recommended fix; safer for security; each proven by a test): ${JSON.stringify(real)}. Update ADR/test-matrix/synth matrix word for word if claims change. Run the touched tests, typecheck, eslint on touched files, lint:copy.
${COMMIT}
${SAVE(`pay-fix${round + 1}.md`, 'each finding: applied or not and why')}
${RULES}
Return visibleChanges as before.`, { label: `fixer-${round + 1}`, phase: 'Fix 2', schema: FIX_SCHEMA })
  fixes.push(fx)
  if (round === 3) pending = real
}
const visible = [...new Set(fixes.filter(Boolean).flatMap((f) => f.visibleChanges || []))]

phase('Capture')
const cap = await agent(`${CONTEXT}
Retake the AFTER screenshots for the UX delta review: the fixes changed what these shots show: ${JSON.stringify(visible)} (plus any shot of the same screens you judge affected; when unsure, retake the whole p.submissions.*, p.case.*, p.contracts.* sample). Use tools/lane-b-screen-tour as /home/user/ops/tools/lane-b-screen-tour/README.md says ("From another lane", "Set-up and a run"), with TOUR_REF = the worktree's local HEAD (git -C ${WT} rev-parse HEAD; it is a local commit, not pushed: if setup insists on origin, make it reachable with git -C /home/user/PhysicalTherapy fetch ${WT} HEAD, or as the README says), TOUR_DIR=/home/user/screens85-after2, TOUR_ONLY those ids at 1280 and 390 px light and 1280 px dark. The tour spec on claude/build-ops already holds #85's steps (shots85.md); if a fix changed a label or act the spec relies on (e.g. Received on now empty and required, so acts must fill it), update tour.spec.ts so it runs on both the base and the head, commit and push it on claude/build-ops (pull first, keep both sides; commit lines end with "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: https://claude.ai/code/session_01FcouKNxBLBBy2FVM7bfSvj"; GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops). Stop the server after (fuser 3297/tcp empty), drop tp_e2e_screens, remove /tmp/tp-e2e-tp_e2e_screens-*. /usr/bin/python3 -I tile.py on the TOUR_DIR; Read tiles to confirm; rebuild the after gallery files in /home/user/gallery85/after2-{1280,390,1280-dark} as shots85.md describes. Never publish; never put a PNG on a branch.
${SAVE('shots85-after2.md', 'ids, steps, results, folders')}
${RULES}
Return the after2 tiles folder, the ids taken, and anything not captured and why.`, { label: 'capture', phase: 'Capture', schema: { type: 'object', required: ['after2', 'ids', 'notCaptured', 'specCommit'], properties: { after2: { type: 'string' }, ids: { type: 'array', items: { type: 'string' } }, notCaptured: { type: 'string' }, specCommit: { type: 'string' } } } })

phase('UX review')
const ux = await agent(`Read .claude/agents/ux-brand-reviewer.md (in ${WT}) and follow it whole. Adversarial UX and brand DELTA review of ${CONTEXT}
The change on screen is the fixed tree at ${WT}'s local HEAD (read-only). The first UX findings: the "ux" track in ${FINDINGS}. The fixes: ${JSON.stringify(fixes.filter(Boolean).map((f) => f.applied)).slice(0, 10000)}. Shots: before /home/user/screens85-before/tiles, first after /home/user/screens85-after/tiles, the retake ${JSON.stringify(cap)}. Read every retaken tile and its counterparts. Confirm each UX finding is fixed on screen, then review the changed words, both widths, dark contrast, focus and live regions. Name shots by id in backticks. Report only real defects.
${SAVE('pay-ux-delta.md', 'each shot pair and each finding')}
${RULES}`, { label: 'ux-delta-review', phase: 'UX review', schema: REVIEW_SCHEMA })

let fix3 = null
const uxReal = ux && ux.findings.length ? await verified(ux.findings, 'uxd') : []
if (uxReal.length) {
  phase('Fix 3')
  fix3 = await agent(`${CONTEXT}
Apply these verified UX and brand delta findings (recommended option, within brand.md and CO-11), each with a test where testable: ${JSON.stringify(uxReal)}. Run the touched tests, typecheck, eslint on touched files, lint:copy.
${COMMIT}
${SAVE('pay-fix-ux.md', 'each finding: applied or not and why')}
${RULES}`, { label: 'fixer-ux', phase: 'Fix 3', schema: FIX_SCHEMA })
}

phase('Suite')
const suite = await agent(`Run the full local suite ONCE on ${WT} at its local HEAD (committed; change no source file except to fix a failure this PR caused, which you then commit locally as the fixers did, and report). ${CONTEXT}
Each under the lock, as /home/user/ops/lanes/lane-b.md "How Lane B runs" says: pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; pnpm check:fixtures; pnpm test; pnpm test:golden; pnpm test:oracle; pnpm test:db in 4 shards one after another, each on a fresh PG18 database on 5433 (created before, dropped after; find the shard flags the record uses in ${WIP}/pay-build-check.md or the CI workflow); pnpm build, the build stamp, then E2E_PREBUILT=1 e2e (both shards, --workers=2, a fresh database each, dropped after; see how earlier runs set E2E_ADMIN_URL/E2E_DATABASE/E2E_PORT in /home/user/ops/approval-summaries/lane-b-ux-download-refusals-fix-suite.md); the Stryker shards pnpm exec tsx tools/stryker/affected.ts --event pull_request --base ${BASE} names, then the gate; pnpm verify-content; pnpm synth --all and watched.ts --write each then git diff --exit-code. Run actions:check and toolchain:check only if a workflow, manifest or lockfile changed (git diff ${BASE} HEAD --name-only). A failure is root-caused and fixed, then re-run; a flake gets one re-run and is named. Report every command, its counts (tests passed/skipped) and result.
${SAVE('pay-suite.md', 'each command and its result')}
${RULES}`, { label: 'full-suite', phase: 'Suite', schema: { type: 'object', required: ['results', 'allPassed', 'failures', 'head'], properties: { results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } }, allPassed: { type: 'boolean' }, failures: { type: 'string' }, head: { type: 'string' } } } })
return { fixes, pending, cap, ux, uxReal, fix3, suite }