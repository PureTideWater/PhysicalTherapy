export const meta = {
  name: 'lane-b-ux-home-figures-reviews',
  description: 'PR #93: payment-engine review; after shots then the UX and brand review; loop until dry; each finding verified by an independent skeptic',
  phases: [
    { title: 'Review', detail: 'payment-engine reviewer; capture-after then UX and brand reviewer, fresh clones; a second round until dry' },
    { title: 'Verify', detail: 'one independent skeptic per finding' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/e9e32b44-ea9a-56f5-83b4-9164e617462b/scratchpad'
const HEAD = args.head
const BASE = args.base
const BEFORE = '83d71fd6'
const SESSION = 'https://claude.ai/code/session_01FcouKPLmdYyBmbVaUjag2c'
const COMMON = `You work on PR #93 of the PaidWhole build (PureTideWater/PhysicalTherapy), draft, branch co-001/ux-home-figures at ${HEAD}, base claude/build-platform ${BASE}: UX PR 9, "one actionable figure on the home and the ROI statement; the Recovered tile names its period" (UX-003, UX-015, UX-140; ADR 0082). The design is /home/user/ops/designs/lane-b-ux-home-figures.md (its last section, the dispositions F1-F13, wins over the sections above); the PR description is in ${SP}/pr93-body.md (and on GitHub); PR #42's files are listed in ${SP}/pr42-files.txt (re-check: git -C /home/user/PhysicalTherapy fetch -q origin co-001/pr-06b-mail-streams and diff its merge base; #42's session may have merged the base in).
Rules: read-only on the product: you never edit, commit or push in the PR's worktree (/home/user/ux-home-figures) or branch. Work in your own fresh clone: git clone -q --branch co-001/ux-home-figures https://github.com/PureTideWater/PhysicalTherapy <your dir under ${SP}> and check out ${HEAD}; if you need to run code, pnpm install --frozen-lockfile there. export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH in every command; every heavy command (install, typecheck, tests, builds, e2e, the screen tour) only under flock /tmp/laneb-heavy.lock, long ones with run_in_background and waited on by notification. db tests on PostgreSQL 18: DATABASE_URL=postgres://postgres:test@localhost:5433/postgres (5432 is PostgreSQL 16). Synthetic data only. No model identifier in any file you write.
Be adversarial: try to break the change. Every finding cites file:line at ${HEAD}, gives a concrete failure (input or state, then what goes wrong), its severity (blocking: wrong, unsafe, inaccessible or misleading; should-fix: a real defect of lesser harm; nit: polish), and the exact fix. Also say what you checked and found sound. Improve as you go: a better option is a finding with its fix.`
const SAVE = (file, what) => `Save as you go: keep ${SP}/progress/${file} up to date (${what}). If it already exists when you start, an earlier run of yours was interrupted: read it, trust what it holds unless the code says otherwise, and continue from where it stopped.`
const FINDINGS = { type: 'object', properties: { findings: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit'] }, file: { type: 'string' }, line: { type: 'number' }, title: { type: 'string' }, failure: { type: 'string' }, fix: { type: 'string' }, rule: { type: 'string' } }, required: ['id', 'severity', 'file', 'line', 'title', 'failure', 'fix', 'rule'] } }, checkedSound: { type: 'array', items: { type: 'string' } }, notSeen: { type: 'array', items: { type: 'string' } }, freezeException: { type: 'string' }, summary: { type: 'string' } }, required: ['findings', 'checkedSound', 'notSeen', 'summary'] }
const CAPTURE = { type: 'object', properties: { tourDir: { type: 'string' }, tilesIndex: { type: 'string' }, shots: { type: 'number' }, failed: { type: 'array', items: { type: 'string' } }, pairs: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, before: { type: 'string' }, after: { type: 'string' }, note: { type: 'string' } }, required: ['id', 'before', 'after', 'note'] } }, notes: { type: 'array', items: { type: 'string' } } }, required: ['tourDir', 'tilesIndex', 'shots', 'failed', 'pairs', 'notes'] }
const VERDICT = { type: 'object', properties: { real: { type: 'boolean' }, severity: { type: 'string', enum: ['blocking', 'should-fix', 'nit', 'not a defect'] }, reasoning: { type: 'string' }, fix: { type: 'string' } }, required: ['real', 'severity', 'reasoning', 'fix'] }

const ENGINE = `You are the payment-engine review, one of the PR's two adversarial reviews. Read .claude/agents/payment-engine-reviewer.md in your clone and apply its checklist whole, as a default agent (floats, rounding, traces that cannot recompute, ledger totals including approved-but-unposted, model output reaching a number or stage, golden lines and property tests). Then attack this change specifically:
- the predicate (apps/worker/src/triage/actionable-now.ts): its rows against today's (the base's lib/triage/queries.ts:347-363); the CASE guard; the OFFSET 0 fence; the practice_id match; null stage; written off; moved_on/stale partition (every open line not in the figure has exactly one cause); bigint sums and their parse in TypeScript (parseCents/sumCents, never Number); RLS (does every read run in the practice scope as tp_app);
- the ROI statement's figure (reconcile/statements.ts generateRoiStatement, OPEN_CASES_ACTIONABLE): same case set as the home and Cases; the CHECK (actionable_open_cents >= 0) can never fail; recomputeStatement and roi_statement_rules still accept; the statement page and PDF words;
- the digest's figure (digest/figures.ts DIGEST_QUERIES.deadlines) and JOB-03's PHI check;
- recoveredPeriods/practiceRecoveredPeriods: Recovered only from ledger entries at posted or deposited by proof level; reversals across the quarter boundary; firstOn from the counted entries only (never an approval); the property test's strength;
- the home's HOME_CASES statement and headline arithmetic (F10), casesByState shape, deadlines;
- that packages/pricing, packages/ledger and packages/db have an empty diff (git diff ${BASE}..${HEAD} --stat -- those paths) and no migration;
- and decide, with reasons, whether redefining roi_statement.actionable_open_cents and the digest's stored totals_cents.cases_nearing_deadline_actionable from ADR 0082's date needs a freeze exception (the engine freeze: no non-test change under packages/pricing; the ledger: additions only; LANES.md "Not while #42 is open"); put your answer in freezeException.
Run the money-relevant tests in your clone if useful (recovered-periods.test.ts, actionable-now.db.test.ts, pricing-current-routes, reconciliation-routes, home-figures, packages/ledger's roi/statement/rules tests), under the lock.`

const UXR = (shots) => `You are the UX and brand review, one of the PR's two adversarial reviews. Read .claude/agents/ux-brand-reviewer.md in your clone and apply it whole, as a default agent with that checklist. The shots: before at ${BEFORE} (the PR's base when it was built; the base has since gained #82 and #83, merged in at ${HEAD}) in ${SP}/hom-screens-before (tiles/index.json, shots.json), after at ${HEAD} in ${SP}/hom-screens-after; the capture's result: ${JSON.stringify(shots).slice(0, 6000)}. Look at every tile of every pair with the Read tool (images), at 1280 and 390 light and 1280 dark. The baseline's findings this closes are UX-003, UX-015 and UX-140 in /home/user/ops/designs/lane-b-ux-review.md (and its section 6.1 words; pull claude/build-ops first). The sample is the design's §5 screens; anything changed outside it is "not seen, by sample".
Attack specifically: every new or changed string against .claude/rules/brand.md, docs/brand/BRAND.md and tools/brand-copy (run pnpm lint:copy); "Recovered" always with posted or deposited; no "stage five" left in a read text this PR touches; the out-of-figure words (counted(), 0/1/2, each cause shown only above 0) on the tile, the case page and the packet builder; the Recovered tile's "to date, since <date>" and "This quarter (YYYY-QN)" (date style, WholeDates, no break at 390 px, data-figure ids); the Payer approved notes and LEDGER_TOTALS_HELP by proof level; the ROI page and PDF words (F9) and the empty approval line; the Cases header and cell (F5); the case page's Actionable fact and Net expected value; the empty home's three states (open, no BAA, paused) and F12's link rule (any role but viewer), including the no-BAA state the tour cannot shoot (read headline.test.tsx's render); whether LEDGER's home now shows the same actionable amount as its newly generated ROI statement and Cases (the defect UX-003 named: $0.00 vs $30.00); the e2e HOM-04's assertions; focus, headings, landmarks and contrast in light and dark.`

const capture = () => agent(`${COMMON}
${SAVE('hom-capture-after.md', 'each step, command and result')}
You take the AFTER screenshots for the UX and brand review. The BEFORE run is done: ${SP}/hom-screens-before (its shots.json, tiles/index.json), at ${BEFORE}; its agent's result is ${SP}/capture-before-result.json (read its notes: they give the exact TOUR_ONLY string, the tile.py prefixes and /usr/bin/python3 -I for tile.py). The tour is /home/user/ops/tools/lane-b-screen-tour (README "From another lane" and "Set-up and a run"); pull claude/build-ops first (git -C /home/user/ops pull --no-rebase -q origin claude/build-ops).
Run: TOUR_DIR=${SP}/hom-screens-after, TOUR_REF=${HEAD}, the same TOUR_ONLY as the before run, setup.sh, build, serve, run.sh, stop, check the lock and server ended together (README step 5), clean up (step 6), tile with /usr/bin/python3 -I tools/lane-b-screen-tour/tile.py <TOUR_DIR> <the same prefixes>. If a head shot fails because the tour's spec does not fit the head (not because the product is wrong), fix the spec on claude/build-ops (version-tolerant, so the base still works), push it (pull first; GITLEAKS=/root/.cache/paidwhole/gitleaks/8.24.3/gitleaks git -C /home/user/PhysicalTherapy push origin claude/build-ops; never force or --no-verify; commits end with a blank line, then "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" and "Claude-Session: ${SESSION}"), and retake. A product defect you see is a note for the reviewer, never a spec workaround. PNGs and tiles never go on a branch.
Return: the TOUR_DIR, the tiles index, the shot count, failed or skipped shots with reasons, and the before/after pairs (one per id: before tile folder or file, after tile folder or file, and a one-line note of what changed), plus notes.`, { label: 'capture-after', phase: 'Review', schema: CAPTURE })

const review = (lens, body, round, seen) => agent(`${COMMON}
${SAVE(`hom-review-${lens}-r${round}.md`, 'what you checked, findings so far')}
${body}
${round > 1 ? `ROUND ${round} (loop until dry). Earlier rounds already reported these findings; do not repeat them, look for what they missed (other files of the diff, other states, other inputs): ${JSON.stringify(seen).slice(0, 8000)}` : ''}
Return findings per the schema; notSeen lists what neither shots nor code showed.`, { label: `review-${lens}-r${round}`, phase: 'Review', schema: FINDINGS })

const verify = (finding, lens) => agent(`${COMMON}
${SAVE(`hom-verify-${lens}-${finding.id}.md`, 'what you checked and your verdict')}
You are an independent skeptic. A ${lens} reviewer of PR #93 reported this finding; try to REFUTE it from the code at ${HEAD} (and, where it is about what a person sees, the shots in ${SP}/hom-screens-after and ${SP}/hom-screens-before). Default to not real if it cannot be shown to happen with a realistic input or state, or if the cited code does not do what it says. If it is real, say whether its severity is right and whether its fix is the best one, or give a better one.
Finding: ${JSON.stringify(finding)}`, { label: `verify-${lens}-${finding.id}`, phase: 'Verify', schema: VERDICT })

// One reviewer, looped until a round brings nothing new that survives its skeptic (at most 3 rounds).
// A review that returns nothing (null: the agent died) is a refusal: the run reports it, never a pass.
const loop = async (lens, bodyOf) => {
  const rounds = []
  const all = []
  for (let round = 1; round <= 3; round++) {
    const r = await review(lens, bodyOf, round, all.map((f) => ({ id: f.id, title: f.title, file: f.file, line: f.line })))
    if (r === null) { rounds.push({ round, refused: 'the review returned nothing' }); break }
    const fresh = (r.findings ?? []).map((f) => ({ ...f, id: `${lens}-r${round}-${f.id}` }))
    const judged = (await parallel(fresh.map((f) => () => verify(f, lens).then((v) => ({ ...f, verdict: v }))))).filter(Boolean)
    all.push(...judged)
    rounds.push({ round, summary: r.summary, checkedSound: r.checkedSound, notSeen: r.notSeen, freezeException: r.freezeException, found: fresh.length, real: judged.filter((f) => f.verdict?.real).length })
    if (!judged.some((f) => f.verdict?.real)) break
    log(`${lens}: round ${round} found ${judged.filter((f) => f.verdict?.real).length} real; another round`)
  }
  return { rounds, findings: all }
}

phase('Review')
const [engine, ux] = await parallel([
  () => loop('engine', ENGINE),
  () => capture().then((shots) => (shots === null ? { refused: 'the after capture returned nothing' } : loop('ux', UXR(shots)).then((r) => ({ ...r, shots })))),
])
return { engine, ux }
