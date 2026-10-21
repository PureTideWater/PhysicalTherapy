# PR 5: what changed since you approved 6435fadd, and the new hash to sign

**Document:** `docs/product/domain-model.md` on branch `co-001/pr-05-packet-deadline`, head `6d93b40`. It is regenerated and **not yet approved**.

**SHA-256 to sign:** `372fa545c9d183e690389a06a94fb05002597d5f54fa42f2347296df05d2a1bc`

- The repository's own approval code prints it (`pnpm db:domain-model --check --require-approval`), and I computed it again separately: the same.
- It replaces both earlier hashes: `6435fadd…`, which you approved on 2026-10-18, and `4ec492ab…`, which I sent after your download rule and you have not signed. Neither carries over.
- Until you sign, exactly one database test fails: the approval check. Every other one passes, apart from one backup drill this machine cannot run (see Checks).

**Still one migration.** `20261103090000_deadline_verification_and_export_attestation` is extended in place. It has only ever run on scratch databases.

- No table is added. There are still 79 tables, 44 of them on the PHI registry.
- No row-level-security setting or policy changes: still 71 tables forced and 156 policies. The catalog and cross-tenant tests pass.
- The counts that move, from your approval to now: functions 248 to 267, of which those that run with their owner's rights go from 110 to 112; triggers 216 to 225; one marker role (`tp_job`); three new columns.

**What nothing here changes:**

- **Pricing:** no file under `packages/pricing/src` changes.
- **Golden lines:** `fixtures/golden` is byte for byte the same, and `test:golden` passes.
- **Releases:** 900001 to 900004 are byte for byte the same.
- **Ledger:** no ledger table or rule is touched. "Recovered" still counts only posted or deposited entries.

## 1. Your download rule, and the worker's own login

This is the change I described with `4ec492ab…`. It is unchanged since then.

**What it does**
- The reimbursement reviewer can attest an export only after downloading both its PDF and its CSV.
- A download counts only once the file's bytes match the fingerprint stored for it. It is then recorded in the reviewer's own name.
- The rule is held in the attest route and again in Postgres.
- The worker now signs in to the database with a login of its own, marked by the role `tp_job`. Postgres refuses a download record or an attestation from that login, whatever person the worker claims to be. So a compromised worker cannot fake the reviewer's downloads.

**What it does not change**
- No table is added.
- It does add a sixth database login and secret in the infrastructure.

## 2. #4: one check that a packet's pricing is still current

**What it does**
- A packet line counts as current only when all of these hold:
  - it still has the pricing in effect (no re-run accepted since has replaced it);
  - its rule release has not been withdrawn;
  - its plan is still mapped the same way;
  - its contract version is still signed off and still covers the service date, which catches a back-dated amendment.
- Postgres makes this one check at approval, at the export (the guard) and at attestation. The export request and the export job make it first, so the person hears no at once.
- I reproduced the audit's own example: a percent-of-Medicare line priced under a release that is then withdrawn. Every step refused it: approval, even a bare database update by a second billing manager; the export request, with nothing queued; the export job; the guard; and the attestation.
- **A submission is never refused for this.** It records something that already happened outside the product. It is logged and flagged with the reason. The database writes the flag, and the application cannot set it (tested).
- The builder, review and submissions pages show each stale line's expected amount and shortfall as they were and as they are now. A line not priced again yet says so.
- **Actionable totals drop at once**, on the Cases list, the case page, the dashboard and the audit report's triage. Triage has new reasons: release withdrawn, version not in force, mapping not in force. Each case keeps its own recorded ask until PR 11 refreshes it.
- No audit report is requested, generated, attested or released on a withdrawn release.
- **The wording is fixed.** "The case is judged again first" is gone, and so is any offer to wait. A refusal names the stale lines and gives the one step that works: write them off on the case page, then write, approve and export the packet again without them.
- The check cannot race a change made at the same moment. It takes a lock that the changes take too. Tests hold a change open across each step: the step waits, then refuses.

**What it does not change**
- Pricing and the ledger.
- Nothing refreshes a case automatically yet. That, the fan-out of a withdrawal to every practice, and the alert for packets already sent are PR 11.

**One decision for you.** Suppose pricing goes stale after the export but before the attestation. The attestation is then refused for good. A submission needs an attested export, so if that file already went to the payer, its submission cannot be logged.
- The submissions page now says not to send such an export, and to tell support if it went.
- How such a submission should be logged is your call. The two options are an unattested submission record, or an attestation of a stale export with its own flag.

## 3. #5: a contract window's unit and start; no Medicare Advantage packet exports until Q34

**What it does**
- When the specialist cites the window, they also choose, from the quote:
  - its unit: calendar days, business days or months;
  - what it runs from: date of service, remittance date, payment date, or the day the practice received it.
- Both come from fixed lists, and Postgres holds the lists. Nothing reads the quote automatically.
- "Verified" is allowed only for the rule the product computes today: **calendar days after the payment date** (BPR16, the check or EFT date). The service, a database trigger and a database CHECK each refuse any other rule. I checked all 12 unit-and-start combinations against the database's rule, and only that one counts.
- The abstraction screen shows the computed rule beside the quote, for example "ends 90 calendar days after the payment date", and says whether the two match.
- If they do not match, Verify is disabled with the reason. The version can still be approved, but its window stays unverified. Its lines wait with no date shown, and the screen says to keep the contract's own deadline. A date counted the wrong way could be later than the real one.
- **Medicare Advantage non-contracted deadlines stay unverified until the specialist confirms the dispute route (golden QUESTIONS Q34).** This holds even under release 900005's L2 records.
  - The consequence: **no packet of a Medicare Advantage non-contracted line exports until then.** Medicare Advantage actionable totals drop to zero.
  - The packet's deadline, the Cases page and the specialist's regulations page say why, and say that the plan's own dispute policy is worked outside the product meanwhile.
  - I confirmed the route is the only thing holding these lines back. With the route switch turned on in a scratch copy, the same lines verify.
  - A Medicare Advantage plan mapped to a contract is not held.

**What it does not change**
- The engine still counts every contract window as calendar days after the payment date. Counting from the cited unit and start is PR 6c.
- Existing signed-off contract versions stay frozen. A new citation goes on an amended or corrected version.

**A second decision for you: what "remittance date" means.** The build treats "the remittance date" as the date printed on the remittance advice, not the payment date. Contracts that say "within N days of the remittance date" therefore stay unverified until PR 6c, and their totals drop too. If you rule that "remittance date" means the payment date, such windows verify now.

## 4. #26: an export the job would refuse is refused at once, and every refusal or failure is recorded

**What it does**
- Before anything is queued, the export request runs the same checks the job will run. If any fails, it refuses at once and lists every reason with its fix. Nothing is queued.
- Every refusal or failed try of the export job is recorded as an audit event: the version's ID and a code, with no words and no patient data. Only the worker's own login can write these events; a person cannot. I checked this with a render failure, and neither the events nor the logs carry an identifier or the error's text.
- The packet page shows the latest attempt:
  - in progress, refreshing about every five seconds;
  - trying again;
  - refused, with its fix;
  - failed, with nothing stored and the operator alerted;
  - an hour with no answer counts as failed.

**What it does not change**
- No table is added: the audit log is the record. The optional attempts table is PR 8's.

## 5. #61: the drafter's Approve button, and one form for the builder

**What it does**
- The person who drafted a version sees the Approve button disabled, with the reason, next to Request approval. Once approval is requested, the reason says so. The database still refuses the drafter's approval (tested).
- A version is written through one form. Each field appears once, with its own ID, and the Save, code-built draft and model draft buttons all send the same fields. A chosen prompt-pay interest line is no longer dropped. I checked this on the real page with the Save button.

**What it does not change**
- Who may approve.
- The accessibility gate over every screen is PR 7.

## Safe while the previous version of the app is running

**Yes (tested).** I ran the current live code (`claude/build-platform`, which has PR 4) in a scratch copy, in two ways.

1. **Over live data.** That code wrote, approved, exported and submitted packets on its own schema. Then the new version's `pnpm db:migrate` ran over that data:
   - every packet version, export fingerprint, submission and contract version was unchanged;
   - existing packet versions read "unverified";
   - the new columns are empty on every old row.

   Afterwards the old code went on as before: writing and approving packet versions, signing off contracts, pricing and triaging. It was refused only where D16 and D17 require:
   - exporting a version whose deadline is not verified;
   - logging another submission of an export no reimbursement reviewer has attested.

2. **Its own tests on the new schema.** I ran 15 of the old code's database test files, covering packets, contracts, pricing and re-runs, triage, reports, the ledger and their routes.
   - 152 tests passed.
   - The 21 that failed fail on one refusal: "a packet version whose deadline is not verified is not exported".
   - The same four files pass on the old schema, so the migration is the only cause.

Things that also hold while the old version still runs:
- Its export job writes no attempt events, so a refused export shows "in progress", then "failed, no result" after an hour.
- Its triage does not know the new reasons, so it may open a case whose export the database then refuses.

The migration briefly locks the small `packet_version` table while it adds the computed column. As before, run the migration before deploying the new version (ADR 0049).

## Checks on head `6d93b40`

All on the exact head, in a fresh clone, with `CI=true`.

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` | passed |
| `pnpm check:fixtures` | passed |
| `pnpm typecheck` | passed |
| `pnpm lint` | passed |
| `pnpm lint:logs` | passed |
| `pnpm lint:copy` | passed |
| `gitleaks`, this branch's commits since `claude/build-platform` | no leaks |
| `pnpm verify-content` | passed |
| `tools/check-releases-immutable.sh` | passed |
| `pnpm synth --all` | tree left clean |
| `pnpm test` | 3,656 passed |
| `pnpm test:golden` | 36 passed |
| `pnpm test:oracle` | 629 fixtures agree |
| `db:migrate` on a fresh PostgreSQL 18 database | 41 migrations applied |
| `db:domain-model --check --strict` | passed |
| `db:domain-model --check --require-approval` | fails only for the missing approval, printing the hash above |
| `pnpm test:db` | 8,430 passed, 1 failed (the approval check only), 1 skipped (a backup drill that needs PostgreSQL 18's `pg_dump`, which this machine lacks) |
| `pnpm test:e2e` | 46 of 46 passed, none retried |
| `pnpm build` | passed |
| `pnpm cdk:diff` | synthesized every stack; no AWS credentials here for the staging diff |

**Proofs of the four items, in a scratch copy.** I wrote my own tests, separate from the builders'. They cover:
- the audit's withdrawn-release example (#4);
- the window lists and the 12 rules (#5);
- the Medicare Advantage route (#5);
- a render failure and its coded record (#26);
- the drafter's refusal (#61);
- the real packet page, checked as the drafter in the browser (#61).

All of them pass.

I then broke each guard in turn, and my tests or the builders' caught every break:
- the pricing check;
- the export guard's pricing step;
- the computed-rule test, in SQL and in TypeScript;
- the Medicare Advantage route switch, in SQL and in TypeScript;
- the withdrawal's triage reason;
- the job's failure record.

**One small, harmless finding.** The model-draft button carries a `name` that React replaces, and React logs a warning about it in development. The model's action never reads that field, so nothing is lost.

## Before the pull request opens

- `claude/build-platform` moved on after this branch last merged it: #24 pins CI runners to Ubuntu 24.04. PR 5 should merge it first. That merge touches only CI files and their test, so it changes neither the schema nor this hash.
