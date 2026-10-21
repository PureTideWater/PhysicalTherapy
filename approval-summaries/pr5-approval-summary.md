# PR 5: what changed since you approved 6435fadd, and the new hash to sign

**Document:** `docs/product/domain-model.md` on branch `co-001/pr-05-packet-deadline` (pull request #30), head `86d7edc`.
It is regenerated and **not yet approved**.

**SHA-256 to sign:** `6f72ea56563c379e05a601f3af019ad4ce3358f55cc02b06fcec17ea23d830a0`

- The repository's approval check prints this hash (`pnpm db:domain-model --check --require-approval`), and I computed
  it again separately from the file (every line but the approval line and the provenance line): the same.
- It replaces `6435fadd…`, which you approved on 2026-10-18. Three hashes came between, and you signed none of them:
  `4ec492ab…` (after your download rule), `372fa545…` (after audit items #4, #5, #26 and #61) and `cf0542d2…` (after
  your 2026-10-20 rulings, last round). None carries over.
- Until you sign, exactly one database test fails: the approval check.

## Still one migration, still no new table

`20261103090000_deadline_verification_and_export_attestation` is extended in place. It has only run on scratch databases.

- Tables: 79, of which 44 hold PHI. Row-level security and policies: unchanged (71 tables forced, 156 policies).
- Since your approval: 4 new columns, 7 new CHECKs, one marker role (`tp_job`), functions 248 to 269 (owner's rights 110
  to 113), triggers 216 to 226.
- This round changes one function body (the export guard) and adds one refusal; nothing else in the schema.
- Unchanged: pricing (`packages/pricing/src`), the golden lines, releases 900001 to 900005, and the ledger. "Recovered"
  still counts only posted or deposited entries.

## What the document now says, in plain words

1. **Your download rule.** The reviewer attests only after downloading both files, each checked against its
   fingerprint. The worker has its own database login. Postgres refuses a download record or an attestation from it.
2. **#4: pricing still current.** One database check runs at approval, at export and at attestation, and only at
   READ COMMITTED. A submission is never refused for stale pricing; it is flagged.
3. **#5: a contract window's unit and start.** Only "calendar days after the payment date" is verified today. No
   Medicare Advantage non-contracted deadline is verified until the dispute route is confirmed (Q34).
4. **#26: export attempts.** Each refusal or failure of the export is recorded as a coded event, with no patient data.
5. **#37 part 1: the payer's copy.** No export without a correspondence contact (`contact_missing`). New this round:
   Postgres itself refuses the export unless the contact has a name or office and a 10-digit phone, the two fields you
   made required.
6. **Your 2026-10-20 ruling on stale exports.** When pricing goes stale after the export and before the attestation,
   the export is never attested. A submission of it can still be logged, recorded "sent without sign-off: pricing went
   stale after export", with the reason and an audit event in the person's name, once.
7. **Safety fixes from last round, kept.** A session at REPEATABLE READ or SERIALIZABLE is refused, and the worker's
   login cannot log a submission in a person's name.

## While the previous version of the app is still running

Its export job exports nothing after this migration: Postgres refuses each of its exports. Its submission form has no
attestation check, so Postgres decides each submission:

- an attested export is logged as before;
- an export whose pricing went stale is logged sent without sign-off, with its reason and event, but without the
  confirmation box;
- any other unattested export is refused.

As before, run the migration before deploying.

## Checks on head `86d7edc` (PostgreSQL 18)

| Check | Result |
| --- | --- |
| install, fixtures, typecheck, lint, log lint, copy lint | pass |
| unit tests (CI=true): 3,825, 1 skipped | pass |
| golden, oracle (629 synthetic 835s), content, release immutability | pass |
| synth regenerated: fixtures unchanged | pass |
| fresh migrate; domain model `--check --strict` | pass |
| database tests: 8,586 pass, 1 skipped | 1 fails: your approval check, as expected |
| browser journeys: 48 | first run 47 (a test-mail race, now fixed); second run 47 (a ledger journey's timing, which passes alone and passed in CI) |
| build | pass |

## For you to decide

1. **The reviewer's checklist wording.** Two items said something untrue: the CSV naming the practice, approval line,
   reference and contact, and the clause shown above the first level. They now say what each file carries. Confirm
   the wording (recommended), or give your own.
2. **The CSV's reference.** Today only its file name carries the reference. Recommended: add a `packet_reference` column
   so the schedule still matches its letter if the name is lost.
3. **An export made before the guard whose pricing went stale since.** It can be neither attested nor logged.
   Recommended: confirm no staging environment holds one that was sent; no remedy is needed if none does.
