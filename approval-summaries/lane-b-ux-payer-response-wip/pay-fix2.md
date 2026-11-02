# PR #85 fix pass 2 (progress)
Started 2026-11-01 (resumed run; no earlier progress file, worktree clean at 2865db68).

- F1 (should-fix) card text unproven: APPLIED. New apps/web/src/components/packets/response-card.tsx (ResponseCardDescription,
  responseCardText, letterOnFile), rendered by submissions/page.tsx AND the forms harness, so the harness tests the page's own
  component. Browser test asserts all four texts + data-can-upload-here/data-letter-on-file (viewer with letter on file,
  paused with none, paused with one, open with one, open with none). e2e asserts the open/no-letter text on the real page.
  (Suspending the org in e2e rejected: SYNTHETIC OTHER PRACTICE's organization is shared by parallel journeys.)
- F2 (polish) closed + none on file contradicted hint: APPLIED: "To the submission of {date}. No payer’s letter is on file, and
  none can be uploaded here now, so no response can be recorded yet; the note under Payer’s letter says why." Also fixed the
  same contradiction in the open branch: with none on file it no longer says "or choose one already on file".
- F3 (polish) duplicate-not-chosen names the copy: APPLIED: status names the copy's upload time (utc()), as its option starts;
  new status duplicate-not-chosen-other-case adds where it is listed and to check it answers this case. n1 test extended.
- F4 (polish) 390px select / progress tests: APPLIED. e2e selects payer_letter on Contracts, atPhoneWidth, then measures at 390
  that a select of the same classes needs no more width for the text than the select has (field.tsx cutChoice's method;
  scrollWidth of a select does not reflect a cut label). Progress bar: harness test asserts the token classes on the
  <progress> (harness compiles no Tailwind, so computed colours cannot be read there).
- Docs: ADR 0085 D3, test-matrix CAS-47, matrix.ts, CAS-47 expected.json (synth --case CAS-47: unchanged), design 6.1 rows.
- Checks: typecheck clean; eslint clean; lint:copy; verify-content; browser 17/17; e2e packets.spec 2 passed (DB dropped). Committed cf6d0f42 (not pushed). DONE.
