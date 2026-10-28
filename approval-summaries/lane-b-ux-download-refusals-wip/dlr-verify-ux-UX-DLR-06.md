# UX-DLR-06 verify (skeptic)
Clone: scratchpad/verify-ux06 at 63aaa7f4.
Checked so far:
- letter.tsx:103 payer = kept only if among options; :114 select has no empty option, so defaultValue undefined -> first payer shown. CONFIRMED by code.
- Route (lib/routes/coverage.ts letterParties) not_found <=> payer not in `payer WHERE practice_id` = same set as payerOptions (remittances/queries.ts:75). So a marked payer is ALWAYS shown as the first option (not_found or invalid fields=payer both keep no listed payer).
- Shot p.coverage.error-letter-payer.1280: SYNTHETIC PAYER N, red border, "Error: Payer: choose one of the payers listed." CONFIRMED.
- e2e download-refusals.spec.ts:141 expects option:checked = PAYER_NONE (first). CONFIRMED.
- Realism: payers are never deleted (job DELETE refused 42501; no DELETE FROM payer in code); no app link builds letter?payer=. So reached only by an edited/foreign URL. Lowers frequency, but the PR designs/tests/shoots this exact state.
- Design D6: "anything else falls back to today's default" -> code follows design; the design missed the contradiction.
- Precedent: uploader.tsx:359 `<option value="">Choose the system</option>` with required (no `disabled`).
Leaning: real, should-fix ok (or downgrade?); fix ok, better without `disabled` (house pattern).
- Unit test letter.test.tsx:132 also codifies it (shown = PAYER_Q, the first option).
- Chromium probe (scratchpad/verify-ux06-probe/probe.mjs, React SSR + playwright from verify-ux01's install): current markup -> shows PAYER N, value a1, form checkValidity() true (Download sends N). With `<option value="">Choose a payer</option>` + defaultValue "" (with or without `disabled`) -> shows "Choose a payer", valueMissing true, form invalid. Fix works; plain (no disabled) matches house pattern uploader.tsx:359.
- 390 and 1280-dark shots show the same as 1280.
VERDICT: real, should-fix (rare: only an edited/foreign URL reaches it, payers are never deleted; but the PR builds, tests and shoots this state and it contradicts itself and lets an unchosen payer download). Fix: finding's, but no `disabled` (house pattern), condition `marked.has('payer') && payer === undefined`, update letter.test.tsx:132 as well as spec:141. DONE.
