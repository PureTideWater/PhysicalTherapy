# ci-findings-transport: adversarial review, CI and test infrastructure (progress)

DONE. Review: approval-summaries/lane-b-ci-findings-transport-review-ci-infra.md.
- Clone /home/user/rv-cft-ci-infra at 1322c7cf… (= origin WIP), base 30871f72…; baseline 177/177; actionlint clean.
- 20 mutations under the lock (scratchpad cft/rvci/results.jsonl): 16 red; W1 (no rm -rf), W2 (no pause), W3 (-lt), W13 (no head -c, harmless) survive.
- O_EXCL partial-download scenario run (logs/rv-ci-excl.log): rm -rf is load-bearing.
- Findings: S1 fake gh does not model gh's O_EXCL, rm -rf untested; S2 the pause untested; N1 no at-bound notify case; N2 "check: success" in the check-failing body / handoff says "notify".
- Nothing blocking. Clone removed after the write.
