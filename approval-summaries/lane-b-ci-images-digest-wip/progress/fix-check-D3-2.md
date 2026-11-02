# fix-check D3 (run 2): adversarial verify of D3 (per-environment-string byte sum) at a5bc1170…

Started 2026-11-02 (UTC). Clone: /home/user/fx-imgdigest-D3-2 (read only, never pushed).
Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/D3w-*.log
Scope: D3 (c1e80912…) plus its repair commits D3-1 c06f3f3e…, D3-2/3 30d05555…, D3-4 212da396…, and the
sum's neighbours that round 1 changed (46e555e9… over exemption, 11534e93… sites, 14a9e6bf… W-4 arguments).

## Steps
- [x] clone + fetch 04:21 UTC (D3w-clone.log): origin/co-001/wip-ci-images-digest = a5bc1170… = the report's head (ls-remote
  agrees); PR branch 83167b8f…; claude/build-platform now 88708069… (#90; base's changes since the merge base touch no
  .github file, no tools/test file, not ci.md, ADR 0066 or reconciliation-001); #42 head 9426a8d1…. Branch verify-d3w.
- [x] pnpm install --frozen-lockfile under the heavy lock: exit 0 (D3w-install.log)
- [x] exposure facts (grep of .github/workflows at head): no workflow_call, no GITHUB_PATH, no container:, no services:
- [x] baseline 04:27 UTC (D3w-baseline.log): whole workflows.test.ts at a5bc1170… on the repository's tree, 124/124 passed
- [x] old-rule worktrees (same lockfile): /home/user/fx-imgdigest-D3-2-old at b2a41a00… (before the fix round: T3 only,
  no sum) and /home/user/fx-imgdigest-D3-2-r0 at d257fe6d… (round 0's sum, before repair 1); installed (D3w-install-old.log)
- [x] read the code at head: environmentProblems (workflows.test.ts:3325-3553), its it (:3571-3653); since d257fe6d… the
  only sum fixture removed is the over-row-plus-vars.A `toEqual([])` (the D4-1 loosening), now red in the beside loop
- [x] harness: scratchpad/imgdigest/d3w/{mutate.py,run-trees.sh,make-probe.py,probe-block.ts}; trees by git archive of
  each side's HEAD, one named edit each (29 trees: control, 18 finding-class, 10 harmless)
- [x] probe at head (D3w-2-probe.log, d3w/reports/probe-head.json, 04:32 UTC): real tree 0 problems, 386 strings
  (385 summed + FINDINGS_B64 exempt alone), 0 unbounded; largest summed 49,191 (INPUT_BUILD-ARGS, release and dry run)
  - refused as they should be: over via env.X (933,339), via a matrix (933,339), as a shell (argument 933,337), over
    compared (`!= ''`) and in a block scalar (beside), `}}` in a quoted string (does not parse), an alias of a three-vars
    env (both places, 147,459), a merge key (no bound), input name with a space at 131,073 (fits at 131,072), a self
    cycle and a mutual env cycle (no env in scope sets), list key + include literal (179,155), string key alone (149,155),
    include-only expression (no bound)
  - exempt by design: the over value alone in with:, parenthesised, indexed (`needs['check']…`) (same value, sites hold)
  - **GAP (D3 itself, c1e80912…)**: a matrix key given as one expression with include entries beside it is bounded by
    the key's expression alone; matrix() falls back to `[given[key]]` and drops include. All three admitted by the sum
    and by T3: `note: ${{ fromJSON(needs.a.outputs.small) }}` plus include `[{ note: <130,000 bytes> }]` read with
    vars.A (actual up to 179,155), plus include `[{ note: "${{ vars.A }}${{ vars.B }}${{ vars.C }}" }]` read alone
    (actual 147,459: the finding's own three-vars value, by way of the matrix), plus `include: ${{ fromJSON(big) }}`
    (actual 149,155). GitHub makes an include entry that would overwrite a key's value a job of its own, so matrix.note
    takes it. Present exposure none: the four string-key matrices (ci.yml unit/e2e shards, mutation.yml shards) have no
    include.
  - not summed, no exposure (no workflow_call in the repository): a reusable-workflow caller's job secrets:/with:; the
    callee bounds secrets.S at 48 KB though a caller may pass a composed value
- [x] proposal for the matrix gap checked (d3w/make-proposal.py, D3w-3-proposal.log, 04:35 UTC): matrix() takes, beside
  a key's expression, each include entry's value for the key, or a whole include from an expression (3 lines in
  workflows.test.ts, inside #86's file) + 5 fixtures in the sum's it (key alone fits; include literal 90,000 + vars.A
  red; include three vars red; include from a 100,000-byte row red; include entries without the key or short fit).
  Fixtures on head's code: the sum's it RED at the first gap fixture (`expected [] to deeply equal [ Array(1) ]`, line
  3633 of the copy); with the patch: whole workflows.test.ts copy 124/124 green (real tree unchanged)
- [x] (3) graft (d3w/make-graft.py, D3w-4-graft.log, 04:35 UTC), both on head's rule, 2/2 passed:
  - b2a41a00…'s route test (25 refused expressions, 8 accepted, 12 places, $GITHUB_ENV reds), adapted only for D4's
    `where` field, D6's map wording and D6's tightening (its old green ENGINE_FREEZE_BASE fixture write is refused
    now), plus each of the 25 refused expressions through head's sum: exactly one "no bound for" each
  - d257fe6d…'s sum test (round 0's D3 fixtures), its one green over-row-plus-vars.A case flipped to red (D4-1's
    tightening): every round-0 red still red at the same byte figures, every round-0 green still green
