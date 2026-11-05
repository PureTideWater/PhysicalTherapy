# pages-child-process: design progress (measured first)

Worktree /home/user/pages-child-process at 7fb3e102 (claude/build-platform, #84), clean. Logs in the session scratchpad `pcp/logs/`.

## Step 1: measurements (2026-11-05)

Machine: 4 CPUs, 16 GiB. Node v24.22.0 (V8 13.6.233.17-node.57), /opt/node24/bin/node. Probe: `pcp/probe.mjs`, output `pcp/logs/probe.json`. heap_size_limit from `v8.getHeapStatistics()`.

| Where | Flags | heap_size_limit |
| --- | --- | --- |
| main thread | none | 2,240 MiB |
| worker thread, resourceLimits old 192 / young 32 | parent: none | **240 MiB** (today's bound) |
| worker thread, no resourceLimits | parent: none | 2,240 MiB |
| main thread | `--max-old-space-size=560` | 752 MiB (560 + 192 young on this host) |
| worker thread, resourceLimits old 192 / young 32 | parent: `--max-old-space-size=560` | **608 MiB** (the defect: old gen 560, young 48) |
| worker thread, resourceLimits old 192 / young 32 | parent: `--max-old-space-size=560 --max-semi-space-size=16` | 608 MiB (semi-space flag overrides too) |
| child process | none | 2,240 MiB |
| child process | `--max-old-space-size=192` | **384 MiB** (young defaults to 192 MiB on this host: the old flag alone is not enough) |
| child process | `--max-old-space-size=192 --max-semi-space-size=16` | **240 MiB** (equals today's thread) |
| child process | `--max-old-space-size=192 --max-semi-space-size=8` | 216 MiB |
| child process | `--max-old-space-size=224` / `256` / `560` | 416 / 448 / 752 MiB |
| child `--max-old-space-size=192`, parent under `--max-old-space-size=560`, env {} | | 384 MiB (a parent's flag never reaches a spawned child) |
| same, parent's flag in NODE_OPTIONS, child env {} | | 384 MiB |
| child argv `--max-old-space-size=192` with NODE_OPTIONS=`--max-old-space-size=560` inherited | | 384 MiB (argv wins over NODE_OPTIONS, but the env allowlist drops NODE_OPTIONS anyway) |

Bare child spawn (`node --max-old-space-size=192 -e 0`, env {}), 10 runs: 37 to 85 ms, median about 45 ms.

Decision from step 1: the child's command carries BOTH `--max-old-space-size=<old>` and `--max-semi-space-size=<semi>`; the old flag alone leaves the young generation host-sized (192 MiB here).

## Step 2: reading (done)
- Only runtime caller: apps/worker/src/intake/pages.ts (readAndStorePages), via intake.ts, intake job batchSize 1, default localConcurrency (1): one document at a time per worker task. Tests and eval call readDocumentPages/documentPages directly (packages/model-gateway eval, apps/web test-support, e2e, tools/release-capacity/scenario.ts).
- tools/release-capacity already runs the worker image under heapFlag('worker') (run.ts line 322), and its scenario reads a PDF through documentPages: the defect is live in the weekly real-size test, not in production (COMMANDS.worker has no heap flag yet).
- COMMANDS.worker (infra/lib/constructs/compute.ts) = node --enable-source-maps dist/main.js, used by the worker AND platform tasks. Worker env holds DATABASE_URL, queue URL, KMS_KEY_ID, DOCUMENTS_BUCKET, the task role's credentials (ECS metadata endpoint var AWS_CONTAINER_CREDENTIALS_RELATIVE_URI).
- Bundle: apps/worker/build.ts bundles page-thread.ts as dist/page-thread.js beside dist/main.js; pages.ts finds it by import.meta.url (.ts in source, .js in the bundle). Image: node:24-trixie-slim, /usr/local/bin/node, WORKDIR /app, dist/ copied, USER node.
- page-thread.ts imports no repository code, so Node runs it as TypeScript by type stripping (no tsx): the child can run the same file.
- ADR 0033 owns the reader (its alternatives table rejected a child process: "no better bound than the thread's polled cap"); ADR 0071 owns heap.ts ("The heap limits", and "The split" lists the heap flags in the task commands as a later PR).

## Decisions
- D1 ADR: amend 0033 (reader in a child process; the alternative row reversed) and 0071 (the order: heap flags in task commands only after this merges). No new ADR number needed. No test-matrix row decided yet (see design).
