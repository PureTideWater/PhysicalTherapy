# Skeptic 3 of 3, ci-infra N2 (ci-findings-transport)

Clone /home/user/sk-cft-ci-infra-N2-2 at origin/co-001/wip-ci-findings-transport 1322c7cf... (read only; removed after).

## Reproduction
- notify's check-failing body is `The content calendar check did not hand on its findings (the check: %s) ...`
  with CHECK_RESULT; tools/test/workflows.test.ts:1399 asserts it for result success. Strings exist as stated.
- handoff lines 118/121 print "the notify job could not read / reads ..."; test lines 1499, 1508 assert them.

## Verdict: refuted (not a defect)
- "(the check: success)" is the true value of needs.check.result; the body does not claim the findings were handed
  on. The issue links the run, whose log carries gh's error from each of the three tries.
- docs/runbooks/content-updates.md:90 (the "Check failing" row) already names "findings the notify job could not
  download" and "a run re-run after its findings expired a day later", and says what to do. ADR 0071 says a failed
  download opens "check failing".
- handoff's naming of the notify job is deliberate: its comment (lines 72-73) and step name say it proves the
  download "as the notify job reads it", with lines held word for word equal to notify's by the test.
- At most an optional wording polish (a body clause for CHECK_RESULT=success naming the download); not needed.
