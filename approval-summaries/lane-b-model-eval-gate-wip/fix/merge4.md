# Lane B #75: merge of claude/build-platform 83d71fd6 (#81, #78) into co-001/contract-phi-check

The merge is resolved and staged. It is not committed. HEAD is 7f77cb19 and MERGE_HEAD is 83d71fd6 (`origin/claude/build-platform`, checked after the fetch). The merge base is 165c5993. Worktree: /home/user/contract-phi-check. Progress log: /tmp/claude-0/sp/phi/progress/merge4.md.

## What the base brought (read first)
- **#81 (56ed6279, SUITE-CAP-1a, ADR 0083):** triage and the audit report read a month in batches. It adds CAS-41 to the test matrix, the synth matrix and the registry, and adds `apps/worker/src/report/csv-arena.ts` to the watched list. It touches none of the files this PR changes in apps/web.
- **#78 (83d71fd6, UX PR 5, UX-010, ADR 0079):** a refused download comes back to its page.
  - On Uploads, a receipt's Report becomes a `DownloadLink` (it downloads in place, `?from=uploads` through `reportHref`).
  - `Uploader` gains `reportFrom` and `receiptsNotice`. `receiptsNotice` is rendered as `DownloadLinks arrived=` around `ReceiptList`.
  - `Uploader` gains `stillSending` and `useLeaveGuard` (`beforeunload`).
  - The Uploads page reads `searchParams` (`downloadRefusal`, `DownloadRefusal`, and `ForgetRefusal` on its Forbidden branch).
  - It adds DLR-01 to DLR-04 (module 18) and three `lib/http` files to the watched list.

## Conflicts and how each was resolved
1. **`apps/web/src/app/p/[practiceId]/uploads/page.tsx`**
   - Doc comment: both sides' sentences are kept (KIND_NAMES and the system's help, then "A receipt's refused report download comes back here … (docs/adr/0079)").
   - Props: `initialKind="x12_835"`, `reportFrom="uploads"` and `receiptsNotice={<DownloadRefusal refusal={refusal} />}` are all passed.
   - Also kept: #75's `KIND_NAMES` labels and import; #78's `searchParams`, `downloadRefusal`, `DownloadRefusal` and `ForgetRefusal`.
2. **`apps/web/src/components/uploads/uploader.tsx`**
   - Imports are the union of both sides: `ReactNode` and `RefObject`; `ReportFrom`; `DownloadLinks`; `Hint` and `controlMarks`; `FieldError`; `counted`.
   - The module doc is one paragraph: #78's leave sentence, widened to cover files waiting to upload, followed by #75's paragraph on waiting files.
   - The props, the receipts block (`DownloadLinks arrived={props.receiptsNotice}` around `ReceiptList reportFrom=`) and #75's KindField, HeldFiles, `FIELD_BOX`, `FIELD_SELECT`, `waitingFor`, `afterChoosing` and so on merged cleanly. All are present.
   - The hook conflict: #75's `waiting`, `formatProblem`, `choose`, `uploadHeld` and `clearHeld` are kept, followed by the guard, now `useLeaveGuard(leaveAsks(batch, held.length))`. See the decision below.
3. **`apps/web/src/components/uploads/uploader.test.tsx`** (add/add)
   - Every #75 test is kept (8 describe blocks), and #78's `describe('leaving the Uploads screen')` is kept with its doc comment and both of its tests.
   - The two import lists are merged into one (`leaveAsks` and `stillSending` added to #75's list).
   - No test names collided, so nothing was renamed.
   - Two tests were added to #78's describe block, one for each direction of `leaveAsks`.

## What was unified (one way, not two)
- **The leave guard.** It is #78's single `useLeaveGuard` hook. #75's waiting files are added through a new exported pure helper, `leaveAsks(batch, held) = held > 0 || stillSending(batch)`. This adds no second guard or listener. `stillSending` and its tests are unchanged.
- **The field marks.** Both sides already used the base's shared `Hint` and `controlMarks` from `components/field.tsx`. #78 widened `hint` to `FieldWords`. #75's `KIND_HELP` and `FORMAT_HELP` are strings, so they pass through unchanged and nothing needed adapting. The field error is the shared `FieldError` from `form-issues`.
- **The module doc comment:** the two side-by-side paragraphs are merged into one statement of when leaving asks.
- Nothing else in #78 and #75 says the same thing two ways. #78's `DownloadLinks` notice is for refused downloads; #75's "Nothing was uploaded" Alert is for batch problems. They are separate surfaces.

## Decision: the leave guard and files waiting to upload
- **Question.** #78 guards only while `stillSending(batch)` (phases waiting, uploading or completing). #75's waiting files are in `held`, not in `batch`, so under #78's code alone a person with files waiting could reload or close the tab and lose them silently.
- **Decision.** The page also asks while any file waits (`leaveAsks`).
- **Reasons:**
  - ADR 0079, decision 4, guards a page that "holds what a reload would lose". Its Revisit list says "Another page comes to hold what a reload would lose beside a download link". Files waiting are exactly that.
  - The person chose them, and often chose their kind and ERA system too. Nothing of them is on the server, so after a reload no receipt would show them. Getting them back means a second trip through the file picker.
  - The list's own heading is "Waiting to upload", which a person can read as queued. Leaving without a question would let them believe the files were sent.
  - The cost of guarding is one browser question, only while files wait. Clear, or Upload, ends it once every file is sent or failed.
  - The guard has no gap. `uploadHeld` clears `held` and `start()` sets `batch` in the same synchronous tick, and a server refusal moves the files from `batch` back to `held` in one tick. So one condition or the other is always true.
- **Recorded in:**
  - the `leaveAsks` doc comment and the `useLeaveGuard` comment;
  - the module doc;
  - a new bullet in ADR 0070 Part 3's upload-panel list (a file this PR already changes);
  - two unit tests.
- **Moves inside the app still do not ask.** That is #78's own scope: no `beforeunload`, and its ADR says the script keeps running. I did not change it.

## Decision: `reportFrom` and `receiptsNotice` against held files
- A held file is never sent or reported as received.
  - It lives only in `held` state.
  - It is shown only in `HeldFiles` ("Waiting to upload: N files", with Upload and Clear).
  - It never enters `batch` (so not "This batch" with its Received or sent counts), and never enters the server's receipts (`ReceiptList` lists server rows only).
  - `reportFrom` only shapes the receipts' Report links.
  - `receiptsNotice` only fills the `DownloadLinks` place above the server receipts.
- Neither prop reads `held` or `batch`, so no change was needed.
- A Report download inside the receipts happens in place (`DownloadLink`), so it never reloads the page under held files. The notice's fallback to a real navigation (a signed-out session and similar) now meets the guard's question, which protects the held files too.
- The contracts and reconciliation panels pass `showReceipts={false}`, so they need no `reportFrom` (ADR 0079 says the same). Only Uploads passes the two props, beside `initialKind`.

## Auto-merged files that both sides changed, checked by hand
Both sides changed: `uploads/page.tsx`, `uploader.tsx`, `uploader.test.tsx` (the three conflicts), plus `docs/product/test-matrix.md`, `packages/synth/src/cases/matrix.ts`, `packages/synth/src/cases/registry.ts` and `tools/screening-capacity/watched-paths.txt`.
- **`test-matrix.md`:** CAS-41 sits after CAS-39 in the CAS table. The "Download refusals (DLR)" section, with DLR-01 to DLR-04, is last, after TBL. MOD-12, MOD-13, MOD-14 and their notes are untouched. No ID is duplicated.
- **`matrix.ts`:** the same order (CAS-41 before LED-01, DLR-01 to DLR-04 after TBL-04). MOD-12 is intact. No duplicate IDs.
- **`registry.ts`:** CAS-41 (module 8, with its Lane B comment) sits before LED-01, and DLR-01 to DLR-04 (module 11, with their comment) after TBL-04. The MOD-12 entry is intact. No duplicate keys. DLR-04's `assertedBy` already lists `uploader.test.tsx`, which keeps its stillSending tests.
- **`watched-paths.txt`:** the merge added #78's `download-refusal-words.ts`, `download-refusal.ts` and `sign-in-for.ts`, and #81's `csv-arena.ts`. The regeneration (below) writes the same 541 lines, with no duplicates.

## Regenerated files
- `pnpm install --frozen-lockfile`: "Lockfile is up to date … Already up to date". `pnpm-lock.yaml` is unchanged.
- `pnpm exec tsx tools/screening-capacity/watched.ts --write`: 541 lines, no change from the auto-merge. This is the runbook's documented command. Plain `node` cannot resolve its extensionless imports.
- `pnpm synth --all`, first run: 259 cases, 0 written, 659 unchanged, 0 removed; 8 EMR formats, 0 written, 16 unchanged. The second run was identical (0 written).

## Edits beyond the auto-merge (all staged)
- `uploads/page.tsx`, `uploader.tsx` and `uploader.test.tsx`: the resolutions above.
- `docs/adr/0070-…md`: one bullet in Part 3's upload-panel list, on the leave guard over waiting files. It also says a waiting file is never in "This batch" or the receipts.

## Tests (all under flock /tmp/laneb-heavy.lock, PATH with /opt/node24)

| Check | Result |
| --- | --- |
| apps/web unit tests: uploads/*, lib/uploads/*, fields, action-form, form-hints, form-issues, download-link, download-refusal, models/path, client-boundary | 15 files, 169 passed |
| DB tests on a fresh database, `phi_merge4_db` on localhost:5433 (created by this run after checking it did not exist; 44 migrations; dropped WITH FORCE afterwards): path.db, models-routes.db, uploads.db | 3 files, 34 passed |
| synth fixtures.test and index.test | 2 files, 37 passed |
| eslint `--max-warnings=0` on uploader.tsx, uploader.test.tsx and uploads/page.tsx | clean |
| `pnpm typecheck` | passed, 22 projects, exit 0 |
| `pnpm lint:copy` | 537 files read, passed, exit 0 |

e2e was not run (not asked for in this part).

## Boundaries
- Nothing was committed, pushed, rebased or forced. There are no conflict markers left in apps/web/src, docs or packages/synth/src.
- Against 7f77cb19, the staged diff touches nothing in packages/pricing, packages/ledger, content/releases, fixtures/golden or migrations, and adds no migration.
- No file that #42 alone changes was touched.
- The added lines contain no model name or identifier. All data is synthetic.

## Proposal (outside this merge)
- A move inside the app (a Next link to another screen) unmounts `Uploader`, which drops the files waiting and the batch's on-screen progress. The PUTs themselves still finish. Per ADR 0079 this does not ask, by design. A follow-up could hold files waiting across in-app moves, or ask on in-app navigation while `leaveAsks` is true, for example by guarding the shell's links. That would touch `components/shell.tsx`, a #42 file, so it waits until #42 merges.
