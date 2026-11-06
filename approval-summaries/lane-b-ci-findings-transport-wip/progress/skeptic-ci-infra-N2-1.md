# Skeptic 2 of 3, ci-infra N2 (ci-findings-transport)

Clone /home/user/sk-cft-ci-infra-N2-1 at origin/co-001/wip-ci-findings-transport (head 1322c7cf..., read only; removed after).

## Reproduction
- notify (content-calendar.yml:177-196): with CHECK_RESULT=success and no artifact (three failed tries, or a re-run past
  the 1-day retention), findings.json stays empty, jq fails, body.md is
  "The content calendar check did not hand on its findings (the check: success) on main at abc: u" (simulated in a shell,
  same printf). The title is "Content calendar check failing". Nothing says the download failed; the run URL is there.
- tools/test/workflows.test.ts:1386-1399 asserts this body for ['success', null] (three downloads) -- the scenario is tested
  and the wording locked in.
- handoff (lines 118, 121) prints "the notify job could not read..." / "the notify job reads N findings..."; asserted at
  workflows.test.ts:1499 and 1508.
- Base 30871f72... has the same body printf (FINDINGS_B64 era), so the wording is inherited; this item makes the
  success-but-no-list path reachable by a new, ordinary cause (download failure, expiry).
- Mitigations: runbook content-updates.md:90 already names "findings the notify job could not download" and the re-run
  after expiry; the body links the run, whose log has gh's error per try. The handoff step is titled "Download the findings
  as the notify job does", so its "notify job" wording is a deliberate proxy statement, merely imprecise.

## Verdict
Not refuted. Real, reachable, cosmetic: nit. Fix: in notify, when CHECK_RESULT is success, write "The content calendar
check succeeded, but the notify job could not download or read this run's findings artifact (three tries; it expires a day
after the run) on %s at %s: %s -- see the run log" and keep the existing sentence for other results; update the
workflows.test.ts:1399 expectation per result. In handoff, "content-calendar: this run's findings read as N findings..." /
"content-calendar: this run's findings could not be downloaded or read (the check: %s)", updating lines 1499 and 1508.
Keep title "Content calendar check failing" (runbook row and dedupe depend on it).
