# PR #106 review (lane B, co-001/ci-trivy-install-2026-11-04), reviewed at f3cb5a81

Two lenses (ci-infra, security-supply) plus a skeptic. No blocking defect. CI on f3cb5a81 confirmed both fixes on the
private repository (images job green with setup-trivy skipped; screening-capacity `changes` passed; the capacity job
stopped with RUNNER_TOO_SMALL as predicted).

Confirmed findings: 2 should-fix, 8 nits.
- ci-infra S1: the CI-11 private-repository guard was narrower than its title and texts (git global options, curl of
  $GITHUB_API_URL/server/repo name, tools/** scripts got past it).
- security-supply S1: release.txt took the Trivy version out of an aged action pin into a file no machine aged.
- Nits: setup-trivy still downloaded at Set up job; "runs offline" wording and O15 missing from the audit (twice);
  ci.md conflict with #86; Sigstore verifiable offline; TRIVY_CMD absolute path; curl https-only; DB pulled by tag.

Waits on the founder: runner/organization decision (issue #102) for the screening-capacity gate; O15 attestation on a
private repository; ADR 0066's "goes private" revisit trigger.
