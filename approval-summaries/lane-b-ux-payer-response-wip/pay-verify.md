# PR #85 fresh-clone verification (stage 6), head a97d6011
Status: PASSED (2026-11-01)
- clone at /home/user/verify85-clone, checked out a97d6011

## 1. Tree
- merge base 83d71fd6; base origin/claude/build-platform now 43565235 (gained #82 bce57f16, #83 43565235). git merge-tree --write-tree base head: NO CONFLICT.
- 41 files: apps/web (pages, components, lib routes/tests, e2e), ADR 0085 (new), test-matrix.md (+4), CAS-45..48 expected.json, synth matrix.ts/registry.ts. No migration, no packages/db, no packages/pricing, no workflow/manifest/lockfile. None on LANES.md's #42 list (routes touched: abstraction, contracts, reconciliation, submissions, triage, uploads; none of console/console-mail/index/practice/settings/registry.test).
- Model identifiers: none in diff; commit messages only in Co-Authored-By/Claude-Session attribution lines. PHI scan: only synthetic dates/hashes (2026-10-xx, SHA a1000...).
- CI poll running in background; fast checks running under flock.

## 2. Claims (live PR body = pr85-body.md, bar a trailing newline; head a97d6011, base claude/build-platform, open)
Held (19 spot-checks):
1. Response hint (submissions/page.tsx:50) vs packages/db/functions/case_rules.sql: accepted / denied w/o reopen -> resolved (ELSE); partial -> partially_resolved; info_requested or denied+reopens -> awaiting_response; lines decide first (all written off -> closed_written_off; resolved_lines; reopened_lines -> awaiting_response). Matches.
2. Received on: Field type=date min=submittedOn max=asOf required, no defaultValue.
3. Route: receivedOn z.string(RECEIVED_ON_EMPTY).refine(!=='') -> issue on field receivedOn; db test workbench :873 (CAS-46, S2-N2) asserts {field:'receivedOn', message:RECEIVED_ON_EMPTY}.
4. Letter check: RESPONSE_DOCUMENT (top-level, payer_letter|other, clean, stored, no contract_version source) in responseDocumentChoosable; handler refuses on documentId with RESPONSE_LETTER_REFUSED.
5. document_use: lock: DOCUMENT_USE_LOCK exported from tagging.ts (n4), taken first in responseDocumentChoosable and refuseResponseLetter; db test :1096 serializes tag vs response.
6. Gate titles in uploads.ts: not open yet (no BAA) / paused / closed / stopped (unknown text whole); uploader falls back to "Uploads are not open yet".
7. contracts.ts and reconciliation.ts use uploadGate.
8. #78's leave guard kept: useLeaveGuard(stillSending(batch)), DownloadLinks around ReceiptList, reportFrom/receiptsNotice; inFlight = pending || stillSending.
9. Write-off: contradictedReason checked inside writtenOffReason===null branch before UPDATE, issue on reason; no date in words.
10. Placeholders: "Choose the channel", "Choose the payer’s answer", "Choose the payer’s letter", "Choose the reason", each required, Zod messages name the field.
11. S2-N1 fix + tests: packets.spec.ts:517 hint regex incl. "moved back"; workbench db :923 reopened_from payer_approved.
12. ux85-1: db tests billing-routes (paused/closed/stopped), contracts-routes :339, reconciliation-routes :210.
13. ux85-2: drop zone p-4 sm:p-8; packets.spec 390 px kind-select measurement.
14. U2-ux85-r2-1: response-card.tsx four texts; browser tests (response-letter.browser.test.tsx :71-77, :672).
15. Progress bar token classes (bg-muted / bg-primary).
16. Reconciliation h3 "Choose posting or EFT exports to upload" in page + reconciliation.spec.ts:101.
17. Contracts title/h3/kind label/"2.0 GiB" pinned in packets.spec.ts:628-634.
18. No packages/db, migration, pricing, ledger, worker/reconcile file in the diff.
19. Base moved: merge-tree clean (matches the description's statement).
Nit: "The web handler and the service check it" — there is one check path (handler -> responseDocumentChoosable in lib/packets), not two independent ones; recordResponseOnce does not re-check. Wording only.

## 3. Fast checks (clone, a97d6011, under /tmp/laneb-heavy.lock; Node 24)
- install --frozen-lockfile pass; typecheck pass (22 projects); lint pass (1,674 files, 0/0); lint:copy pass (540); lint:logs pass (1,085)
- vitest unit (components, lib, synth): 92 files, 1,324 passed
- synth --all: 0 written, 654 unchanged (16 EMR unchanged); git diff clean
- watched.ts --write: git diff clean; git status clean

## 4. CI on a97d6011
All 22 check runs completed. success: all green, mutation, screening-capacity gate, approval-of-record (x2), capacity, e2e 1/2 2/2, db 1-4/4, unit, lint, static, build, images, domain model, changes (x2). skipped (legitimate): stryker matrix (no money/pricing/ledger/packets path affected; mutation gate success), notify (runs only on failure).

## Verdict
passed. Notes: base moved past the merged base 83d71fd6 by #82 (bce57f16) and #83 (43565235); merge-tree clean, the merge step merges it again. Nit: the description's "The web handler and the service check it" names one check path twice.
