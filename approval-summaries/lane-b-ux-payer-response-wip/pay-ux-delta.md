# PR #85 UX/brand DELTA review (after fix rounds 1-3)
Started 2026-11-01 (resumed run, fresh progress file). Head under review: local HEAD cf6d0f42 + uncommitted fix 3. Shots: after2 at cf6d0f42.
## Findings to confirm (ux track, real): ux85-1, ux85-2, ux85-5, ux85-7, U2-r2-1, U2-r2-2, U2-r2-3, U2-r2-5, U2-r2-6, U2-r2-7; sec with UI: S2-N1, S2-N2, S2-N3
## Progress
- Read fix 1-2 code diff (90ec40ab..cf6d0f42) and fix 3 uncommitted diff.
- `p.submissions.default.1280` / `.390` (after2): card text (open, letter on file) ok; Received on empty mm/dd/yyyy + hint; Response hint quoted (fix-1 wording; fix 3 wording not in shots, judged from code); drop zone p-4 at 390 OK; "2.0 GiB". S2-N1, S2-N2, U2-r2-5, ux85-2(pad) fixed on screen.
- `p.submissions.error-unchosen-response.1280`/`.390`: three refusals on fields (Payer's letter, Response, Received on), summary links; Received on empty refused "enter the date the payer's letter was received". S2-N2 OK. (summary order Response-first = ux85-3, judged not real, not raised.)
- `p.submissions.error.1280`: letter option starts "2026-11-01 20:17 UTC: payer letter, SHA-256 …" (U2-r2-2 OK); Received on kept 11/01/2026 after refusal.
- `p.submissions.uploads-paused.1280` + dark: title "Uploads are paused", upload words, card says choose letter on file (ux85-1, U2-r2-1 OK). Dark date-picker icon dark-on-dark is base (before shot same) - not this PR.
- `p.submissions.letter-list.1280`: group "Letters of this case's earlier responses", option date-first. OK.
- `p.contracts.kind-letter.390`: card title "Upload a contract, exhibit or payer's terms letter", drop zone "Choose contracts, exhibits or payer's terms letters to upload", "2.0 GiB", select whole "Payer's terms or policy letter" (ux85-2, ux85-5, ux85-7 OK).
- `p.contracts.uploads-paused.390`, `p.reconciliation.uploads-paused.1280`: "Uploads are paused" + upload words. OK. Candidate (not caused): reconciliation empty Exports says "Upload ... above" while uploads paused.
- `p.uploads.default.390`: shared drop zone p-4 at 390, named by heading. OK.
- `p.case.error-unchosen.390` spot check: unchanged by fixes. OK.
- `p.submissions.error-unchosen-response.1280-dark`: errors, links, hints legible. OK.
- Code (no shot): duplicate-not-chosen(-other-case) words, single-mode refusals, progress bar tokens, "Uploads are stopped" fallback, fix-3 hint (true to case_rules.sql reopened_lines), contracts h2>h3 + aria-labelledby, Received on schema same strictness as isoDate. OK.
## Result
No findings against this change. Other (not caused, polish): `p.reconciliation.uploads-paused.1280` Exports empty state says "Upload ... above" while uploads are paused (reconciliation/page.tsx:314).
DONE
