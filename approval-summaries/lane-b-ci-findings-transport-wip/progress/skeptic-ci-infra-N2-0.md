# Skeptic 1 of 3, ci-infra N2 (check-failing wording; handoff log names notify)

Clone at origin/co-001/wip-ci-findings-transport = 1322c7cf… (read only; removed).

Reproduction (by reading .github/workflows/content-calendar.yml):
- notify, CHECK_RESULT=success and the download fails three times (or the artifact expired): findings.json stays
  empty, the jq shape check fails, body.md = "The content calendar check did not hand on its findings (the check:
  success) on <ref> at <sha>: <run url>". Reachable, as the finding says.
- handoff lines 118/121 print "the notify job could not read…" / "the notify job reads…"; workflows.test.ts:1499,1508 assert them.

Why refuted:
- Every word is true: the check did succeed, and from notify's side its findings were not handed on. The run URL
  leads to gh's error, printed on each try. The design (ci-findings-transport.md §8 "Issue text", :790-792) weighed
  this exact case and kept the sentence on purpose ("which is true, and the run link leads to gh's message").
- docs/runbooks/content-updates.md:90 already lists "findings the notify job could not download" and "a run re-run
  after its findings expired a day later" as causes of this issue, with what to do.
- handoff copies notify's download word for word and exists to show what notify would read (step name "Download the
  findings as the notify job does"; §9 R7 records "the notify job reads M findings, N bytes, SHA-256 X" as the
  evidence of record). The notify-named lines are designed, not a slip.
- Changing them means editing the design-approved text, two test assertions and the §9 run-record line. That is
  churn with nothing gained.

Verdict: refuted=true, severity none (at most a wording preference).
