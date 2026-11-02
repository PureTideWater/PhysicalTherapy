# fix-check D10-1 (adversarial verify of D10: the value rule's scope stated in ADR N32 and ci.md)

Started 2026-11-02 (UTC in logs). Clone: /home/user/fx-imgdigest-D10-1 (read only, never pushed).
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/D10-1-*.log

Finding (critic C1-F3, N): T3 reads only .github/workflows; a pinned action's action.yml (input defaults, composite
steps' env/with/run) and code are evaluated by the runner and unread, while ADR N32 and ci.md say every expression is
read. Fix (docs): state the scope in ADR N32 "What holds it" and ci.md; proposal for #82's area (parseActionMeta).

## Steps
- [x] clone, fetch WIP ref, check out d257fe6d..., confirm = origin/co-001/wip-ci-images-digest (02:32 UTC; ls-remote: wip d257fe6d…, PR 83167b8f…, #42 6c28d6a2…; NOTE base claude/build-platform is now 4eaf7124… (#92 merged after 43565235): integrator's re-merge)
- [x] pnpm install --frozen-lockfile (EXIT 0, D10-1-install.log)
- [x] read the D10 diff (f89770ca...) and the ADR/ci.md text at the head: ADR N32 "What holds it" +4 lines (:1009-1012),
  ci.md "Changing CI" +4 lines (:432-436) and rewrap of the two D2 paragraphs (pure rewrap: word-diff shows only the
  added sentence and moved breaks), workflows.test.ts T3 header comment +4 lines (:2843-2847). d257fe6d touches ADR only.
  T3/T5/T6 read workflowFiles() = .github/workflows/*.y(a)ml under CI_ROOT only (lines 87-96, 3429, 3440, 3981, 4093,
  4105); no read of any action.yml anywhere in the test; the repo holds no action.yml and no .github/actions.
  reconciliation-001 :663 says "workflows.ts admits into a process only a closed list of values" with no scope (to judge).
- [x] (1) finding's scenario: M1/M1b (action.yml unread, value rule green) vs M2/M3/M4 (workflow-level red): docs now say what the code does
- [x] (2) harmless variants: M1 (unused action.yml) green; head run's rewritten-pins self test passed (124/124 unskipped); D10's test edit transpiles identical
- [x] (3) nothing loosened: code delta nil; b2a41a00's red fixtures kept (D6's message form for $GITHUB_ENV)
- [x] (4) documents match code, three nits (below)
- [x] remove clone

## Log
- 02:35 UTC comment-only proof (D10-1-comment-only.log): D10 changes ADR, ci.md, workflows.test.ts; d257fe6d changes the
  ADR only. workflows.test.ts at d5f987a4 and f89770ca transpiled without comments (typescript transpileModule,
  removeComments): IDENTICAL (sha 3033cb99, 286,250 chars), so D10 cannot loosen or tighten any rule. Whitespace-
  normalised sentence diff: ci.md gains exactly the one scope sentence (the rest is a pure rewrap); the ADR gains exactly
  the two sentences. Widths: ci.md 425-447 max 118, ADR 1000-1031 max 118, test header max 121 (121 pre-existing).
- 02:36 UTC head control (D10-1-head-workflows.log): workflows.test.ts at d257fe6d…, 124/124 passed, EXIT 0.
- 02:40 UTC (3) nothing loosened: b2a41a00 is an ancestor of HEAD. D10's own code delta is nil (comment-only proof above).
  b2a41a00's "refuses each route a value could take whole" body vs head's: every expression fixture line is in head
  verbatim; the 81 lines absent are the T6 rows (D1's reshape, its verifier's), the admitted-fixture shape (values now
  carry `where`, D4) and the three $GITHUB_ENV cases, which head keeps as red cases with D6's "closed map" message
  (:3570-3581: BODY=$x and cat file >> $GITHUB_ENV still refused). All pass in the head run (124/124).
- parseActionMeta (tools/check-action-pins/verify.ts:44-59) confirmed: keeps inputs (with default) and composite steps'
  uses/if/with only; drops env and run. formProblems (workflows.ts:100) refuses `uses: ./` (local action) and docker://.
- 02:37-02:41 UTC CI_TREE runs of workflows.test.ts (D10-1-tree-<T>.log, JSON in scratch d10/trees/<T>.json), 124 tests each:
  - T0 control (copy of .github, Dockerfiles, compose): 123 passed, 1 skipped (the self-copy test, skipped under CI_TREE). GREEN.
  - M1 an action.yml (.github/actions/leak, composite: input default = pull_request.body, env toJSON(github.event), a key
    with the title, steps.x.outputs.metadata), unreferenced: GREEN 123/1 -> the documented scope (action.yml not read) holds.
  - M1b same, used as `- uses: ./.github/actions/leak` in ci.yml images: 1 failed = the pin rule (a) only (local action
    refused); every N32 test GREEN -> the value rule never reads the composite; the pin form rule is what stops it.
  - M2 a pinned action's input `labels: ${{ github.event.pull_request.body }}` on the web build: RED in T3 (admits...) and
    the sum (keeps every environment string...) -> the workflow-level bound the docs claim holds.
  - M3 BUILT: ${{ steps.web.outputs.metadata }} (the defect itself): RED in T3, sum, T6 (66 vs 67 values) and the two
    behavioural identity tests (E2BIG at 132,377 bytes).
  - M4 an unlisted pinned-action output ID: ${{ steps.web.outputs.imageid }}: RED in sum and T6 (68 vs 67), not in T3
    (T3 admits the grammar; T6 closes the list).
  - M5 `&& steps.web.outputs.metadata != ''` in the web identity step's if: only the exact-if pin test RED; T3, sum, T6
    GREEN -> a step output read in if: is not bounded (by design: reaches no process). Re-run on an unpinned if: (M5b).
- 02:39 UTC messages (D10-1-tree-<T>-messages.log, -t filters):
  - M2: T3 `ci.yml job images step "Build the web image" with.labels: github.event.pull_request.body, not a bounded
    github value`; sum `... with.labels: no bound for github.event.pull_request.body`. RED as documented.
  - M3: T3 `env.BUILT: steps.web.outputs.metadata whole`; sum `no bound for steps.web.outputs.metadata, which no row of
    the table bounds`; T6 value set differs. RED.
  - M4: sum `env.ID: no bound for steps.web.outputs.imageid, which no row of the table bounds`; T6 `+ ci.yml images
    steps.web.outputs.imageid`. RED.
  - M1b: only `ci.yml:746: ./.github/actions/leak is a local action or workflow; the pin policy names every action by
    repository and commit`. The value rule stays green on a used composite: scope as documented; the pin rule closes
    in-repo composites, so "this repository's workflows" is the whole in-repo surface.
  - M5b (setup-node step in images: `if: ${{ !cancelled() && steps.web.outputs.metadata != '' && contains(
    steps.web.outputs.metadata, github.event.pull_request.body) }}`): 122 passed, 1 failed = the exact-if pin of the
    images steps only; T3, sum, T6 GREEN. So a step output read in `if:` is unbounded and unlisted (by design, reaches no
    process): D10's "every step output is bounded where a workflow reads it" is wider than the code (NIT, wording).
- 02:40 UTC trial merges (D10-1-trial-merges.log), HEAD with each live head touching ADR 0066 / ci.md / workflows.test.ts
  and with the base: clean and all three D10 sentences intact (count 1 each) for #42 9426a8d1… (MOVED from 6c28d6a2…:
  +1 commit "Update domain-model.md", domain-model.md only, by the founder, 02:36 UTC), ss-01 bb13be1b… (MOVED from
  efb20704…), suite-cap-1-triage-locks ce408d2f…, wip-ci-findings-transport b9a83bd3…, dependabot-group-routing
  651f8b80…, packet-day-counts e3299ea2…, wip-packet-day-counts-4 081a8034…, wip-interest-chain c18a847e…, base
  4eaf7124… (MOVED from 43565235…, #92). ci-mutation-trigger 50029e64… (live, 01:47 UTC, on 43565235…): CONFLICT,
  additive only (ADR :33 Date line, its Part 7 entry; reconciliation-001 :663 both append an entry), not on D10's
  lines; D10 sentences survive in the conflicted tree. ledger-interest-once, main-dependabot-template: stale old bases.
- Extra commit d257fe6d checked in passing: Part 5 (ADR :1323 on) holds N23 to N31, one N29 among them. Accurate.
- PR #86 body (GitHub MCP read, head 83167b8f): says T3 reads every expression "in every workflow" (scoped); the
  integrator's R3 body owns any refresh.

## Verdict
RESOLVED, not loosened. D10 is docs plus a comment (transpiled test identical); ADR N32 :1009-1012, ci.md :432-436 and
the T3 header :2843-2847 now say the rule reads this repository's workflows only, which M1/M1b/M2/M3/M4 confirm.
Nits (N, inside #86's files):
- N-a ADR :1012, ci.md :435, test :2846-2847 "every step output is bounded where a workflow reads it": M5b shows a step
  output (and the description) read in `if:` is admitted unbounded by design; say "where a workflow hands it to a
  process" (or "where it reaches a process").
- N-b reconciliation-001 :665 "`workflows.test.ts` admits into a process only a closed list of values": the same
  unscoped claim C1-F3 found; add "from this repository's workflows".
- N-c wording: passive "are not read" while #82's verify.ts (parseActionMeta) does read each pin's action.yml (for pin
  rules, not values): "are not read by it"; ADR "the rule and its list" vs ci.md "the value rule and its table" (ci.md
  says "its list" two lines later).
Proposal refinement (#82's area): parseActionMeta already keeps inputs' defaults and composite `with`; it drops env and
run (and a Docker action's runs.args/env); the value rule lives in a describe closure, so applying it there means moving
it to a module both import.
Hand-over (integrator, D1's trials): base now 4eaf7124… (#92), #42 now 9426a8d1… (domain-model.md only), SS-01 now
bb13be1b… (the builder's trial used efb20704…), ci-mutation-trigger 50029e64… live and conflicting additively (ADR
Date line, reconciliation-001 tail).
## DONE: clone /home/user/fx-imgdigest-D10-1 removed; nothing pushed, commented or edited on GitHub.
