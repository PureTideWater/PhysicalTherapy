# PR #78 fix round: re-read and full local suite

Worktree /home/user/ux-download-refusals, branch co-001/ux-download-refusals. The base head was 53c7224f (CI green on every check). The merge base with origin/claude/build-platform is e908c214. Nothing was pushed. No rebase, no prettier, no migration, no new dependency, nothing under packages/pricing.

## Commits (53c7224f..HEAD)
- aa4176ff: the fix round, in one commit (29 files). It holds the work of the core, letter, downloads and docs builders. The re-read changed no code. The commit covers SEC-01 to SEC-03 and UX-DLR-01 to UX-DLR-15.
- f4b01073: tools/screening-capacity/watched-paths.txt gains one row, apps/web/src/lib/http/download-refusal-words.ts, written by `watched.ts --write` (download-refusal.ts now imports it). It is a separate commit, as 53c7224f was.

Final head: f4b01073.

## Re-read against reviews-result.json (verdict's fix where it differs)
- SEC-01: fixed. `keptCodes` (lib/http/download-refusal.ts) also returns undefined when `textPhiFindings(codes)` finds anything. There is no separator normalisation. Tests drop '123456789', '19500115' and '919 555 0100', and keep 'L1832, 0101T', 'G2061, 0106T' and 'L2000; 0512T'. letter.test.tsx has the crafted-codes case: no value, still aria-invalid. ADR 0079 D3 and the Consequences match. Holds.
- SEC-02 with UX-DLR-14: fixed. The pure `forgetRefusalUrl(href, also)` is in components/forget-refusal.tsx. `ForgetRefusal` takes `also`, and `DownloadRefusal` takes `forget` and passes it on. The letter passes `LETTER_CONTROLS` (payer, contract, codes); a drift test holds that equal to payerLetter's kept keys. Reports passes `['list']`. The letter's gate is kept: entries are read only beside a refusal. `RefusalNotice`'s page key strips the same keys (verdict point 7). There are unit tests and an e2e step for the letter's notice and for the Reports list. Holds.
- SEC-03: fixed as a comment only (handler.ts `returnParams`, the verdict's wording). Holds.
- UX-DLR-01: fixed.
  - `ForgetRefusal` replaces the URL on a setTimeout with `replaceState(null, ...)` and clears the timer on cleanup.
  - The new components/refusal-notice.tsx holds the notice through a router refresh while `pageOfRefusal` stays the same.
  - The e2e calls `window.next.router.refresh()`. It asserts that the RSC request carries no `refused`, the URL stays clean and the notice stays visible and focused. Then it reloads, and the notice is gone.
  - Holds.
- UX-DLR-02: fixed.
  - `DownloadLink` and `DownloadLinks` are in components/download-link.tsx. A plain primary click fetches the file as a script and saves the blob under its Content-Disposition name. A refusal is said in place with `RefusalAlert` and focused through a ref, because React's autoFocus does not focus a div. The href stays for a new tab, a modifier click or a page without script.
  - It is used by the receipts' Report link and the export review's PDF and CSV, with `refresh` until both files are downloaded.
  - `Uploader` adds a `beforeunload` guard while `stillSending`.
  - The words come from the new lib/http/download-refusal-words.ts, which imports nothing (a test holds this). It is the one source: download-refusal.ts and download-refusal.tsx re-export from it, and next.ts takes `minutesWords` from it. rate-limit.ts (#42) is unchanged, and a test holds `waitMinutes` equal to its `retryMinutes`.
  - There are unit tests for the save and refusal paths, and an e2e step on Uploads (a download in place, then a 429 stand-in said in place and focused, with the page kept).
  - Holds.
- UX-DLR-03: fixed. `describedBy` and `invalidMarks` replace `controlMarks`. All three letter controls write `aria-describedby` as their own attribute. Holds.
- UX-DLR-04: fixed. The new components/coverage/letter-marks.tsx clears a control's mark on input or change. A valid submit clears all marks and takes refused, fields, retry, payer, contract and codes out of the URL. There are unit tests on fakes, and an e2e step (the corrected letter downloads, no marks, a clean URL, and a reload shows the plain form). Holds.
- UX-DLR-05: fixed.
  - The packet page's Forbidden branch says the file's words ("...a billing manager or a firm principal downloads them...") and has `ForgetRefusal` as a sibling. components/shell.tsx is untouched.
  - Narrower-permission check, page against file:
    - Packet page `packet.draft` against PDF and CSV `phi.export`: narrower, done.
    - Reviewer checklist `audit_finding.validate` against the report PDF's `report.read`: narrower, done, with an extra sentence and `ForgetRefusal`.
    - Export review: equal, but `ForgetRefusal` was added anyway.
    - Every other return page takes its file's permission or a broader one. The report page has `report.read` against the CSV's `phi.export`, and every role with `phi.export` also has `report.read`.
  - There is an e2e step (a viewer's packet PDF). Holds.
- UX-DLR-06: fixed. A marked payer that is none of the options shows a plain `<option value="">Choose a payer</option>`, not disabled, and it is the default. The e2e checks that `checkValidity()` is false. Holds.
- UX-DLR-07: fixed. The placeholder is deleted, with a test guard. Holds.
- UX-DLR-08: fixed. Every refusal is titled "Not downloaded". The forbidden body is the disposition's sentence. The console's sentence is kept. Tests cover every status's title. Holds.
- UX-DLR-09: fixed. Each example code is in its own `Figure`, with the comma in the sentence face. Figure's doc comment is widened. Holds.
- UX-DLR-10: fixed. The three messages are now the disposition's words. The tests and e2e are updated. Holds.
- UX-DLR-11: the markup is kept. ADR 0079's Revisit when names the second-merge move (form-issues' FieldError, and `scroll-mt-18` replaced by ADR 0077's `scroll-padding-top`). The PR body still needs this line (Proposals).
- UX-DLR-12: no defect. No change. Holds.
- UX-DLR-13: no defect. ADR 0079's upload-report row now says a zip's file returns to its receipt, which links back to the zip. Holds.
- UX-DLR-15: fixed. components/coverage/letter-contract-check.tsx uses `setCustomValidity` (optgroups are not disabled). Contract options carry `data-payer`. The e2e checks that the contract is held in the browser, that no request is sent, and that the server mark still appears when the form is sent with noValidate. Holds.
- #42 files: `git diff --name-only 53c7224f` against pr42-files.txt touches three files:
  - docs/product/test-matrix.md and packages/synth/src/cases/matrix.ts: against e908c214, 0 removed lines; the DLR rows only, and this round changed only DLR-04's.
  - tools/screening-capacity/watched-paths.txt: 3 added rows, all from the generator (this round's row is re-checked by the suite's `watched.ts --write` plus `git diff`).
- Model identifiers: none in `git diff e908c214 HEAD`. In the commit messages, only the attribution lines.

## Dispositions
Every disposition was followed as the session set it. SEC-01, SEC-02 with UX-DLR-14, SEC-03 (comment only), UX-DLR-01 to UX-DLR-11 and UX-DLR-15 are fixed in aa4176ff. UX-DLR-11's PR line is still open. UX-DLR-12 is not a defect (no change). UX-DLR-13 is not a defect (ADR row).

## Full local suite on f4b01073
Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24.22.0 and PG18 on 5433. Logs are in scratchpad/suite-dlr/*.log.

| Command | Result |
| --- | --- |
| pnpm install --frozen-lockfile | Pass (2 s). |
| pnpm check:fixtures | Pass. 333 files read, 3,798 searched. |
| pnpm typecheck | Pass. 22 projects (51 s, cache warm). |
| pnpm lint | Pass. 1,629 files in 3 groups, 0 errors, 0 warnings (124 s). |
| pnpm lint:copy | Pass. 530 files. |
| pnpm lint:logs | Pass. 1,064 files. |
| pnpm verify-content | Pass. |
| tsx tools/engine-freeze/check.ts e908c214 (merge base) | Pass. No non-test file under packages/pricing/src changes. Nothing let through, no problems. |
| pnpm exec tsx tools/screening-capacity/watched.ts --write, then git diff --exit-code watched-paths.txt | Pass. 532 lines, unchanged from f4b01073. |
| pnpm synth --all, then git diff --exit-code | Pass. 240 cases: 0 written, 632 unchanged, 0 removed. EMR: 8 formats, 16 unchanged. The tree is clean. |
| pnpm test | Pass. 383 files: 6,463 passed, 4 skipped (277 s), coverage thresholds met. |
| pnpm test:golden | Pass. 5 files, 376 tests. |
| pnpm test:oracle (TP_ORACLE_PYTHON=/opt/py312-ci/bin/python3) | Pass. pyx12 4.0.0 agrees on all 687 (676 valid, 11 malformed), and edi835 agrees. |
| pnpm db:migrate (5433, fresh database tp_dlr_migrate, dropped afterwards) | Applied 44 migrations. None were applied beforehand. |
| pnpm test:db --shard=1/6 | Pass. 22 files, 2,432 passed (222 s). |
| pnpm test:db --shard=2/6 | Pass. 21 files, 824 passed, 1 skipped (139 s). |
| pnpm test:db --shard=3/6 | Pass. 21 files, 2,510 passed (189 s). |
| pnpm test:db --shard=4/6 | Pass. 21 files, 1,836 passed (145 s). |
| pnpm test:db --shard=5/6 | Pass. 21 files, 1,398 passed (201 s). |
| pnpm test:db --shard=6/6 | Pass. 21 files, 222 passed (93 s). |
| test:db total | 127 files, the same as `vitest list --project db`: 9,222 passed, 1 skipped, 0 failed. |
| pnpm build | Pass (20 s, Turbopack's cache warm). The tree was clean afterwards. |
| build-stamp.ts --write f4b01073… | Stamped f4b01073. The web server read "the build is f4b01073…'s". |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr78 E2E_PORT=3178 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 28 passed (6.1 min). download-refusals.spec (DLR-04), packets and reports included. |
| same, --shard=2/2 | Pass. 27 passed (5.3 min). screening.spec and uploads included, so no flake re-run was needed. |
| e2e total | 55 passed, 0 failed (55 tests in 27 files, `playwright test --list`). tp_e2e_pr78 and its /tmp directories were dropped afterwards. |
| tsx tools/stryker/affected.ts --event pull_request --base e908c214 | Money, pricing, ledger and packets are not affected. No shards. |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed", "mutation gate: passed". |
| Model identifiers in git diff e908c214 HEAD and the messages | None beyond the attribution lines. |

## Failures

None. No command failed and no flake re-run was needed.

## Proposals
- Refresh the PR #78 description with the fix round:
  - line 25: forbidden "Your role cannot download this file. Ask your organization’s administrator, who manages users and roles."
  - line 31: every title is "Not downloaded"
  - the #74 overlap line (UX-DLR-11): whichever merges second moves the letter onto form-issues' FieldError and drops scroll-mt-18 for ADR 0077's scroll-padding-top
  - the first line's zip case (UX-DLR-13)
  - a fix-round summary
- Nine equal-permission return pages still keep `?refused=` in the address bar on their Forbidden branch: Uploads, an upload's receipt, Reports, an audit report, a report document, an ROI statement, the monthly summary, Coverage and the console's compliance page. Nothing replays because they render no notice. ADR 0079 Consequences records this. The UX-DLR-05 verdict's part 2 (a `ForgetRefusal` beside each `Forbidden`) is a small follow-up.
- The audit report's reviewer checklist (its PDF and CSV links, with ticked boxes) and the packet page's export-history links (typed words) are still plain links, so a refused file there loads the page again. ADR 0079 Revisit when records this. Moving them onto `DownloadLink` would keep that state.
- design §6 in /home/user/ops/designs/lane-b-ux-download-refusals.md still has the old words: R09's title and forbidden body, D6's messages, R16's "ux-forms' Field clears the mark", and D6's "Before the server" does not name LetterContractCheck. Update it to match ADR 0079 (build-ops, not committed here).
- Retake the after-screens whose look changed: p.coverage.error-letter-payer, -contract and -codes at 1280, 1280-dark and 390, and p.report.refused-forbidden and p.packet.refused-forbidden.
- The e2e has no step that ticks the export review's boxes and then forces an in-place refusal (the UX-DLR-02 verdict's third test). The unit tests and the Uploads step cover the in-place path.
- Carried from core: packages/synth/src/cases/registry.ts (#42) could name apps/web/src/lib/http/download-refusal-words.test.ts under DLR-02.
- Carried from the security review, outside this PR: download GETs do not check Sec-Fetch-Site, so a cross-site top-level navigation can start a download and its export record.

## Part 2: second pass (UX-DLR-02, UX-DLR-05) and its re-read

Worktree /home/user/ux-download-refusals, branch co-001/ux-download-refusals. Nothing was pushed. There was no rebase, no migration, no new dependency, and nothing under packages/pricing.

### Commits after f4b01073…
- 872f05b3…: the part-2 builder's commit (19 files).
  - The nine equal-permission return pages render `ForgetRefusal` beside `Forbidden`.
  - The reviewer checklist, the packet page's export history and the console's evidence export are `DownloadLink`s. `DownloadLinks` takes `below`.
  - reports.spec's reviewer step has its line CSV refused in place, then downloads it.
  - DLR-04's assertedBy is widened, and ADR 0079 D4, D5 and Consequences are updated.
- 74ca6afc…: the re-read's one fix, in lib/http/download-refusal.test.ts (8 lines added, 2 removed).

Final head: 74ca6afc….

### Re-read of the diff from f4b01073… (adversarial)
- Success path and the 303 fallback hold. Every in-place href is unchanged, `?from=review` and `${shownVersion}` included, and none has a `download` attribute. A new tab, a modifier click or a page without script still gets the 303. The console export is a `downloadHandler` route, so the fetch gets an attachment and saves it.
- Focus holds. A notice said in place is focused through `focusNotice`'s ref, the same as before. `below` puts the notice before or after the children in fixed slots, so the children never remount: ticked boxes and typed words stay. The packet page's `flex flex-col gap-4` adds no empty child, because `RefusalNotice` renders null when there is no notice.
- Words hold. No new user-facing text was added. Every notice comes from `shownRefusal` (download-refusal-words.ts), never from the URL. The e2e's 429 stand-in body is the shape `outcomeResponse` sends, as in download-refusals.spec.
- The `Forbidden` branches are right. Coverage's `LETTER_CONTROLS` comes from letter.tsx, which has no 'use client', so it is a real array in a server page. Reports passes `RETURN_ONLY`. The monthly summary passes no key, because `month` is the page's own.
- #42 files: only packages/synth/src/cases/registry.ts changed (its DLR-04 row). components/shell.tsx is untouched. There is no model identifier in the diff, and in the messages only the attribution lines.
- One gap was found and fixed in 74ca6afc….
  - The gap: the new source test took a notice's `forget` keys from the page's own source only. Coverage's notice is in its letter, so dropping `also={LETTER_CONTROLS}` from Coverage's `ForgetRefusal` still passed.
  - The fix: `noticeSources()` also reads the components a page imports.
  - Mutation check: with Coverage's `also` dropped, the Coverage case fails ("the notice forgets LETTER_CONTROLS"). Restored, all 13 pass.

### Local suite on the final tree
Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24.22.0 and PG18 on 5433. Logs are in scratchpad/dlrf2c/*.log.

The unit, lint, synth and e2e runs used the working tree of 872f05b3… plus the test fix. That tree is byte-identical to 74ca6afc…, which was committed after the pass. The e2e did not use `E2E_PREBUILT`, because build-stamp refuses an uncommitted tree; playwright built that tree itself.

| Command | Result |
| --- | --- |
| pnpm typecheck | Pass. 22 projects (30 s); apps/web was rechecked. |
| pnpm lint | Pass. 1,629 files in 3 groups, 0 errors, 0 warnings (113 s). |
| pnpm lint:copy | Pass. 530 files. |
| pnpm lint:logs | Pass. 1,064 files. |
| pnpm test (the whole unit project) | Pass. 383 files: 6,477 passed, 4 skipped (258 s), coverage thresholds met. That is 14 more than on f4b01073…: 13 return-page cases and the `below` case. |
| pnpm synth --all, then git diff --exit-code fixtures packages/synth | Pass. 240 cases: 0 written, 632 unchanged, 0 removed. EMR: 8 formats, 16 unchanged. |
| pnpm exec tsx tools/screening-capacity/watched.ts --write, then git diff --exit-code tools/screening-capacity | Pass. 532 lines, unchanged. |
| db shards | None. No route.ts or lib/routes file changed, and none of the 127 *.db.test.ts files imports a changed page or component. oracle.db.test.ts takes @tp/synth scale rows, not the DLR-04 entry. |
| pnpm build | Pass. Web and worker (18 s). Afterwards the tree held only the test fix. |
| E2E_ADMIN_URL=…5433/postgres E2E_DATABASE=tp_e2e_pr78b E2E_PORT=3179 pnpm test:e2e download-refusals, packets, reports, uploads, monitoring, onboarding --workers=2 | Pass. 15 passed (5.0 min): download-refusals 1, onboarding 5, monitoring 1, packets 2, reports 3, uploads 3. |
| Clean-up | tp_e2e_pr78b was dropped and its /tmp directories removed (0 left). Nothing is listening on 3179. |

### Failures
None. No command failed and no flake re-run was needed.

### Still open (carried, not this pass's)
- The PR #78 description still needs updating. It lacks the fix round's lines, plus this pass: every return page forgets a refusal on `Forbidden`, and the reviewer checklist, packet history and console export download in place.
- No end-to-end test clicks the packet page's export history links or the console's evidence export. Both are the same `DownloadLink`, held by its unit tests and the type check, as ADR 0079's Not verified here says.

## Part 3: the UX re-check's three (UX-DLR-16 to UX-DLR-18), the merge of #80, and the full local suite

Worktree /home/user/ux-download-refusals, branch co-001/ux-download-refusals. Nothing was pushed. There was no rebase, no migration, no new dependency, nothing under packages/pricing and no model identifier. No #42 file was edited except the shared docs' rows and the generated files as their generators write them; components/shell.tsx is untouched.

### Commits after e36a68bc…
- 4a5f8d88…: the fix, in one commit (7 files). It holds the builder's work and the re-read's changes.
  - UX-DLR-16: `DownloadLinks` keeps a `role="status"` line in its place, mounted from the first render and empty and out of the layout's flow while idle (`empty:sr-only`). It reads "Downloading the file…" while any link inside is fetching. The link keeps `aria-busy` and takes `aria-busy:cursor-progress`.
  - UX-DLR-17: the contract's mark names the payer as `also`, and a change of the payer clears it once the pair holds.
  - UX-DLR-18: no code. ADR 0079's Revisit when gives `Forbidden` an optional link once #42 merges.
- cadcdc22…: the merge of claude/build-platform at 0dd1ba7e… (#80) with --no-ff. test-matrix.md, matrix.ts and registry.ts merged without a conflict, and both sides' rows are kept (DLR-01 to DLR-04 and MOD-13, MOD-14). `pnpm install --frozen-lockfile --config.modules-cache-max-age=0`, `watched.ts --write` and `pnpm synth --all` wrote nothing on the merged tree.

Final head: cadcdc22….

### Re-read of the builder's diff (adversarial)
- Focus holds. A refusal said in place still mounts under a new key and is focused through `focusNotice`. A fetch begun takes the earlier notice away at the click. In Chromium and Firefox the clicked link holds the focus then, so no focus is lost that was not lost before.
- The status does not repeat the refusal. It is a sibling of the alert, never its container. Its outcome clears it in the same render as the alert mounts, so a screen reader hears the alert alone. With two links fetching, the status keeps its words beside the first refusal, unchanged, so it is not announced again.
- The nested case holds. An inner `DownloadLinks` provides no context of its own, so its links tell the outer one and one status renders (the Uploads screen's, above its receipts).
- The always-mounted `<p>` nests validly at every host: a div, a section or a CardContent, never inside a `<p>`, a list or a table. So the server render hydrates. No e2e `getByRole('status')` is ambiguous: packets.spec:228 reads the packet page's Export card, which holds no `DownloadLinks`.
- The letter's ordering holds. `LetterContractCheck` listens on the payer itself (target phase) and `LetterMarks` on the form (bubble), so the validity read is the new pair's. The select is uncontrolled, so no React handler runs before it.
- Changed in the re-read:
  - `LetterMarks` reads `validity.valid` instead of `checkValidity()`. checkValidity() fires an `invalid` event at the contract on every payer change that leaves the pair refused. No listener exists today, but one would run on each change. The fakes in letter.test.tsx and ADR 0079 item 5 follow.
  - Two comments in download-link.tsx said a notice is null "while a fetch runs". With two links, a refusal shows while another fetch runs, so they now say "from a fetch begun until a refusal comes back".
  - The e2e reads the status in a browser. The Uploads step holds the receipts' refused Report fetch open and expects "Downloading the file…" visible and the link `aria-busy`. Then it releases the fetch and expects the refusal focused, the status text gone and `aria-busy` gone. ADR 0079's Not verified now says the status is read in a browser on that link alone.

### Local suite on cadcdc22…
Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24 and PG18 on 5433. Logs are in scratchpad/dlrf3m/*.log. The tree was clean before and after each step, so the e2e ran the stamped build of the commit.

| Command | Result |
| --- | --- |
| apps/web: vitest run download-link.test.tsx coverage/letter.test.tsx (before the commit) | Pass. 2 files, 35 tests. |
| apps/web: tsc --noEmit -p . and eslint --max-warnings 0 over the 6 changed .ts/.tsx (before the commit) | Pass, both. |
| git fetch origin claude/build-platform; git merge --no-ff --no-commit | 0dd1ba7e… (#80). Auto-merged test-matrix.md, matrix.ts and registry.ts with both sides' rows; no conflict. |
| pnpm install --frozen-lockfile --config.modules-cache-max-age=0 | Pass. The lockfile was up to date and nothing changed. |
| tsx tools/screening-capacity/watched.ts --write (merge) | Pass. 536 lines, unchanged. |
| pnpm synth --all (merge) | Pass. 245 cases: 0 written, 637 unchanged. EMR: 8 formats, 16 unchanged. |
| pnpm typecheck | Pass. 22 projects (31 s). |
| pnpm lint | Pass. 1,638 files in 3 groups, 0 errors, 0 warnings (80 s). |
| pnpm lint:copy | Pass. 530 files. |
| pnpm lint:logs | Pass. 1,067 files. |
| pnpm test (the whole unit project) | Pass. 389 files: 6,636 passed, 4 skipped (187 s), coverage thresholds met. |
| pnpm synth --all, then git diff --exit-code | Pass. 245 cases: 0 written, 637 unchanged, 0 removed. EMR: 8 formats, 16 unchanged. |
| tsx tools/screening-capacity/watched.ts --write, then git diff --exit-code | Pass. 536 lines, unchanged. |
| tsx tools/stryker/affected.ts --event pull_request --base 0dd1ba7e… | Pass. Money, pricing, ledger and packets are not affected: any=false, no shards. |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed", "mutation gate: passed". |
| db shards chosen | All six. Found by grep over the 127 *.db.test.ts and placed by tools/test/db-shards.ts 6. Direct importers of what #80 changed (@tp/model-gateway's redact and narrative; the worker's packets/identifiers.ts and services.ts; lib/models/narrative-drafts.ts through lib/routes/models.ts and packets.ts) are in shards 1, 3, 4, 5 and 6. Shard 2 holds route-tests.5, and the generated route tests load the whole route registry. This round's files are client components and an e2e spec, with no db test. |
| pnpm test:db --shard=1/6 | Pass. 22 files, 2,432 passed (96 s). |
| pnpm test:db --shard=2/6 | Pass. 21 files, 824 passed, 1 skipped (58 s). |
| pnpm test:db --shard=3/6 | Pass. 21 files, 2,510 passed (101 s). |
| pnpm test:db --shard=4/6 | Pass. 21 files, 1,836 passed (90 s). |
| pnpm test:db --shard=5/6 | Pass. 21 files, 1,398 passed (193 s). |
| pnpm test:db --shard=6/6 | Pass. 21 files, 222 passed (59 s). |
| test:db total | 127 files: 9,222 passed, 1 skipped, 0 failed. |
| pnpm build | Pass. Web and worker (49 s). The tree was clean afterwards. |
| build-stamp.ts --write cadcdc22… | Stamped cadcdc22…. Both e2e web servers read "the build is cadcdc22…'s". |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr78c E2E_PORT=3182 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 28 passed (4.2 min). download-refusals (DLR-04) is included, with its new UX-DLR-16 and UX-DLR-17 assertions. |
| same, --shard=2/2 | Pass. 27 passed (3.7 min). packets, reports, uploads and screening are included. |
| e2e total | 55 passed, 0 failed: the whole suite (55 tests in 27 files, `playwright test --list`). |
| Clean-up | tp_e2e_pr78c was dropped and its /tmp directories removed (0 left). Nothing is listening on 3182. |
| Scope (git diff 0dd1ba7e… HEAD, 62 files) | The #42 files touched are test-matrix.md, matrix.ts and registry.ts (rows), and watched-paths.txt (generated). packages/pricing has 0 lines. No migration, package.json or lockfile. No model identifier in the added lines. |

### Failures
None. No command failed and no flake re-run was needed.

### Still open (carried)
- UX-DLR-18 waits for #42: `Forbidden`'s optional link, and the packet page's and the reviewer checklist's links (ADR 0079, Revisit when).
- A refusal said in place takes the focus even when the person has moved on while the fetch ran, for example into the packet page's version form. This predates this pass; ADR 0079 D4 says the notice is focused as it mounts.
- The PR #78 description still needs the fix rounds' lines, this pass's included.

## Part 4: the merge of #79, its adversarial check, and the full local suite

Worktree /home/user/ux-download-refusals, branch co-001/ux-download-refusals. #79 (co-001/ux-table-scroll, UX PR 3; ADR 0078) merged into claude/build-platform as a6e754fc…, and git merge-tree found conflicts in 10 files. Nothing was pushed. There was no rebase, no force and no --no-verify. There was no migration, nothing under packages/pricing and no model identifier. Against a6e754fc… the #42 files touched are test-matrix.md, matrix.ts and registry.ts (rows only: 14, 24 and 22 lines added, 0 removed) and watched-paths.txt (3 rows, the generator's). components/shell.tsx is untouched.

### Commits after b459ba73…
- 646f060a…: the merge (parents b459ba73… and a6e754fc…), made by the merge agent (LANES.md rule 6: this PR merged second, so it keeps both).
  - The 10 conflicts:
    - receipts.tsx, the packet's Versions and Reports' Generated reports: each takes #79's `ScrollTable`, with the table its only child, inside this PR's `DownloadLinks`. They keep this PR's `DownloadLink` (no download attribute), `${shownVersion}` and `?from=list`.
    - Coverage: keeps `PayerLetter`, with #79's `w-full min-w-0` selects carried into letter.tsx.
    - Synth and test matrix: `CASE_MODULES`, `MODULE_NUMBER`, matrix, registry and test-matrix hold TBL (17), then DLR (18).
    - Personas: both sides' entries and doc comment.
  - download-refusals.spec.ts names the Receipts and Generated reports regions with `exact: true` (ADR 0078's rule).
  - The generators (install, watched.ts, synth) wrote nothing.
- f47437eb…: this check's one fix (4 files: download-link.tsx and its test, download-refusals.spec.ts, ADR 0079).

Final head: f47437eb….

### Adversarial check of the merge against both parents
- **Every file is accounted for.** I compared each side's own change (from the merge base 0dd1ba7e…) with what the merge adds to the other parent, as multisets of +/- lines.
  - The 44 files only this PR changed equal b459ba73…, except the merge's two ports (letter.tsx, and download-refusals.spec.ts's `exact: true`).
  - The 83 files only #79 changed equal a6e754fc…. So #79's tests and guards are whole: tables.test.ts, scroll-table.test.tsx, stacked-rows.test.tsx, tables-phone.spec.ts, a11y.ts's phone checks, dates.tsx, brand.css, ADR 0078 and the TBL fixtures.
  - In the 18 files both sides changed, every difference is a planned resolution or a re-indentation pair. test-matrix.md, matrix.ts and registry.ts hold both sides' rows whole.
- **The four conflicted pages and receipts.tsx hold.**
  - Render order: in each, `DownloadLinks`' place (the busy status, then the notice) renders above the `ScrollTable`, never inside the scroller.
  - The notice per list on Reports sits above each table.
  - The `?from=`, `?version=` and `reportHref` link counts equal this PR's in all 7 files that carry them.
  - No `<a … download>` is left in apps/web/src (multi-line search).
  - Every `Forbidden` branch keeps its `ForgetRefusal`.
- **Nesting.** No `DownloadLinks` is inside a `ScrollTable`. Each wraps its table from outside, and the guard holds each table as its scroller's only child. The Uploads screen's outer `DownloadLinks` still says the receipts' refusals above its list.
- **Stacked rows.** None to check: no page renders `StackedRows` yet (ADR 0078 ships it adopted at no site), so no download link is in a stacked copy and no `DownloadLinks` is duplicated.
- **Focus: one defect, found and fixed (f47437eb…).**
  - Since #79, the receipts' Report link and the packet's version files sit in the scroller. The scroller is a region with a tab stop while its table overflows (on a phone) and before it is measured.
  - Safari does not focus a clicked link; it focuses the link's nearest focusable ancestor, here the scroller. `focusIsFree` freed only the page and a download link, so on an iPhone a refused file said in place would not have taken the focus. Chromium focuses the link, so CI could not see this.
  - The fix: `focusIsFree` also frees an element that holds a download link. A person who moved on while the file was fetched (to another table, or into the version form's narrative) keeps their place, as before.
  - Tests: a unit case covers the fix. A new e2e step on Uploads at 390 px focuses the receipts' scroller, as Safari would, and clicks Report without moving the focus. It expects the refusal focused, above the scroller and not in it, with the page kept.
  - ADR 0079 D4 now names the scroller, and its Not verified here says Safari is stood in for in Chromium.
  - Mutation check: with the old line put back, download-refusals.spec failed at the new step (`toBeFocused`, received "inactive": the notice rendered, the focus stayed on the scroller). It passes with the fix.
- **The letter holds.** Its columns are `flex min-w-0 flex-col` and the selects `w-full min-w-0` (#79's af13cc06…), so a long contract title does not widen Coverage at 390 px. Its marks, `LetterMarks` and `LetterContractCheck` are unchanged.

### Local suite on f47437eb…
Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24.22.0 and PG18 on 5433. Logs are in scratchpad/m79s/*.log. The tree was clean before and after each step, so the e2e ran the stamped build of the commit.

| Command | Result |
| --- | --- |
| merge agent, on the merged tree before its commit: pnpm install --frozen-lockfile --config.modules-cache-max-age=0; watched.ts --write; pnpm synth --all | Pass. Each wrote nothing. Synth: 249 cases, 0 written, 641 unchanged. |
| apps/web: tsc --noEmit -p .; vitest run download-link.test.tsx; eslint --max-warnings 0 over the 3 changed .ts/.tsx; pnpm lint:copy (before the fix commit) | Pass. 19 tests; 0 problems; 532 files. |
| pnpm typecheck | Pass. 22 projects (25 s). |
| pnpm lint | Pass. 1,644 files in 3 groups, 0 errors, 0 warnings (81 s). |
| pnpm lint:copy | Pass. 532 files. |
| pnpm lint:logs | Pass. 1,069 files. |
| pnpm test (the whole unit project) | Pass. 392 files: 6,679 passed, 4 skipped (175 s), coverage thresholds met. That includes #79's tables.test.ts guard, scroll-table, stacked-rows and dates, and the new focus case. |
| pnpm synth --all, then git diff --exit-code | Pass. 249 cases: 0 written, 641 unchanged, 0 removed. EMR: 8 formats, 16 unchanged. TBL-01 to TBL-04 and DLR-01 to DLR-04 are both present. |
| tsx tools/screening-capacity/watched.ts --write, then git diff --exit-code | Pass. 536 lines, unchanged. |
| tsx tools/stryker/affected.ts --event pull_request --base a6e754fc… | Pass. Money, pricing, ledger and packets are not affected: any=false, no shards. |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed", "mutation gate: passed". |
| DATABASE_URL=…5433/postgres pnpm test:db --shard=1/6 | Pass. 22 files, 2,432 passed (92 s). |
| --shard=2/6 | Pass. 21 files, 824 passed, 1 skipped (58 s). |
| --shard=3/6 | Pass. 21 files, 2,510 passed (98 s). |
| --shard=4/6 | Pass. 21 files, 1,836 passed (88 s). |
| --shard=5/6 | Pass. 21 files, 1,398 passed (192 s). |
| --shard=6/6 | Pass. 21 files, 222 passed (58 s). |
| test:db total | 127 files: 9,222 passed, 1 skipped, 0 failed. |
| pnpm build | Pass. Web and worker (25 s). The tree was clean afterwards. |
| build-stamp.ts --write f47437eb… | Stamped f47437eb…. Both e2e web servers read "the build is f47437eb…'s". |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr78e E2E_PORT=3184 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 29 passed (5.4 min). download-refusals (DLR-04) is included, with the new Safari stand-in step. |
| same, --shard=2/2 | Pass. 28 passed (4.1 min). tables-phone (both tests), uploads, packets, reports, reconciliation and screening are included. |
| e2e total | 57 passed, 0 failed: the whole suite (57 tests in 28 files, `playwright test --list`). |
| Clean-up | tp_e2e_pr78e was dropped and its /tmp directories removed (0 left). Nothing is listening on 3184. |
| Mutation check: the old `focusIsFree` line restored; E2E_DATABASE=tp_e2e_pr78m E2E_PORT=3185 pnpm test:e2e download-refusals --workers=1 (built here) | Failed as intended. download-refusals.spec failed at the new step (spec line 398, the notice not focused). The positional filter did not narrow the run (`playwright test download-refusals --list` lists all 57), so the run was stopped with SIGINT after the failure: 31 passed, 1 interrupted (reconciliation, mid-run), 24 not run. Then the file was restored (tree clean), tp_e2e_pr78m dropped (0 /tmp directories, 3185 free), and the clean tree rebuilt and stamped f47437eb… again, so `.next` holds no build of the mutated line. |

### Failures
None in the suite. No flake re-run was needed. The only failure was the intended one in the mutation check.

### Still open (carried)
- No test runs Safari. Its focus on a clicked link's scroller is stood in for in Chromium (ADR 0079, Not verified here).
- `prettier --check` fails on download-link.tsx, download-link.test.tsx and download-refusals.spec.ts. It failed on them at 646f060a… already. Prettier is not one of the repo's gates and no round has run it, so they were not reformatted.
- Carried from Part 3: UX-DLR-18 waits for #42. The PR #78 description still needs the fix rounds' lines, plus this merge: the receipts', Versions' and Generated reports' tables scroll in #79's regions inside this PR's `DownloadLinks`, and the focus fix.

## Part 5: the merge of #74 and UX-DLR-11

Worktree /home/user/ux-download-refusals, branch co-001/ux-download-refusals. #74 (co-001/ux-forms, UX PR 1; ADR 0077, FRM-01 to FRM-08) merged into claude/build-platform as 165c5993…, after #79. The merge base is a6e754fc…, and 16 files changed on both sides. Nothing was pushed. There was no rebase, no force and no --no-verify. There was no migration, nothing under packages/pricing and no model identifier. Against 165c5993… the #42 files touched are test-matrix.md, matrix.ts and registry.ts (rows only: 14, 24 and 22 lines added, 0 removed) and watched-paths.txt (3 rows, the generator's). components/shell.tsx is untouched.

### Commits after f47437eb…
- 8f7d18d4…: the merge (parents f47437eb… and 165c5993…), made by the merge agent (LANES.md rule 6: this PR merged second, so it keeps both).
  - The 10 conflicts:
    - The packet, packet review, report review and Reports pages, and uploader.tsx: only the imports conflicted. Each keeps #74's `TextAreaField`, `CheckboxGroup`, `SelectField` and `Field` beside this PR's `DownloadLinks`, `DownloadLink`, `DownloadRefusal`, `ForgetRefusal` and `?from=`.
    - Coverage: keeps `PayerLetter`. Its two selects become #74's `SelectField` with `showChosen`, because #74's packets.spec.ts (its FRM-08 step) reads the letter's chosen contract under the select at 390 px. `SelectField` writes no attribute on an option, so the contract is held to its payer by ID (`contractOwners`). The form also takes #74's `grid-cols-1`, and the codes hint is 14 px, because form-hints.test.ts (ADR 0077 D9) failed on the merged tree.
    - lib/http/next.ts: keeps `signInFor` in sign-in-for.ts (this PR) and #74's `guardMessage`, `STALE`, `refusedInput` and the form actor mark, with this PR's `minutesWords`. The words are the same either way.
    - Synth and test matrix: `CASE_MODULES`, `MODULE_NUMBER`, matrix, registry and test-matrix hold FRM (16), TBL (17) and DLR (18).
    - Personas: both sides' entries and doc comment.
  - The generators (install, watched.ts, synth) wrote nothing.
- 036989af…: UX-DLR-11, by the merge agent (8 files), as ADR 0079's Revisit when asked of whichever PR merged second.
  - The letter's controls are marked through form-issues' `FieldError` and `describedBy`, through `SelectField`'s own `error`.
  - `scroll-mt-18` is gone from `RefusalAlert` and the letter, replaced by #74's `html { scroll-padding-top: calc(3.5rem + 1rem) }`, which is the same 72 px.
  - `LetterMarks` now hides the whole `FieldError` line.
- 4136bd3d…: this check's first fix, F1 to F4 (9 files).
- a0099fab…: this check's second fix, F5 (5 files): Coverage failed on every render.

Final head: a0099fab….

### Adversarial check of the merge against both parents
- **Every file is accounted for.** I compared each side's own change (from the merge base a6e754fc…) with what the merge adds to the other parent, as multisets of +/- lines.
  - At the merge: the 62 files only this PR changed equal f47437eb…, except the three letter files of the planned Coverage resolution (letter.tsx, letter-contract-check.tsx, letter.test.tsx: the selects became #74's SelectField and the contract is held to its payer by ID), and the 113 only #74 changed equal 165c5993…. (Wording corrected after the fresh-clone verification wf_f6ddc946-253.)
  - The 16 both-changed files are exact unions except the planned resolutions: next.ts, uploader.tsx, the four pages, console/compliance/page.tsx, lib/routes/compliance.ts, test-matrix.md, matrix.ts, registry.ts and watched-paths.txt.
  - Re-run on the final head: 17 files differ from a plain union, and each difference is planned:
    - the personas' doc comment;
    - the Coverage page and the synth `CASE_MODULES` and `MODULE_NUMBER`;
    - the letter files, download-refusal and its test, refusal-notice, the e2e spec and ADR 0079 (UX-DLR-11 and F2 to F4);
    - field.tsx and fields.test.tsx (F1);
    - letter-contract-owners.ts and client-boundary.test.ts (F5).
  - F1 replaced 13 of #74's lines in field.tsx, and each one is widened where it stood: a hint or a label that is a string renders as before.
- **Nothing of #74's is lost.** `ActionForm` keeps what was typed. `Field`, `FieldError` (its icon and an aria-hidden "Error:"), `RefusalSummary` and `describedBy` are intact. So are the unlayered 2 px invalid rule, the 14 px hints, `html` scroll-padding-top, its tests (form-hints, fields, action-form, form-issues, forms-keep-input.spec, packets.spec FRM-08) and the FRM rows (## Forms (FRM), 16 rows in the registry and in the matrix).
- **Nothing of this PR's is lost.** `returnTo`, the notices, `ForgetRefusal`, every `DownloadLink` placement, `?from=`, the `Forbidden` branches with their `ForgetRefusal`, the letter's behaviour, the tests, ADR 0079 and the DLR rows are all intact. That behaviour is: kept entries, marks from the URL, focus on the first marked control, a mark that clears on edit, on the payer and contract pair and on a valid submit, `LetterContractCheck`, the pattern, and the hint after the message.
- **One defect that neither tsc nor any unit test could see (F5, from the merge commit).** letter.tsx is a server component, and it called `contractOwners` from letter-contract-check.tsx, a `'use client'` module. On the server that export is only a client reference. So every render of Coverage threw "Attempted to call contractOwners() from the server". The first suite run's e2e found it (below). A boundary scan of the server module graph found that one call on 4136bd3d… and none in either parent. A second scan found no function handed to a client component as a prop, on the head or on either parent.

### UX and brand review of the letter's new markup (by code, against ADR 0077)
- **Holds.**
  - Each refused control has `aria-invalid` and #74's 2 px danger border from the one unlayered rule. The border reaches `SelectField` and `Input` alike, so the mark is never colour alone.
  - Under each refused control is `FieldError`: the icon, an aria-hidden "Error:" and the message (3.3.1). It is named first in the control's `aria-describedby`, then the hint (FRM-04).
  - The first marked control is focused on arrival.
  - `LetterMarks` hides the whole line (Tailwind's preflight `[hidden]` is display:none !important, which beats the line's flex).
  - The notice (`RefusalAlert`) and the focused control stop under the sticky header through `html` scroll-padding-top. The header is h-14 and sticky in the document scroller (shell.tsx), so the `html` rule applies.
- **F1 (ADR 0077 D9).** The codes control was hand-written (Label, Input, FieldError and its own `<p>`), because the shared `Hint` took only a string and this hint sets each example code in mono (UX-DLR-09). Now `Hint` and `FieldProps.hint` take words in runs, as an option's label already did (ADR 0077 D6). The codes are a `Field`, and the DOM is the same as before.
- **F2 (record).** ADR 0079's Revisit when said `scroll-mt-18` with scroll-padding-top made "144 px where 72 px was meant". That holds only for a top-aligned scroll, and this PR has none. Chromium's `focus()` centres the element instead, and it stopped 36 px lower. The ADR now says so, and its D5 letter paragraph names the three shared fields.
- **F3 (tidy).** Doc comments the UX-DLR-11 edit had left past the 120-column wrap are reflowed in 5 files.
- **F4 (test gap).** The e2e now asserts the 2 px `--destructive` border on the refused codes input and the refused contract select (`expectDangerMark`). There is no e2e for the header offset, because Chromium's centring focus cannot tell the padding from none. The rule is held in download-refusal.test.tsx, and its effect is #74's FRM-05.
- **F5 (the fix).** `contractOwners` and `ContractOwners` move to components/coverage/letter-contract-owners.ts, which has no directive. letter.tsx and letter.test.tsx import the function from there, and the check imports only the type.
  - New guard: apps/web/src/client-boundary.test.ts. It reads the code with the TypeScript compiler, starting from the app's server files, proxy.ts and every `'use server'` module, and follows imports through `ts.resolveModuleName` until it reaches a `'use client'` module (through barrels too). It fails on any use of a client export except as a JSX tag, a JSX attribute's value, an export or a type.
  - Proven: with 4136bd3d…'s letter files it fails with "letter.tsx: contractOwners at line 164 (CallExpression)", and on the fix it passes (3 tests).
  - The guard has no test-matrix row, because the matrix files are #42's.
- **Considered, not changed.**
  - Several marks focus the first marked control and show no summary. The letter is a GET download form with no `ActionForm`. R02 decided this, and two marks at once need both browser checks bypassed.
  - The billing page's `scroll-mt-20` (PR #56) now stacks with #74's padding on a `#pay-<invoice>` fragment. That has been on the base since #74, and the file is not this PR's.
  - `SelectField` keeps its intrinsic width in the letter, as #74's own letter and all 62 of its uses do.

### Local suite on a0099fab…
Every command ran under `flock /tmp/laneb-heavy.lock`, one at a time, with Node 24.22.0 and PG18 on 5433. Logs are in scratchpad/m74s2/*.log, and the first run's are in scratchpad/m74s. The tree was clean before and after each step, so the e2e ran the stamped build of the commit.

| Command | Result |
| --- | --- |
| merge agent, on the merged tree before its commit: pnpm install --frozen-lockfile --config.modules-cache-max-age=0; watched.ts --write; pnpm synth --all | Pass. Each wrote nothing. Synth: 257 cases, 0 written, 649 unchanged. |
| F1 to F4 (before 4136bd3d…): tsc apps/web (twice); vitest, 9 files then 7; eslint, 8 files; pnpm lint:copy | Pass. 297 tests, then 135; 0 problems; 535 files. |
| F5 (before a0099fab…): tsc apps/web; vitest client-boundary, coverage/letter and form-hints; eslint, 5 files; watched.ts --write | Pass. 3 files, 30 tests; 0 problems; 538 lines, unchanged. |
| Targeted check of a0099fab…: pnpm build, stamp, then E2E_DATABASE=tp_e2e_pr78g E2E_PORT=3187 pnpm test:e2e --workers=2 with download-refusals, era-exports, mapping, models and packets | Pass. 8 passed (1.9 min), with no server error. DLR-04 passes, including the F4 marks, focus and kept entries, and so does #74's FRM-08 step. tp_e2e_pr78g was dropped. |
| pnpm typecheck | Pass. 22 projects (16.9 s). |
| pnpm lint | Pass. 1,658 files in 3 groups, 0 errors, 0 warnings (79 s). |
| pnpm lint:copy | Pass. 536 files. |
| pnpm lint:logs | Pass. 1,075 files. |
| pnpm test (the whole unit project) | Pass. 399 files: 6,789 passed, 4 skipped (186 s), coverage thresholds met. That includes client-boundary.test.ts, form-hints, fields, letter and download-refusal. |
| pnpm synth --all, then git diff --exit-code | Pass. 257 cases: 0 written, 649 unchanged, 0 removed. EMR: 8 formats, 16 unchanged. |
| tsx tools/screening-capacity/watched.ts --write, then git diff --exit-code | Pass. 538 lines, unchanged. |
| tsx tools/stryker/affected.ts --event pull_request --base 165c5993… | Pass. Money, pricing, ledger and packets are not affected: any=false, no shards. |
| tsx tools/stryker/gate.ts (empty reports, --expected '[]') | Pass: "No money path changed", "mutation gate: passed". |
| DATABASE_URL=…5433/postgres pnpm test:db --shard=1/6 | Pass. 22 files, 2,432 passed (97 s). |
| --shard=2/6 | Pass. 21 files, 824 passed, 1 skipped (58 s). |
| --shard=3/6 | Pass. 21 files, 2,510 passed (100 s). |
| --shard=4/6 | Pass. 21 files, 1,836 passed (92 s). |
| --shard=5/6 | Pass. 21 files, 1,398 passed (163 s). |
| --shard=6/6 | Pass. 21 files, 222 passed (60 s). |
| test:db total | 127 files: 9,222 passed, 1 skipped, 0 failed. |
| pnpm build | Pass. Web and worker (11 s: Turbopack's cache from the targeted check's build of the same tree). The tree was clean afterwards. |
| build-stamp.ts --write a0099fab… | Stamped a0099fab…. Both e2e web servers read "the build is a0099fab…'s". |
| E2E_ADMIN_URL=…5433/postgres E2E_PREBUILT=1 E2E_DATABASE=tp_e2e_pr78f E2E_PORT=3186 pnpm test:e2e --shard=1/2 --workers=2 | Pass. 32 passed (4.7 min). download-refusals (DLR-04), era-exports, layout-1280, mapping, models and forms-keep-input are included. |
| same, --shard=2/2 | Pass. 31 passed (4.5 min). packets (with #74's FRM-08 step), tables-phone, uploads, reports and reconciliation are included. |
| e2e total | 63 passed, 0 failed: the whole suite (63 tests in 29 files, `playwright test --list`). No server error in either log. |
| Clean-up | tp_e2e_pr78f was dropped and its /tmp directories removed (0 left). Nothing listens on 3186 (only TIME_WAIT sockets). |

### Failures
- **First suite run, on 4136bd3d….** Everything passed through the stamp: typecheck, lint, lint:copy, lint:logs, test (398 files, 6,786 passed), synth, watched, affected, the gate, the six db shards and the build. Then e2e shard 1/2 failed 5 tests with one root cause, F5, which is not a flake: download-refusals DLR-04, era-exports CO-03 (Coverage), the layout-1280 tour (it timed out after 8 min waiting on Coverage's table), mapping MAP-01 and models milestone 10. Every Coverage render threw `contractOwners()` from the server (digest 766848993).
- A container restart cut shard 2/2 off before it reported. After the restart I dropped the leftover tp_e2e_pr78f and its 7 /tmp directories.
- F5 is fixed in a0099fab…, and the whole suite above was run again on it. No flake, and no re-run was needed.

### Still open (carried)
- `prettier --check` fails on letter-contract-owners.ts, letter-contract-check.tsx and client-boundary.test.ts, as it does on field.tsx and form-hints.test.ts on the base. Prettier is not one of the repo's gates, so they were not reformatted.
- No test runs Safari (ADR 0079, Not verified here).
- Carried from Part 3: UX-DLR-18 waits for #42.
- The PR #78 description still needs the fix rounds' lines, plus this merge: the letter on #74's shared fields, scroll-padding-top in place of scroll-mt-18, `Hint` in runs, and client-boundary.test.ts.
