# check-K-CE-1

Started 2026-11-07. Read design. Next: clone.
- Clone /home/user/ux42-K-CE-1 at dab7d237, installed (lock).
- Finding: skip link focused has padding 0 (focus:not-sr-only padding:0 beats px-3/py-2), 20px tall; unfocused 8px 12px. Log logs/K-CE-1/skip-link-padding.log.
- Finding: ADR 0077 amendment says Invitations table is "a sm:table table"; page now wraps it in div.hidden.sm:block.
- tables/form-hints/synth fixtures pass at head; tables and form-hints red with the base pages (logs K-CE-1/*-red-base-page.log). CI-30 row word for word (design, md, matrix, registry); CI-30 allocation confirmed in status file.
- runTag: 400k clinic names, no PHI hit (runtag-phi.log).
- Finding: "Refused: {msg}." / "payer's copy cannot be printed:" contradict ADR item 1's "only colons" and BRAND.md line.
- Nit: Ticket hint says "Tickets"; the screen is "Support tickets".
- Confirmed with the app's real globals.css compiled: focused skip link padding 0, 20 px tall.
- Clone removed. DONE: 5 findings (1 should skip-link padding, 1 should ADR sm:table, 1 should ADR/BRAND colon claim, 2 nits).
