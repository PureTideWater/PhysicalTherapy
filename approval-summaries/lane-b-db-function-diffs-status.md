# db-function-diffs: status (Lane B; combined audit #111; LANES queue item 4)

**Open questions:** none.

- **Stage:** CI on 20898fb (the verification's fixes), then mark ready and merge.
- **Branch / PR:** `co-001/db-function-diffs` / draft PR #46, head 20898fb (base 6ddd587, unchanged). CI on b564bf2 all green; CI on 20898fb running.
- **Design:** `designs/lane-b-db-function-diffs.md`. Confirmed at design: **no migration** ("Database: no schema change");
  the domain model's text and hash stay unchanged; no workflow change.
- **Machine:** setup-container OK 2026-10-25 23:45 UTC; `gh api user` = PureTideWater.
- **#42:** none of its 143 files touched (test-matrix.md is shared, rule 6).
- **For Lane A (#42), sent to the orchestrator 2026-10-26 ~00:18 UTC:** if this merges first, #42's next `--out` writes
  its function files, and that commit must precede the founder's signature (a later commit dismisses the approval).
- **Proposals outside this PR:** protect-content.sh refusing hand edits to packages/db/functions/*.sql and a CLAUDE.md
  Never line (founder-owned guards); a sentence in Appendix C's intro pointing at the files, at Lane A's next
  domain-model regeneration.
- **Build (wf_fd3165ee-160):** code + docs builders and a checker; all local checks pass (typecheck, lint 1,493, unit, db domain-model 4 files/12 tests, --check --strict). Read-only check on #42 (13f59b1): +35 −3 ~5 function files, no GRANT to PUBLIC, no definer without search_path.
- **Decisions taken (recommended):** DBF db cases in their own file function-files.db.test.ts, so workflows.test.ts CI-09 stays unchanged; synth no-file entries DBF-01..05 (module DBF) as the orchestrator confirmed.
- **Reviews (wf_a92bcca4-084):** tooling 17 findings (T1 blocking: the summary with diffs would exceed GitHub's 65,536-character PR body for a real migration such as #42's; 6 should; 10 nits), security 15 (6 should, 6 nits, 3 improvements). All taken except I2 (needs a workflow change: proposal) and S1's workflow step (not needed). Findings: `approval-summaries/lane-b-db-function-diffs-review-findings.json`; dispositions: `...-fix-dispositions.md`.
- **Proposal (outside this PR):** I2: CI's domain model job could run the summary renderer from the base ref, so a PR cannot change the judge that writes the founder's copy (a workflow change; Lane A or a CI PR).
- **Fix round (wf_9668ca80-bbd):** every finding fixed in ac1c337, 95ee88f, b564bf2 (one push). Full local suite: typecheck; lint 1,493; lint:copy 491; lint:logs 999; fixtures; synth clean; unit 5,057 + 3 skipped; golden 188; oracle 637; test:db 9,065 + 1 skipped (119 files, 4 shards); domain model --check --strict; build + e2e 51/51; actionlint; no mutation shard affected. New tests fail on e1896d5 (33 unit, 10 db).
- **Verification (wf_088253bb-ce9):** scope, generator and CI pass; CI totals vs base 6ddd587: unit 5,059 (+63, 3 new files), db 9,065 (+16, 1 new file), e2e 51 (0). Failed on wording only: --out did not refuse stray entries as 4 docs said (now the code does, tested), plus stale description items (#42 counts now +35 −3 ~7, 45 files). Fixed in 20898fb; typecheck, lint, lint:copy, unit 657, db domain-model 22 pass locally. Since the fixes are a small tested code change plus wording, the second check is reading CI on 20898fb (the 6b-3 precedent).
- **Next:** CI green on 20898fb, the PR body updated, mark ready, merge with expectedHeadSha.

## Log (UTC)
- 2026-10-25 23:45: machine OK; read LANES, lane-b.md, CLAUDE.md, audit #111.
- 2026-10-25 23:58: design written.
- 2026-10-26 00:15: design review done (wf_2fc4efb8-887), 17 findings taken; design §7.
- 2026-10-26 00:21: the co-founder's standing ruling (relayed by the orchestrator, ~00:20 UTC): "Don't ask for approvals anymore just build and optimize": take the recommended option for every choice (the safer one for security), record the reasons. Applied from now.
- 2026-10-26 00:20: builders done; the DBF matrix rows need synth no-file entries DBF-01..05 (module DBF; fixtures.test.ts). Recommended and taken: add them (CI-series precedent; registry/matrix are shared under rule 6). Orchestrator told to widen the claim's reservation.
- 2026-10-26 00:45: build done; 2abcf83 pushed; draft PR #46 opened, body written with update_pull_request and verified byte for byte; subscribed.
- 2026-10-26 00:50: CI on 2abcf83: unit red (brand scan read '#111'); fixed e1896d5, pushed.
- 2026-10-26 01:00: reviews done; dispositions written; fix round launched.
- 2026-10-26 02:05: fix round pushed b564bf2; CI all green; PR body updated (verified byte for byte); verification launched.
- 2026-10-26 ~03:50: worker restarted; PG18 restarted (stale pid). Verification fixes committed and pushed as 20898fb.
