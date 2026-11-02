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
