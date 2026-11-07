# repair-1 (S3, ux-forms-after-42)
Start: WIP head dab7d237 = origin/co-001/wip-ux-forms-after-42.
## Done
(none yet)
- KU1-1 / W1-F1: 53cd69c5 fix(screening) — seq-newer-wins (W1-F1 refined), choose() clears only its own message, no setNoFile(null) before send. Red logs/R1-upload-red.log (shown:1), green logs/R1-upload-green.log (7 files, 133 tests), static R1-upload-static.log.
- K-CE-1-02: 3c2ee966 docs(adr) sm:table -> ScrollTable in hidden sm:block.
- KW1-F2 + K-CE-1-03: 094de2c2 docs(adr) item 1 scoped to a field's refusal; exceptions named; Revisit-when follow-up; BRAND.md line.
- KW1-F3: 684dd9e7 docs(adr) 0037 status amended 2026-11 + 0077 item 1 names the full stop it supersedes.
- K-CE-1-05: ad08657c style(e2e) mail-notices empty first line.
- K-CE-1-01: bd5f2035 fix(shell). Red logs/R1-skiplink-red.log (padding 0px), green logs/R1-skiplink-green.log (2 passed). e2e needs DATABASE_URL=postgres://postgres:test@localhost:5433/postgres E2E_DATABASE=tp_e2e_ufa42 (5432 default fails: R1-skiplink-red-wrongdb.log).
- W1-F3: 877ce95c docs(adr) item 5 + item 1 + FRM-04 (test-matrix.md, matrix.ts, fixture via pnpm synth: logs/R1-synth.log, R1-verify-content.log). legal-surfaces.md untouched.
- W1-F2: 85a5f0a7 fix(screening) unconfirmed="mails-again" lead. Red R1-unconfirmed-red-unit/-browser; green R1-green-unit (9 files 197), R1-unconfirmed-green-unit2. Security reviewer ruling on two mails still open (not written into ADR).
- KW1-F7: 81c657de fix(settings) minutes/dollars + VERB_FIRST. Red R1-settings-guard-red, R1-settings-db-red; green R1-green-unit, R1-green-db (5 files 128).
- KW1-F6: 47a4ff0d fix(console) uploadAgreement signedOn. Red R1-signedon-db-red; green R1-green-db. compliance page hint left out of scope (not in item files).
- KW1-F4: 09377f21 test(onboarding) payers own it(); red R1-payers-red.log (payers.0 vs payers, base shape with words held), green R1-payers-green.log (23/23).
- Checks: R1-typecheck.log (0), R1-lint.log (0), R1-lint-copy (0), R1-lint-logs (0), R1-eslint2 (0).
- Pushed dab7d237..09377f21 to co-001/wip-ux-forms-after-42 (R1-push.log, hook ran).
- No change: KU1-2, KW1-OK (none); KW1-F5, K-CE-1-04 (brand-reviewer questions).
DONE.
