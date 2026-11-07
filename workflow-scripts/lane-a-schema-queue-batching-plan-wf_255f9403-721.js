export const meta = {
  name: 'schema-queue-batching-plan',
  description: 'Acting Lane A, read-only: scout every item in the schema queue after #126, propose batched schema PRs (related tables/functions), adversarially critique the grouping, loop until the critic finds nothing new',
  phases: [
    { title: 'Scout', detail: 'one read-only scout per queue item: tables, functions, migrations, state, risk, dependencies' },
    { title: 'Plan', detail: 'two independent groupings, judged; synthesis' },
    { title: 'Critique', detail: 'completeness critic and risk skeptic; loop until dry' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/6af08ef9-734c-5d6d-a787-51ade7156d78/scratchpad'
const OPS = '/home/user/ops'
const COMMON = `Repository PureTideWater/PhysicalTherapy (PaidWhole). READ-ONLY: write nothing in any worktree or on GitHub (gh api / git ls-remote reads only); scratch notes only under ${SP}/plan/. The base is origin/claude/build-platform (fetch it in /home/user/PhysicalTherapy, read with git show / git grep on origin/claude/build-platform). Docs on claude/build-ops are in ${OPS} (LANES.md, lanes/, designs/, approval-summaries/). Context: this session is acting Lane A (S2), running the schema chain one schema PR at a time; every schema PR (a migration or a regenerated docs/product/domain-model.md) needs the founder's committed approval line, so each costs a founder approval cycle. The orchestrator's standing rule (2026-11-06 22:45 UTC): batch queue items that touch related tables or functions into one schema PR where review risk allows; record the grouping and why; never more than one schema PR open. Fixed order so far: #126 (interest once, in flight) first; then password-changed-notice; then the SUITE-CAP-3 ledger-function bodies (founder GRANTED 2026-11-06 ~22:45 UTC, exactly as ${OPS}/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md, one migration, CREATE OR REPLACE of ledger_line_net and ledger_entry_rules only); then ${OPS}/lanes/lane-a-handoff-to-lane-b-2026-11-05.md section 4's queue in order. Freeze rules: the ledger freeze stands except founder-granted exceptions; any ledger change beyond a grant is the founder's. CLAUDE.md's four rules hold.`
const SCOUT = { type: 'object', properties: { item: { type: 'string' }, state: { type: 'string' }, branch_or_design: { type: 'string' }, tables: { type: 'array', items: { type: 'string' } }, functions: { type: 'array', items: { type: 'string' } }, other_files: { type: 'array', items: { type: 'string' } }, needs_migration: { type: 'boolean' }, depends_on: { type: 'array', items: { type: 'string' } }, founder_gates: { type: 'array', items: { type: 'string' } }, review_risk: { type: 'string' }, deploy_order_constraints: { type: 'string' }, size: { type: 'string' }, notes: { type: 'string' } }, required: ['item', 'state', 'tables', 'functions', 'needs_migration', 'founder_gates', 'review_risk'] }
const ITEMS = [
  { key: 'pwnotice', d: `password-changed-notice (ADR 0091, SGN-16): ${OPS}/designs/lane-a-auth-emails.md, ${OPS}/approval-summaries/lane-a-auth-emails-status.md (+ -review, -fix-round, -verification), branch co-001/password-changed-notice if on origin (git ls-remote). A password_notice table filled by an AFTER INSERT trigger on audit_event password_reset_completed; tp_operator claim functions; kind password_changed on the transactional stream.` },
  { key: 'ledgerbodies', d: `SUITE-CAP-3's ledger-function bodies (granted): ${OPS}/approval-summaries/lane-b-suite-cap-3-freeze-exception-ask.md, ${OPS}/designs/lane-b-suite-cap-3-reconcile.md (sections 1.5, 8.3a, 8.4, 14.1), ${OPS}/approval-summaries/lane-b-suite-cap-3-status.md, WIP co-001/wip-suite-cap-3. Which part is the migration (Lane A's) vs SUITE-CAP-3's app-code PR (Lane B's); whether the migration can or must ship with or before the app code.` },
  { key: 'verifier3', d: `#84's tp-packet-verifier/3 migration (packet-figure-placeholders slice 3 builds on it): ${OPS}/designs/lane-b-packet-figure-placeholders.md, ${OPS}/approval-summaries/lane-b-packet-figure-placeholders-status.md, LANES.md "Handed to Lane A".` },
  { key: 'pr85', d: `#85's design section 7.2 items 1 to 5 (UX PR 10, payer response): find the design (${OPS}/designs/*payer-response*; LANES.md; lanes/lane-b-item-prompts-2026-11-01/ux-payer-response.md) and list each item's schema change.` },
  { key: 'f9', d: `#93's F9: roi_links_valid()'s fifth key. Find #93 (gh api repos/PureTideWater/PhysicalTherapy/pulls/93 read-only), its F9 finding, and the function on the base.` },
  { key: 'relink', d: `Relinking an app row to a new Cognito subject (#125's stuck-invitee note): find #125's note (gh api pulls/125, ADR 0081, LANES.md) and the tables/functions it needs.` },
  { key: 'handed', d: `The rest of LANES.md "Handed to Lane A" (every open item not merged or claimed elsewhere: e.g. SS-01's (a) suspension mail + Q13, (b) the tp_app status REVOKE after deploy, N1 the interest "allocated" flag, the renumbered-reversal link, others). For each: still open?, its schema change, tables/functions, founder gates.` },
]

phase('Scout')
const scouts = await parallel(ITEMS.map(it => () => agent(`${COMMON}

You scout ONE schema-queue item: ${it.d}
Report exactly: its state (designed? built? branch head? reviewed?), every table, function, trigger, policy and index it would create or change (verify against the base's migrations and packages/db/functions), whether it needs a migration, its dependencies on other items or PRs, founder gates (rulings, freeze exceptions, approvals beyond the domain-model line), review risk (money, PHI, auth, tenancy), deploy-order constraints (e.g. must ship before/after app code; safe with the previous image), and size. Cite file paths and commits.`, { label: `scout: ${it.key}`, phase: 'Scout', schema: SCOUT })))
const S = scouts.filter(Boolean)
log(`scouted ${S.length}/${ITEMS.length}`)

phase('Plan')
const PLAN = { type: 'object', properties: { prs: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, items: { type: 'array', items: { type: 'string' } }, why_together: { type: 'string' }, reviews: { type: 'array', items: { type: 'string' } }, founder_gates: { type: 'array', items: { type: 'string' } }, risk: { type: 'string' } }, required: ['name', 'items', 'why_together', 'reviews'] } }, kept_apart: { type: 'array', items: { type: 'string' } }, open_questions: { type: 'array', items: { type: 'string' } } }, required: ['prs', 'kept_apart'] }
const angles = ['fewest founder approval cycles, batching wherever tables or functions are related and review risk stays bounded', 'lowest review and deploy risk per PR: batch only items that share tables/functions AND the same risk class and deploy constraints']
const plans = await parallel(angles.map((a, i) => () => agent(`${COMMON}

Scout reports: ${JSON.stringify(S).slice(0, 40000)}
Propose the ordered list of schema PRs after #126, optimizing for: ${a}. Respect the fixed order (password-changed-notice next; the granted ledger bodies after it; then section 4's order) unless batching moves an item EARLIER into a PR that already must open (say so and why); never put two schema changes together where one would block the other's merge on a founder gate it does not need; a freeze exception covers only its own text. For each PR: items, why together, the reviews it needs (two adversarial for db/money/PHI/auth), founder gates, risk. List items kept apart and why.`, { label: `plan ${i + 1}`, phase: 'Plan', schema: PLAN })))
const P = plans.filter(Boolean)
const synth = await agent(`${COMMON}

Two candidate plans: ${JSON.stringify(P).slice(0, 30000)}
Scout reports: ${JSON.stringify(S).slice(0, 30000)}
Judge them on: founder approval cycles saved, review risk, deploy safety, merge-blocking risk (a batched item waiting on a gate holds the whole PR), and time to value. Synthesize ONE plan (best of both), with reasons per grouping.`, { label: 'synthesize plan', phase: 'Plan', schema: PLAN })

phase('Critique')
let plan = synth
const seen = new Set()
let rounds = 0
const CRIT = { type: 'object', properties: { issues: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, what: { type: 'string' }, evidence: { type: 'string' }, fix: { type: 'string' } }, required: ['id', 'what', 'evidence', 'fix'] } } }, required: ['issues'] }
while (rounds < 3 && plan) {
  rounds++
  const crits = await parallel([
    () => agent(`${COMMON}\n\nYou are a completeness critic. Plan: ${JSON.stringify(plan).slice(0, 20000)}\nScouts: ${JSON.stringify(S).slice(0, 25000)}\nWhat is missing or wrong: an open "Handed to Lane A" item not placed; a dependency or deploy-order constraint broken; a founder gate not named; an item already merged or claimed by someone else; a wrong table/function claim (verify against the base). Report only issues with evidence; issues already raised: ${JSON.stringify([...seen]).slice(0, 4000)}`, { label: `critic r${rounds}`, phase: 'Critique', schema: CRIT }),
    () => agent(`${COMMON}\n\nYou are a risk skeptic. Plan: ${JSON.stringify(plan).slice(0, 20000)}\nTry to show a grouping is unsafe: a batched item that widens a freeze exception beyond its text, mixes a money change with an unrelated auth change so one review lens misses the other, makes a PR wait on a gate only one item needs, or breaks safe-with-previous-image deploys. Report only issues with evidence; issues already raised: ${JSON.stringify([...seen]).slice(0, 4000)}`, { label: `skeptic r${rounds}`, phase: 'Critique', schema: CRIT }),
  ])
  const fresh = crits.filter(Boolean).flatMap(c => c.issues || []).filter(x => !seen.has(x.what))
  if (!fresh.length) break
  fresh.forEach(x => seen.add(x.what))
  const revised = await agent(`${COMMON}\n\nRevise the plan for these issues (verify each against the evidence; reject with reason if wrong): ${JSON.stringify(fresh).slice(0, 15000)}\nPlan: ${JSON.stringify(plan).slice(0, 20000)}`, { label: `revise r${rounds}`, phase: 'Critique', schema: PLAN })
  if (revised) plan = revised
}
log(`critique rounds: ${rounds}; issues seen: ${seen.size}`)
return { scouts: S, plans: P, plan, issues: [...seen] }
