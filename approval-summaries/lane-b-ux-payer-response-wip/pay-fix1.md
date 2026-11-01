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
