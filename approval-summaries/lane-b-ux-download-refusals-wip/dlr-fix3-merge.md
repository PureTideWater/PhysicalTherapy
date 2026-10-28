# dlr-fix3-merge (PR #78, UX-DLR-16/17 review + fix, merge base, full suite)
Started 2026-10-28. Worktree /home/user/ux-download-refusals, head e36a68bc with the builder's uncommitted diff (7 files). Do NOT push.

## Status
- [x] 1. adversarial re-read of builder diff; fix; commit
- [x] 2. fetch + merge claude/build-platform --no-ff; regen; commit
- [x] 3. checks on merged tree
- [x] 4. Part 3 in ops summary

## Commands and results
### Step 1 (re-read)
- Read builder diff (7 files). Checked: every DownloadLinks host (uploader div flex-col gap-2, receipts section, packet export history CardContent, export review CardContent, reviewer checklist AppShell below, console) -> none inside a <p>/<ul>/<table>, so the always-mounted <p role=status> nests validly (SSR/hydration safe); e2e getByRole('status') users (packets.spec:228 is the packet page's "Export" card, which holds no DownloadLinks) unaffected.
- Focus: refusal alert focused via key=attempt + focusNotice; 'fetching' unmounts the earlier notice at click (focus is on the clicked link in Chromium/Firefox); no regression. Status is a sibling of the alert, cleared in the same batched render as the alert mounts -> no repeat of the refusal. Nested: inner defers (no provider), links tell the outer; one status. Letter ordering: LetterContractCheck listens on the payer (target phase), LetterMarks on the form (bubble) -> validity read is the new pair's.
- Fixes made: (a) letter-marks reads control.validity.valid instead of checkValidity() (checkValidity fires an `invalid` event at a control that does not hold, on every payer change); MarkedControl.validity; tests' fakes (FakeControl.validity, FakeContract.customValidity, FakeMarkedContract getter validity); ADR item 5 sentence reworded + paragraph rewrapped. (b) download-link docs: Said.notice / NoticePlace said "null while a fetch runs" — wrong with two links (a refusal can show while another fetch runs); corrected. (c) e2e: receipts step holds the 429 open, reads the status "Downloading the file…" visible + aria-busy on the link, then releases; asserts notice focused, status text gone, aria-busy gone; spec header + step title updated; ADR Not-verified line updated.
- CMD (flock): apps/web vitest run download-link.test.tsx coverage/letter.test.tsx -> 2 files, 35 passed
- CMD (flock): apps/web tsc --noEmit -p . -> 0; eslint --max-warnings 0 (6 changed .ts/.tsx) -> 0
- pr42 overlap of staged files: none
- COMMIT fix: 4a5f8d88… (4a5f8d88)
- [x] step 1 done
### Step 2 (merge)
- CMD: git fetch origin claude/build-platform -> 0dd1ba7e (new since ecebdc90: #80 = 6c371e52, 25759c0a, 351262ed, 0dd1ba7e; model-gateway redact, ADR 0054, MOD-13/14 fixtures, test-matrix/matrix.ts/registry.ts rows)
- CMD: git merge --no-ff --no-commit origin/claude/build-platform -> auto-merged test-matrix.md, matrix.ts, registry.ts; no conflict; both sides' rows verified (diff vs each parent)
- CMD (flock): pnpm install --frozen-lockfile --config.modules-cache-max-age=0 -> 0 (lockfile up to date); tsx tools/screening-capacity/watched.ts --write -> 0 (536 lines, no change); pnpm synth --all -> 0 (245 cases, 0 written, 637 unchanged; 8 EMR formats, 16 unchanged)
- COMMIT merge: cadcdc22… (cadcdc22)
- [x] step 2 done
### Step 3 (checks on merged tree cadcdc22)
- Logs: scratchpad/dlrf3m/ (suite.sh -> results.txt; batch2.sh affected + db 1..6/6 -> results2.txt; batch3.sh build, stamp, e2e 1/2 2/2, drop -> results3.txt)
- suite.sh started (bg): typecheck 0 (31 s), lint 0 (80 s), lint:copy 0, lint:logs 0, ... (test, synth+diff, watched+diff pending)
- db shard plan (tsx tools/test/db-shards.ts 6, 127 files): direct importers of the base's changed modules (@tp/model-gateway redact/narrative; worker packets/identifiers.ts, services.ts; web lib/models/narrative-drafts.ts via lib/routes/models.ts, packets.ts):
  shard 1 permitted, export-attempts, unattested-report (+ route-tests.6, .9); shard 2 route-tests.5 only (the generated route tests load the whole route registry, packets.ts and models.ts with it); shard 3 letter-records, payer-copy (+ route-tests.0, .2, .8, .11); shard 4 pricing-race (+ route-tests.1, .3, .4); shard 5 models-routes, gateway.db (+ route-tests.7, .10); shard 6 path.db, packets.db, pricing-current, unattested-submission (+ snapshot). This round's files (client components, e2e) have no db test. -> run all six shards.
- scope (git diff 0dd1ba7e HEAD, 62 files): #42 files touched = test-matrix.md, matrix.ts, registry.ts, watched-paths.txt (shared rows / generated only); no model id in added lines (base..HEAD, and in the fix commit); packages/pricing 0 lines; no migration, package.json or lockfile.
- e2e --list: 55 tests in 27 files (shard 1/2: 28 in 14; 2/2: 27 in 14)
- SUITE DONE on cadcdc22: typecheck 0 (22 projects, 31 s); lint 0 (1,638 files in 3 groups, 0/0, 80 s); lint:copy 0 (530 files); lint:logs 0 (1,067 files); pnpm test 0 (389 files, 6,636 passed, 4 skipped, 187 s); synth --all 0 (245 cases 0 written 637 unchanged; EMR 8/16 unchanged) + git diff --exit-code 0; watched.ts --write 0 (536 lines) + git diff --exit-code 0; tree clean after
- batch2 started (bg): affected --base 0dd1ba7e, then test:db 1..6/6
- affected --event pull_request --base 0dd1ba7e: exit 0; money, pricing, ledger, packets not affected; any=false packages=[] shards=[] (no shards to run)
- gate (tsx tools/stryker/gate.ts <empty dir> --expected '[]'): exit 0, "No money path changed ... mutation gate: passed"
- test:db (DATABASE_URL 5433) 1/6..6/6 all exit 0: 22/2432, 21/824+1 skip, 21/2510, 21/1836, 21/1398, 21/222 = 127 files, 9,222 passed, 1 skipped (96+58+101+90+193+59 s)
- batch3 started (bg): pnpm build, build-stamp --write HEAD, e2e 1/2 and 2/2 (E2E_PREBUILT=1, tp_e2e_pr78c, port 3182, --workers=2), drop
- pnpm build exit 0 (49 s); tree clean after; build-stamp --write: stamped cadcdc22…
- e2e --shard=1/2 exit 0: 28 passed (4.2 min)
- e2e --shard=2/2 exit 0: 27 passed (3.7 min). Total 55/55 (= --list), server read "the build is cadcdc22...'s"; no retry, no flake. download-refusals (shard 1) passed with the new UX-DLR-16 and UX-DLR-17 assertions.
- clean-up: DROP DATABASE tp_e2e_pr78c exit 0 (0 left), /tmp/tp-e2e-tp_e2e_pr78c-* 0 left, nothing on 3182; tree clean
- [x] step 3 done
- NEXT: Part 3 in /home/user/ops/approval-summaries/lane-b-ux-download-refusals-fix-suite.md (not committed)
- Part 3 appended to /home/user/ops/approval-summaries/lane-b-ux-download-refusals-fix-suite.md (ops repo: file modified, not committed)
- STATUS: complete. Commits 4a5f8d88 (fix), cadcdc22 (merge). Not pushed.
