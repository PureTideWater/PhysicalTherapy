# PR 6b: the plan (four pull requests from three designs)

Base: `claude/build-platform` at 8e33cb3. Design step only: nothing was built or committed. This plan merges three
reviewed and revised designs, and where it differs from one of them, this plan wins (section 5 lists each difference):
- Track A, ZIP+4 and pricing settings: `scratchpad/design/pr6b-zip4-settings.md` ("A §n" below);
- Track B, the consumer and the time check: `scratchpad/design/pr6b-consumer-time.md` ("B §n");
- Track C, the email streams: `scratchpad/design/pr6b-email-streams.md` ("C §n" or "C Dn").

Sources: HANDOFF.md 5-74, 131-139, 144-186, 261-293, 309-313; reconciliation-001.md 423-454 (the checks) and 495-527;
ADR 0062 619-668, 710-827; combined audit #7, #16, #31, #33, #53, #76. Claims about code cite `file:line` at 8e33cb3:
mine where I checked, otherwise the design's (each design checked its own against the code).

---

## 0. In one screen

- **Four pull requests, in this order:**
  - 6b-1, the engine: no migration;
  - 6b-2, the location and the screening's ZIP+4: migration 1;
  - 6b-3, the consumer and the time check: migration 2;
  - 6b-4, the mail streams: migration 3.
- **Three domain-model approvals, one after another.** Each PR is approved only after the one before it has merged,
  because each regenerates `docs/product/domain-model.md`, and CI fails until that exact text is signed
  (`packages/db/src/domain-model/domain-model.db.test.ts:61-63`).
- **One batch of 13 founder questions (section 3), cost first.**
  - Q3 and Q4 must be answered before 6b-1's builders start, and Q2, Q3, Q5, Q6 and Q11 (a) before 6b-2's.
  - Q1, Q7 and Q8 must be answered before 6b-3's builders start, and Q1, Q9, Q10 and Q11 (b) before 6b-4's.
  - Q12's wording is needed before each PR merges. Q13 belongs to the billing PR.
- **No PR opens the screening.** In production it opens only when all four conditions hold:
  - counsel's review is recorded (`apps/web/src/lib/screening/routes.ts:323-335`);
  - a release is in force and a split is approved;
  - the deployed tag's capacity report passes with time enforced, on both image IDs (6b-3);
  - the mail path is proven ready (6b-4).

  The last two are runtime checks in code, so the launch rule does not rest on merge order.
- **Engine freeze.** Only 6b-1 changes `packages/pricing/src`: five files, about 45 lines. From 6b-2 on, the freeze tool
  fails any engine diff.
- **Pacing.** The relayed request puts the meter at 41%, with the reset on Tuesday (14:00 UTC is assumed, HANDOFF.md:71).
  - Run at most two heavy workflows at once: 6b-1's round and 6b-2's build first.
  - Read the meter before each heavy run, and start none at about 80%.
  - Never cut a stage.

## 1. The pull requests

| PR | Name | Branch | Migration | Domain-model approval | Depends on |
|---|---|---|---|---|---|
| 6b-1 | ZIP+4 localities in the engine, under the 2026-10-18 freeze exception | `co-001/pr-06b-zip4-engine` | none | no | 8e33cb3; Q3, Q4; open item O1 |
| 6b-2 | The practice's pricing location, pricing settings at onboarding, and ZIP+4 in the screening | `co-001/pr-06b-pricing-location` | `20261105090000_pricing_location_and_zip_plus_four.sql` | yes, first | 6b-1 merged (stacked on its branch until then); Q2, Q3, Q5, Q6, Q11 (a) |
| 6b-3 | The screening's own consumer and the 60-second time check | `co-001/pr-06b-screening-consumer` | `20261106090000_screening_consumer.sql` | yes, second | 6b-2 merged; Q1, Q7, Q8 |
| 6b-4 | Mail streams, delivery recording and the screening cut-off | `co-001/pr-06b-mail-streams` | `20261107090000_mail_streams.sql` | yes, third | 6b-3 merged; Q1, Q9, Q10, Q11 (b) |

The newest migration is `20261104090000_free_screening.sql`.

**Why this split:**
- **The engine freeze.** 6b-1 is the one PR whose `packages/pricing/src` diff holds the ZIP+4 lookup, and nothing else.
  Its reviewers check five files, the golden additions and the differential test, with no database or web noise. Its
  `exception.json` applies only in the PR that adds or edits it (A §3.8), so every later PR runs with no engine
  exception.
- **Approvals.** 6b-1 needs no migration (below), so it merges on reviews and green CI. Each later PR's schema is small
  enough for the founder to read its "changes since last approved" summary. Two migration PRs open at once would conflict
  on the domain model, so the approvals are strictly ordered.
- **Order of the migration PRs:**
  - 6b-2 comes first: 6b-3 and 6b-4 build on its `submit_screening` and `operator_screening_claim`.
  - 6b-3 comes before 6b-4: 6b-4 grants to `tp_screening` and narrows `ScreeningRole`, and both exist only after 6b-3.
  - Putting 6b-3 after 6b-2 also means its first CI capacity run, the measurement of record (B §2.4), measures the final
    screening code with the ZIP+4 fetch and the content-span check.
- **Review quality.** Each PR has one subject and one reviewer checklist:
  - 6b-1, payment-engine;
  - 6b-2, payment-engine plus security (Q5 changes the matrix);
  - 6b-3, security plus infrastructure;
  - 6b-4, security plus infrastructure.

  Two splits were weighed and rejected:
  - *Splitting 6b-2 into practice and screening halves* was weighed and rejected. Both halves change the same code:
    `locality_status()`, the `rule_record` CHECK, the split rename and `submit_screening`. The founder's rule groups such
    items (HANDOFF.md:311), and a split would add a fourth approval for nothing.
  - *Joining 6b-3 and 6b-4* was weighed and rejected. They share only a few files (`apps/worker/src/screening/job.ts`,
    `infra/lib/constructs/{compute,monitoring}.ts`, `screening-role.ts`, the screening page). 6b-4 also reaches
    break-glass notices, dunning and invitations, which need their own review.
- **CI time.** Each PR runs the full suite once per pushed head. Batch pushes, because ci.yml cancels in-progress runs
  (HANDOFF.md:293).
  - 6b-1, 6b-2 and 6b-3 trigger the capacity workflow by its paths (`.github/workflows/screening-capacity.yml:16-45`),
    and so does 6b-4 through `apps/worker/src/mail/**`.
  - From 6b-3, the capacity gate is a required check if Q8 is (a).
  - 6b-1 carries the `money` label, so Stryker runs on the engine change (`.github/workflows/ci.yml:102-103`).
- **The launch rule.** Nothing merged here opens the production screening. See section 0.

### 6b-1: ZIP+4 localities in the engine
Contents (A §3.1-3.4, §3.7-3.8; the unit, golden and freeze rows of A §8; PRC-21 and PRC-22 of A §9):
- **Engine** (`packages/pricing/src`, non-test):
  - `types.ts`: `PracticeSettings.zipPlusFour?`;
  - `reasons.ts`: the ENGINE_ERROR detail `zip_plus_four_not_in_locality_map`. `UNPRICED_REASONS` and `REVIEW_DETAILS`
    are unchanged;
  - `trace.ts`: `ENGINE_VERSION` becomes `phase-two/2`, with two optional keys;
  - `engine.ts`: the PLUS_FOUR check in `validSettings`, and the range lookup used only when the ZIP's `locality_map`
    record is flagged and a ZIP+4 is given;
  - `recompute.ts`: the ZIP+4 checks.
  - `testing.ts` and `index.ts` are unchanged.
- **Rules:**
  - the record type `locality_map_plus_four`, keyed by the five-digit ZIP; its value is sorted, non-overlapping ranges,
    each with a carrier and locality (under Q3 (a));
  - the ZIP9 parser and the schema checks;
  - `tools/release` (the ZIP9 completeness check, synthetic 900006);
  - `fixtures/synthetic/cms/*900006*`, `ZIP9_SYNTHETIC.txt` and `README.md`;
  - `fixtures/synthetic/rules/release-synth-900006/**` (generated).
- **Golden** (Q4 (a)):
  - G196-G199 under 900006;
  - `fixtures/golden/QUESTIONS.md` Q37 and `README.md:31-35,260`;
  - the ZIP9 step in `tools/golden-worksheet/golden_worksheet.py`, written independently of the engine.
- **Freeze tool:**
  - `tools/engine-freeze/{exception.json,check.ts,check.test.ts,differential.test.ts}`;
  - one ci.yml step, and `ENGINE_FREEZE_BASE` for the unit job;
  - `.gitignore`, `vitest.config.ts:7`, `eslint.config.js:97`, CODEOWNERS;
  - the **rule-table DDL check** added by this plan (section 5, G2).
- **Docs:** new ADR 0064 (the engine part); ADRs 0029, 0033 and 0034 amended; `docs/product/test-matrix.md` PRC-21 and
  PRC-22; `packages/synth/src/cases/{registry,pricing}.ts`.
- **Migration: none.** No database loads 900006 in this PR: every loader names its own release directory (for example
  `apps/worker/src/price/test-support/pricing-world.ts:45-62` and `apps/web/e2e/prepare.ts:30`). No test compares
  `RULE_RECORD_TYPES` with the database's CHECK (it is used only at `packages/pricing/src/trace.ts:28` and in
  `packages/rules`). So the CHECK widening waits for 6b-2, the first PR that loads 900006.
  - Until then, `loadRelease` of a release that holds the new type fails closed at the CHECK. That is harmless before
    launch, and 6b-2's new closed-list test then holds the two lists equal.
- **Nothing in `apps/` passes a ZIP+4 yet.** The path runs in unit, property, golden and differential tests only. The
  screening labels need no change: `DETAIL_LABELS` is a partial record (`apps/web/src/lib/screening/labels.ts:157-171`).

### 6b-2: the practice's pricing location, settings at onboarding, ZIP+4 in the screening
Covers #33, #16 (the minimal record), #7's screening part and the ZIP+4 key of #31. Contents: A §3.5-3.6, §4, §5, §6
and the rest of §7-§10, with section 5's deltas.

**Migration `20261105090000_pricing_location_and_zip_plus_four.sql`** (A §6, rows 1-9, with the header's six
deploy-window effects):
1. The `rule_record` record-type CHECK, widened to the 17 values (Q3 (a)).
2. `practice_site` and everything around it:
   - the CHECKs, the unique index, forced RLS and the `practice_site_tenant` and `practice_site_owner` policies;
   - its `phi_table_registry` row;
   - `SELECT` granted to `tp_app`;
   - `practice_site_rules()`, `practice_site_no_truncate`, `practice_site_required()` and the constraint trigger
     `practice_has_site`;
   - the backfill.
3. `practice.zip` deprecated, with INSERT and UPDATE revoked from `tp_app`.
4. The `pricing_settings.set` rows in `role_permission` (Q5 (a)).
5. `locality_status()`, `practice_location_status()`, `practice_set_location()` and `console_set_practice_location()`;
   `console_practice_settings()` and `console_set_practice_settings()` replaced.
6. The split, renamed to `place_of_service_split`, with its objects; `place_of_service_split_in_force()` and
   `pricing_run_split(uuid)` (DEFINER, `tp_app`); the console split functions; `screening_status()` replaced.
7. `pricing_run.place_of_service_split_id`, and `pricing_run_rules()` replaced (the pin, and the missing-location
   guard).
8. The screening objects:
   - `screening_prospect.zip_plus_four`;
   - the three `outside_content_*` columns on `screening_upload` (Q6 (a));
   - `submit_screening` dropped and created with `plus_four` and the three counts, and `operator_screening_claim` dropped
     and created with `zip_plus_four`;
   - `operator_screening_release` (the sixth keyed type), `operator_screening_run_records`,
     `screening_rejection_valid`, `screening_refusal_codes_valid` and `screening_labels_version` replaced;
   - `screening_zip_status` dropped.
9. `rule_release_content_span(integer)` (with its `FILTER`) and `screening_band_days(text)`.

Every created function is followed by `REVOKE ALL ... FROM PUBLIC` and exactly its grant (A §6).

**Also in 6b-2:** `tools/engine-freeze/exception.json`, rewritten for this PR only, with no engine files, no golden
files, and `rule_table_ddl` naming this migration (section 5, G2).

### 6b-3: the screening's own consumer and the 60-second time check
Covers #53 parts 3-4, decisions 13 to 16 and #31's screening part. Contents: B §3, §5, §7 and §8, with section 5's
deltas: Track C's parts move out of the function bodies; the account key is keyed; `complete` has no `held_by_pause`;
`ScreeningRole` is narrowed; the main thread gets a heap limit.

**Migration `20261106090000_screening_consumer.sql`:**
- **Grants for `tp_screening`.** The role itself is created by the bootstrap (`packages/db/src/roles.ts`, B §3.3.1).
- **Five columns on `screening_run`:**
  - `received_at`, with `screening_run_received` and its backfill;
  - **`account_subject`** in place of B's `account_sha256` (section 5, D6);
  - `wait_reason`;
  - `queue_priority`, with `screening_run_priority`;
  - `progress_at`.
- **Three indexes:** `screening_run_created_at`, `screening_run_account_day` (on `account_subject, created_at`) and
  `screening_run_waiting`.
- **Three new functions:** `screening_wait_limits()` (INVOKER, no grant), `operator_screening_queue()` (DEFINER,
  `tp_screening`) and `screening_wait(uuid)` (DEFINER, `tp_app`).
- **Recreated on top of 6b-2's bodies:**
  - `submit_screening`, dropped and created with `received timestamptz, rate_account_subject text` before `request`, and
    the tier of B §3.4;
  - `operator_screening_claim`, replaced in place (same return type): stale on `progress_at` after 2 minutes, and the
    claim sets `progress_at`;
  - `operator_screening_due`, dropped and created, adding `queue_priority` to its result and its order;
  - `operator_screening_complete`, dropped and created, adding `received_at` and `wait_reason` to its result;
  - `operator_screening_release`, replaced: it probes the index (B §7.3);
  - `operator_screening_record`, replaced: the update to `progress_at`;
  - `screening_run_rules()`, replaced.
- **Privileges last,** as in B §3.3.5. `tp_operator` keeps the nine functions for one release.

### 6b-4: mail streams, delivery recording and the screening cut-off
Covers #76. Contents: C §2-§10 and §14, with section 5's deltas:
- the ADR is 0065;
- the pause is carried by triggers only;
- the consumer reads a new `screening_mail_gate()`, granted to `tp_screening`;
- under Q10, `client_subject` goes on `screening_run`;
- the DNS check and SES validation run concurrently;
- the harness charges their time.

**Migration `20261107090000_mail_streams.sql`** (C §3):
- **Mail tables:** `mail_recipient_key`, `mail_stream` (three seeded rows), `mail_send` and `screening_mail_refusal`.
  Under Q10 (a), also `screening_bounce_mark`.
- **Notice tables:**
  - `support_grant_notice` and `support_grant_notice_recipient`, each with its tenant policy and registry row, and
    `SELECT` for `tp_app`;
  - `dunning_notice_recipient`.
- **Changed tables:**
  - `invitation`, adding `undelivered_at` and `undelivered_reason`;
  - the `notification` kind CHECK, adding `support_notice_undelivered`;
  - the `audit_event_record` policy, which now reserves three more actions.
- **Triggers:** `mail_send_expiry`, `screening_prospect_mail_gate` and `screening_run_mail_gate`. Under Q11 (b), also
  `screening_prospect_mail_forget`. Under Q10 (a), also `screening_run_bounce_budget`.
- **Functions:** those of C §3; `screening_mail_gate()` (section 5, D3); and the replaced `operator_due_support_notices`
  and `console_support_grants()`. `operator_record_support_notice`, `operator_practice_administrator_emails` and
  `billing_owner_emails` are dropped.
- **Under Q10 (a):** `submit_screening` is dropped and created again with `client_subject text` added. Its body is 6b-3's,
  and a db test diffs the two bodies apart from the one parameter.

---

## 2. Builders

Every builder runs, before pushing:
- `pnpm typecheck` (the whole repository);
- `pnpm lint`;
- the tests of the packages and files it touched: unit, plus the db tests of the files it changed.

No full `test:db` or e2e run at build time: CI on the draft PR runs those (HANDOFF.md:52-60). The database builder of a
migration PR writes the migration with `/new-migration`, regenerates the domain model, reads its Cross-checks block and
prepares the approval comment. It never writes the approval line itself. No two builders of a PR own the same file.

### 6b-1 (two builders)
| Role | Owns | Tests it runs | ADRs and docs |
|---|---|---|---|
| **E1, engine and rules** | `packages/pricing/src/**` (the five files and their tests: `engine.test.ts`, `recompute.test.ts`, `properties.test.ts`, the trace tests); `packages/rules/src/**`; `tools/release/{assemble,synthetic}.ts`; `fixtures/synthetic/cms/**`; `fixtures/synthetic/rules/release-synth-900006/**`; `packages/synth/src/cases/{registry,pricing}.ts`; `docs/product/test-matrix.md` | `@tp/pricing`, `@tp/rules`, `tools/release`, `tools/verify-content` (unchanged), `pnpm verify-content` | new ADR 0064 (engine); amends 0029, 0033 and 0034 |
| **E2, golden and freeze** (writes the oracle's ZIP9 step from the CMS layout, not from E1's diff) | `fixtures/golden/**`; `tools/golden-worksheet/**`; `tools/engine-freeze/**`; `.github/workflows/ci.yml`; `.gitignore`; `vitest.config.ts`; `eslint.config.js`; `.github/CODEOWNERS`; `tools/test/codeowners.test.ts` | `pnpm test:golden`; the worksheet's Python tests; `tools/engine-freeze` tests, with `ENGINE_FREEZE_BASE` set to the merge base; `tools/test` | `QUESTIONS.md` Q37; golden `README.md` |

No migration and no domain model.

### 6b-2 (three builders)
| Role | Owns | Tests it runs | ADRs and docs |
|---|---|---|---|
| **L1, database** (writes the migration; regenerates the domain model) | the migration; `packages/db/src/**`: `schema/{tenancy,screening,pricing}.ts`, `authz/permissions.ts`, `catalog.ts`, `row-factory.ts`, `tenant-world.ts` (`createPracticeWithLocation`), `seed.ts`, and the db tests `location` (new), `screening`, `migrate`, `access`, `documents`, `hardening`, `crypto/practice-keys` and `identity`; `packages/db/domain-model/**`; `docs/product/{domain-model,data-dictionary}.md`; `tools/engine-freeze/exception.json` | packages/db unit and the db tests above, the cross-tenant test included | amends ADR 0064 (location, settings, waits, split, screening ZIP+4, content span) |
| **L2, worker, contracts and capacity** | `packages/contracts/src/{location,index}.ts`; `apps/worker/src/price/{settings,create,execute,impact,causes,diff,keyed-release}.ts`; `monitor/{plan,job}.ts`; `jobs/registry.ts`; `screening/{adapter,job,format}.ts`; `screening/test-support/legacy-release.ts` (one identifier); the worker test files of A §4.7 and §8; `packages/synth/src/release/scale.ts`; `tools/screening-capacity/{uploads,run,oracle}.ts`; `docs/product/test-matrix.md` (PRC-23, PRC-24, SCR-15, SCR-16) | `apps/worker` unit and the db tests it changed; `packages/synth`; `packages/contracts`; `tools/screening-capacity` unit | amends ADR 0039 |
| **L3, web and e2e** | `apps/web/src/**` of A §7 (`lib/zip.ts`; `routes/{settings,console,practice}.ts`; `console/practice-settings.ts`; `screening/{routes,labels,messages,content-span}.ts`, and `retention.ts` only under Q11 (a) answer (b); the components and pages listed; the web db tests and test-support; `screening.large.db.test.ts`); `apps/web/e2e/**` | `apps/web` unit and the db tests it changed | amends ADR 0062 (A §10's twelve edits) |

### 6b-3 (three builders)
| Role | Owns | Tests it runs | ADRs and docs |
|---|---|---|---|
| **C1, database and worker** (writes the migration; regenerates the domain model) | the migration; `packages/db/src/{roles.ts, roles.test.ts (new), catalog.ts, catalog.db.test.ts, schema/screening.ts, screening.db.test.ts, migrate.db.test.ts}`; `packages/db/domain-model/**`; `docs/product/{domain-model,data-dictionary}.md`; `apps/worker/src/{config.ts, worker.ts, build.ts, jobs/{screening (new),registry,enqueue,platform}.ts, screening/{threads,thread (new),operator,job}.ts, deploy/logins.ts}` and their tests | packages/db and `apps/worker` unit and db tests for those files | amends ADRs 0014 and 0019 |
| **C2, infrastructure, release and web** | `infra/lib/{environments.ts, screening.ts (new), deploy-parameters.ts, launch.ts, platform-stack.ts, constructs/{compute,database,network,monitoring,screening-role (new)}.ts}` and `infra/test/**`; `.github/workflows/release.yml`; `tools/test/workflows.test.ts`; `apps/web/src/lib/screening/routes.ts` (receipt time, account subject, wait states); `apps/web/src/app/screening/page.tsx`; the screening route db tests; the e2e worker that runs `WORKER_JOBS=screening`; `docs/runbooks/deploy-and-rollback.md` | `infra` tests and synth; `tools/test`; `apps/web` unit and the db tests it changed | amends ADR 0049 and PRD 19 (the cost line) |
| **C3, capacity harness and launch check** | `tools/screening-capacity/**` (limits, env, containers, run, uploads, report, the new `launch-check.ts`, and tests); `.github/workflows/screening-capacity.yml`; `docs/runbooks/screening-capacity.md`; `docs/product/test-matrix.md` (SCR-08, SCR-09, SCR-17 to SCR-20); reconciliation-001 (decisions 13-16 as built) | `tools/screening-capacity` unit; one local process-runtime run of S1 and S4 as a smoke test (the measurement of record is CI's) | amends ADR 0062 (B §6) |

### 6b-4 (three builders)
| Role | Owns | Tests it runs | ADRs and docs |
|---|---|---|---|
| **M1, database** (writes the migration; regenerates the domain model) | the migration; `packages/db/src/schema/{operations,tenancy,billing,onboarding,screening,index}.ts`; `mail.db.test.ts` (new); `hardening.db.test.ts`; `screening.db.test.ts`; `catalog.db.test.ts`; `packages/db/domain-model/**`; `docs/product/{domain-model,data-dictionary}.md`; `docs/policies/data-retention.md` | packages/db unit and those db tests | new ADR 0065 |
| **M2, worker** | `apps/worker/src/mail/{streams (new),mail,events (new)}.ts`; `platform/{mail-events (new),support-notices,wiring}.ts`; `billing/dunning.ts`; `digest/job.ts`; `screening/{job,thread}.ts`; `jobs/platform.ts`; `config.ts`; `runtime.ts`, and their tests; `tools/screening-capacity/{run,report}.ts` (the seeded ready stream, and the address-check charge of section 5, G1) | `apps/worker` unit and the db tests it changed; `tools/screening-capacity` unit | amends ADRs 0014, 0019 and 0050, and adds a note to 0039 |
| **M3, infrastructure, web, e2e, runbooks** | `infra/lib/{mail.ts (new), deploy-parameters.ts, platform-stack.ts, constructs/{mail-streams (new),identity,operator-role,application-role,screening-role,network,monitoring,compute}.ts}` and `infra/test/**`; the `apps/web/**` files of C §5 (`screening/{address,tlds,validation}.ts` (new), `routes.ts`, `http/rate-limit.ts`, the pages, `monitoring/{display,queries}`, the console mail route, the users page, the route registry, `package.json`) and `pnpm-lock.yaml`; `apps/web/e2e/**` (C §10's two journeys); `docs/runbooks/{deliverability (new),deploy-and-rollback}.md`; `docs/product/test-matrix.md` (SCR-21, SCR-22, SEC-18, SEC-19, JOB-05) | `infra` tests and synth; `apps/web` unit and the db tests it changed | amends ADRs 0049, 0055 and 0062 |

---

## 3. Founder questions (one batch; recommended answer first)

Design numbers map to this batch as follows:
- A: Q1 is Q2 here; Q2 is Q3; Q3 is Q5; Q4 is Q4; Q5 is Q11 (a); Q6 is Q6.
- B: 1 and 5 are in Q1; 2 is Q7; 3 is in Q12; 4 is in Q1 (the runner) and Q8 (the rule).
- C: Q1 is in Q1; Q2 is Q9; Q5 is in Q12; Q6 is Q11 (b); Q7 is Q10; Q4 is Q13.
- C's Q3 is settled without the founder (section 5, D9).

Every AWS price was read through search results, because the proxy refused aws.amazon.com. Re-read them on AWS's pages
before signing (open item O12).

**Q1. Monthly running costs.** Blocks every 6b-3 builder (size, `starts`, the harness layout, the runners) and M3 in
6b-4 (the endpoint, validation).

(a) **The screening consumer.**

| Option | Production a month | Worst-case time to result (indicative, measured on a 4-CPU machine; B §2.2) | What it gives up |
|---|---|---|---|
| **A (recommended): one task, 2 vCPU/4 GiB, three screenings at once** | ≈ $74.50 (≈ $60.10 on ARM after #136) | Three worst files at once: 41.1 s for the slowest. A small file behind them: an estimated 21-30 s. A crash or a lost zone adds about 3 minutes, and nothing is lost | Zone redundancy. It also replaces audit #53's adopted "two at a time" with three, because two measured 55.8 s against the 48-s line |
| B: three tasks, 1 vCPU/2 GiB | ≈ $110.50 | A lone worst file 32.4 s. Three at once cannot be measured faithfully on 4 CPUs (47.6-48.7 s with Postgres on one CPU) | $36 a month more per environment, and an 8-core CI runner (≈ $40 a month instead of ≈ $22). It gains zone redundancy |
| C: one task, 1 vCPU/2 GiB, stepping up to three on queue depth | ≈ $38.60, plus the stepped-up hours | The third of three worst files 75.4 s; a small file 54.2 s | Decision 14: two large files at once break the 60-second promise, so this changes your ruling |
| A with two tasks | ≈ $146.60 | As A, without the 3-minute delay on a zone loss | ≈ $72 a month more per environment |

The 60 seconds covers normal uploads only. An upload over its account's share, or over the day's cap (Q7), has no time
bound: it is priced when no normal upload waits.

(b) **Production before launch.** Recommended: hold production's consumer at 0 until the first launch value is
deployed, at about $0.40 a month (its secret).
- This gives up running production's consumer before launch. Staging and the launch check cover the same image.
- Running it from the first deploy costs ≈ $74.50 a month, and nothing can reach it before launch.

(c) **Staging.** Recommended: the same task, always on, ≈ $74.50, so that staging measures decision 15's
runner-to-Fargate factor on production's task and runs the deployed image every day. Running it only for measurement
days costs a few dollars, but gives up that daily run of the image and its alarms.

(d) **CI, once the repository is private.** The capacity workflow and the release's capacity job run on a 4-core
larger runner, ≈ $22 a month, under the Team organization you accepted with the audit. Nothing is charged while the
repository is public.

(e) **The email streams, ≈ $18 per environment, ≈ $36 for both** (C §8):
- the SQS interface endpoint, $14.60. Recommended over NAT (≈ $0.01), which sends queue traffic carrying recipient
  addresses over the internet path and gives up the endpoint policy;
- 15 alarms, $1.50, and 6 log metrics, $1.80;
- simulator probes, $0.03;
- SQS, KMS and EventBridge requests, $0.17 at most.

(f) **The SES plan.** Recommended: stay on Essentials, $0.16 per 1,000 sends, with VDM's dashboard and engagement
tracking off. À la carte is $0.10 per 1,000 and gives up VDM. They differ by under $1 a month at launch volume.

(g) **Address validation at submit.** Recommended: $0.01 a screening, capped at 1,000 a day in production (at most $10 a
day) and 50 in staging.
- Without it, a mailbox typo is caught only after the prospect has left, and each one counts toward the cut-off.
- A higher cap gives up a tighter bound on what abuse can cost. A lower cap gives up checking every address on a busy
  day.

**Totals, as recommended:**
- after launch: ≈ $74.50 (production) + ≈ $74.50 (staging) + ≈ $36 (mail) + ≈ $22 (CI) ≈ **$207 a month**, plus $0.01
  a screening;
- before launch: ≈ **$133 a month**.

This compares with the ≈ $18 a month accepted for the consumer with audit #53.

**Q2. Where the ZIP+4 lives (#16).** Blocks 6b-2's L1, L2 and L3.
- **Recommended: (a) a location record, `practice_site`, undated, one per practice, edited in Settings → Pricing
  settings.** The person still enters the ZIP and ZIP+4 in practice settings, so your ruling's promise holds; only where
  the database keeps them changes.
  - It gives up a bigger 6b-2.
  - `practice.zip` stays, deprecated and stale, until the multi-site PR drops it.
  - That PR still rewrites the per-practice readers and alters the table, under its own approval.
- **(a′) The same record with dated windows now.** Either it moves part of #16 out of the PR the audit places it in (if
  moves are offered), or the windows sit unused (if not). The gain before launch is nil.
- **(b) Columns on `practice`.** It gives up a data move and a second rewrite of the readers and setters in the
  multi-site PR.

**Q3. A new rule record type is DDL on `rule_record`.** This breaks a change-order check (reconciliation-001.md:445)
and #31's "no DDL" line. Blocks 6b-1's E1 (the lookup's shape, the parser) and 6b-2's L1.
- **Recommended: (a) widen the record-type CHECK by one value, `locality_map_plus_four`, in 6b-2's migration.** It is
  additive, keeps one record per ZIP and keeps the reads keyed by ZIP.
  - It gives up an exception to the check, recorded in ADR 0064 and in that PR's `exception.json`.
  - The migration takes a short ACCESS EXCLUSIVE lock.
- **(b) Per-code `locality_map` records keyed `{zip, plus_four}`, with no DDL.** It gives up:
  - one record per ZIP+4 (the count is unknown), against #31's memory budget;
  - ranges, which must be expanded into single codes;
  - a single key shape: every reader must handle a second one.

**Q4. Golden lines for the ZIP+4 path.** This breaks the check "`fixtures/golden` unchanged" (reconciliation-001.md:429).
Blocks 6b-1's E2.
- **Recommended: (a) add G196-G199 under release 900006, with every existing claim, diff and source byte-identical, and
  edit `QUESTIONS.md` Q37 and `README.md`.**
  - It gives up the check's literal wording: the set grows to 154 claims and 330 lines.
  - The freeze tool refuses any change to an existing file.
- **(b) Prove the path in `tools/golden-worksheet/zip-plus-four/`.** It gives up golden coverage and the specialist's
  single list of questions, and Q37 and README.md:260 stay stale.

**Q5. A dedicated permission before PR 14.** The matrix is meant to change only in PR 14
(reconciliation-001.md:454). Blocks 6b-2's L1 and L3.
- **Recommended: (a) `pricing_settings.set` for practice_admin, billing_manager and firm_principal; the reviewer is
  denied.**
  - It gives up PR 14 being the only review of the matrix.
  - 6b-2 then gets a security-reviewer pass.
- **(b) Gate on `contract.sign_off`, held by the same three roles.** It gives up one permission per power: narrowing
  either power later moves the other, and the audit trail reads "contract sign-off" for a ZIP change.

**Q6. A Medicare screening row in a quarter outside the loaded content (#7).** Blocks 6b-2's L1, L2 and L3.
- **Recommended: (a) leave the row out and count it, as the 11-claim-line floor does.**
  - Three new counts on `screening_upload` are kept for 30 days.
  - A request that bypasses the browser is refused.
  - The dated wording goes to counsel.
  - It gives up a result that screens fewer rows than the file holds.
- **(b) Refuse the whole upload with a dated message.** It gives up usability: a typical two-year file is refused
  outright, and the prospect must edit it.

**Q7. An account's share, the daily cap and fairness.** Blocks 6b-3's C1 (`screening_wait_limits()`, the tier) and C2
(the wait states).
- **Recommended:**
  - each account's share is 100,000 rows a UTC day (two worst-shape files);
  - the daily cap is 1,000,000 rows of within-share uploads (ten accounts' shares);
  - an account's k-th upload over its share waits at priority −k;
  - every upload is accepted, and the prospect is told it can take longer.

  This gives up the 60-second promise for a firm's third and later large file on a busy day.
- **A cap with no account share** gives up protection from one firm: its own 20-upload allowance would put every later
  prospect that day over the cap.
- **Lower numbers** protect the promise sooner but make more genuine prospects wait. Higher numbers do the reverse.

**Q8. The capacity test in the merge rule.** Blocks 6b-3's C3 (the gate job) and your ruleset change.
- **Recommended: a required check from 6b-3 on, through an always-running gate job that passes at once when no watched
  path changed.** It adds about 45 minutes to screening and pricing PRs.
- Until the 4-core runner exists (Q1 (d)), a private repository's 2-vCPU runner is refused as too small, so production's
  screening cannot open. That does not delay the planned launch, which waits for release 1 and counsel.
- **Not requiring the check** gives up catching a promise-breaking change before it merges.
- **A self-hosted runner** gives up security.

**Q9. The screening mail cut-off.** Blocks 6b-4's M1 and M2.
- **Recommended:**
  - a 7-day window since the last resume;
  - floors of 200 sends for bounces and 2,500 for complaints;
  - also pause when the account reaches half of SES's review levels, or SES puts the account under review;
  - resume only by a platform administrator, with a reason.

  Plainly: anyone who can make 7 validated-looking addresses bounce in a week closes the screening until someone
  resumes it (Q10 narrows this).
- **Automatic resume** gives up confirming that the cause is fixed.
- **Higher floors** give up early protection.
- **No account trigger** gives up acting on the rate SES itself reviews.

**Q10. A bounce budget per client and per email domain (founder and counsel).** Blocks 6b-4's M1 (the table, the
trigger, `submit_screening`) and M3 (the web passes the subject).
- **Recommended: yes.**
  - Keep two values with the run for its 30 days: the rate limiter's keyed hash of the client address (`client_subject`)
    and the account hash 6b-3 already keeps.
  - Keep a 7-day mark for each hard bounce, and refuse after 3.
  - The pages say so, with counsel.
- **No budget** keeps the pages as they are, and lets one client close the public screening.

**Q11. What the screening keeps (founder and counsel; decision 7).**
- **(a) The ZIP+4.** Blocks 6b-2's L3 only under answer (b).
  - **Recommended: no change to the words.** The ZIP+4 is entered in the same "ZIP code" field, goes at 30 days and is
    never kept with a request. This relies on counsel reading "ZIP code" as including it.
  - **Naming it everywhere** gives up the ruled wording for a fact it already covers.
- **(b) A keyed hash of a screening address that hard-bounced or was reported as spam.** Blocks 6b-4's M1 and M3.
  - **Recommended: keep it for 12 months, used only to refuse that address.** `retention.ts`, the screening terms and
    `data-retention.md` are amended, and the page must not call it deleted.
  - **Keeping it no longer than the prospect** keeps today's wording, but gives up refusing a known-bad or complaining
    address after 30 days.

**Q12. The screening's sender and page wording (yours, then counsel's before the screening opens).** The builders write
the recommended drafts, and each PR needs your words before it merges.
- **The sender (6b-4).** Recommended: `results@screening.<domain>`, display name "PaidWhole", with Reply-To set to
  SupportEmail.
  - No Reply-To gives up the prospects who reply.
  - A sales mailbox gives up the support desk's ticket trail.
- **The "sent" page's four states (6b-3).** Recommended:
  - "usually within a minute";
  - "can take a few minutes" when every slot is busy;
  - one honest sentence for an upload over its account's share;
  - one for an upload over the day's cap.

  Keeping "usually within a few minutes" gives up telling prospects about the promise.
- **The paused page and the one sentence for every refused address (6b-4):** C D7 and D9.
- **The left-out-quarters sentences on the upload and result pages (6b-2):** A §5.2.

**Q13. For the billing PR, not PR 6b: should suspension wait for a delivered dunning notice?** Blocks no PR 6b builder.
- **Recommended: yes.** Suspension waits until an owner has received a dunning notice, or the operator records
  another contact.
- **Suspending as now** gives up the guarantee that no organization is suspended without being told.

---

## 4. Acceptance checks

### The change order's checks (reconciliation-001.md:423-454), on every PR
| Check | 6b-1 | 6b-2 | 6b-3 | 6b-4 |
|---|---|---|---|---|
| `git diff --stat <base> -- packages/pricing/src ':!**/*.test.ts'` | exactly the five files; the freeze tool's summary | empty | empty | empty |
| `fixtures/golden` unchanged; 900001-900005 unchanged | only G196-G199 added, `QUESTIONS.md` and `README.md` edited (Q4 (a)); `--diff-filter=MDRT` empty | unchanged | unchanged | unchanged |
| `recompute(trace)` equals every stored amount (PRC-16) | yes, over the new lines too | yes | yes | yes |
| `docs/product/unpriced-reasons.md` and `UNPRICED_REASONS` unchanged | yes: the new item is a detail, which the document does not list | yes | yes | yes |
| Medicare flag defaults; the screening only calls the engine | yes | yes | yes | yes |
| No ledger DDL | yes | yes | yes | yes |
| `content/releases/**`, `tools/verify-content`, `protect-content.sh` and `publish-content.yml` unchanged; `pnpm verify-content` | yes | yes | yes | yes |
| No DDL on `rule_release`, `rule_record` or `rule_release_withdrawal` | yes (the new check, section 5, G2) | the one CHECK, under Q3 (a), named in `exception.json` | yes | yes |
| `pnpm test:db` (catalog and cross-tenant); catalog rules unchanged, only lists grow; every new table that can hold PHI registered and forced; no BYPASSRLS; the application role owns nothing | yes | `practice_site` registered; `REVIEWED_SCOPE_FUNCTIONS` gains one function | `tp_screening` added to the no-SET-ROLE and owns-nothing lists | the two notice tables registered |
| The permission matrix changes only in PR 14 | yes | changes only as Q5 rules, with a security-reviewer pass | yes | yes |

### Each PR's own proofs
- **6b-1:**
  - **Engine:** A §8's unit cases (a)-(i), the recompute tampering cases and the property test.
  - **Golden:** G196-G199, priced by the engine and the Python oracle, which match. The set is 154 claims and 330
    lines.
  - **Freeze:**
    - `differential.test.ts` runs in CI and does not skip: base equals head on 150 claims (326 lines) and 20,000
      generated five-digit claims;
    - `check.test.ts` passes every case, including the rule-table DDL cases;
    - Stryker passes on the `money` label.
  - **Rules:** the parser and schema tests; 900006 renders equal to the committed files; 900001-900005 render unchanged.
- **6b-2:**
  - **Database** (A §8): `location.db.test.ts` (every status, the setter's refusals, the pin and read as `tp_app`,
    privileges by exact name), and a new closed-list test that `RULE_RECORD_TYPES` equals the CHECK's 17 values.
  - **Screening:** `screening.db.test.ts`'s ZIP+4 and content-span cases, including no MUE at all, an MUE window that
    ends a quarter early, and no per-code MPPR.
  - **Worker:** the monitor and execute cases run as `tp_app`; the causes cases.
  - **Web:** the routes; the labels version.
  - **e2e:**
    - a practice reaches a priced month with no seeded settings;
    - a flagged ZIP waits and creates no run each day;
    - the split `prepare.ts` approves equals the screening spec's.
  - **Capacity:** the five-digit uploads equal the frozen oracle; S1-2 (a split ZIP) equals the whole-release oracle.
    `screening.large.db.test.ts` still sends 50,000 rows and leaves none out.
- **6b-3:**
  - B §8's table: the role and login, exact grants with a `tp_screening` column, the queue order (SCR-17), staleness,
    the heartbeat on an existing queue, the kill-and-recover test (SCR-19), the thread pool, the infra assertions (no
    scaling target), the launch check, `workflows.test.ts`.
  - The CI capacity run with time enforced:
    - every upload under 48 s;
    - no upload in the waiting tier;
    - the platform prices none;
    - the time metric within its bounds;
    - the oracle equal for S1-1, S2-1 and S3-1;
    - the consumer measured at 2 vCPU, 4,096 MiB and 3 threads.

    A worst time above 44 s goes to the founder as a sizing question before merge (B §2.4).
  - The heap limits sum under 90% of the task (section 5, G3).
- **6b-4:**
  - C §10:
    - the infra assertions (three sets; screening `SuppressedReasons: []`; no engagement tracking; 15 alarms; both
      phases);
    - `mail.db.test.ts` (the cut-off at its edges, every bounce subtype, the keyed hash, the reserved actions, the
      outbox cases, the late invitation bounce);
    - the worker tests (reconcile drift, a pause disables only the screening set, retries reach only pending
      recipients);
    - the web tests (one refusal sentence; validation never called for an upload that fails the row checks or the rate
      limit);
    - the two e2e journeys.
  - The CI capacity run, with the address checks charged (section 5, G1), stays under 48 s.
  - A paused stream claims nothing.
  - Track A's ZIP+4 and Track B's claim and grant db tests pass after this migration.

### The fresh-clone verification (each PR; it reads CI rather than rerunning it)
It must prove:
1. **A clean start.** The clone is fresh at the PR's head, and `pnpm install --frozen-lockfile` passes.
2. **Scope.** `git diff --name-only <merge-base>` lists only files the PR's builders own (section 2). There is exactly
   the PR's one migration, or none in 6b-1. No applied migration is edited.
3. **The freeze tool's output**, as the first table above expects for that PR.
4. **The domain model.**
   - `pnpm db:domain-model --check` regenerates the committed text exactly.
   - The Cross-checks block has been read.
   - Once the founder signs, `--require-approval` passes.
   - The approval summary carries `--summary-since <base>`.
   - This applies to 6b-2, 6b-3 and 6b-4.
5. **The proofs above,** run locally where CI does not show them:
   - 6b-1: the differential test's case count, in the CI log.
   - 6b-2: as `tp_app`, a run insert pins the split, and the worker reads it through `pricing_run_split`.
   - 6b-3: the capacity report's `time === 'enforced'`, consumer and image IDs.
   - 6b-4: after a full scenario, no table but `screening_mail_refusal` holds an address-derived value.
6. **CI** is green on that head: the full suite and the capacity workflow. Red CI goes back to a fix round.
7. **The approval summary,** with every finding's disposition and every open item.

---

## 5. Where the designs disagree (resolved), and what none covers

### Disagreements, resolved
- **D1. One migration (B §3.3.4) or C's own migration after A's and B's: three migrations in three PRs.**
  - Each migration recreates a shared function on top of the body the PR before it merged.
  - B's "owner" column becomes PR order: A writes `submit_screening` and `operator_screening_claim` in 6b-2, and B
    recreates them in 6b-3.
  - B's open item "Tracks A and C adopt §3.3.4" is closed by this.
- **D2. Pause in the function bodies (B §3.3.4) or in triggers (C D7): triggers.**
  - A trigger binds every writer, as the campaign-code triggers already do (ADR 0062, 2026-10-21). It survives later
    rewrites of the functions, and 6b-4 then copies none of 6b-3's bodies.
  - B's `submit`, `claim`, `due` and `complete` bodies drop C's parts.
  - The consumer reads the mail gate before it claims (D3). A per-run job that finds the stream not sending finishes
    without claiming, so no attempt is spent; the sweep sends the job again after the resume.
  - The refusal order is pinned in `screening.db.test.ts`:
    1. closed;
    2. A's ZIP statuses and `screening_band_outside_content`, in the body before the prospect insert;
    3. `screening_paused`;
    4. under Q10 (a), `screening_bounce_budget`;
    5. `screening_contact_undeliverable`.

    The pause trigger is a backstop, because `screeningOpen()` closes the page first.

    **Amended by the fix round of 2026-10-27** (PR #42, review S1 and S4; ADR 0065, "The refusals"): the budget now
    comes before the refusal list (steps 4 and 5 above; this plan had the list fourth and the budget fifth). With the
    list first, a client or an email account past its budget learned, from which of the two refusals it got, whether
    an address it named had bounced or complained in the last 12 months, with nothing recorded and nothing sent; it
    now gets the budget's sentence whatever the address. That order was this plan's own resolution, not one of the
    founder's rulings (Q1, Q9, Q10 (a), Q11 (b), Q12), so the safer order was taken under the co-founder's standing
    direction of 2026-10-27. As built: an accepted upload is refused while paused by a trigger on `screening_upload`
    (`screening_upload_mail_gate`, not on `screening_prospect`, which `reject_screening_upload()` also writes); a run
    is refused for the budget and then for the list by one trigger on `screening_run` (`screening_run_mail_refusal`).
    Before any address check, the web asks `screening_submit_mail_refusal()` (tp_app, writes nothing) for the refusal
    `submit_screening()` would give for the mail, in the same order (closed, paused, the budget, the list), so none of
    the day's validations is spent on an upload the database refuses and no listed address reaches SES's validation;
    the typo hint comes before it. The triggers stay the backstop.
- **D3. `held_by_pause`: a column on `complete` (B) or decided by the job (C D7): the job decides.**
  - 6b-3 cannot read `mail_stream`, which does not exist until 6b-4.
  - So 6b-3's `complete` returns `received_at` and `wait_reason`.
  - 6b-4 adds `screening_mail_gate() RETURNS TABLE (sending boolean, resumed_at timestamptz)`: SECURITY DEFINER, revoked
    from PUBLIC, granted to `tp_screening`.
  - The worker logs "emailed after waiting" for a run received before `resumed_at`.
- **D4. ADR numbers: A and C both claimed 0064.**
  - 0064 is ZIP+4 and the location: created in 6b-1, amended in 6b-2.
  - 0065 is the mail streams: created in 6b-4. C's runbook rule cites 0065.
- **D5. Grants on C's gate functions.**
  - C granted `screening_mail_sending()` to "Track B's screening login". Instead, the consumer's `screening_mail_gate()`
    is granted to the role `tp_screening`, never to its login. Logins hold nothing (B §3.3.1).
  - `screening_mail_sending()` stays for the triggers, granted to no role.
  - `tp_operator` gets neither: the platform prices no screenings after 6b-3, and PR 6e decides about reminders.
- **D6. B's unkeyed `account_sha256` and C's Q7 `account_subject`: one keyed column.**
  - It is `screening_run.account_subject`: the rate limiter's HMAC for the screening bucket's account
    (`rateSubjectHash`, `apps/web/src/lib/http/rate-limit.ts:64-67`), computed by the web and passed as
    `rate_account_subject text`, `CHECK (~ '^[0-9a-f]{64}$')`.
  - *Why:*
    - an unkeyed SHA-256 of a free-mail mailbox can be reversed by dictionary;
    - the database never receives the plain account string;
    - one value serves both B's share sums and C's account marks.
  - It goes with the run at 30 days: the run cascades from the upload, which cascades from the prospect
    (`20261104090000_free_screening.sql:310,380`).
  - Under Q10 (a), 6b-4 adds only `screening_run.client_subject`. The budget is a BEFORE INSERT trigger on
    `screening_run`, where both values live, not on the prospect.
- **D7. C's Q7 body copy said "as Track A's migration leaves it": it is as 6b-3's leaves it,** and a db test diffs the
  two bodies apart from the one parameter.
- **D8. The test-matrix rows.** A uses PRC-21 to PRC-24, SCR-15 and SCR-16; B uses SCR-17 to SCR-20; C had none. 6b-4
  adds:
  - **SCR-21:** the screening stream's cut-off, by any of its three triggers. The other streams never pause. A resume
    sends only after SES confirms, and queued runs are kept.
  - **SCR-22:** the address checks: the typo hint, DNS, the validation verdicts and the refusal list. One sentence
    answers every refused address, and nothing about a customer's mail is revealed.
  - **SEC-18:** no screening address is kept by SES or by the mail record. The keyed refusal hash is the only value
    derived from one. No address appears in a log, payload, audit event or error, and the reserved actions are refused
    to the application role.
  - **SEC-19:** a break-glass notice goes one message per administrator, from a recorded outbox. An undelivered one is
    flagged in three places, and a notice with no administrator records `notice_undelivered`, never `notice_sent`.
  - **JOB-05:** a mail event is recorded once per message and event, in any order, and deleted from the queue only after
    commit.
- **D9. C's Q3 (where a prospect's delivery state lives): settled, not asked.** It is not a promise, wording, cost,
  number or ruling. The mail record keyed to the prospect is a delivery state on screening prospects, as #76 asks. It
  needs no loosening of the prospect's immutability, and PR 7 adds its read function.
- **D10. #31's "one copy per release": three copies, one per thread (B §7.2).** Each holds 2,184 records in the scale
  release, about 1 MiB each. It was measured and recorded as a departure in ADR 0062, and is not a founder question.

### What none of the designs covers, now assigned
- **G1. The address checks fall inside the measured time (6b-4).**
  - B counts time to email from the web's receipt of the upload (`routes.ts:416`, B §3.2). C's DNS check and SES validation run
    after the row checks and before `submit_screening`, so their latency counts. Neither design measured it.
  - *Resolved:*
    - the DNS check and SES validation run concurrently, after the row checks and the rate limit, so the added worst
      case is one 2-s timeout, not two;
    - a DNS refusal still refuses;
    - a call made for a domain DNS then refuses costs $0.01 under the daily cap.
  - The harness's fakes answer after 2,000 ms on every upload, so the 48-s verdict includes the worst case. Run 7's
    41.1 s becomes about 43.1 s.
  - M2 owns the harness; M3 owns the web.
- **G2. "No DDL on the rule tables" is checked by no machine.** 6b-1's `check.ts` also reads every migration the PR
  adds, and fails on DDL that names `rule_release`, `rule_record` or `rule_release_withdrawal` unless the applicable
  exception lists that file under `rule_table_ddl`. Cases go in `check.test.ts`. In 6b-2 the exception lists only its
  own migration, with empty engine and golden lists, so it cannot cover an engine change.
- **G3. #31's "explicit heap limit" for the consumer's main thread (6b-3, C1).**
  - Set the screening container's main thread to `--max-old-space-size=512`, beside B's 1,024 MiB per thread.
  - A test holds 3 × 1,024 + 512 = 3,584 MiB under 90% of the task's 4,096 MiB (3,686 MiB), so an out-of-memory thread
    fails alone.
- **G4. `ScreeningRole` between 6b-3 and 6b-4.** B grants `ses:SendEmail` on `identity/*`. 6b-3 instead scopes it to
  the MailFromAddress identity, with `ses:FromAddress`. 6b-4 narrows it to the screening identity and set.
- **G5. Review checklists.** reconciliation-001.md:454 requires the security reviewer for PRs 8, 14 and 17 only. One of
  the two adversarial reviews uses the security-reviewer checklist in:
  - 6b-2 (the matrix, under Q5);
  - 6b-3 (a new role and login, catalog lists, network egress);
  - 6b-4 (IAM, addresses, reserved audit actions).

  6b-1 and 6b-2's pricing parts use the payment-engine checklist. Every review runs on the default workflow agent
  (HANDOFF.md:61).
- **G6. The `money` label on 6b-1,** so that mutation testing covers the engine change (`.github/workflows/ci.yml:103`).
- **Checked, and nothing left:**
  - the handoff's PR 6b line: ZIP+4 in the engine, settings and the screening; the consumer, with its cost before it is
    built; the time check; schema approval;
  - #7's PR 6b part (Q6);
  - #16's record (Q2);
  - #31's screening cache and ZIP+4 key;
  - #33 entire;
  - #53 parts 3-4;
  - #76 entire.

  #53 part 1's weekly schedule waits for the default branch (#54); the rest of #7 and #31 are the Release-operations
  PR's; #16's resolution is the multi-site PR's.

---

## 6. Open items

- **O1, E1, before the parser:** confirm the ZIP9 layout from CMS's layout document: one plus-four per line at
  positions 22-25, or a low/high pair. The record design holds either way.
- **O2, the specialist:** Q37 (amended), what Medicare does with a ZIP+4 the ZIP9 file does not list. Until it is
  answered, the engine stops. An answer of "fall back" is an importer change.
- **O3, L1:** the cross-tenant row factory reuses the world's one location, not a second row. Extend it if needed;
  never skip the table.
- **O4, counsel, after Q6, Q10, Q11 and Q12:**
  - the left-out-quarters wording;
  - the reading of "ZIP code";
  - the refusal hash and bounce-budget wording;
  - the "sent", paused and refused-address wording;
  - all before the screening opens.
- **O5, launch checklist:**
  - a place-of-service split approved before the first customer run;
  - `ScreeningLaunch` and `ScreeningConsumer=running` on the first launch deploy;
  - both mail phases and the DNS records;
  - SES production access.
- **O6, the multi-site PR:**
  - dated windows, and dropping `practice_site_one_per_practice`;
  - readers per site and per claim;
  - dropping `practice.zip` and `practice.locality_code`;
  - `priced_line.practice_site_id`;
  - the stale-packet cause for a corrected location.
- **O7, the Release-operations PR:**
  - reuse `rule_release_content_span()`;
  - turn `locality_not_loaded` lines into "waiting on content";
  - the keyed read for price jobs;
  - the README fix of #7.
- **O8, capacity:**
  - the scale release's ZIP9 size and the keyed read's time with it, in 6b-2's report;
  - a `scale.test.ts` assertion that its MUE and per-code MPPR windows cover all eight upload quarters.
- **O9, 6b-3's first CI capacity run is the measurement of record.**
  - A worst time above 44 s goes to the founder as a sizing question before merge.
  - The small upload behind three busy slots is measured with the race fixed (an estimated 21-30 s).
  - The web's 10-18 s share of S4 is watched in staging.
- **O10, the first schema PR after 6b-3 is deployed to an environment:** revoke the nine screening functions from
  `tp_operator` (add, then remove: `docs/runbooks/deploy-and-rollback.md:66-67`). Record it in HANDOFF.md as a
  follow-up.
- **O11, staging, after 6b-4's phase 2:**
  - whether Cognito needs a sending-authorization policy on the stack's identity;
  - that an empty `SuppressedReasons` both stops additions to the account's list and stops checks against it;
  - whether account reputation metrics publish at launch volume;
  - that RDS `log_parameter_max_length_on_error` stays 0.
- **O12, the founder, before signing Q1:** re-read the AWS prices on AWS's own pages, including the RDS T4g
  surplus-credit rate, which was not read.
- **O13, PR 6e:**
  - reminders and withdrawal confirmations go on the screening stream;
  - check the mail gate and the refusal list in `operator_screening_reminders_due`;
  - `List-Unsubscribe` headers;
  - decide whether reminders stay on `tp_operator`.
- **O14, the founder's actions:**
  - register with Postmaster Tools and SNDS;
  - set the DNS records from 6b-4's outputs;
  - set the larger runner and the required-check ruleset (Q8).
- **O15, quarterly:** refresh the IANA TLD snapshot and the typo list (the runbook).

## 7. Out of scope

- The rest of #7: runs waiting on content, Coverage's wording, triage holds and the README.
- #31's price-job keyed read and its heap limits.
- #16's per-claim resolution.
- Dunning suspension (Q13).
- PR 6e's reminders and withdrawal page.
- PR 7's lead list and `screening_prospect_mail_state()`.
- arm64 (#136).
- The web task's size and the RDS class.
- A keyed-record cache, and splitting one screening across threads.
- Dedicated IPs, SES tenants, DMARC report parsing and BIMI.
- Any engine change beyond 6b-1's five files.
