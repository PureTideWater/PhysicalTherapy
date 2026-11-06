# Skeptic 1 of 3, ci-infra N1 (no exact-MAX_FILE_BYTES case in notify or handoff)

Clone /home/user/sk-cft-ci-infra-N1-0 at origin/co-001/wip-ci-findings-transport 1322c7cf... (node_modules symlinked from the main checkout, lockfile identical). Removed after.

- Code: .github/workflows/content-calendar.yml:114 (notify) and :189 (handoff), `[ "$(wc -c < findings.json)" -le "$MAX_FILE_BYTES" ] || : > findings.json`.
- Tests: tools/test/workflows.test.ts:1415 (notify) and :1503 (handoff) are the only bound cases, both MAX_FILE_BYTES='100' with a 200-x body (about 230 bytes). No case at 100 or 101. content-calendar.test.ts:586-587 pins findingsJson at the byte, so the two sides are not tied together at the edge.
- Mutation: -le to -lt in both blocks; `vitest run --project unit tools/test/workflows.test.ts -t content-calendar`: 12 passed, 0 failed (logs/sk-N1-0-mut.log). Restored after.
- Shell probe of the two lines, bound 100: unmutated keeps a 100-byte file and empties a 101-byte one; the mutant empties both. So the mutant refuses a file findingsJson accepts, and notify files "check failing" (handoff exits 1).

Verdict: not refuted. Real test gap, nit. Fix: in the notify bound case and the handoff loop, with MAX_FILE_BYTES '100', a list of exactly 100 bytes (asserted with Buffer.byteLength) is read (notify files the finding, handoff exits 0) and one of 101 bytes is refused (notify files "check failing", handoff exits 1).
