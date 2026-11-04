ACTING (Lane A's account, https://claude.ai/code/session_019i9ifCJSbPYXpafL86Rm6J) holds this item from 2026-11-04T11:40Z; Lane B: read lanes/lane-b.md's latest entries before resuming.

# redact-label-boundary (`co-001/redact-label-boundary`): status

A PHI-redaction defect on the base, from #75 (`packages/model-gateway/src/redact.ts`). In "Patient: AA CLAIM.\nID:1990-01-01", a head word that ends the sentence before (here the end of the patient's name) joined the bare "ID:" after it into one "Claim ID" label. `labelFor` then refused that label for a member ID written as a date, so the member ID went to the model. MOD-13's unseeded property found it on #85's CI (seed 460548619).

## Ruling
Lane A's orchestrator, 2026-11-04 11:35 UTC: make it its own small PR now, in parallel with #85's finish.
- **The fix:** a sentence end breaks a label's head.
- **The tests:** a failing-first test, with seed 460548619 pinned.
- **The sweep:** every other label head, checked for the same boundary class.
- **Reviews:** two adversarial reviews, security (PHI) and then correctness with the redaction oracle.
- **Merge:** under the up-to-date rule.
- **Afterwards:** send the diff to S2, S3, S4 and the schema chain. redact-ssn-phone then builds on top of it.

## Log
| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-11-04 11:40 | Started | Worktree `/home/user/redact-label-boundary` from 24531dc2. Workflow wf_b20c6884-fa4 (script archived) runs: build (reproduce, fix, sweep, tests, the ADR 0054 line), the security review then the correctness review with a skeptic per finding, the full suite once, and a critic. No push yet. No new test-matrix id; no new ADR. |

## Next
The push, a draft PR from the template, CI, ready, an up-to-date check, the merge, the diff to the four sessions, then redact-ssn-phone.
| 2026-11-04 ~17:30 | Built, reviewed, suite; PR | wf_b20c6884-fa4 (12 agents): a01a0737 (root: a sentence end breaks a label's head; backstop: the line/sentence-start label counts), then review fixes 3356df22 (oracle-1), cbe89f0c (sec-1, major), 4a51f77e (sec-3), 30946b56 (sec-2), d6e2b3d9 (critic), 24b93397/e5c4caf2 (test timeouts). Class probe on the base: 1,350 member-ID and 420 claim/PCN leaks; after: 0 of the class (705 tab-joined one-line labels remain, G2 by design, pinned). Full suite on e5c4caf2: unit 7,478 / 4 skipped; golden 381; oracle 689; eval 300/300; db 140 files; e2e 70; mutation none; critic READY-TO-PUSH. Base 9b237a93 merged clean as **83414ebd** (typecheck, lint:logs, check:fixtures, model-gateway unit 589, eval pass). **Pushed; draft PR #115**; subscribed. Reports `lane-b-redact-label-boundary-wip/`. Next: CI, ready, merge, diff to S2, S3, S4 and the schema chain. |
