# PR #106 fix round (lane B), head 78cd55d2, base 4846f043 (not moved, no merge)

Commits:
- c408047f: CI-11 guard catches every git/curl form and scans shell scripts and the TypeScript the steps run (red first,
  11 of 21 forms survived the old regex; injected mutations killed).
- b1a108f4: check-action-pins ages a new Trivy or gitleaks release.txt version by its tag's commit; deleted tag refused
  (red first, 3 cases; CI-21 amended).
- 8e2fc06a: TRIVY_CMD absolute path; both installers https-only (--proto '=https,file' --proto-redir '=https').
- 78cd55d2: ADR 0066 and ci.md updated (offline Sigstore verification recorded, O15 audit line, follow-ups named).

Local suite: all green; unit 7,313 passed / 4 skipped in 432 files; golden 376; actions:check aged trivy 0.70.0
(201 days). test:db and e2e left to CI.

Still waits on the founder: issue #102 (runner/organization; the screening-capacity gate fails on this PR until then),
O15, ADR 0066's revisit trigger. Follow-ups proposed: pin-time Sigstore verifier, running trivy directly, DB source.
The session marks ready and merges.
