export const meta = {
  name: 'lane-b-ux-synthesis',
  description: 'UX baseline review: review the retaken shots, deduplicate and verify every finding, rank them, group them into PRs in landing order, one adversarial review and a fact check, then resolve every point',
  phases: [
    { title: 'Retake', detail: 'one reviewer, all five lenses, on the 22 retaken shots' },
    { title: 'Cluster', detail: 'group the findings by root cause, so each problem appears once' },
    { title: 'Write', detail: 'two writers: one verified canonical finding per cluster' },
    { title: 'Plan', detail: 'rank, group into PRs in landing order, write designs/lane-b-ux-review.md' },
    { title: 'Review', detail: 'one adversarial reviewer on the rules, one fact checker on the code' },
    { title: 'Revise', detail: 'every review point applied or rejected with its reason' },
  ],
}

const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/2c852daf-87b1-515e-ade9-06adce7d5ec8/scratchpad'
const UX = SP + '/ux'
const SY = UX + '/synth'
const OPS = '/home/user/ops'
const DOC = OPS + '/designs/lane-b-ux-review.md'
const SAVE = (file) => `Save as you go: keep ${SY}/progress/${file} current after each step, so an interruption loses nothing. If it exists when you start, an earlier run of yours was interrupted: read it, trust it unless the code says otherwise, and continue from where it stopped.`
const RULES = `Context: Lane B of the PaidWhole build (CLAUDE.md is in your context). This is the UX/UI and brand baseline review. Its brief is ${OPS}/designs/lane-b-ux-review-brief.md; read its "What it judges against", "Method" steps 3 to 5 and "Not in it". Lane rules: ${OPS}/LANES.md (read rules 1 to 12, the Claims table and "Handed to Lane A").
The inputs:
- Eleven expert reviewers (brand; flows, practice and other; words, practice and other; accessibility in three sets; 390 px and states in three sets) looked at 857 screenshots and the code behind them. Their findings are in ${UX}/findings/<lens>.json, in the form ${UX}/reviewer-common.md describes. The lens is a finding id's prefix before its last -NN.
- The capture's coverage: ${OPS}/designs/lane-b-ux-review/coverage.md and route-map.json.
- The screenshots were taken from claude/build-platform 6ddd587. The tip is now 4d99df8: PR #47 (audit #135, the bank account shown first) merged as c5195ee, then PR #46 (audit #111, readable database-function diffs, no screen changed) as 4d99df8. #47 changed apps/web/src/app/p/[practiceId]/settings/page.tsx, apps/web/src/app/settings/billing/[organizationId]/page.tsx, apps/web/src/components/billing/*, apps/web/src/lib/routes/billing.ts. The checkout /home/user/PhysicalTherapy is at 4d99df8 and stays there for this run: read the code there and cite file:line as it reads at 4d99df8.
- Work in flight in Lane B, where a finding inside that item's scope folds in rather than becoming a new PR: #38 every figure explained in words (packets, packet review, line-trace pages) and #48 a narrative draft survives sign-out (packet pages), one session, designed, building; #46 the Verified seal (ROI pages), queued in the 15b session; PR #51, audit #12, ledger amounts in payment terms; PR #50, audit #10, a superseded re-run cannot be accepted; audit #32, one unmapped plan no longer freezes a month (mapping and coverage), designing; PR #49, the release content checks; PR #48, ci-deps (no screens); #84 and #120, the model evaluation gate and the contract PHI check (gateway and console model pages), building; co-001/materiality-cents, in design, which already owns the materiality settings page showing cents as dollars (narrow-practice-2-02, flows-practice-01) and the console's model budget typed in cents (words-other-21, flows-other-10's budget part). Lane A's open PR #42 (mail streams) changes the 143 files in ${SP}/pr42-files.txt; Lane A's PR 7 carries audit #103 (every route's accessibility under WCAG 2.2).
- Rules that bind the proposals: Lane B never opens a pull request with a migration, so any part that needs DDL goes to Lane A under "Handed to Lane A". A no-migration fix that changes a file in pr42-files.txt stays in Lane B's queue, marked "after #42 merges". No engine (packages/pricing), ledger (packages/ledger) or content-pipeline change inside a UX pull request (the freezes). CLAUDE.md's four rules and its never-list hold.
- Who decides: wording and visible changes take the recommended option without asking, and are reported afterwards in one list (the co-founder's ruling, 2026-10-25 ~21:34 UTC); so do cost and security trade-offs (security: the safer). The founder keeps: legal text (the terms, the cookie notice, the screening terms, the AMA notice, anything on HANDOFF.md's counsel list), reversing a recorded founder ruling (for example reconciliation-001.md:309, D9 item 3, "dark mode stays off"), palette changes (the brand owner's, ADR 0058 D9), the domain model, release tags and owner-admin settings. Those go to the founder through the co-founder, as a question with options and a recommendation.
- The standing rule: recommend only the best option, never weighted by build effort, judged on accuracy, quality, user experience, security and privacy, compliance, reliability and maintainability.
Rules for you: synthetic data only. Read-only on /home/user/PhysicalTherapy and on GitHub (gh api GET only). Write only the files your task names. Never run git add, commit, push, checkout, reset, stash or fetch: the orchestrator commits. No heavy command (no build, test, install or server). Every shell command starts with export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. No model name in any file. The style is the repository's: plain words, short sentences, file:line evidence, the person's view first. In any markdown you write, wrap every shot id, route, file path and code name in backticks: the push's secret scan (gitleaks' generic-api-key rule) otherwise reads a shot id such as support-access.1280 followed by a comma and another id as a key and value, and refuses the push.`

const CANON = `A canonical finding is JSON: {"cid", "title", "severity": "blocking"|"should_fix"|"polish"|"dropped", "roles": [personas], "screens": [at most 8 shot ids, the clearest first], "routes": [patterns], "evidence": merged and deduplicated, file:line at 4d99df8, "rule": file:line or WCAG success criterion, or "no written rule; recommended" where the rules are silent, "bestFix": one specific fix (components, tokens, exact words), the best option never weighted by build effort, "size": "S"|"M"|"L", "files": [paths], "needsMigration": bool, "migrationPart": exactly what needs DDL, else "", "touches42": true only when a path in files is in pr42-files.txt (check each path), "inFlight": "" or the item it folds into, "decision": "" | "wording" (a wording or brand choice taken under the co-founder's ruling; state the chosen words or style) | "founder" (say which founder-kept matter and why), "sources": [every member id], "verification": "confirmed" | "corrected: <what>" | "not reproduced: <why>", "notes"}.`

phase('Retake')
const retake = await agent(`${RULES}

Task: review the 22 retaken screenshots with all five lenses (brand, flows, words, accessibility, 390 px and states), as the other reviewers did for theirs. ${SAVE('retake.jsonl')} Save each finding as one JSON line there.
- The shots: ${SP}/screens/batches/retake.json (shots.json entries with their png paths). The image checkers' verdicts: ${SP}/screens/verify/retake.json, or ${SP}/progress/check-retake.jsonl if that file is missing. Shots still flagged as capture faults are not product findings; list them in your result.
- Open every PNG with the Read tool and read the code behind each screen (the route map gives the page file).
- Before filing, read ${SY}/index.md, the compact list of every finding so far, and file only what is new. If a retaken shot is better evidence for an existing finding, record that in your result's evidence list instead of filing it again.
- Findings take the reviewers' form (${UX}/reviewer-common.md, "EACH FINDING"), with ids retake-NN and lens "retake". Write them all as a JSON array to ${UX}/findings/retake.json (an empty array if none).`, { label: 'retake-review', phase: 'Retake', schema: {
  type: 'object',
  properties: {
    findings: { type: 'number' },
    ids: { type: 'array', items: { type: 'string' }, description: 'the id of every finding written to retake.json' },
    newEvidence: { type: 'array', items: { type: 'object', properties: { findingId: { type: 'string' }, shot: { type: 'string' }, note: { type: 'string' } }, required: ['findingId', 'shot', 'note'] } },
    stillFaulty: { type: 'array', items: { type: 'string' } },
  },
  required: ['findings', 'ids', 'newEvidence', 'stillFaulty'],
} })
if (!retake) throw new Error('The retake reviewer returned nothing.')

phase('Cluster')
const clusterTask = (extra) => `${RULES}

Task: group the findings by the problem they describe, so each real problem appears once. ${SAVE('cluster.md')}
- Inputs: ${SY}/index.md (every reviewer finding, compact) and ${UX}/findings/retake.json (the retake reviewer's, ${retake.findings} of them; add them). Open the full entries in ${UX}/findings/<lens>.json whenever the compact line cannot tell you whether two findings share a cause and a fix.
- Put findings in one cluster only when they share the root cause and one fix closes all of them; for example every lens that reports ActionForm's reset of a refused form is one cluster. Keep different problems on the same screen in separate clusters. A finding that bundles two problems goes in the cluster of its main problem; name the second problem in that cluster's alsoCovers, and make sure some cluster owns it.
- Each cluster: cid (C-001 onward), a plain title, severity (the highest member's, unless the members' evidence shows that is wrong; then say why), theme (one of forms-and-errors, navigation-and-shell, money-and-figures, tables-and-390, words-and-copy, accessibility-semantics, brand-and-visual, dark-mode, sign-in-and-account, console-and-operations, screening-and-public, notices-and-status, states, other), members (finding ids), alsoCovers, conflicts (where members disagree on facts, severity, migration, #42 or in-flight, for the writer to settle from the code), and writer "A" or "B".
- Writers: A takes forms-and-errors, navigation-and-shell, accessibility-semantics, sign-in-and-account, states, tables-and-390 and dark-mode; B takes money-and-figures, words-and-copy, brand-and-visual, console-and-operations, screening-and-public, notices-and-status and other. If either ends up with more than 55% of all member ids, move whole themes until neither does.
- Every finding id belongs to exactly one cluster. The full list is ${SY}/ids.json plus the retake ids.${extra}
Write ${SY}/clusters.json (an array) and return every cluster's cid, theme, writer and members.`
const CLUSTERS = { type: 'object', properties: { clusters: { type: 'array', items: { type: 'object', properties: { cid: { type: 'string' }, theme: { type: 'string' }, writer: { type: 'string', enum: ['A', 'B'] }, members: { type: 'array', items: { type: 'string' } } }, required: ['cid', 'theme', 'writer', 'members'] } } }, required: ['clusters'] }
let clustered = await agent(clusterTask(''), { label: 'cluster', phase: 'Cluster', schema: CLUSTERS })
if (!clustered) throw new Error('The clusterer returned nothing.')
const CHECK = { type: 'object', properties: { expected: { type: 'number' }, placed: { type: 'number' }, missing: { type: 'array', items: { type: 'string' } }, duplicates: { type: 'object' }, unknown: { type: 'array', items: { type: 'string' } } }, required: ['expected', 'placed', 'missing', 'duplicates', 'unknown'] }
const check = (n) => agent(`Run exactly this command and return its JSON output as your result, field for field, changing nothing: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH && python3 -I ${UX}/check-clusters.py ${SP}`, { label: `cluster:check-${n}`, phase: 'Cluster', schema: CHECK, effort: 'low' })
let coverage = await check(1)
for (let round = 2; coverage && (coverage.missing.length || coverage.unknown.length || Object.keys(coverage.duplicates).length) && round <= 3; round++) {
  log(`Cluster coverage: ${coverage.placed}/${coverage.expected} placed, ${coverage.missing.length} missing, ${Object.keys(coverage.duplicates).length} in two clusters, ${coverage.unknown.length} unknown`)
  clustered = await agent(clusterTask(`\n- A script check of ${SY}/clusters.json found: missing from every cluster: ${coverage.missing.join(', ') || 'none'}; in more than one cluster: ${JSON.stringify(coverage.duplicates)}; ids that are not findings: ${coverage.unknown.join(', ') || 'none'}. Read the file, place each missing id, keep each duplicated id in one cluster only, correct or remove the unknown ids, and rewrite the file.`), { label: `cluster:fix-${round}`, phase: 'Cluster', schema: CLUSTERS })
  if (!clustered) throw new Error('The clusterer returned nothing on a fix pass.')
  coverage = await check(round)
}
if (!coverage || coverage.missing.length || coverage.unknown.length || Object.keys(coverage.duplicates).length) throw new Error(`Cluster coverage still incomplete: ${JSON.stringify(coverage)}`)
log(`Cluster coverage: all ${coverage.expected} findings placed once`)
const counts = { A: 0, B: 0 }
for (const c of clustered.clusters) counts[c.writer] += c.members.length

phase('Write')
const writer = (w) => agent(`${RULES}

Task: you are writer ${w}. Write one verified canonical finding for each cluster in ${SY}/clusters.json whose writer is "${w}" (${clustered.clusters.filter((c) => c.writer === w).length} clusters, ${counts[w]} member findings). ${SAVE(`write-${w}.jsonl`)} Save each canonical finding there as one JSON line as you finish it.
- For each cluster, read every member's full entry in ${UX}/findings/<lens>.json (retake ids are in retake.json), and settle the cluster's conflicts from the code.
- Verify against the code at 4d99df8. For every blocking cluster, and every cluster with a migration, #42 or in-flight claim, open each cited file:line yourself and confirm, correct or drop it. For the rest, check at least the root-cause citation. Where #47 changed the file, check whether #47 already fixed it. A claim you cannot reproduce makes the finding "dropped", with the reason.
- The fix is the best option. Where members propose different fixes, choose on the evidence and say why in notes. Where the brand's rules are silent, say so and recommend.
- ${CANON}
Write ${SY}/canon-${w.toLowerCase()}.json as a JSON array, and return the counts.`, { label: `write:${w}`, phase: 'Write', schema: {
  type: 'object', properties: { written: { type: 'number' }, blocking: { type: 'number' }, shouldFix: { type: 'number' }, polish: { type: 'number' }, dropped: { type: 'number' }, corrected: { type: 'number' } }, required: ['written', 'blocking', 'shouldFix', 'polish', 'dropped', 'corrected'],
} })
const [wa, wb] = await parallel([() => writer('A'), () => writer('B')])
if (!wa || !wb) throw new Error('A writer returned nothing.')

phase('Plan')
const plan = await agent(`${RULES}

Task: turn the canonical findings into the review document and Lane B's queue. ${SAVE('plan.md')}
Inputs: ${SY}/canon-a.json and canon-b.json (${wa.written + wb.written} canonical findings), ${SY}/clusters.json, the brief, the coverage files, LANES.md, and ${OPS}/lanes/lane-b.md's log entry of 2026-10-25 ~15:40 UTC (the earlier tour's five defects).
1. Rank: blocking first, then should_fix, then polish; within each, by harm (money or status misread, data lost, a task that cannot be finished, an accessibility block) and then reach (routes and roles touched). Number them UX-001 onward in rank order, keeping each cid beside its UX id. Dropped findings are listed at the end with their reasons, unnumbered.
2. Group them into proposed pull requests in landing order, each small enough to review well: one coherent theme, and about 400 changed lines of product code at most; split a larger fix into ordered PRs.
   - Land first the blocking fixes that touch no #42 file. Next, the shared pieces later PRs build on (for example one Notice component with its kinds, field-level errors, the form that keeps its values, one figure tile), so no later PR redoes them.
   - Keep files that #42 changes out of the PRs that do not need them. A PR that needs one is "after #42 merges".
   - A migration part goes to Lane A. The Lane B part ships first only if it stands alone without the migration.
   - A finding inside an in-flight item's scope is listed under that item, not as a new PR. The materiality cents item is already its own PR (co-001/materiality-cents); list what it covers.
   - Each PR: branch co-001/ux-<name>, title, findings closed (UX ids), files, size, depends on, after #42 (yes or no), visible change (yes means the UX and brand review is one of its two adversarial reviews, brief "Then" 2), tests to add (unit, e2e, axe routes, brand or copy checks), and what it leaves to Lane A or the founder.
3. Decisions:
   - (a) Wording and brand choices taken under the co-founder's ruling: one list, each with the choice made.
   - (b) For the founder, through the co-founder: each with the question, the options, the recommendation and why. The dark-mode question goes here, because it reverses D9 item 3. Recommend, and say what Lane B does meanwhile under the standing ruling: fixing the dark tokens' defects so the choice is ready costs nothing if dark stays off. Include the terms page that shows no terms text (legal text), and any palette change (ADR 0058 D9).
4. Write ${DOC} with these sections:
   1. Summary: what was reviewed; the counts after deduplication (blocking, should fix, polish, from how many reviewer findings); the ten most important; what passed.
   2. How it was done: the capture (857 shots, 83 routes, 1280 and 390 px, dark from the tokens only, the states; 78 skipped shots and the unreachable states with reasons, pointing to coverage.md); the 22 retaken; the eleven reviewers and their sets; this synthesis and its reviews. The gallery's URL "is recorded in lanes/lane-b.md".
   3. Proposed pull requests in landing order: a table, then a short section for each.
   4. Folded into work already in flight.
   5. Handed to Lane A: the migration parts, and the items that belong in PR 7 (#103).
   6. Decisions: 6.1 taken under the co-founder's ruling; 6.2 for the founder.
   7. Findings, ranked: per UX id: title, severity, roles, screens, evidence, rule, fix, size, files, migration, #42, in flight, sources, verification.
   8. The earlier tour's five defects, re-checked.
   9. Limits: the unreachable states; what axe misses (the accessibility reviewers' gap lists); what this review did not judge.
   Also write ${SY}/prs.json: [{order, branch, title, findings, files, size, dependsOn, after42, visible, tests, leavesOut}].
Return the counts, the PR list in order and the founder's questions.`, { label: 'plan', phase: 'Plan', schema: {
  type: 'object', properties: { findings: { type: 'number' }, prs: { type: 'array', items: { type: 'string' } }, founderQuestions: { type: 'array', items: { type: 'string' } }, laneA: { type: 'array', items: { type: 'string' } } }, required: ['findings', 'prs', 'founderQuestions', 'laneA'],
} })
if (!plan) throw new Error('The planner returned nothing.')

phase('Review')
const REVIEW = { type: 'object', properties: { file: { type: 'string' }, blocking: { type: 'number' }, shouldFix: { type: 'number' }, nits: { type: 'number' } }, required: ['file', 'blocking', 'shouldFix', 'nits'] }
const [rules, facts] = await parallel([
  () => agent(`${RULES}

Task: you are the review's one adversarial reviewer. Review ${DOC} and ${SY}/prs.json. Your job is to find what is wrong, not to approve. ${SAVE('review-rules.md')}
Check:
1. Every proposal against .claude/rules/brand.md, docs/brand/BRAND.md, ADR 0056, ADR 0058, CO-11 in docs/product/change-order-001.md, docs/product/PRD.md near :256, and WCAG 2.1 AA with audit #103's 2.2 additions.
2. The freezes: no engine, ledger or content-pipeline change.
3. The lanes' rules. No migration in a Lane B PR. Every PR that changes a file in ${SP}/pr42-files.txt is marked after #42; check each PR's files. No founder-kept matter decided. In-flight folds point at the right item.
4. Nothing is taste presented as a rule. Every "must" cites a rule; where the rules are silent, the document says so and recommends.
5. The landing order. Dependencies are right, shared pieces come first, each PR is small and coherent, and nothing is done twice.
6. Each fix is the best option, not the cheapest.
7. Severity is honest: blocking means blocking.
8. Completeness: every canonical finding in canon-a.json and canon-b.json sits in exactly one PR, an in-flight fold, the Lane A list, the founder list or the dropped list with its reason.
Write ${SY}/review-rules.md: numbered findings, each blocking, should fix or nit, with evidence and the fix.`, { label: 'review:rules', phase: 'Review', schema: REVIEW }),
  () => agent(`${RULES}

Task: check the facts the document rests on, against the code at 4d99df8. Review ${DOC} and ${SY}/prs.json. ${SAVE('review-facts.md')}
Check:
- every blocking finding's cause, opening each cited file:line;
- every migration claim, both "needs a migration" and "no migration" where data is stored;
- every PR's file list: the files exist, the fix needs them, and none is missing;
- #42 overlap, per file, against ${SP}/pr42-files.txt;
- at least 25 should-fix findings' root-cause citations, chosen across the themes;
- the earlier tour's five defects as the document reports them;
- the claims about what axe covers, against apps/web/e2e/a11y.ts and the specs that call it.
Write ${SY}/review-facts.md: numbered findings, each blocking, should fix or nit, with evidence and the fix.`, { label: 'review:facts', phase: 'Review', schema: REVIEW }),
])
if (!rules || !facts) throw new Error('A reviewer returned nothing.')

phase('Revise')
const revised = await agent(`${RULES}

Task: resolve every point in ${SY}/review-rules.md (${rules.blocking} blocking, ${rules.shouldFix} should fix, ${rules.nits} nits) and ${SY}/review-facts.md (${facts.blocking} blocking, ${facts.shouldFix} should fix, ${facts.nits} nits). ${SAVE('revise.md')}
- For each point, verify it against the code or the rules. Then apply it to ${DOC}, ${SY}/prs.json and, where a finding changes, the canon file. Or reject it, with the evidence.
- Add a final section, "10. Review dispositions": one line per point with its outcome and reason.
- Then check completeness yourself: every canonical finding is accounted for exactly once.
Return the final counts, the PRs in order, the founder's questions and the Lane A handoffs.`, { label: 'revise', phase: 'Revise', schema: {
  type: 'object', properties: { blocking: { type: 'number' }, shouldFix: { type: 'number' }, polish: { type: 'number' }, dropped: { type: 'number' }, prs: { type: 'array', items: { type: 'object', properties: { order: { type: 'number' }, branch: { type: 'string' }, title: { type: 'string' }, after42: { type: 'boolean' }, size: { type: 'string' } }, required: ['order', 'branch', 'title', 'after42', 'size'] } }, founderQuestions: { type: 'array', items: { type: 'string' } }, laneA: { type: 'array', items: { type: 'string' } }, applied: { type: 'number' }, rejected: { type: 'number' } }, required: ['blocking', 'shouldFix', 'polish', 'dropped', 'prs', 'founderQuestions', 'laneA', 'applied', 'rejected'],
} })
return { retake, clusters: clustered.clusters.length, writers: { A: wa, B: wb }, plan, reviews: { rules, facts }, revised }
