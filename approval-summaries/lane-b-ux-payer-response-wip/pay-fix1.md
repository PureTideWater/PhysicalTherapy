# pay-fix1: fix round 1 for #85 (co-001/ux-payer-response, from 90ec40ab)
Started 2026-11-01. 13 real findings + critic n1-n7 (n8 elsewhere: tour + PR description, outside repo).

## Code applied (uncommitted, in /home/user/ux-payer-response) — tests/docs still to do
- S2-N1 + U2-r2-5: RESPONSE_HINT covers every answer per case_rules (Denied without reopening -> Resolved; info requested / reopening denial -> Awaiting response), quoted options/states.
- S2-N2: Received on starts empty, required, with hint (window counts from it); route refuses empty on receivedOn with RECEIVED_ON_EMPTY 'enter the date the payer’s letter was received'.
- S2-N3: responseDocuments splits unused into 'unused' (uploaded_by = app_actor_id()) and 'unusedByOthers'; groups "Letters you uploaded that no response names yet" / "Letters others uploaded that no response names yet". (n6) thisCase listed whole, limit 50 over the rest.
- ux85-1/U2-r2-1: UploadGate.title; suspendedGate() maps the 3 exact organization_run_refusal texts to upload words ("Uploads are paused"/"Uploads are closed"), fallback keeps DB text; uploader renders gate.title; response card description by canUpload && gate.open.
- ux85-2: drop zone p-4 sm:p-8.
- U2-r2-2: letterOption "Uploaded here, {utc}: payer letter, SHA-256 x…" / "{utc}: payer letter, …"; stored-not-chosen says starts “Uploaded here”.
- U2-r2-3: single.tooLarge; "The file is empty." / "The file is larger than X; save the letter as a smaller PDF."
- U2-r2-6: region aria-labelledby heading (useId).
- U2-r2-7: progress classes from tokens (bg-muted / primary).
- ux85-5: Contracts title "Upload a contract, exhibit or payer’s terms letter", heading "Choose contracts, exhibits or payer’s terms letters to upload".
- ux85-7: Contracts description uses formatBytes.
- n1: new status duplicate-not-chosen. n4: DOCUMENT_USE_LOCK exported from tagging.ts, used by submissions.ts (test keeps its own literal on purpose: pins the key Lane A matches). n6: duplicate-unusable words true for an unlisted copy; thisCase listed whole.
## For the tour / n8 (outside repo)
- tour.spec.ts:716 CONTRACT_UPLOAD regex must accept "Upload a contract, exhibit or payer’s terms letter".
- tour notes mentioning “(uploaded here)” (2896) now "Uploaded here, " at the start.
- tour 2781 already fills an empty Received on.

## Resumed 2026-11-01 ~19:20 UTC
- Verified the uncommitted code against case_rules.sql, organization_run_refusal.sql, source_document.uploaded_by/app_actor_id(). OK.
- Tightened RESPONSE_HINT: "... “More information requested”, or a denial that reopens it, marks it “Awaiting response”. A case its lines already decide keeps their state: a line at “Payer approved” or “Recovered”, or every line written off. At the next reconcile ..."
- NEXT: tests (response-letter.browser, billing-routes.db, workbench-routes.db, packets.spec e2e), docs (ADR 0085, test-matrix + matrix.ts CAS-45..48), synth, checks, commit.
- Tests written: packets.spec.ts (Received on empty+required+hint, fill with submission date, log shows it; option "Uploaded here, ..." under "Letters you uploaded ..."; hint regex covers all answers); response-letter.browser.test.tsx (new strings, DROP_ZONE region by heading, 4 groups, duplicate-not-chosen, single empty/too large, paused title, unusedByOthers duplicate); billing-routes.db.test.ts (nonpayment/held/closed gate words on Uploads, Contracts, Reconciliation [n7]; suspendedGate fallback); workbench-routes.db.test.ts (receivedOn empty/absent/blank/malformed refused on field; window counts from the date entered [daysFromToday]; denied w/o reopen -> resolved; groups by uploader both ways; thisCase listed whole past the limit); uploads.db.test.ts title null; uploads.spec.ts region names (done before).
- Docs: ADR 0085 D1 (Received on empty; Response words per case_rules), D3 (4 groups, option order, closed-uploads titles, single words), D4 drop "the console's count" (n3), Consequences (S2-N3 second residual; costs). CAS-46/47/48 rows identical in test-matrix.md and matrix.ts.
- n2: design-doc table wording ("since the upload began") vs rule; ADR and code agree (never over the person's choice). No repo change; for the design doc.
- n5: design says "No synth fixture" but generator writes CAS-45..48 expected.json (CAS-39 precedent). No repo change; for the design doc.
- n8: tour + PR description, done elsewhere.
- For design 6.1 (outside repo): closed card row; option row "Uploaded here, {utc}: payer letter, SHA-256 …"; single refusals; Response hint; Received on hint/refusal; group labels; "Uploads are paused/closed" titles.
- Results so far: vitest unit (packets, uploads, test-support, cases page, routes/uploads, lib/packets): 8 files 56 passed; response-letter browser 19 passed (Chromium ran). db run 1: workbench + reconciliation + contracts passed; 3 failed: uploads.db (gate title) and billing (contractsPage needs a practice cipher the billing suite does not provision) -> moved Contracts/Reconciliation paused-gate checks into contracts-routes.db and reconciliation-routes.db (suspend, check, reinstate in finally); billing keeps Uploads (nonpayment, held, closed, fallback). Rerunning.
- synth --all: wrote CAS-46/47/48 expected.json; watched.ts --write after staging: no diff.
- db rerun: billing, uploads, contracts-routes, reconciliation-routes: 4 files 54 passed. workbench-routes passed in run 1.
- lint:logs clean; eslint (all touched .ts/.tsx) clean; pnpm typecheck clean. lint:copy flagged "Recovered" unlabelled in RESPONSE_HINT -> reworded "a line at “Payer approved” or later, or every line written off" (equivalent: stages monotonic); lint:copy clean.
- e2e packets.spec + uploads.spec running (build here, 5433).
- e2e (build here, 5433): packets.spec + uploads.spec 5 passed (3.4m).
- After final staging: synth --all 0 written; watched.ts --write no diff.
- COMMITTED 2865db68 locally (not pushed). DONE.
- visibleChanges: submissions default/error/error-unchosen-response/error-unchosen-channel/notice/letter-refused/letter-scanning/letter-list/uploads-paused (x3 widths); contracts default/kind-letter/packets/uploads-paused (x3); reconciliation uploads-paused (x3), reconciliation.default.390, uploads.default.390, uploads.era-format.390.
