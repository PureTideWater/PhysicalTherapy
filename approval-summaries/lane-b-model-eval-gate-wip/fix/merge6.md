# merge6: claude/build-platform 21fa10df into co-001/contract-phi-check

Commit **a03654ce** (parents 315ac91e, 21fa10df). Worktree /home/user/contract-phi-check, tree clean, **not pushed**. No rebase, amend or force.

## Base
origin/claude/build-platform = 21fa10df, as expected; nothing else arrived. First-parent since 88708069:
- 22789493 #42 PR 6b-4: mail streams, delivery recording, the screening cut-off (ADR 0065; migration 20261107090000_mail_streams)
- 2affb854 #95 one unmapped plan no longer freezes a whole month (audit #32, ADR 0075)
- 21fa10df #91 dependabot group routing

`git merge --no-ff --no-commit`: clean, with no conflicts.

## Files both sides changed (88708069..base ∩ 88708069..315ac91e)
I checked each one by hand three ways. (1) Every added line of each side is in the merge, and every removed line is gone. (2) For each file, the merge's line multiset equals base + HEAD - ancestor: 0 mismatches across all 8, so there are no duplicates and nothing was dropped. (3) I read the hunks: the two sides' regions don't overlap and order is kept.
- apps/web/e2e/contracts.spec.ts: #95 changes the "mapped" notice wait (now l.268) to accept `mapped` or `mapped_pricing`. This PR's uploader, held-files and "Choose a kind" hunks (l.4, 8, 74+) are elsewhere. The lines that repeat are repeats from this PR's own side.
- docs/product/PRD.md: #95's NO_MAPPING wording is at l.174, 236 and 703. This PR's contract PHI check is at l.574 and 690.
- docs/product/reconciliation-001.md: base changes are at l.12, 498-500 and 643+. This PR's 2026-10-27 amendment is at l.263.
- docs/product/test-matrix.md: base adds or changes MAP-01, MAP-06..09, PRC-29..31, SEC-18/19, SCR-21/22, JOB-05, CI-12 and the SCR attribution line. This PR adds the MOD-12 row and the MOD-07..12 note. Order is MOD-11, MOD-12, MOD-13.
- packages/db/src/runtime.ts: base adds the canonicalMailbox export line. This PR adds `openedPool` to the connect export. Both are kept.
- packages/synth/src/cases/matrix.ts: base adds MAP, PRC, SEC, SCR and JOB rows and changes CI-12. This PR adds MOD-12 between MOD-11 and MOD-13.
- packages/synth/src/cases/registry.ts: base adds entries and changes MAP-01. This PR adds the MOD-12 entry. Test paths that repeat sit in different entries' assertedBy lists.
- tools/screening-capacity/watched-paths.txt: the union of both sides, regenerated (see below).

The task named two more files, but only the base side changed them since 88708069, so I took them from base: apps/worker/src/jobs/registry.ts and pnpm-lock.yaml. `--frozen-lockfile` confirms the lockfile.

## #42 and the screen
#42 does not affect the screen.
- **Audited reads (patient-records.ts):** migration 20261107090000_mail_streams does not touch patient_ref, claim, posting_row or ledger_match. readWithAudit (packages/db/src/authz/audit.ts) is unchanged. The audit_event_record INSERT policy is recreated with three more reserved actions (notice_undelivered, mail_stream_paused, mail_stream_resumed). It does not reserve `read` or `contract_screen_requested`, and its practice check is unchanged.
- **Rate-limit counters:** rate_limit_take.sql is unchanged. rate-limit.ts only adds the `screening_validation` bucket and a `global` limit kind. The screen's buckets, model_screen and model_screen_day (contract-proposals.ts), are untouched.
- **Other function changes:** the app_actor_* and reject_change diffs are comment lines only.

## Regenerated (nothing changed, nothing to stage)
- pnpm install --frozen-lockfile: ok.
- tsx tools/screening-capacity/watched.ts --write: 553 lines, identical to the merged union.
- pnpm synth --all, run twice: both runs wrote 0 files for 288 cases (689 unchanged) and 0 for 8 EMR formats (16 unchanged).

## Checks (all under flock /tmp/laneb-heavy.lock)
| Check | Result |
| --- | --- |
| pnpm typecheck | pass, 22 projects, 100.5 s |
| pnpm lint:copy | pass, 557 files |
| pnpm lint:logs | pass, 1118 files |
| pnpm check:fixtures | pass, 342 guard files, 4044 searched |
| vitest unit: packages/model-gateway, apps/web/src/components/uploads, packages/synth | 43 files, 800 tests passed |
| vitest db on a fresh phi_merge6_db at localhost:5433: patient-records.db, gateway.db, models-routes.db, permitted.db | 45 migrations applied (0 already), 4 files, 61 tests passed; database dropped WITH (FORCE) |

## Not run
The full pnpm test, the full test:db, test:golden and e2e.

## Commit message
The subject is as specified. The body names each both-sides file and how it was resolved, the #42 impact finding, what was regenerated and the checks. It ends with the two required trailer lines.
