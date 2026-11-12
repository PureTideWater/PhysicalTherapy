# Dependabot replacement PR, 2026-11-12 (W26, acting Lane B)

Session: session_019i9ifCYJnbESeoV7M8kwdU. Branch `co-001/deps-2026-11-12` from `claude/build-platform` fd14d89f.
Takes as the build's own: #123 (aws-sdk, 10), #124 (aws-cdk 2.1146.1 to 2.1148.0), #135 (pnpm/action-setup 6.1.0 to
6.1.1), #139 (minor-and-patch, 14). Procedure of record: docs/runbooks/dependency-upgrades.md.

## Plan (written before any change)
1. Cut the branch; apply the four PRs' manifest and workflow changes (their non-lockfile diffs, as patches).
2. Regenerate the lockfile with pnpm (`pnpm install --lockfile-only`, the workspace's release age and trust policy on);
   never a hand edit. Compare each direct dependency's locked version with the bot's lockfiles by script.
3. `pnpm install --frozen-lockfile`; `pnpm actions:check`; `pnpm toolchain:check` (BASE=origin/claude/build-platform).
4. `pnpm lint`, `typecheck`, `test`; then the full local suite once (test:db, test:golden, test:e2e, verify-content,
   lint:logs, licenses:check). Output to files; read counts and failures.
5. Changelogs: one line per non-patch bump, and per package touching the gateway, auth, crypto, the database driver or
   the EDI parser whatever its size (one subagent reads release notes; report file).
6. The runbook's AWS items: `pnpm cdk:diff` for the CDK CLI bump; the SDK socket and bundle comparison if a harness
   exists in the repository (else recorded as owed, with why).
7. One adversarial review, scope "supply chain and CI of this diff"; verify each finding; at most two fix rounds.
8. Draft PR from the template; subscribe; CI green; base merged right before the last push; merge.
9. Verify with git ls-remote; close #123, #124, #135, #139 with one comment each; final state here; tell the orchestrator.
10. A bump that breaks beyond a quick, obvious fix is held back, recorded here, and the rest ships.

## Log (UTC; an earlier copy of this log carried guessed times, corrected here from the machine's clock)
- 01:35 machine OK (setup log ends OK; hook and gitleaks present). Read CLAUDE.md, STATE.md, the runbook. The four PRs'
  non-lockfile diffs read; each holds only its group's members (10, 1, 1 action on 17 steps, 14).
- Branch cut from fd14d89f; the diffs applied as patches; lockfile by `pnpm install --lockfile-only`, then
  `pnpm update -r --depth Infinity --lockfile-only` of the transitives the bots moved. By script: all 25 direct
  dependencies at the bots' versions; the lockfile adds 125 versions, exactly the union of the bots' three lockfiles.
  **No package held back.**
- **Finding on the base:** @smithy/core 3.38.0, in the base's lockfile, is deprecated on npm for a bug in custom-logger
  redaction (aws/aws-sdk-js-v3 issue 8393; affected >=3.24.0 <3.38.1). A plain regeneration kept it (in range), so the
  transitives were refreshed: head resolves 3.39.0 only. The SDK comparison reproduced the leak on the base (Cognito
  `UserAttributes[].Value` reaches a custom logger in clear; redacted on head) and found that no production code passes
  a `logger` to an SDK client: latent on the base, never live. No log review or rotation is called for.
- `pnpm actions:check` and `pnpm toolchain:check` pass (pin 73e46992: on master, tag v6.1.1 names it, 8.48 days old;
  125 added versions each three days old, registry integrity, no trust downgrade). One standing warning, not this
  item's: buildkit v0.34.2 exists and moves by hand.
- First `pnpm test`: 14,227 passed, 3 failed, all in tools/stryker. Two were catalog lines quoted at their old versions
  (manifests.test.ts; literals moved). One was the installed-tooling scan (ADR 0066 Part 7, N51): it reads typescript's
  diagnostic text "Import emit helpers from 'tslib'" as an import, and with tslib 2.9.1 now hoisted (Stryker's packages
  hold 2.8.x) that resolves outside the tooling's closure. Dependabot's #123 carries the same split.
  Considered and rejected: holding tslib at one version (pnpm's resolver would not keep it; fragile on the next batch).
- First fix (f063e54f) named tslib in TEST_TOOLING. **The review's S1 showed it wrong** (verified in affected.ts: tooling
  names are seeded from declared dependencies only, so it held nothing and made the scan skip tslib everywhere).
  Fix round 1 (7660a331): TEST_TOOLING back to the base's; the scan removes only that exact text from typescript's
  files. The delta's review: no blocker, no should-fix. One fix round used of two.
- Changelogs read (report `lane-b-deps-2026-11-12-changelogs.md`); SDK comparison, base against head over local sockets
  and in the worker's bundle options, 44 cases (report `lane-b-deps-2026-11-12-sdk-comparison.md`): no wire difference;
  four behaviour differences, all fixes on head, none reached by today's configuration. Review report:
  `lane-b-deps-2026-11-12-review.md`.
- Draft PR #151, subscribed. Events for 721dc8a1 and f063e54f were cancelled runs of superseded heads.
- Machine note: node v22.23.4 here against engines >=24 (Queues item 30); CI is the suite of record.

## Changelog lines (acceptance 3)
- @aws-sdk/client-* and s3-request-presigner 3.1160.0 to 3.1164.0 (gateway: bedrock-runtime; auth: cognito; crypto: kms;
  textract): 3.1161.0 corrects clock skew without the server's processing time; 3.1162.0 adds a per-service default
  socket timeout that applies only under AWS_ENABLE_DEFAULT_SOCKET_TIMEOUT_2026, which nothing here sets;
  bedrock-runtime and the presigner are version bumps only. No breaking note.
- @smithy/core 3.38.0 to 3.39.0 (transitive): the redaction fix above; an abort during a retry delay now rejects at once
  (seen: Cognito globalSignOut's 10 s bound becomes exact). @smithy/node-http-handler 4.14.0 to 4.14.2: a stalled body
  under a configured socketTimeout raises TimeoutError; no client here sets one.
- aws-cdk (CLI) 2.1146.1 to 2.1148.0: nothing on telemetry, notices, the version check or the schema (2.1147.x notes
  not read); infra/test/cli-settings.test.ts and cdk:diff are the proof.
- @opentelemetry/api 1.9.1 to 1.10.0 (gateway): `Attributes` values widened to AnyValue; typecheck passes.
- @simplewebauthn/server 14.0.3 to 14.1.0 (auth): the verify functions throw SimpleWebAuthnError on an invalid
  expectedRPID or expectedOrigin; android-key root checked before the chain. Transitive @peculiar/x509 2.1.0 to 2.2.0,
  @peculiar/asn1-* 2.11.1, asn1js 3.0.10 to 3.1.0 (crypto): encoding fixes; same publishers.
- otpauth 9.5.2 to 9.6.0 (auth): no breaking or security note found; its code diff was not read.
- @stripe/stripe-js 10.1.0 to 10.2.1: two PaymentElement `update()` option types removed; typecheck passes.
  @stripe/react-stripe-js 7.0.1: a patch.
- pdfjs-dist 6.4.299 to 6.5.438 (reads contract PDFs in the worker): two api-minor changes on canvas and text layer
  rendering, `getTextContent` reads through `getReader`, hardening on malformed input; test:golden is the proof.
- vitest and @vitest/coverage-v8 5.0.5 to 5.1.0: no breaking section; fake timers reset after each file.
- eslint 10.13.0 to 10.14.0, globals 17.13.0 to 17.14.0: rule fixes; which globals changed was not read; lint passes.
- Patches: typescript-eslint 8.72.1, tailwindcss and @tailwindcss/postcss 4.3.5 (fixes that can change generated CSS;
  e2e's baselines are the proof), postcss 8.5.32, pnpm/action-setup v6.1.1 (action.yml identical; its bundled
  bootstrap pnpm moves 11.25.0 to 11.28.10 before it switches to the pinned 10.34.8).
- Database driver and EDI parser: no bump touches either.
- Sources: github.com was read only through fetched summaries, not verbatim; the report lists what was not read.

## For the queue (lesser findings, none blocking)
1. Commit a harness for the runbook's AWS SDK comparison under tools/ (this batch's lives in /home/user/wt/sdk-compare
   on a container, described in the report); the runbook asks for it on every @aws-sdk or @smithy move.
2. The scan's exemption: share one helper between the scan and its assertions, and fail when the exemption goes dead
   (review N-F1, N-F2). manifests.test.ts quotes catalog versions and breaks on every vitest or typescript-eslint bump:
   read the line by pattern (review N4).
3. For the founder to see, no action asked: tslib 2.9.1 was published by a different publisher account of the same
   owner than 2.8.1, without provenance before or after (trust policy passes); @opentelemetry/api gained two
   maintainers; the Stripe packages were published by a different staff account (review N2, N3).
4. buildkit v0.34.2: the by-hand builder move (actions:check's standing warning).
5. ADR 0066 line 2015 and the base's lockfile history: record that 3.38.0 was carried from its merge until this PR.
6. The SDK comparison's oddities, same on both sides: a second HTTP/2 session for a second Bedrock call on one client.

## Final state (2026-11-12 04:12 UTC): MERGED, stood down
- **#151 merged** into `claude/build-platform` as 891bf993955038923a14eb0122b8c2815861148a (parents fd14d89f, 7660a331),
  verified with `git ls-remote`. The base did not move during the work, so no base merge was needed before the last push.
- Required checks on 7660a331: `all green`, `mutation` (every shard), `screening-capacity gate`, `approval-of-record`,
  all success; 48 check runs, none failed on the head (earlier red events were cancelled runs of superseded heads).
- #123, #124, #135 and #139: one comment each naming #151 and its merge commit, then closed (all four are grouped pull
  requests, so the close ignores nothing).
- Local suite on 7660a331: unit 14,230 passed; test:db 10,272 passed, 1 failed once (screening/routes.db.test.ts, a
  lock-wait assertion; 3 of 3 alone; CI's shards green); golden 381; e2e 87; verify-content, lint:logs, licenses,
  build pass; cdk:diff synthesized every stack (no AWS credentials here).
- **Mistake caught and corrected:** re-running `tools/setup-container.sh` to restart the stopped PostgreSQL servers
  (they were down at 01:55) switched the checkout to `claude/build-platform`; the suites run between 01:58 and 03:45
  therefore ran on the base's sources. They were discarded and rerun on 7660a331 with the commit recorded at the start
  and the end. For the queue: the setup script should refuse, or keep the branch, when the checkout is on a work branch.
- Local failures that are not this change's, each seen on the base too or passing alone: MOD-15's redaction property on
  fast-check seed 1596478644 (fails on the untouched base; Queues item 38, told to the orchestrator); the page reader's
  heap-exhaustion test (`packages/contracts/src/evidence/pages.test.ts`, SIGABRT, 1 of 3 on head and 1 of 3 on base on
  this node 22 machine; Queues item 30's ground); local test:db needs DATABASE_URL on port 5433 (PostgreSQL 18), since
  vitest.config.ts's default 5432 is this machine's PostgreSQL 16.
- Review: one adversarial review and one delta review; one fix round of two used; notes in "For the queue" above.
- Holds nothing: unsubscribed from #151, no check-in pending, the base worktree removed.
