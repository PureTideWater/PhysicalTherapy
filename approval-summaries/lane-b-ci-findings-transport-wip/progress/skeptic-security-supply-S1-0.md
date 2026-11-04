# Skeptic 1 of 3, security-supply S1 (size refusal unpinned by tests)

Clone /home/user/sk-cft-security-supply-S1-0 at origin/co-001/wip-ci-findings-transport 1322c7cf… (read only; removed after).

## Reproduction
- Extracted handoff's run script from content-calendar.yml (yaml 2.9.1), two mutations: nobound (wc line deleted), cp (head -c replaced by cat). Fake gh copies a fixture into $RUNNER_TEMP/findings. MAX_FILE_BYTES=100.
- Fixtures: padded.json (one-finding list + 200 spaces, 234 bytes); xbody.json (the test's case, body 'x'*200, 233 bytes).
- Results (log scratchpad/cft/logs/sk-s1-repro.log):
  - HEAD: padded exit 1, xbody exit 1.
  - nobound: padded exit 0, "reads 1 findings, 101 bytes"; xbody exit 1.
  - cp: padded exit 1, xbody exit 1.
- So the tests' only over-bound case (xbody) gives the same outcome under HEAD and both mutations. Confirmed.

## Verdict
Real (not refuted). Severity nit: with the wc line gone, head -c still bounds the read at MAX+1 bytes, and a cut prefix
passes jq only when the bytes cut are trailing whitespace (the same list) or follow a closed array in an already
malformed file. The cp mutation changes only how much is copied to disk, never the outcome. No content or permission
consequence; the gap is a test whose name claims a refusal its case does not tell apart.

## Fix
Add a padded valid list (and a closed list followed by non-JSON bytes) past MAX_FILE_BYTES to notify's over case
("check failing") and handoff's over rows (exit 1). Assert downloadBlock's only line reading
"$RUNNER_TEMP/findings/findings.json" is the head -c "$((MAX_FILE_BYTES + 1))" line.
