# PR D (#105) review, head 693f0500

One adversarial review (test-only change, speed rule 3), each finding checked by a skeptic. Refuted: none.

| ID | Finding | Verdict |
| --- | --- | --- |
| S1 | Head not green: ci 41770379745 `images` fails at "Install Trivy" (exit 6), so `all green` red; same on base push run 41763423759 (4846f043) | Real; infrastructure, not D. No D change. Merge waits for the Trivy fix (co-001/ci-trivy-install-2026-11-04) on the base, a base merge and green CI on that head. A re-run of the old run does not help (old merge ref). |
| N1 | "A repeat names its own await" held only inside shownCount; S-SEC-2's cleared wait (:378) kept the 30 s default | Real (nit) |
| N2 | sameBytes' failure text shows non-ASCII as latin1 mojibake | Real (nit) |

Found sound: both shownCount copies monotonic (rAF-polled), settled exact asserts deterministic and catch a double insert, no timeout for CAS-41.3 backed by profile, forced reproduction (exact 3/3 at D=0, 0/3 at 30/100/200 ms; monotonic 3/3 everywhere), no other exact-value wait on a moving counter, no new test-matrix ID. CI unit on 693f0500 green (7,306 passed).

Evidence: scratchpad d/logs/review-probe-*.txt, d/ci/review-*.log, d/progress/review.progress.md.
