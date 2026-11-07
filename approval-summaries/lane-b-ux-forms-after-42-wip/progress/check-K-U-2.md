# check-K-U-2 (adversarial checker round 2, slice U)
Status: started 2026-11-07. Clone /home/user/ux42-K-U-2 at co-001/wip-ux-forms-after-42 (expect 09377f21).
- done: clone at 09377f21; legal marker word for word vs base (line moved only); retention.ts/address.ts/legal-surfaces.md unchanged; method=post, no action.
- candidate KU2-1: "mails-again" unconfirmed lead says "a second email follows" unconditionally; routes.db.test.ts "before the first is priced" sends 1 mail (likeliest case: immediate re-press). To prove by db test run.
- candidate KU2-2 (nit): choose(null) (clearing the file) also clears the no-file message.
- running: install + typecheck + upload tests under lock (bg).
- done: install, typecheck (tc=0), upload-form.test + action-form.browser (63/63 pass) -> ku2/upload-tests.log.
- done: FRM-04 new case red against dab7d237's upload-form.tsx (shown:1) -> ku2/frm04-at-dab.log; green at HEAD. KU1-1 fixed.
- done: resend db tests pass (ku2/resend-db.log): early re-send = 1 mail, so KU2-1 CONFIRMED (lead says "a second email follows" unconditionally).
- KU2-2: new lead departs from design 2.1 Words ("unconfirmed lead ... unchanged"), not brand-reviewed, not in the report's design-departure list.
- dropped: clearing-file nit (unreachable: an empty input fires no change).
- clone removed. Status: DONE
