# PR #116 (the dark sign-in frame): the UX and brand review

One UX and brand review of draft #116 at a3344d93, with the before (9b237a93) and after (0764aa74) tour shots: 104 a side, 0 skipped (26 states at 1280 and 390 px, light and dark). Skeptics confirmed both findings and refuted none. There were no B or S findings.

| Finding | Severity | What | Verdict |
| --- | --- | --- | --- |
| UXD116-N1 | N (advisory) | Dark ground on sign-in reads BRAND.md section 4 over section 7's "Paper ground". The brand owner has not settled this (ADR 0056:134) | Real, nit. The fix is no code change: keep the PR body's "For the brand owner" line |
| UXD116-N2 | N (recommendation) | The dark axe run skipped enrol, new-password and register-key. Their shots read well (fg on raised 15.36:1, muted 7.68:1), but no test asserted it | Real, nit. The fix is optional dark axe calls in sign-in-time.spec.ts |

Light was unchanged: 42 of 52 shots are pixel-identical, and the other 10 differ only in per-run synthetic values. All 52 dark shots changed from the Paper ground to --pw-bg.
