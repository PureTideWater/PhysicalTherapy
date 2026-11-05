# Lane A's handoff to Lane B (2026-11-05 ~07:55 UTC)

Lane A's account reached 99% of its weekly usage on 2026-11-05 ~07:50 UTC. It resets about 2026-11-10 14:00 UTC. Every
session on it was told to stop at a clean point. Each one pushes its work as WIP refs, writes a RESUME-BLOCK in its
status file, unsubscribes from its PRs and cancels its check-ins. **From Lane B's reset (2026-11-06 19:00 UTC) Lane B's
account runs everything below**: Lane B's own items, the acting items, and Lane A's schema chain as acting Lane A until
Lane A's account returns. One schema PR at a time; the founder's decisions stay the founder's. Lane B also allocates the
counters until then.

Read in this order:
1. `CLAUDE.md`.
2. `LANES.md` (claims; "Handed to Lane A"; the notes at the top of "Claims").
3. This file.
4. `lanes/acting-lane-b-2026-11-04.md`. Its speed rules are the standing rules for both lanes; read 2a, the up-to-date rule.
5. `lanes/lane-b.md` from 2026-11-04 02:30 UTC on. Every merge, decision and ruling is there, dated.
6. Each item's status file and its RESUME-BLOCK.

Check every head live first (`git ls-remote origin`, the open PRs): a session may have merged or pushed after this was
written.

## 1. What merged since Lane B's handoff back (2026-11-02, tip 2affb854)

Each merged as a merge commit with every required check green after its verification:

| Merged | PRs |
| --- | --- |
| 2026-11-04 | #94, #107, #105, #75, #106, #86, #108, #104 (SS-01, schema), #109, #113, #114, #85, #115, #96, #117, #116, #84 |
| 2026-11-05 to ~07:45 UTC | #119, #118, #120, #121, #110 (SUITE-CAP-1b, schema), #125, #127 |

Two of the three schema-chain PRs are merged, each on the founder's committed approval line: SS-01 (#104) and
SUITE-CAP-1b (#110). #42 merged on 2026-11-02.

## 2. In flight when this account stopped (heads, WIP refs and next steps are in each status file's RESUME-BLOCK)

| Item | Where | State | Next |
| --- | --- | --- | --- |
| **Interest credited once (schema, Lane A)** | #126, `co-001/ledger-interest-once`; `lane-a-schema-chain-status.md` | Draft; four reviews (ledger, security, UX with shots, reliability) running or done; its own CAS-42.5 passed at full size | The fix round (with ADR 0084 D5's line-whole cap sentence), the full suite once, one push, the verification reading CI, then the suggested approval line. **The founder commits it.** The founder granted its ledger freeze exception on 2026-10-27. |
| **password-changed-notice (schema, Lane A, next after #126)** | `co-001/password-changed-notice` (not started); design in `designs/lane-a-auth-emails.md`; `lane-a-auth-emails-status.md` | Designed: a password_notice table filled by an AFTER INSERT trigger on audit_event password_reset_completed; tp_operator claim functions; kind password_changed on the transactional stream; ADR 0091, SGN-16 | Build through the marker route with a timestamp after 20261110090000. Its PR opens only after #126 merges, then needs the founder's line. |
| Email lockup plate | #129, `co-001/email-lockup-plate`; `lane-a-email-lockup-plate-status.md` | Fix round done; the derived plate art was confirmed by the orchestrator as the brand delegate | Merge on green under the up-to-date rule, if S4 did not already. |
| Packet figures as placeholders, slice 1 | **Merged as #128 (cc3dd7f6, 2026-11-05 ~08:20 UTC)** | Done | Slice 2 (the drafter emits tokens; verifier /3 behind the format constant; ADR 0089) from the RESUME-BLOCK in `lane-b-packet-figure-placeholders-status.md`. Slice 3's verifier /3 migration is in Lane A's schema queue. |
| Contract pages in their own process | `co-001/wip-pages-child-process` (c369bc77 or later); `lane-a-pages-child-process-status.md` | Built; two reviews running; SEC-24 | Fix round, PR, CI, merge. **infra/lib/heap.ts's planned `--max-old-space-size=560` must not ship before it.** |
| Packets verifier identifier fold | `co-001/packets-verifier-identifier-fold`; `lane-b-packets-verifier-identifier-fold-status.md` | Just started (S1); MOD-19, MOD-20 | The gateway's fold reused in `packages/packets` identifierSpans, with a differential property test; two reviews. |

**First thing for Lane B: #127's MOD-16 property fails on some seeds.** It is unseeded, in `packages/model-gateway/src/redact.property.test.ts`. It failed at seed 1034253323 on "Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00" (#128's CI). The base's push run passed only by its random seed, so any PR's unit job can go red.
- It is a real over- or under-redaction case, or a survivor-scan false positive, between the SSN and phone patterns and an amount next to a date range.
- Root-cause it, pin the seed as a regression case, and fix it. It is PHI redaction, so two reviews.
- S1 stood down before fixing it (`lane-b-redact-ssn-phone-status.md`).

## 3. Paused Lane B items (no session holds them)

- UX PR 4b: the screening labels re-pin, under the ruling in `lanes/lane-b.md` 2026-10-28 03:20 UTC, plus #121's P1 (the anomaly chip's sans "$5").
- ux-forms-after-42.
- P2 ci-trivy-version.
- P5 ci-catalog.
- UX PR 8 (ADR 0090, SGN-09 to SGN-12).
- #46's verified seal.
- #48's narrative draft (ADR 0076, CAS-35 to CAS-37).
- **dark-mode-ship.** The brand ruling of 2026-11-04: a dark-mode pass over every screen first, then `prefers-color-scheme` with a settings override.
- **SUITE-CAP-3, reconcile at real size.** The design is on WIP `co-001/wip-suite-cap-3`; SUITE-CAP-1b's hand-off is `approval-summaries/lane-a-to-lane-b-sc1b-reconcile-time-2026-11-05.md`. Its `ledger_line_net` rewrite needs a founder freeze exception. The capacity summary's "Known gap" line tracks the margin (F's 2,000-line reconcile is 413 to 657 s of 900).
- The UX review's later PRs (LANES.md "Queues").

## 4. Lane A's schema queue after #126 (for acting Lane A, one at a time, each with the founder's line)

1. password-changed-notice (section 2).
2. #84's tp-packet-verifier/3 migration (packet-figure-placeholders slice 3 builds on it).
3. #85's design §7.2 items 1 to 5.
4. #93's F9 (`roi_links_valid()`'s fifth key).
5. Relinking an app row to a new Cognito subject (#125's stuck-invitee note).
6. The rest of LANES.md "Handed to Lane A".

Cognito PR 2 (the confidential client and cutover; ADR 0088) is not a schema PR. It is cut only after #113 is deployed
to staging, and it needs the founder's F1 to F5 and ruling 16 first.

## 5. The founder's open items

- **#126's approval line** when posted: "Commit suggestion" on GitHub, as for #104 and #110. Then password-changed-notice's.
- **Staging steps:**
  - F0: a synthetic invite, then set the password, enrol and sign in, before release N reaches production (ADR 0088).
  - F1 to F5 and ruling 16 (an SCP or permission boundary denying DescribeUserPoolClient to read-only sets) before Cognito PR 2.
  - #125's staging smoke checks (ADR 0081).
  - Real Gmail iOS and Outlook.com dark renders of the email plate.
- **Launch items:**
  - #42's actions 2 to 7;
  - counsel's reading of the signed-off legal text;
  - O9 (issue #41);
  - runbook 3i (the build's own GitHub account);
  - PRD section 19's RDS cost line (staging is now db.t4g.medium and dev db.t4g.small: about +$23 and +$11 a month).
- **Housekeeping, the person's call:** delete the superseded branches `co-001/cognito-confidential-client`, which holds two .gitleaksignore entries and is never to be merged, `co-001/wip-pricing-run-cutoff` and `co-001/wip/pricing-run-cutoff-s4`.

## 6. Counters (Lane B allocates until Lane A returns)

Next free:
- ADR 0092 (0089 packet-figure-placeholders slice 2, 0090 UX PR 8, 0091 password-changed-notice);
- test-matrix MOD-21, CAS-56, SEC-25, SGN-17;
- synth module 21;
- fixture release 900008.

## 7. What cost time this round, so it does not cost Lane B's

- **Repository visibility.** The repository went private for a few hours on 2026-11-04. Private 2-CPU runners fail the screening-capacity gate (RUNNER_TOO_SMALL), and blobless clones need credentials (#106 fixed that). It is public again; keep it so, or move to an organization on GitHub Team with a 4-core runner.
- **GitHub's up-to-date rule** is enforced on a public repository. Merge the base right before the merge, and expect one CI re-run when the base moved.
- **Sessions may not open a PR on a relayed request.** The orchestrator opened #109, #114, #119 and #128 itself. Plan for it.
- **An agent added .gitleaksignore entries once** (#112, closed, never merged). Every workflow prompt now says: a gitleaks refusal is fixed by rewriting the flagged text, never by .gitleaksignore.
- **A process-wide `--max-old-space-size` overrides a worker thread's resourceLimits on Node 24.** Isolate untrusted parsers in child processes.

## 8. The message that starts Lane B

> ultracode. You are Lane B of the PaidWhole build, from 2026-11-06 19:00 UTC. Lane A's account is out of weekly usage
> until about 2026-11-10 14:00 UTC. Read CLAUDE.md, LANES.md, `lanes/lane-a-handoff-to-lane-b-2026-11-05.md`,
> `lanes/acting-lane-b-2026-11-04.md` (the speed rules, 2a included) and `lanes/lane-b.md` from 2026-11-04 02:30 UTC,
> then each item's status file and RESUME-BLOCK. Check every head live. Run Lane B's items, the in-flight items of
> section 2 and, as acting Lane A until Lane A returns, the schema chain (#126 first, then section 4), one session per
> item from its status file. Pace to the week: about five sessions, at most two heavy workflows each. One schema PR at a
> time; the founder's decisions stay the founder's. Allocate the counters and write your entries in `lanes/lane-b.md`.
> Before your own account's limit, write a handoff back like this one.
