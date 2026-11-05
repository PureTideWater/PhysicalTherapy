COUNTER ALLOCATED (orchestrator, 2026-11-05 02:09 UTC): test-matrix **SEC-24** for "An untrusted document is read in its own process" (SEC-20 to SEC-23 went to #113; the next free is SEC-25). Replace the placeholder SEC-<n> with SEC-24 in the fix round and register it in packages/synth with the test that asserts it. No ADR number needed (ADR 0033 and 0071 amended).

ACTING (Lane A's account, https://claude.ai/code/session_019i9ifDkvaQzK4YgTGnKWC3) holds this item from 2026-11-04 23:59 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Contract-page extraction in its own process (`co-001/pages-child-process`): status

Decided by Lane A's orchestrator (session_01TrKDxeLbxVo7t7zwRXFzrg) on 2026-11-04 23:58 UTC, from S2's sweep; run by acting session S3 after ci-findings-transport. GitHub login PureTideWater. Every choice takes the recommended option (security the safer).

Open questions: none.

<!-- RESUME-BLOCK -->
## Current state (2026-11-04 23:59 UTC): design, build and reviews starting on the WIP ref
- **The defect (latent):** `packages/contracts/src/evidence/pages.ts` reads an untrusted document in a worker thread under resourceLimits (maxHeapMb 192, young 32; PAGE_READ_LIMITS). `infra/lib/heap.ts` (ADR 0071) plans `--max-old-space-size=560` on the worker task's command; a process-wide flag overrides a worker's resourceLimits on Node 24 (S2's measurement), so the page thread would get 560 MiB and, with the main thread, could pass the task's 1,024 MiB.
- **The fix (orchestrator):** page extraction in a child process with its own `--max-old-space-size` (192 plus headroom), killed and refused on overrun or timeout; a test measuring the extractor's heap_size_limit under the task's real command with the planned flag; a synth-time infra guard refusing the worker task's heap flag unless untrusted parsers run in child processes; the order recorded in the ADR that owns heap.ts (heap.ts's flag must not ship before this).
- **Reviews:** two (security-reviewer; correctness and capacity with a skeptic).
- **WIP:** `co-001/wip-pages-child-process` cut at base 7fb3e102 (#84), worktree /home/user/pages-child-process. The PR branch `co-001/pages-child-process` is pushed only after ci-findings-transport's push (one base merge right before it).
- **Workflow wf_0ae2cbbb-803** (`workflow-scripts/lane-a-pages-child-process-build-review-wf_0ae2cbbb-803.js`), started ~00:05 UTC 2026-11-05: design measured first (`designs/lane-a-pages-child-process.md`), build failing first on the WIP ref, two reviews (security-reviewer; correctness and capacity), three skeptics each, a critic. Progress `approval-summaries/lane-a-pages-child-process-wip/progress/`.
- **Next:** the workflow above; then the fix round, the base merge, the full suite once, push, the draft PR, CI, verification, the up-to-date check, merge. Hand back at 2026-11-06 18:30 UTC if not merged.
<!-- RESUME-BLOCK -->
