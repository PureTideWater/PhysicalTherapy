# Verify UX-DLR-04 (letter keeps Error:/aria-invalid after download; reload restores refused value)
Status: in progress 2026-10-27. Clone: scratchpad/verify-uxdlr04 at 63aaa7f4.
## Checked
- letter.tsx:97-104,59-76: marks + kept entries come only from searchParams (server render); no client code clears them. Confirmed.
- handler.ts:365: success is `attachment` -> browser stays on page, URL unchanged. Confirmed.
- download-refusal.tsx:80 ForgetRefusal renders only inside the notice; letter.tsx:107 renders notice only when marked.size===0 -> marked letter keeps refused/fields in URL (ADR 0079 L122-125 deliberate). Reload restores refused value + mark. Confirmed.
- Finding's example 'ABC' NOT reachable from the form: LETTER_CODES_PATTERN (letter.ts:39) == route rule; browser blocks submit. Only a crafted/edited URL gives fields=codes.
- Realistic path instead: contract select (letter.tsx:125-138) lists every payer's contracts; payer A + contract of B -> letterParties InputError field 'contract' (coverage.ts:175-176) -> same stale-mark state after correction.
- Design R16 + ADR 0079 Consequences L162-167 accept it, deferring to ux-forms' Field "clears a field's mark as the person types". origin/co-001/ux-forms @4f0b526d: Field/useFieldIssue read FormIssuesContext (server action state); no input-clearing code; ADR 0077 says nothing of it. Deferral's premise is false.
## Verdict
(pending: fix review)
- e2e download-refusals.spec.ts:120-129 itself drives the contract-mismatch refusal from the real form; :170-177 shows a good letter downloads and URL stays unchanged (from a clean URL only; the post-refusal success is untested).
- Screen p.coverage.error-letter-contract.390 shows the marked contract state.
- Fix review: finding's (1) per-control clear misses a pair refusal fixed by changing the payer (contract mark stays). Its (2) writes payer/contract/codes back into the URL, but letter.tsx:100-101 ignores entries on a plain visit, so "reload shows what was last sent" is false unless the page reads entries on plain visits, which widens ADR 0079's crafted-link residual (L168-171).
## Verdict
REAL, should-fix (agree). Better fix: client component in the form; per-control clear on input/change (drop id from aria-describedby, remove message), and on submit clear ALL marks + replaceState removing refused/fields/retry AND payer/contract/codes; no plain-visit reading. Correct ADR 0079 Consequences + Revisit-when and design R16 (ux-forms Field does not clear marks). Tests: letter.test.tsx (jsdom), e2e step: refused contract -> fix by payer change -> download -> no marks, URL clean, reload plain.
Status: done.
