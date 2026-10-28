export const meta = {
  name: 'lane-b-packet-day-counts-fix-round',
  description: 'Fix round for PR #84: apply all three reviews and the CI shard timeout, re-review, capture and UX review, full suite',
  phases: [{ title: 'Fix' }, { title: 'Re-review' }, { title: 'Fix 2' }, { title: 'Capture' }, { title: 'UX review' }, { title: 'Fix 3' }, { title: 'Suite' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/c2897427-570e-5954-bd7a-54cacd103451/scratchpad'
const WT = '/home/user/packet-day-counts'
const BASE = '56ed6279'
const JOURNAL = '/root/.claude/projects/-home-user-PhysicalTherapy/c2897427-570e-5954-bd7a-54cacd103451/subagents/workflows/wf_5607bc50-a7b/journal.jsonl'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH\`; every heavy command (install, build, typecheck, lint, test, test:db, e2e, Stryker, the screen tour's build and server) under \`flock /tmp/laneb-heavy.lock\`. Local test:db and e2e need DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PG18). eslint may need NODE_OPTIONS=--max-old-space-size=6144. Synthetic data only. No model name or identifier in any file. Never push (the session pushes once at the end). Long commands: run_in_background and wait for the notification. packages/packets is a money package; packages/pricing and packages/ledger are frozen; no migration (Lane A's alone: if a fix needs one, build the rest and record that part for Lane A). You MUST finish by returning the structured result.`
const COMMIT = `When your changes are complete and checked, commit them locally in ${WT} (git add -A; a message describing the change, ending with a blank line and then the two lines "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: https://claude.ai/code/session_019i9ifC3LkwNtonZfNSNmCp"). Never push.`
const CONTEXT = `PR #84 (PureTideWater/PhysicalTherapy, branch co-001/packet-day-counts in the worktree ${WT}, pushed head e3299ea2, base ${BASE}): the packet narrative verifier reads every figure in the role its words give it (packages/packets roles.ts, roles-words.ts, facts.ts, verifier/mismatches.ts, check.ts; the gateway's narrative-roles.ts and narrative.ts; the web editor apps/web/src/components/packets/narrative-editor.tsx and apps/web/src/lib/packets/view.ts; ADR 0086 with amendments of 0047, 0054, 0061; CAS-43/CAS-44). Design and design review: /home/user/ops/designs/lane-b-packet-day-counts.md.`
const FIX_SCHEMA = { type: 'object', required: ['applied', 'notApplied', 'tests', 'commit'], properties: { applied: { type: 'string' }, notApplied: { type: 'string' }, tests: { type: 'string' }, commit: { type: 'string', description: 'the local commit sha, or "none"' } } }
const REVIEW_SCHEMA = { type: 'object', required: ['verdict', 'findings'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: { type: 'object', required: ['severity', 'title', 'detail', 'fix'], properties: { severity: { type: 'string' }, title: { type: 'string' }, detail: { type: 'string' }, reproduction: { type: 'string' }, fix: { type: 'string' } } } } } }

phase('Fix')
const fix1 = await agent(`${CONTEXT}
Fix round. Apply every finding of the three reviews, whose full results are the "result" lines with "findings" in ${JOURNAL} (payment-engine checklist, correctness, UX and brand; their notes in ${SP}/progress/pdc-review-pe.md, pdc-review-corr.md, pdc-review-ux.md and the UX probe ${SP}/progress/pdc-review-ux-probe.txt). Take each reviewer's recommended fix; for a false pass, the safer option; keep legitimate narratives passing. In particular:
- one role per figure, not the union of the clause's cues (the noun right after it first; else the nearest cue, a verb cue for the payer's action winning over a noun cue for its object); day-count cues the same; the gateway's pre-call check must be at least as strict as the base's for every swap the base caught (prove it: run the base's narrative-roles.ts (git show ${BASE}:packages/model-gateway/src/functions/narrative-roles.ts) and the new check over the same probes);
- quoted texts: no whole-clause pass in any role (the clause-edge rule), "no quoted figure is a role fact";
- a count noun after a year wins over the year lead ("2026 claims" fails against a 2026 date);
- per-line values vs totals, "respectively", ordinals before other nouns ("the sixth unit"), the natural sentences that fail ("the first 3 claims", a fee-schedule year after a payment cue, business days), list inheritance, the four-token quote rule, "appeal" as a label;
- the editor: one reading per keystroke (no double read), the words the UX review asks for (say what the records hold the figure as; plain words, not "in the role its words give it"; no rule-release example; mono for counts as the brand says; shorter items at 390 px; the live region not re-announcing everything on each keystroke);
- UX blocking: a version the current reading fails must not show "Verifier passed" and must not be approvable: re-run the verifier in the approval handler (and wherever "Verifier passed" is shown, show the current reading's result); if a Postgres-side change would also be needed, that part is a migration for Lane A: record it, build the handler and display parts;
- the property tests: sentences with two or more cues where the figure is held only in the farther one's role, edge-delimited quoted figures, the year lead before count nouns, the missing date roles in the oracle; seeded per the repo's convention; run each property over many seeds once (e.g. 40 seeds) and report zero failures;
- CI: the packets-words shard was cancelled at the mutation job's 30-minute limit on CI (job 122675878615, 06:55 to 07:25; locally 22 min 42 s): split the vocabulary by word family into separate files, each its own shard in stryker/shards.json (and stryker/base.mjs, tools/stryker tests, watched-paths via \`pnpm -s exec tsx tools/screening-capacity/watched.ts --write\`), so every shard's local time is under about 12 minutes on 4 shared CPUs; do not raise the job's limit.
Update ADR 0086 (and its amendments), the design's section 7 ("Fix round"), CAS-43/CAS-44 rows if their claims change (and the synth matrix word for word; regenerate expected.json with \`pnpm synth --case\`), and add every review reproduction as a named CAS-43/CAS-44 example.
Check: packets, model-gateway (with eval/gate.golden.test.ts), web packets, worker src/packets (db), synth and tools/stryker tests; typecheck; eslint on touched files; lint:logs; verify-content.
${COMMIT}
${SAVE('pdc-fix1.md', 'each finding: applied or not and why; commands and results')}
${RULES}`, { label: 'fixer', phase: 'Fix', schema: FIX_SCHEMA })

phase('Re-review')
const rerev = await agent(`${CONTEXT}
Adversarial re-review of the fix round, on ${WT} at its local commit (${JSON.stringify(fix1.commit)}; read-only for you: probes only as temporary test files you delete). You review with both lenses: .claude/agents/payment-engine-reviewer.md's checklist and correctness. The fix round's account: ${JSON.stringify(fix1)}. The original findings: ${JOURNAL}.
Re-run every reviewer's reproduction and confirm each is fixed; then try hard to make a wrong figure pass (amounts, dates, day counts, counts, units, pages, codes, years, releases, levels, rows, quoted figures; any role swap; across sentences with several cues; lists; numbers in words) and a legitimate natural narrative fail (write 60+ new sentences a billing specialist would write; the MOD-03 references; the e2e narratives). Check the gateway's check is at least as strict as the base's (${BASE}) on swaps. Check the approval handler and the "Verifier passed" display. Check the shard split's times are plausible for CI. ${SAVE('pdc-rereview.md', 'probes and findings')}
${RULES}`, { label: 're-review', phase: 'Re-review', schema: REVIEW_SCHEMA })

let fix2 = null
if (rerev.findings.length > 0) {
  phase('Fix 2')
  fix2 = await agent(`${CONTEXT}
Second fix pass. Apply these re-review findings (recommended fix; safer for a false pass; keep legitimate narratives passing; every reproduction a named example): ${JSON.stringify(rerev.findings)}. Update the ADR and the design's section 7 if behaviour changes. Run the changed packages' tests, typecheck, eslint on touched files.
${COMMIT}
${SAVE('pdc-fix2.md', 'each finding: applied or not and why')}
${RULES}`, { label: 'fixer-2', phase: 'Fix 2', schema: FIX_SCHEMA })
}

phase('Capture')
const cap = await agent(`You take the before and after screenshots for the UX and brand review of ${CONTEXT}
Before: TOUR_REF=${BASE}. After: TOUR_REF = the worktree's current local HEAD (\`git -C ${WT} rev-parse HEAD\`; a local commit, not pushed: the tour's setup reads refs from the shared object database; if it insists on origin, say so and use \`git -C /home/user/PhysicalTherapy fetch ${WT} HEAD\` to make the commit reachable from the main checkout).
A first attempt (notes ${SP}/progress/pdc-capture.md; dirs ${SP}/screens-before, ${SP}/screens-after) chose 9 shot ids and added cap() calls on claude/build-ops, but its before build stopped with ELIFECYCLE at 07:24 (read ${SP}/screens-before/build.log and fix the cause; it ran with TOUR_MINUTES=30 while other heavy work held the lock: use TOUR_MINUTES=90). Follow /home/user/ops/tools/lane-b-screen-tour/README.md "From another lane" and "Set-up and a run" exactly (one run at a time; check the server stopped and fuser 3297/tcp is empty between runs; clean up after). The sample: the packet narrative editor and the version page with (a) a failing figure in the wrong role, (b) a passing narrative, (c) a stored version the current reading fails (the "Verifier passed" fix), at 1280 and 390 px light and 1280 px dark. Tile both runs with /usr/bin/python3 -I tools/lane-b-screen-tour/tile.py. If you change the tour, push it to claude/build-ops (pull first; GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops; commit lines as below). PNGs never go on a branch.
${SAVE('pdc-capture2.md', 'steps done, shot ids, paths')}
${RULES} (Exception: you may push the tour's own changes to claude/build-ops; commit messages end with the two lines "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: https://claude.ai/code/session_019i9ifC3LkwNtonZfNSNmCp".)
Return the before and after tile directories, the shots.json paths, the shot ids with what each shows, and anything not captured and why.`, { label: 'capture', phase: 'Capture', schema: { type: 'object', required: ['before', 'after', 'shots', 'notCaptured'], properties: { before: { type: 'string' }, after: { type: 'string' }, shots: { type: 'string' }, notCaptured: { type: 'string' } } } })

phase('UX review')
const ux = await agent(`You review as .claude/agents/ux-brand-reviewer.md says (read it whole and follow it). Adversarial UX and brand review of ${CONTEXT}
The change on screen is the fixed tree at the worktree's local HEAD (read-only for you). The first UX review's findings and notes: ${SP}/progress/pdc-review-ux.md (and the "findings" results in ${JOURNAL}); the fix round's account: ${JSON.stringify({ fix1: fix1.applied, fix2: fix2?.applied ?? null })}. Screenshots, before and after (1280 px light, 390 px light, 1280 px dark): ${JSON.stringify(cap)}. Open every tile with the Read tool. Check each earlier UX finding is fixed, then review the words, the layout at both widths, dark contrast, focus and the live region, and whether a person can tell what to fix and why a stored version cannot be approved. ${SAVE('pdc-review-ux2.md', 'findings so far')}
${RULES}`, { label: 'ux-review-2', phase: 'UX review', schema: REVIEW_SCHEMA })

let fix3 = null
if (ux.findings.length > 0) {
  phase('Fix 3')
  fix3 = await agent(`${CONTEXT}
Apply these UX and brand findings (within .claude/rules/brand.md and CO-11; the recommended option): ${JSON.stringify(ux.findings)}. Run the web packets tests, typecheck, eslint on touched files.
${COMMIT}
${SAVE('pdc-fix3.md', 'each finding: applied or not and why')}
${RULES}`, { label: 'fixer-3', phase: 'Fix 3', schema: FIX_SCHEMA })
}

phase('Suite')
const suite = await agent(`Run the full local suite once on ${WT} at its local HEAD (committed; do not change source files except to fix a failure this PR caused, which you then commit locally as the fixers did and report). Per /home/user/ops/lanes/lane-b.md "How Lane B runs", each under the lock: pnpm lint; pnpm typecheck; pnpm lint:logs; pnpm verify-content; pnpm test; pnpm test:golden; pnpm test:oracle; pnpm test:db in shards one after another (DATABASE_URL on 5433, PG18; give *.db.test.ts a longer timeout only on the command line if a cold machine needs it, and say so); pnpm build; the build stamp (apps/web/scripts/build-stamp.ts --write $(git rev-parse HEAD)); pnpm test:e2e with E2E_PREBUILT=1 --workers=2; every packets mutation shard in stryker/shards.json (each under the lock, timed: report each shard's wall time; any over 15 minutes is a failure to report) and the mutation gate; \`pnpm -s exec tsx tools/screening-capacity/watched.ts --write\` (no diff expected). A failure this PR did not cause: show it fails on origin/claude/build-platform too.
${SAVE('pdc-suite.md', 'each command and its result')}
${RULES}`, { label: 'full-suite', phase: 'Suite', schema: { type: 'object', required: ['results', 'allPassed', 'failures', 'head'], properties: { results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } }, allPassed: { type: 'boolean' }, failures: { type: 'string' }, head: { type: 'string' } } } })
return { fix1, rerev, fix2, cap, ux, fix3, suite }