# repair-2 (S3)

Start: 09377f21 (= origin WIP). Status: done.
- KU2-1/KW2-1/W2-F1: f5fb2894 fix(screening) conditional lead. Red logs/R2-mails-red-unit.log, R2-mails-red-browser.log; green R2-mails-green.log (63/63).
- KW2-2/K-CE-2-01/W2-F2: 31b9ced5 docs(brand). lint:copy 0 (R2-brand-lintcopy.log), verify-content 0 (R2-brand-verify-content.log).
- W2-F3: 6f510bea test(routes) guard reads rerun.ts (RerunRefusedError incl. SUPERSEDED_MESSAGES record) and lib/contracts. Red logs/R2-guard-red.log (0 vs >=12), mutation red R2-guard-mutated-red.log (3 hits), green R2-guard-green.log (49/49). Not read still: lib/console, lib/cases/write-off.ts (report).
- W2-F4: 9c1c1187 docs(test-matrix) CI-30. Fixture drift red logs/R2-ci30-fixture-red.log; pnpm synth --all R2-synth.log (1 written); verify-content R2-verify-content.log 0; synth unit R2-synth-unit.log 192/192. Design 5.1 CI-30 text amended (orchestrator).
- K-CE-2-02 (with K-CE-1-04): 76da396a fix(console) hint 'as Support tickets shows it'. No test or shot pins the hint (grep). Design lines 353, 362, 715 edited in /home/user/ops working tree (uncommitted, for the orchestrator). Brand reviewer to confirm.
- KU2-2: no code commit (follows f5fb2894). For the orchestrator's design-departure / waiting list: the screening-only "mails-again" lead, final words " If PaidWhole had already emailed you the first screening, a second email follows, and only the newer email’s link opens the screening." (design 2.1 Words said unchanged; allowed by design §8 conditions). Proven by routes.db.test.ts 'before the first is priced…' (one mail) and 'after the first is priced and mailed…' (RESEND_LATE_MAILS = 2). For the ux-brand-reviewer (§9 list). Security reviewer's ruling on two mails open; ADR 0077 not amended until then. The sentence says a result link stops opening: orchestrator to decide whether counsel sees it (next to screening-kept-email).
- KU2-OK, KW2-OK: none.
- K-CE-2-03: at 76da396a (built, stamped): typecheck 0 (R2-typecheck.log), lint 0 (R2-lint.log), build 0, stamp R2-stamp.log, full e2e 84/84 E2E_PREBUILT=1 --workers=2 on 5433 (R2-e2e-all.log), K-CE-2 probe re-run (copied in, excluded, removed; never committed): topmost true, 145x36 px, outline solid, Enter -> #content at 1280, 390, 320 (R2-skiplink-probe.log). /home/user/ux42-K-CE-2 removed.
- Pushed ff 09377f21..76da396a to co-001/wip-ux-forms-after-42 (R2-push.log, hook ran).
DONE.
