# review-SEC: security and privacy review of #132 (head 76da396a, base 31a7345f)
Status: DONE 2026-11-07. Read-only clone /home/user/rv42-SEC (removed). Nothing run (static review; tests/shots already recorded on this unchanged head).
Checklist: .claude/agents/security-reviewer.md (no migration, no packages/db, no new query/job/table, no model call; nothing logged: no console/logger/storage line added in the diff).

## Design section 9 checks: all PASS
1. File in memory only, no value in a URL: upload-form.tsx:324 `<form method="post">` with no action; file input :186-196 has no name; body built only from FormData + parse result (:287-297); no web storage (grep empty). Pins: upload-form.test.tsx:47-48; no-JS e2e forms-keep-input.spec.ts (no search, no value in any URL, no filename=, no file bytes; nothing screened). Shot screening.no-javascript.*.
2. stale = origin only: publicRoute (invoke.ts:382) gives csrf_refused only from sameOrigin; csrfToken false for public (invoke.ts:369); parse(..., false) never makes a requestKey issue (invoke.ts:105-110); screening has no requestKey field. next.ts:169 is the only stale mapping. OriginLead (form-issues.tsx:720-735) claims no refresh; appOrigin = services.origin (screening/routes.ts:225) = config APP_ORIGIN (config.ts:331), passed by app/screening/page.tsx:94; never window.location. Pin upload-form.test.tsx:216-218.
3. Detector unchanged: textPhiFindings/screened( call counts equal base vs head (screening/routes.ts 5/5, onboarding.ts 7/7; apps-wide 14/14); only NO_PATIENT_INFORMATION's text (colon -> semicolon, "then send it again") and its home (schemas.ts) moved.
4. Sign-in words only: sign-in.ts:151,418,638,723 punctuation; CODE_REFUSED stays one refusal for every cause; no step, lock or outcome change. account.ts:349 punctuation only.

## Also
- Legal surfaces: retention.ts, address.ts, legal-surfaces.ts/.md, tools/test unchanged; data-legal-surface marker set identical base vs head (only extra grep hit is messages.test.ts:60, a test); upload marker kept at upload-form.tsx:93. The new "Not confirmed" sentence says nothing kept/deleted: not a legal surface.
- PHI in messages: every new interpolation is a row/column number, a constant, a field label or a configured origin; no cell value, header text or typed value reaches a server message.

## Ruling: late re-send after "Not confirmed" (routes.db.test.ts:84 RESEND_LATE_MAILS = 2)
ACCEPT, do not prevent in this PR. Reasons: same recipient as typed; the mail carries a link, no patient data (totals only); the server revokes the first link (routes.db.test.ts:498 not_found) so one live bearer link exists at a time (least exposure); this is the pre-existing one-screening-per-practice replacement the About card already discloses (upload-form.tsx:341); the lead tells the truth (form-issues.tsx:694, shot screening.error-unconfirmed.1280); mail volume is bounded by the account rate limit. Preventing it (dedupe identical prospect+rows after mailing) would keep an older link alive longer and change ADR 0062 replacement semantics: a product change, not safer. Keep RESEND_LATE_MAILS and both re-send cases as pins; change the test comment from "Recorded, not ruled" to cite this ruling.

## Findings
- SEC-N1 nit: routes.db.test.ts:77-83 comment says "Recorded, not ruled": update to the ruling above.
Blocking: none. Should: none.
