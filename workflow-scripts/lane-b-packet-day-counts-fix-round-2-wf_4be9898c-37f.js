export const meta = {
  name: 'lane-b-packet-day-counts-fix-round-2',
  description: 'Fix round for PR #84: verify critic findings, fix all 28 defects, split the Stryker shard, loop-until-dry re-review with 3-lens verification, capture and UX review, full suite',
  phases: [{ title: 'Verify critic' }, { title: 'Fix' }, { title: 'Re-review' }, { title: 'Capture' }, { title: 'UX review' }, { title: 'Suite' }, { title: 'Record' }],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2c2b82ed-413a-5c90-8dd5-7354c4f665c6/scratchpad'
const WT = '/home/user/packet-day-counts'
const BASE = '83d71fd6'
const HEAD0 = '1c423691'
const FINDINGS = '/home/user/ops/approval-summaries/lane-b-packet-day-counts-reviews.md'
const SESSION = 'https://claude.ai/code/session_01FcouKQVq7K3Np8pwNtDhew'
const GL = 'GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks'
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}), so an interruption loses nothing. If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const RULES = `Rules: \`export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH\`; every heavy command (install, build, typecheck, lint, test, test:db, e2e, Stryker, the screen tour's build and server) under \`flock /tmp/laneb-heavy.lock\`. Local test:db and e2e need DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (PG18). eslint may need NODE_OPTIONS=--max-old-space-size=6144. Synthetic data only (packages/synth, @tp/packets/testing). No model name or identifier in any file, commit or comment. packages/packets is a money package; packages/pricing and packages/ledger are frozen. No migration and no edit of docs/product/domain-model.md (Lane A's alone: if a fix needs Postgres-side work, build the rest and record that part "for Lane A"). Stay off every file in /home/user/ops/LANES.md's "Not while #42 is open" list (apps/web/src/lib/routes/packets.ts and apps/web/src/components/packets/display.tsx are outside it; check any other file before touching it). Never push the PR branch co-001/packet-day-counts; never force; never --no-verify. Long commands: run_in_background and wait for the notification. You MUST finish by returning the structured result.`
const COMMIT = `When your changes are complete and checked, commit them in ${WT} (git add -A; a message describing the change, ending with a blank line and then the two lines "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"), then push a safety copy, fast-forward only, to the WIP ref and nothing else: \`${GL} git -C ${WT} push origin HEAD:refs/heads/co-001/wip-packet-day-counts-2\` (if the hook refuses it, fix the flagged text with a new commit; if it is not a fast-forward, stop and report; never force).`
const CONTEXT = `PR #84 (PureTideWater/PhysicalTherapy, branch co-001/packet-day-counts, worktree ${WT}; local head started at ${HEAD0} = PR head e3299ea2 + base ${BASE} merged; safety copies on co-001/wip-packet-day-counts-2): the packet narrative verifier reads every figure in the role its words give it (packages/packets roles.ts, roles-words.ts, facts.ts, verifier/mismatches.ts, check.ts; the gateway's packages/model-gateway/src/functions/narrative-roles.ts and narrative.ts; the web editor apps/web/src/components/packets/narrative-editor.tsx and apps/web/src/lib/packets/view.ts; ADR 0086 with amendments of 0047, 0054, 0061; test-matrix and synth cases CAS-43/CAS-44 in the CAS module). Design and its review: /home/user/ops/designs/lane-b-packet-day-counts.md. The reviews' findings, whole, with reproductions, harnesses and recommended fixes: ${FINDINGS} (28 distinct defects; 9 blocking: PE-1..PE-5, PE-8, CORR-4, CORR-5, CORR-6).`
const FIX_SCHEMA = { type: 'object', required: ['applied', 'notApplied', 'tests', 'commit'], properties: { applied: { type: 'array', items: { type: 'object', required: ['id', 'how'], properties: { id: { type: 'string' }, how: { type: 'string' } } } }, notApplied: { type: 'array', items: { type: 'object', required: ['id', 'why'], properties: { id: { type: 'string' }, why: { type: 'string' } } } }, tests: { type: 'string', description: 'commands run and results' }, commit: { type: 'string', description: 'the head sha after your commits, or "none"' }, forLaneA: { type: 'string' } } }
const FINDING = { type: 'object', required: ['id', 'severity', 'file', 'title', 'detail', 'reproduction', 'fix'], properties: { id: { type: 'string' }, severity: { type: 'string', description: 'blocking | should fix | nit' }, file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' }, detail: { type: 'string' }, reproduction: { type: 'string', description: 'exact input; observed vs expected; runnable' }, fix: { type: 'string' } } }
const REVIEW_SCHEMA = { type: 'object', required: ['verdict', 'findings'], properties: { verdict: { type: 'string' }, findings: { type: 'array', items: FINDING } } }
const VERDICTS = { type: 'object', required: ['verdicts'], properties: { verdicts: { type: 'array', items: { type: 'object', required: ['id', 'real', 'severity', 'reason'], properties: { id: { type: 'string' }, real: { type: 'boolean' }, severity: { type: 'string' }, reason: { type: 'string', description: 'what you ran and saw' } } } } } }
const CLONE = (dir, sha) => `Work in your own clone ${dir}: if it does not exist, \`git clone -q ${WT} ${dir}\`; then \`git -C ${dir} fetch -q ${WT} HEAD && git -C ${dir} checkout -q -f ${sha}\` and \`pnpm install --frozen-lockfile\` under the lock (skip install if the lockfile did not change since your last install there). Read-only for the PR: probes only as temporary test files you delete after.`

const LENSES = [
  { key: 'reproduce', text: 'does-it-reproduce: run each reproduction exactly as written, then one variant; real only if you see the defect' },
  { key: 'payer', text: 'payment-engine (.claude/agents/payment-engine-reviewer.md checklist): would a payer receive a wrong figure, would a correct narrative fail in normal use, or is the gateway less strict than the base on a swap the base caught' },
  { key: 'intent', text: 'intent and scope: is the behaviour intended by ADR 0086, the design or the item scope (then real=false, say where), or is the finding a duplicate of an already-fixed one; real only if it is a defect this PR should fix' },
]
const verify3 = async (findings, sha, tag) => {
  if (!findings.length) return []
  const sets = await parallel(LENSES.map((l) => () => agent(`You are a skeptical verifier. Try to REFUTE each finding below about ${CONTEXT}
${CLONE(SP + '/verify-' + l.key, sha)}
Your lens: ${l.text}. Decide for each: real or not; default to real=false when you cannot reproduce it. Give your own severity (blocking = a wrong figure can pass to a payer, a right narrative fails in normal use, the gateway is less strict than the base on a swap the base caught, or an approvable/"Verifier passed" stored version the current reading fails; should fix; nit). Findings: ${JSON.stringify(findings)}
${SAVE(`pdc3-verify-${tag}-${l.key}.md`, 'each finding: verdict and what you ran')}
${RULES}`, { label: `verify-${tag}-${l.key}`, phase: tag.startsWith('crit') ? 'Verify critic' : 'Re-review', schema: VERDICTS })))
  const votes = {}
  for (const s of sets.filter(Boolean)) for (const v of s.verdicts) (votes[v.id] ??= []).push(v)
  return findings.map((f) => ({ ...f, verdicts: votes[f.id] ?? [], confirmed: (votes[f.id] ?? []).filter((v) => v.real).length >= 2 }))
}

// Phase A: the critic's four findings had no verifier pass.
phase('Verify critic')
const critIds = ['CRIT-1', 'CRIT-2', 'CRIT-3', 'CRIT-4']
const critFindings = critIds.map((id) => ({ id, severity: 'see file', file: 'see file', title: id, detail: `Read ${id} in ${FINDINGS} whole (detail, reproduction, fix).`, reproduction: `as written under ${id} in ${FINDINGS}`, fix: 'as written there' }))
const critJudged = await verify3(critFindings, HEAD0, 'crit')
const critRefuted = critJudged.filter((f) => !f.confirmed).map((f) => f.id)
log(`critic findings: confirmed ${critJudged.filter((f) => f.confirmed).map((f) => f.id).join(', ') || 'none'}; refuted ${critRefuted.join(', ') || 'none'}`)
const SKIP = critRefuted.length ? `Do NOT apply these critic findings, refuted by three-lens verification: ${JSON.stringify(critJudged.filter((f) => !f.confirmed).map((f) => ({ id: f.id, verdicts: f.verdicts })))}.` : 'All four critic findings were confirmed by three-lens verification.'

// Phase B: sequential fixers in the one worktree.
phase('Fix')
const fixCore = await agent(`${CONTEXT}
Fix round, part 1 of 3: the role reader, the facts, the verifier and the gateway check. Apply every confirmed finding in ${FINDINGS} that lives in packages/packets or packages/model-gateway (all PE, CORR and CRIT ids except CORR-5, PE-9/CORR-17 and PE-5/CORR-19, which later parts take). ${SKIP} Take each finding's recommended fix; for a false pass, the safer option; keep legitimate narratives passing. In particular:
- one role per figure, never the union of the clause's cues (the noun right after the figure first; else the nearest cue, a verb cue for the payer's action winning over a noun cue for its object, with the subject noun considered (CRIT-2)); the same for day counts, dates, deadlines, pages and percentages; a figure after another figure with no cue between inherits nothing silently ("respectively", per line vs total: CORR-6, CORR-7); dates after another figure or opening a sentence are checked (CRIT-3); "days after/of payment" (CRIT-4);
- the gateway's pre-call check at least as strict as the base's on every swap the base caught: PROVE it with a committed test that runs the base's check (vendor it from \`git show ${BASE}:packages/model-gateway/src/functions/narrative-roles.ts\` into the test as a fixture-only module, or record the base's verdicts as expected data) over the same swap probes and asserts every swap the base flagged is flagged now;
- quoted texts: no whole-clause pass in any role; the narrative's clause must end where the quote's does; the four-token rule only in the quote's own role (PE-3, CORR-3, CORR-14);
- a count noun after a year wins over the year lead ("2026 claims" fails against a 2026 date) (PE-8);
- ordinals, partitives, "the first 3 claims", schedule_year, business days, "appeal" as a verb, list inheritance, en-dash ranges, confusable letters in cues, totals paid and patient share, the gateway notice's role (CORR-8..CORR-16, CORR-20, CORR-21);
- every reproduction in the file (and each verifier variant it records) becomes a named example in CAS-43 or CAS-44 tests (roles.test.ts, verifier.test.ts, the gateway tests) asserting the corrected verdict;
- property tests (PE-7, CORR-18, CRIT-1): sentences with two or more cues where the figure is held only in the farther one's role, edge-delimited quoted figures, the year lead before count nouns, every date role in the oracle, the deadline role expected to pass; the oracle independent of the reader; seeded per the repo's convention; run each property over 40 seeds once and report zero failures;
- update ADR 0086 and its amendments of 0047, 0054 and 0061, the CAS-43/CAS-44 rows of docs/product/test-matrix.md and the synth matrix word for word, then \`pnpm synth --case CAS-43\` and \`--case CAS-44\` (check the CLI's exact syntax) and commit the regenerated expected.json.
Check: packets and model-gateway tests (with eval/gate.golden.test.ts), synth tests, typecheck, eslint on touched files, lint:logs, verify-content. Do not split roles-words.ts yet (part 3 does), but keep its exported vocabulary per word family if that helps part 3.
${COMMIT}
${SAVE('pdc3-fix-core.md', 'each finding id: applied (how) or not (why); commands and results')}
${RULES}`, { label: 'fixer-core', phase: 'Fix', schema: FIX_SCHEMA })

const fixWeb = await agent(`${CONTEXT}
Fix round, part 2 of 3: the screens and the approval path. Part 1 (the reader, facts, gateway) is committed: ${JSON.stringify({ commit: fixCore?.commit, notApplied: fixCore?.notApplied })}.
1. CORR-5 (blocking): a stored version the current reading fails must not show "Verifier passed" and must not be requested or approved. Re-run the verifier (the same function the export job runs) in requestApprovalAction and approvePacketVersionAction (apps/web/src/lib/routes/packets.ts), and wherever "Verifier passed" is shown (apps/web/src/components/packets/display.tsx, apps/web/src/lib/cases/workbench.ts, and any other place: grep for the stored verifier result). Refuse with a plain message and the mismatch list, keep the person's place (#78 added returnTo for refused exports: follow its pattern). Each mutation keeps its Zod schema, role check, practice-scoped transaction and audit event (CLAUDE.md conventions). If a Postgres-side part would also be needed (a verifier report format tp-packet-verifier/3), record it "for Lane A" and build no migration. Add tests: unit for the handlers' refusal and the display; db tests where the handlers already have them; an e2e assertion only if an existing packets e2e journey covers approval.
2. PE-9/CORR-17: the editor reads the narrative once per keystroke.
3. The editor's words (the 2026-10-28 UX review, whose findings are lost, asked for): say what the records hold the figure as; plain words, not "in the role its words give it"; no rule-release example; mono for counts as .claude/rules/brand.md says; shorter items at 390 px; the live region not re-announcing everything on each keystroke. Stay within .claude/rules/brand.md and CO-11; run tools/brand-copy (pnpm script, if any) on touched copy.
Check: web packets tests, worker src/packets tests (db, 5433), typecheck, eslint on touched files, lint:logs.
${COMMIT}
${SAVE('pdc3-fix-web.md', 'each item: applied (how) or not (why); commands and results')}
${RULES}`, { label: 'fixer-web', phase: 'Fix', schema: FIX_SCHEMA })

const fixStryker = await agent(`${CONTEXT}
Fix round, part 3 of 3: the mutation shards (PE-5/CORR-19). Parts 1 and 2 are committed (head ${JSON.stringify(fixWeb?.commit ?? fixCore?.commit)}). CI cancelled \`stryker (packets-words)\` (roles-words.ts, 1,128 mutants; 22m42s locally) at the mutation job's 30-minute limit. Split roles-words.ts by word family, each family its own file built per call as vocabulary() is now, each with its own shard: (a) labels and nouns: LABELS, ROW_LABELS, COUNT_NOUNS, ORDINAL_NOUNS, NOT_THE_COUNT, YEAR_*; (b) the cue lists: DAY_, PAGE_, AMOUNT_, PERCENT_, DATE_CUES; (c) function and ordinal words (adjust to what part 1 left; split further if a shard is still too slow). Update stryker/shards.json (and its $comment), stryker/base.mjs, tools/stryker/shards.test.ts, tools/stryker/affected.test.ts, tools/stryker/equivalent/packets.json (every recorded equivalent re-checked as really equivalent; renumbered ids correct) and docs/runbooks/ci.md's shard table; run \`pnpm -s exec tsx tools/screening-capacity/watched.ts --write\`. Never raise timeout-minutes: 30 in .github/workflows/mutation.yml; its matrix comes from tools/stryker/affected.ts over shards.json, so no workflow change should be needed (if one is, run pnpm actions:check and pnpm toolchain:check with BASE=origin/claude/build-platform). Then run EVERY packets shard (packets-roles, packets-rest, packets-scan, packets-explain and the new word shards), one at a time under the lock, timed (report each wall time; aim under ~12 min each locally: packets-roles took 7m16s locally and 10m04s on CI; packets-rest was 17m23s locally before the fix: if over ~15 min, split it too), then the mutation gate; kill or record as equivalent every survivor (with reasons); keep the packets score at least where it was (98.59% over the five packets shards). Run tools/stryker tests.
${COMMIT}
${SAVE('pdc3-fix-stryker.md', 'files changed; each shard: mutants, score, wall time; gate result')}
${RULES}`, { label: 'fixer-stryker', phase: 'Fix', schema: { ...FIX_SCHEMA, required: [...FIX_SCHEMA.required, 'shards'], properties: { ...FIX_SCHEMA.properties, shards: { type: 'array', items: { type: 'object', required: ['name', 'mutants', 'score', 'wall'], properties: { name: { type: 'string' }, mutants: { type: 'number' }, score: { type: 'string' }, wall: { type: 'string' } } } } } } })

// Base merge before the reviews, so the one full suite and every review run on the final tree.
const baseMerge = await agent(`${CONTEXT}
Merge the latest base into the fix round's head, so every later review, the capture and the one full suite run on the final tree. The fix round's three parts are committed in ${WT} (head ${JSON.stringify(fixStryker?.commit ?? fixWeb?.commit)}); first check \`git -C ${WT} status --short\` is clean (if the Stryker part left anything uncommitted, stop and report it).
In ${WT}: \`git fetch -q origin claude/build-platform\`, then \`git merge --no-ff origin/claude/build-platform\` (a merge commit; message "Merge remote-tracking branch 'origin/claude/build-platform' into co-001/packet-day-counts" ending with a blank line and the two lines "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"). Expected at 88708069 (#90 anthropic SDK, #92 sign-in steps, #93 home figures): one conflict in apps/web/src/components/test-support/browser.ts: resolve keeping both sides' behaviour (read both sides and their tests). Auto-merged but check by reading: apps/web/e2e/packets.spec.ts, the packet pages, docs/product/test-matrix.md (keep every row of both sides), docs/runbooks/ci.md (the shard table must list this PR's shards), synth matrix.ts and registry.ts. Never hand-merge generated files: regenerate them under the lock with \`pnpm install --frozen-lockfile\` (pnpm-lock.yaml changed on the base), \`pnpm -s exec tsx tools/screening-capacity/watched.ts --write\` and \`pnpm synth --all\`, and amend nothing: commit any regenerated diff as a separate commit. Then run the delta's checks: typecheck; the web unit tests for components/test-support and packets; packets, model-gateway and synth tests; tools/stryker tests; eslint on the conflicted and touched files. Fix any failure the merge caused (separate commit).
${COMMIT}
${SAVE('pdc3-base-merge.md', 'base sha, conflicts and how resolved, regenerations, checks')}
${RULES}`, { label: 'base-merge', phase: 'Fix', schema: FIX_SCHEMA })

// Phase C: loop-until-dry re-review with 4 lenses, 3-lens verify, fixer.
phase('Re-review')
const headOf = (r) => (r && r.commit && r.commit !== 'none' ? r.commit : null)
let head = headOf(baseMerge) ?? headOf(fixStryker) ?? headOf(fixWeb) ?? headOf(fixCore) ?? HEAD0
const REVIEWERS = [
  { key: 'pe', text: `You review as .claude/agents/payment-engine-reviewer.md says (apply its checklist). First re-run EVERY reproduction in ${FINDINGS} and confirm each is fixed (list any that is not as a finding). Then try hard to make a wrong figure reach a payer: amounts, percents, dates, day counts, windows and deadlines (ADR 0061), codes, counts, units, pages, years, releases, levels, rows, quoted figures; any role swap, several cues in a sentence, lists, numbers in words, "respectively", per-line vs total.` },
  { key: 'corr', text: `Adversarial correctness review. Write 60+ NEW natural sentences a billing specialist would write about a packet (vary voice, order, lists, ordinals, partitives, dates, quotes) and check none fails wrongly; run the MOD-03 reference narratives in packages/model-gateway/eval and the e2e packets narratives; then try misfiled figures the earlier findings did not cover. Check the property tests (oracle independent of the reader; seeded; no fc.pre exhaustion) and run them over 40 seeds.` },
  { key: 'gateway', text: `Gateway strictness and agreement: the gateway's pre-call check (narrative-roles.ts, narrative.ts) must be at least as strict as the base's (\`git show ${BASE}:packages/model-gateway/src/functions/narrative-roles.ts\`) on every swap the base caught: generate a large swap corpus (every pair of held roles, several sentence shapes) and compare verdicts; also checkedFigures vs findMismatches vs the browser editor's check must agree on every sentence you try.` },
  { key: 'flow', text: `The approval path and screens: a stored version the current reading fails must not show "Verifier passed" anywhere, must be refused by request-approval and approve (and export), with the audit event, Zod schema, role check and practice-scoped transaction intact; the editor reads once per keystroke; its words within .claude/rules/brand.md; tenant isolation and no PHI in logs, URLs or errors (as .claude/agents/security-reviewer.md checks). Also the mutation shard split: shards.json, base.mjs, tests, equivalents really equivalent, ci.md table, watched-paths; is each shard's time plausible under 30 minutes on CI.` },
]
const seen = []
const rounds = []
let dry = 0
let round = 0
const MAX_ROUNDS = 5
while (dry < 1 && round < MAX_ROUNDS) {
  round++
  const found = (await parallel(REVIEWERS.map((r) => () => agent(`${r.text}
Subject: ${CONTEXT}
The fix round's accounts so far: ${JSON.stringify({ core: fixCore, web: fixWeb, stryker: fixStryker, earlierRounds: rounds.map((x) => ({ round: x.round, fixed: x.fix?.applied, notFixed: x.fix?.notApplied })) })}.
${CLONE(SP + '/rr-' + r.key, head)} Review head ${head} against base ${BASE}.
Already reported in earlier rounds (do not report again unless the fix failed): ${JSON.stringify(seen)}.
Give every finding an id R${round}-${r.key.toUpperCase()}-n and a runnable reproduction with observed vs expected. Report only what you reproduced.
${SAVE(`pdc3-rr${round}-${r.key}.md`, 'probes and findings')}
${RULES}`, { label: `rereview-${round}-${r.key}`, phase: 'Re-review', schema: REVIEW_SCHEMA })))).filter(Boolean).flatMap((x) => x.findings)
  let fresh = found
  if (found.length && seen.length) {
    const d = await agent(`Deduplicate. Earlier findings (titles): ${JSON.stringify(seen)}. New candidates: ${JSON.stringify(found.map((f) => ({ id: f.id, title: f.title, detail: f.detail.slice(0, 600) })))}. Return the ids of candidates that are NOT the same defect as an earlier finding and not the same as another candidate listed before them.`, { label: `dedup-${round}`, phase: 'Re-review', effort: 'low', schema: { type: 'object', required: ['newIds'], properties: { newIds: { type: 'array', items: { type: 'string' } } } } })
    const keep = new Set(d?.newIds ?? found.map((f) => f.id))
    fresh = found.filter((f) => keep.has(f.id))
  }
  fresh.forEach((f) => seen.push(`${f.id}: ${f.title}`))
  const judged = await verify3(fresh, head, `r${round}`)
  const confirmed = judged.filter((f) => f.confirmed)
  log(`round ${round}: ${found.length} found, ${fresh.length} new, ${confirmed.length} confirmed`)
  if (!confirmed.length) { dry++; rounds.push({ round, found: found.length, fresh: fresh.length, judged, fix: null }); continue }
  dry = 0
  const fix = await agent(`${CONTEXT}
Re-review round ${round}: apply these confirmed findings (each confirmed by at least two of three verifier lenses; their verdicts included). Recommended fix; the safer option for a false pass; keep legitimate narratives passing; every reproduction a named CAS-43/CAS-44 example; update ADR 0086, the design notes the record agent will write, the matrix rows and the synth matrix if behaviour changes (then regenerate with pnpm synth --case). If a fix changes roles-words files or the shard layout, re-run the affected Stryker shards timed under the lock and the gate. Findings: ${JSON.stringify(confirmed)}
Run the changed packages' tests, typecheck, eslint on touched files.
${COMMIT}
${SAVE(`pdc3-fix-r${round}.md`, 'each finding: applied (how) or not (why)')}
${RULES}`, { label: `fixer-r${round}`, phase: 'Re-review', schema: FIX_SCHEMA })
  head = headOf(fix) ?? head
  rounds.push({ round, found: found.length, fresh: fresh.length, judged, fix })
}
if (dry < 1) log(`re-review stopped at the ${MAX_ROUNDS}-round cap before a dry round: the last round's findings are recorded for the PR description`)

// Phase D: capture before/after, UX review, verify, fix, re-capture check.
phase('Capture')
const CAP_SCHEMA = { type: 'object', required: ['before', 'after', 'shots', 'gallery', 'notCaptured'], properties: { before: { type: 'string' }, after: { type: 'string' }, shots: { type: 'string', description: 'each shot id and what it shows' }, gallery: { type: 'string', description: 'the private gallery link or path' }, notCaptured: { type: 'string' } } }
const capPrompt = (afterSha, tag, extra) => `You take before and after screenshots for the UX and brand review of ${CONTEXT}
Follow /home/user/ops/tools/lane-b-screen-tour/README.md "From another lane" and "Set-up and a run" exactly, with TOUR_MINUTES=90; one run at a time; between runs check the server stopped and \`fuser 3297/tcp\` is empty; clean up after. PG18 on 5433 and Chromium must be ready (\`pg_isready -h localhost -p 5433 && ls /opt/pw-browsers >/dev/null\`; if not, run bash /tmp/setup-container.sh until it prints OK). Before: TOUR_REF=${BASE}, TOUR_DIR=${SP}/screens-${tag}-before. After: TOUR_REF=${afterSha} (pushed on co-001/wip-packet-day-counts-2; if the tour insists on a branch, use that ref), TOUR_DIR=${SP}/screens-${tag}-after. TOUR_ONLY: the six existing ids \`p.packet.error-wrong-role.{1280,390,1280-dark}\` and \`p.packet.live-check-pass.{1280,390,1280-dark}\` (tools/lane-b-screen-tour/capture/tour.spec.ts ~2355-2393; route-map entry p.packet "error" (a2), (a3)) plus the new shot's three ids. ${extra}
Shoot at 1280 and 390 px light and 1280 px dark. Tile both runs with /usr/bin/python3 -I tools/lane-b-screen-tour/tile.py. PNGs never go on a branch; share them as a private gallery as the README says. If you change the tour, commit in /home/user/ops (pull --no-rebase first; message ending with a blank line and the lines "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}") and push: \`${GL} git -C /home/user/PhysicalTherapy push origin claude/build-ops\` (if the remote moved, pull --no-rebase and push again). Write screenshot ids in backticks.
${SAVE(`pdc3-capture-${tag}.md`, 'steps done, shot ids, paths, gallery')}
${RULES} (Exception: you may push the tour's own changes to claude/build-ops.)`
const cap = await agent(capPrompt(head, 'a', `Add the missing shot first: a stored synthetic version whose verifier report passed under the old reading but fails the current one, opened by an approver (it must show that the version cannot be approved and why, not "Verifier passed"): \`cap(...)\` in capture/tour.spec.ts plus its entry in /home/user/ops/designs/lane-b-ux-review/route-map.json, following the neighbouring p.packet shots; seed it synthetically the way the tour seeds its other states.`), { label: 'capture', phase: 'Capture', schema: CAP_SCHEMA })

phase('UX review')
const UX_PROMPT = (capture, prior) => `You review as .claude/agents/ux-brand-reviewer.md says (read it whole and follow it: .claude/rules/brand.md, WCAG 2.1 AA with 2.2's additions, the UX baseline review). Adversarial UX and brand review of ${CONTEXT}
The change on screen is the tree at ${head} (read-only for you). What changed on screen: the editor's mismatch words and live check (narrative-editor.tsx, view.ts), and the version page's verifier status and the refusal of request-approval and approve for a stored version the current reading fails (display.tsx, routes/packets.ts, workbench.ts). Screenshots before and after (1280 px light, 390 px light, 1280 px dark): ${JSON.stringify(capture)}. Open every tile with the Read tool. ${prior}
Review the words (plain, specific, telling the person what to do; brand voice; length at 390 px), layout at both widths, dark contrast, focus, the live region, and whether a person can tell what to fix and why a stored version cannot be approved. Also read every string the diff adds to a screen. Give each finding an id UX-n with where it shows (shot id or file:line).
${SAVE('pdc3-ux.md', 'findings so far')}
${RULES}`
const ux = await agent(UX_PROMPT(cap, 'The 2026-10-28 UX review (findings lost) asked for: say what the records hold the figure as; plain words; no rule-release example; mono for counts; shorter items at 390 px; the live region not re-announcing everything on each keystroke; check each was done.'), { label: 'ux-review', phase: 'UX review', schema: REVIEW_SCHEMA })
let uxConfirmed = []
let uxJudged = []
if (ux?.findings?.length) {
  const UXL = [
    { key: 'rules', text: 'the written rules: does .claude/rules/brand.md, CO-11, WCAG 2.1 AA/2.2 or the UX baseline actually require this (quote the rule), or is it taste' },
    { key: 'shots', text: 'the evidence: is the problem visible in the shots or the code exactly as described, at the widths and theme named' },
  ]
  const sets = await parallel(UXL.map((l) => () => agent(`You are a skeptical verifier of UX findings about ${CONTEXT} Screenshots: ${JSON.stringify(cap)} (open the tiles with Read). Your lens: ${l.text}. Try to REFUTE each; default real=false when unsure. Findings: ${JSON.stringify(ux.findings)}
${SAVE(`pdc3-ux-verify-${l.key}.md`, 'verdicts')}
${RULES}`, { label: `ux-verify-${l.key}`, phase: 'UX review', schema: VERDICTS })))
  const votes = {}
  for (const s of sets.filter(Boolean)) for (const v of s.verdicts) (votes[v.id] ??= []).push(v)
  uxJudged = ux.findings.map((f) => ({ ...f, verdicts: votes[f.id] ?? [], confirmed: (votes[f.id] ?? []).filter((v) => v.real).length >= 1 }))
  uxConfirmed = uxJudged.filter((f) => f.confirmed)
}
let fix3 = null
let cap2 = null
let ux2 = null
if (uxConfirmed.length) {
  fix3 = await agent(`${CONTEXT}
Apply these confirmed UX and brand findings (within .claude/rules/brand.md and CO-11; the recommended option): ${JSON.stringify(uxConfirmed)}. Run the web packets tests, typecheck, eslint on touched files, and tools/brand-copy if it covers the files.
${COMMIT}
${SAVE('pdc3-fix-ux.md', 'each finding: applied or not and why')}
${RULES}`, { label: 'fixer-ux', phase: 'UX review', schema: FIX_SCHEMA })
  head = headOf(fix3) ?? head
  cap2 = await agent(capPrompt(head, 'b', 'The new shot already exists in the tour (added by the first capture); only re-run.'), { label: 'capture-2', phase: 'UX review', schema: CAP_SCHEMA })
  ux2 = await agent(UX_PROMPT(cap2, `Check each of these earlier findings is now fixed (report any that is not, same id): ${JSON.stringify(uxConfirmed)}. Report new problems only if they are real and introduced by the UX fixes.`), { label: 'ux-recheck', phase: 'UX review', schema: REVIEW_SCHEMA })
}

// Phase E: the full local suite.
phase('Suite')
const suite = await agent(`Run the full local suite once on ${WT} at its HEAD (${head}; committed). Do not change source files except to fix a failure this PR caused, which you then commit and push to the WIP ref as below and report. Per /home/user/ops/lanes/lane-b.md "How Lane B runs" (read it), each under the lock: pnpm lint; pnpm typecheck; pnpm lint:logs; pnpm verify-content; pnpm test; pnpm test:golden; pnpm test:oracle; pnpm test:db in 4 shards one after another (DATABASE_URL on 5433, PG18; if a cold machine needs a longer *.db.test.ts timeout, only on the command line, and say so); pnpm build; the build stamp (apps/web/scripts/build-stamp.ts --write $(git rev-parse HEAD), as lane-b.md says); pnpm test:e2e with E2E_PREBUILT=1 --workers=2; every packets mutation shard in stryker/shards.json, each timed (report each wall time; any over 15 minutes is a failure to report), then the mutation gate; \`pnpm -s exec tsx tools/screening-capacity/watched.ts --write\` and the synth check (\`pnpm synth --all\`; no diff expected). A failure this PR did not cause: show it fails on origin/claude/build-platform too.
${COMMIT}
${SAVE('pdc3-suite.md', 'each command and its result')}
${RULES}`, { label: 'full-suite', phase: 'Suite', schema: { type: 'object', required: ['results', 'allPassed', 'failures', 'head', 'shardTimes'], properties: { results: { type: 'array', items: { type: 'object', required: ['command', 'result'], properties: { command: { type: 'string' }, result: { type: 'string' } } } }, allPassed: { type: 'boolean' }, failures: { type: 'string' }, head: { type: 'string' }, shardTimes: { type: 'string' } } } })
head = (suite && suite.head) || head

// Phase F: records.
phase('Record')
const record = { critJudged, fixCore, fixWeb, fixStryker, rounds, cap, ux: { review: ux, judged: uxJudged, fix3, cap2, ux2 }, suite, head }
const rec = await agent(`Write the fix round's records on claude/build-ops (/home/user/ops; \`git -C /home/user/ops pull --no-rebase origin claude/build-ops\` first):
1. /home/user/ops/approval-summaries/lane-b-packet-day-counts-fix-round.md, whole and self-contained (the PR description will be written from it): the head ${head}; each original finding id (from ${FINDINGS}) with its resolution and commit; the critic verification; each re-review round (found, new, confirmed, each finding with its verdicts and resolution; whether the loop ended dry or at the cap); the shard split (files, each shard's mutants, score and wall time; the gate); the capture (shot ids, gallery link) and the UX review with its verification, fixes and recheck; the full suite table (command, result); anything "for Lane A"; anything not fixed and why.
2. In /home/user/ops/designs/lane-b-packet-day-counts.md, a new section "Fix round (2026-11-01)" after "Review and departures (the build, 2026-10-28)" (section 7 is "Coordination"; do not renumber): what changed in the design's rules and why (one role per figure, quotes, year leads, the approval path, the shard split), departures, and results; point to the two files above.
No model name or identifier anywhere. Commit (message ending with a blank line and "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}") and push: \`${GL} git -C /home/user/PhysicalTherapy push origin claude/build-ops\` (if the remote moved: pull --no-rebase, push again; never force).
The round's data: ${JSON.stringify(record)}
Return the commit pushed and a 10-line summary.`, { label: 'record', phase: 'Record', schema: { type: 'object', required: ['commit', 'summary'], properties: { commit: { type: 'string' }, summary: { type: 'string' } } } })
return { head, rec, suiteAllPassed: suite?.allPassed ?? null, suiteFailures: suite?.failures ?? 'suite agent failed', shardTimes: suite?.shardTimes ?? null, roundsSummary: rounds.map((r) => ({ round: r.round, found: r.found, fresh: r.fresh, confirmed: r.judged.filter((f) => f.confirmed).length })), dryEnd: dry >= 1, ux: { findings: ux?.findings?.length ?? null, confirmed: uxConfirmed.length, recheck: ux2?.findings?.length ?? null }, notApplied: { core: fixCore?.notApplied, web: fixWeb?.notApplied, stryker: fixStryker?.notApplied }, forLaneA: [fixCore?.forLaneA, fixWeb?.forLaneA].filter(Boolean) }
