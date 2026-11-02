# fix-check D1 (run 1)

Verifier of disposition D1 (structural refs in T6 BOUNDED_VALUES). Report names head d257fe6d...
Clone: /home/user/fx-imgdigest-D1-1 (read only, never pushed). Logs: /tmp/claude-0/-home-user-PhysicalTherapy/fcfc578e-dd4f-58f4-94e2-9bcf8baab1a3/scratchpad/imgdigest/logs/D1v-*.log

## Steps
- [ ] clone, fetch WIP ref, check head equals report, install
- [x] V0 (about 22:20 UTC) clone made; ls-remote: wip-ci-images-digest = d257fe6d... (= report), PR branch and
  refs/pull/86/head 83167b8f..., claude/build-platform 43565235..., refs/pull/42/head 6c28d6a2.... Checked out d257fe6d
  detached. pnpm install --frozen-lockfile running (logs/D1v-install.log).
- [x] V1 install exit 0 (D1v-install.log). Baseline whole tools/test/workflows.test.ts at d257fe6d: 124 passed, exit 0
  (D1v-base-whole.log, 22:06 UTC).
- [x] V2 live heads (92 co-001 refs, D1v-co001-heads.txt) that change a file a row cites (workflows, report.ts, run.ts,
  image-id*, release-capacity/*, render.ts, content-calendar.test.ts, affected*, stryker/base.mjs, publish-content*):
  #42 = pr-06b-mail-streams = wip-pr42-integrate-3 6c28d6a2; suite-cap-1-triage-locks ce408d2f (contains SS-01
  efb20704); ledger-interest-once e0646746 (10-28, mb e908c214); packet-day-counts e3299ea2 and its WIPs
  wip-packet-day-counts-2 bf849464 (11-01 21:14, live) / -3 9554cdc7 (stryker/base.mjs + affected.test.ts: NOT in the
  builder's trial set); old #42 WIPs (fix-db/harness/infra, 10-27); main-dependabot-template (main, old).
  packet-day-counts (and both WIPs): base.mjs gains two packet shards, affected.test.ts's cited test keeps its title and
  asserts 9 shards (was 7): symbol and title resolve; SHARDS_BYTES 1,024 still holds 9; only the bytes comment's
  "seven shards" goes stale (prose).
- Plan: CI_TREE copies under scratchpad/imgdigest/D1v-trees/ for workflow mutations; tool-code mutations in place in the
  clone, restored with git checkout and checked with git status. -t "only from the list below" = T6;
  -t "resolves each row" = the resolver fixture.
- [x] V3 (1)+(2) on CI_TREE copies at d257fe6d, T6 only (-t "only from the list below"; logs D1v-new-<tree>.log, ~22:20 UTC):
  base green (1 passed). RED: M1 range script changed -> "step range of job static (ci.yml:56) has a changed script,
  fingerprint f6ead5c3, not 4dccf1d2: re-check the bound ..."; M2 release identity script changed -> 12 rows, "fingerprint
  1ccec6fd, not cb290c31"; M6 runner-image id renamed in ci.yml (3 jobs) -> "job db|e2e|unit has no step runner-image";
  M7 screening measure script changed -> 2 rows "fingerprint 2d754e5b, not 366a6ad6"; M5 capacity sizing output removed
  -> red, but by the set comparison (value gone), not the output ref. GREEN (parsed YAML deep-equal to base, checked
  with same.mjs): H1 comment atop all 10 workflows; H2 a comment line above each of 46 id'd steps (+ blank line above
  range); H3 range step's keys reordered (id, if, name).
- [x] V4 output ref on the real tree: M5b capacity output key sizing -> sizing-renamed (values unchanged) -> T6 red
  "screening-capacity.yml gate needs.capacity.outputs.sizing: job capacity declares no output sizing".
- [x] V5 gap probes, T6 alone vs whole file (D1v-new-G*.log): G1a release identity env IMAGE: matrix.image + "-x"
  (writes sha256_web-x..., job outputs read sha256_web) T6 GREEN, whole file red only by the dry-run behavioural test;
  G1b release matrix worker -> worker-x: T6 GREEN, whole red by the release and dry-run tests; G3 capacity output
  sizing = sizing + time-warnings: T6 GREEN, whole red by the screening-capacity workflow test (outputs pinned).
  Cause for G1: refProblems skips the "writes no <name>=" check whenever the row names any symbol, and every
  templated row (the 18 identity rows) names image-id.ts#identityOf, so the matrix spelling never runs on the real
  table (fixture only). Calendar's script writes findings= itself and is skipped the same way.
- RESUMED (01:01 UTC 11-02) after an interruption: clone at d257fe6d detached; the only change in it is an in-place
  probe of refProblems's skip (narrowed so a symbol row still has its <name>= write checked when the script itself
  echoes NAME=); D1v-narrow-base.log was cut off before vitest ran. Continuing that probe, then V6 onward.
- [x] V6 (about 01:03 UTC) probe of a narrower skip (in place, saved as D1v-scripts/narrow-skip.diff, then restored with git
  checkout; status clean): skip "writes no <name>=" only when the row names a symbol AND the script itself echoes no
  NAME=. Real tree T6 GREEN (D1v-narrow-base.log); resolver fixture GREEN (D1v-narrow-resolver.log); G1a RED, 12 rows
  "step identity of job build (release.yml:171) writes no sha256_web= ..." (D1v-narrow-G1a.log); G1b RED, the 3 worker
  rows (D1v-narrow-G1b.log). So the gap is closable inside #86's file without turning the real table red.
- [x] V7 (about 01:05 UTC) tool-code refs, in place on the real tree, each restored (git status clean after each; scripts
  D1v-scripts/inplace.sh, inplace-unit.sh):
  RED: T1 sizingQuestion renamed -> 2 rows "tools/screening-capacity/report.ts declares no sizingQuestion"; T2 the
  affected.test.ts title renamed -> 7 rows "has no test named ..."; T4 advisoriesOutput renamed -> 2 rows "declares no
  advisoriesOutput". GREEN (by design, no fingerprint on tool code): T3 sizingQuestion's sentence + 4,096 chars (bound
  512); T6 verdict always adding a 4,096-char advisory (bound 256); T5 the named test made it.skip (testTitles counts
  it.skip/it.todo titles, so a skipped test still "proves" the bound; no lint rule bans skip).
  Do the NAMED tests guard the bound? T3: the named sizing test ("passes the verdict and is reported as a sizing
  question ...") stays GREEN (it never reads sizingQuestion's text; 5 OTHER report.test.ts tests fail). T6: the named
  "records times as advisory" fails. T7 (a 4,096-char advisory only when coldMs > 60,000): every checks.test.ts test
  GREEN, T6 GREEN: the 256-byte row is defended by nothing. Finding: the named tests pin examples, none asserts a
  byte figure; SIZING names a test that does not exercise sizingQuestion's output.
- [x] V8 (about 01:07 UTC) (3) nothing loosened. Old file b2a41a00 vs new d257fe6d, by it() title and call text (TypeScript
  parser, D1v-scripts/bodies.mjs, D1v-bodies/): 117 old titles, 113 bodies identical, 1 renamed (T5, D7's), 3 changed:
  T3 fixture (D2 key cases and D6 map cases added; old BODY= and `cat file` cases still red, now "outside its closed
  map"), route fixture (values carry where/step: D4), T6 itself. Old T6's checks: set equality kept verbatim; ci.yml no
  outputs kept; one over row kept; MAX_FILE_BYTES > 131,072 kept; the format regex inverted (no line cite) by design;
  notify's FINDINGS_B64 check replaced by sites (D4's). Workflows changed only by D7 (7 env lines + comments), so the
  row set is the same (set equality holds on both). CI_TREE N1 (a new reader of steps.range.outputs.head in 3 static
  steps) RED "+ ci.yml static steps.range.outputs.head" by the set comparison (D1v-new-N1-new-reader.log); M5 (value
  gone) RED (V3). Whole file at d257fe6d 124 passed (V1).
- [x] V9 (about 01:08 UTC) G1c: the identity step's env IMAGE: ${{ matrix.image }}-x in BOTH release.yml and
  release-dry-run.yml (step writes sha256_web-x=, job outputs still read sha256_web, so 18 rows' producer writes
  nothing they name): the WHOLE workflows.test.ts at d257fe6d passes, 123 passed + 1 skipped (the recursive one under
  CI_TREE) (D1v-new-G1c-identity-env-both-whole.log). Under the narrowed skip (narrow-skip.diff applied, restored,
  status clean): T6 RED, 18 "writes no ..." lines (D1v-narrow-G1c.log). CONFIRMED gap: the disposition's "templated
  output names must resolve too" holds only in the fixture; on the real table every templated row is excused by its
  symbol ref. The fingerprint also covers run alone, not the step's env, which is what G1 changes.
- [x] V10 (about 01:10 UTC) the resolver fixture has teeth: refProblems mutated in place (each restored, status clean):
  K1 no fingerprint compare, K2 no symbol check, K3 no output check, K4 no step-exists check, K5 the message's line
  dropped: each turns "resolves each row ..." RED. K7 (no "before its reader" check): whole file 2 failed. K6 (no
  uses-action compare): whole file 124 PASSED, a survivor: no fixture covers a uses: producer. On the real tree the
  compare works: CI_TREE M8 tsc-cache uses actions/cache instead of actions/cache/restore -> T6 RED "step tsc-cache of
  job static (ci.yml:144) uses actions/cache, not actions/cache/restore" (D1v-new-M8-tsc-cache-action.log).
- [x] V11 (about 01:11 UTC) (4) documents. ADR 0066 N32 "What holds it" first sub-bullet and ci.md (the "A step takes only
  the value it uses" bullet) say what the code does for step by job and id, job output, matrix key, needed job,
  path#symbol with its unit test, and the run: fingerprint with re-read-then-rewrite. Gaps: (a) neither names the
  uses: producer (a step with its action, which the code compares, M8); (b) both say the named unit test "proves" the
  bound; the code checks only that a test of that title exists (it.skip counts, V7 T5), and SIZING's named test never
  reads sizingQuestion's text (V7 T3). No document claims templated names resolve (the build report does).
  reconciliation-001's entry does not describe citations (nothing to match).
- [x] V12 (01:12 UTC) (5) live heads re-listed (99 refs, D1v-co001-heads-2.txt; new since V2: wip-ss01-chain moved to
  bb13be1b (contains #42 6c28d6a2 and SS-01), wip-interest-chain c18a847e (contains suite-cap ce408d2f and
  ledger-interest-once), wip-packet-day-counts-4 081a8034 (contains packet-day-counts e3299ea2; -3 9554cdc7 is not in
  it)). Cited files: D1v-cited-files.txt (14 tool files) + workflows. Trial merges by D1v-scripts/trial.sh (merge
  --no-commit, whole workflows.test.ts, merge --abort, clean check). A #42 6c28d6a2: clean, CI files and
  workflows.test.ts unchanged vs d257fe6d, report.ts/run.ts/report.test.ts move; 124 passed; abort clean
  (D1v-trial-A-pr42.log). Producers on #42 by name: verdict 507->554, sizingQuestion 835->932, jobResult 863->960
  (outputs time-warnings and sizing unchanged), run.ts GITHUB_OUTPUT write 1036->1093: every cited line would have
  gone stale; by name each still resolves to the same producer. B..J running in background (D1v-trials-summary.log).
- [x] V13 (01:17 UTC) trials so far, each clean (no conflict), the merged .github and workflows.test.ts equal to
  d257fe6d's, whole workflows.test.ts 124 passed, abort clean: B suite-cap ce408d2f, C SS-01 efb20704, D wip-ss01-chain
  bb13be1b (its ci.yml/workflows.test.ts changes are #83's, already in d257fe6d). Release-capacity producers on
  suite-cap / interest-chain / ledger-interest-once by name: verdict 119->206 (still at most one advisory: if/else if),
  advisoriesOutput 194->315, run.ts main 311->375 writes advisories= at 536->696; both named checks.test.ts titles
  present. packet-day-counts heads: shards 7 -> 9 (e3299ea2, -3) and 15 (-4 081a8034); 15 names as JSON about 289
  bytes, under SHARDS_BYTES 1,024; only the comment "their seven shards' (under 120)" goes stale (prose).
  Exact reproductions of the security review's S2 built: S2-1 five comment lines at ci.yml:21 (parsed equal), S2-2 the
  review's range echo of the commit message. G4 (mutation.yml job output shards -> steps.affected.outputs.packages)
  and G5 (release-capacity output advisories doubled) trees built; to run after the trials.
- [x] V14 (01:20 UTC) E wip-interest-chain c18a847e: clean, 124 passed, abort clean. F ledger-interest-once e0646746
  (10-28, base e908c214 of 10-26): 9 conflicts (apps/web x4, ADR 0062, test-matrix, ci.md, synth matrix/registry), not
  tested; stale: its live successor wip-interest-chain contains it and merges clean (E). Its ci.md change is the
  release-capacity table row and a SUITE-CAP-1b reading section, not #86's bullet.
- [x] V15 (01:17 UTC) G packet-day-counts e3299ea2: clean, no lockfile change, base.mjs and affected.test.ts move (its
  ci.md change is two shard rows of the mutation table); 124 passed; abort clean. MUTATION_PACKAGES (base.mjs:24),
  shardsFor (affected.ts:681) and the named title exist on e3299ea2, -3 and -4.
- [x] V16 (01:21 UTC) H wip-pdc-3 9554cdc7 and I wip-pdc-4 081a8034: clean, 124 passed, abort clean. J1-J3 the old
  #42 WIPs fix-db/harness/infra (10-27, not in #42's ancestry): each conflicts on ADR 0062 only (not #86's), not
  tested; superseded by #42 6c28d6a2 (A, clean). All 11 trials done (D1v-trials-summary.log); clone at d257fe6d, clean.
  No live head turns a row red; no live head changes any workflow or workflows.test.ts relative to d257fe6d.
  main-dependabot-template (07e78d20, on main, base b62c8b69 of 10-18) not trial-merged: a main-based branch.
- [x] V17 (01:24 UTC) the security review's own S2 scenarios at d257fe6d: S2-1 five comment lines at ci.yml:21 (parsed
  equal) T6 GREEN, no churn (D1v-new-S2-1-five-comments-at-21.log); S2-2 the review's range echo of the commit message
  T6 RED "step range of job static (ci.yml:56) has a changed script, fingerprint 5eb0a3d1, not 4dccf1d2: re-check the
  bound ..." (the review had it green under T6). Job-output remaps: G5 release-capacity output advisories doubled
  (${{ steps.measure.outputs.advisories }} twice) T6 GREEN, whole file red only by release-capacity's pinned notify
  test; G4 mutation output shards -> steps.affected.outputs.packages T6 red only through the set comparison (shards'
  last reader gone), whole red also by the mutation workflow test; G3 (V5) the same: an output ref checks the name is
  declared, not what it reads.

## Result (01:25 UTC)
Core finding fixed and proven: no row holds a line; S2-1/H1-H3 cause no churn; a changed run: script (M1, M2, M7,
S2-2), a renamed step id (M6), a removed or renamed output (M5, M5b), a deleted symbol (T1, T4) or renamed test (T2) and
a changed uses: action (M8) each turn T6 red; old red cases stay red (N1, M5); all 11 live-head trials keep every row
resolving to the same producer, none turns a row red. Open: (1) templated names never checked on the real table
(G1a/G1b/G1c; G1c leaves the WHOLE file green); narrow-skip.diff closes it with the real table green; (2) job-output
remaps leave T6 green (G3, G5); (3) the named tool tests need not prove the byte figure (T3 sizing test green, T7 no
test red; it.skip counts); (4) no fixture for a uses: producer (K6 survivor); (5) docs omit the uses: producer and say
"proves". Clone removed after this entry.
- clone /home/user/fx-imgdigest-D1-1 removed (01:20 UTC); nothing pushed from it.
