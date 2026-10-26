# PR #49 reviews (wf_9ab8bb48-29a, head 45fe117f, 2026-10-26)

Two adversarial reviews (release and content integrity: pipeline, money paths, surfaces; security: application, jobs/logs/content publisher boundary), each finding verified by a skeptic. Full findings, evidence and verdicts: `lane-b-release-content-checks-review-findings.json`.

| ID | Review | Severity (verified) | Real | Where | Finding |
|---|---|---|---|---|---|
| INT-PIPE-1 | integrity | major (major) | yes | `tools/verify-content/check.ts:346` | C16 groups records by source.sha256, so a quarterly file whose bytes did not change between quarters cannot be loaded for both quarters; following the README (GPCI2026.csv, no renaming) also silently overwrites the earlier quarter's draft |
| INT-PIPE-2 | integrity | major (minor) | yes | `tools/release/assemble.ts:414` | Nothing refuses a release number below the newest: it is compared against an older release, and the later published release then fails C8 permanently |
| INT-PIPE-3 | integrity | major (minor) | yes | `tools/verify-content/check.ts:213` | The checker never checks an RVU, GPCI or MUE record's window against the quarter its stored source states (only ZIP quotes are checked), so a whole file re-dated by hand to another quarter passes and assembles |
| INT-PIPE-4 | integrity | minor (minor) | yes | `packages/rules/src/records.ts:771` | COVERAGE.md withdrawn entries typed by hand into an outgoing release pass the checker, and duplicate JSON keys let what a reviewer reads differ from what is parsed |
| INT-PIPE-5 | integrity | minor (minor) | yes | `packages/rules/src/import.ts:113` | Quarter patterns use \b, which treats '_' as a word character, so common CMS-style names state no quarter |
| INT-PIPE-6 | integrity | nit | - | `packages/rules/src/parsers/locality.ts:45` | Misleading refusal texts |
| M-1 | integrity | minor (minor) | yes | `apps/worker/src/price/release.ts:331` | isLoudContentGap checks no_gpci and no_conversion_factor against the service date even when the terms are LOCKED to a year |
| M-2 | integrity | minor (minor) | yes | `packages/triage/src/actionable.ts:108` | TriageFacts.contentNotLoaded is optional, but the design makes it required |
| M-3 | integrity | minor (nit) | yes | `apps/worker/src/price/execute.ts:395` | A month whose run failed release_read_outside_fetch is planned again on every monitoring trigger |
| N-1 | integrity | nit | - | `packages/triage/src/actionable.ts:38` | Comment describes a release span narrowed by a later correction, which cannot happen |
| N-2 | integrity | nit | - | `tools/release/database-runs.ts:48` | The dry run shares one memory source across every run and practice, so one run's keys hide another run's key-set miss |
| S1 | integrity | minor (minor) | yes | `apps/web/src/app/p/[practiceId]/releases/page.tsx:70` | "What this release covers" drops any family that is not loaded |
| S2 | integrity | minor (minor) | yes | `tools/content-calendar/render.ts:16` | Truncation note claims the CLI prints the full body; nothing does |
| S3 | integrity | minor (minor) | yes | `.github/workflows/release-capacity.yml:108` | Windows-query over-budget advisory never reaches the notify issue |
| S4 | integrity | minor (minor) | yes | `docs/runbooks/content-updates.md:74` | "Ended" row says later lines wait for the content; most families do not wait |
| S5 | integrity | minor (minor) | yes | `docs/adr/0071-check-a-releases-coverage-against-the-last-refuse-months-the-content-does-not-cover-read-only-the-keys-a-run-prices-and-keep-a-content-calendar.md:206` | Private-repository cost claim ignores that the weekly harness refuses the private 2-CPU runner |
| S6 | integrity | minor (minor) | yes | `docs/product/test-matrix.md:242` | RCC-05 and RCC-08 claim screen behaviour that no test asserts |
| S7 | integrity | minor (nit) | no | `apps/web/src/app/console/rule-releases/page.tsx:59` | Console says "No rule release is published." when releases are published but none is in force |
| S8 | integrity | nit | - | `.github/workflows/content-calendar.yml:87` | notify passes silently when a successful check hands it no findings |
| S9 | integrity | nit | - | `apps/web/src/lib/pricing/content.ts:90` | Quarter label in 'Waiting on' is not in the mono face |
| SEC-APP-1 | security | major (major) | yes | `apps/web/src/components/pricing/display.tsx:46` | release_read_outside_fetch tells the customer the operator was alerted, but nothing alerts |
| SEC-APP-2 | security | minor (minor) | yes | `apps/worker/src/monitor/job.ts:66` | Content refusals and waiting months raise no alarm until the later PR |
| SB-1 | security | major (major) | yes | `tools/content-calendar/fetch.ts:68` | Source watch fails open on new files whose names are not plain |
| SB-2 | security | minor (minor) | yes | `tools/content-calendar/fetch.ts:63` | Only double-quoted hrefs are read; a page redesign silently disables the watch |
| SB-3 | security | minor (minor) | yes | `tools/content-calendar/fetch.ts:41` | Redirects are followed to any host and to plain http |
| SB-4 | security | minor (nit) | yes | `tools/content-calendar/fetch.ts:42` | No cap on response size |
| SB-5 | security | minor (minor) | yes | `tools/content-calendar/render.ts:101` | Findings past 20 are starved while the first 20 stay open |
| SB-6 | security | nit | - | `tools/content-calendar/fetch.ts:70` | notShown counts every non-plain link on the page, not just the matching ones |
| SB-7 | security | nit | - | `.github/workflows/release-capacity.yml:95` | notify may not fire when the 180-minute timeout cancels the run (plausible) |
