# UX-DLR-15 verify (done)

Clone: verify-uxdlr15/repo at 63aaa7f4 (read-only; nothing run beyond reading; e2e logs of the integrate run reused).

Checked:
- letter.tsx:114 payer select is `required` with no blank option; payers come ORDER BY name_raw (remittances/queries.ts:75), so the alphabetically first payer is preselected.
- letter.tsx:125-137 contract select lists every payer's contracts in optgroups, no client guard; same structure as base e908c214 coverage/page.tsx:431-446 (pre-existing, but the PR rewrote it and added the codes pattern as the only pre-server check; design D6 "Before the server" names codes only; section 6 silent on contract).
- coverage.ts:163-177 route refuses a contract not of the payer with InputError field contract -> 303 back with marks.
- e2e download-refusals.spec.ts:120-129 itself submits PAYER_NONE + Q's agreement through the form with no noValidate and gets refused -> reachable by ordinary use. The seed's first payer (SYNTHETIC PAYER DLR) has no contract, so picking the only listed contract without touching Payer is refused.
- Shot screens-after/tiles/p.coverage.error-letter-contract.1280/03.png shows the after state (marked, kept).
- PR already has a client-component pattern (forget-refusal.tsx: 'use client', useEffect, returns null).

Verdict: REAL, nit (severity right). Fix refined: setCustomValidity guard (data-payer on each contract option, listeners on both selects, run on mount), not disabling optgroups/resetting (a disabled-but-selected kept contract is dropped from GET form data per HTML; a reset discards a choice silently). e2e step 2 asserts the guard then sets noValidate to reach the server.
