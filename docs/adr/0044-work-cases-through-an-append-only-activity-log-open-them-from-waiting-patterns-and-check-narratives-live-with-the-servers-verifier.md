# 0044. Work cases through an append-only activity log, open them from waiting patterns, and check narratives live with the server's verifier

- **Status:** accepted (amends 0038 for who opens a case, and 0041 for where the verifier runs)
- **Date:** 2026-10-24
- **Deciders:** founder (engineering)
- **PRD sections:** 3 (the billing manager must not approve a packet she drafted), 5 (J8 to J10), 7 (Cases, Packet
  builder, Submissions and responses, the dashboard), 8 (case: owner, materiality), 12 (Materiality and pursuit cost,
  The packet, Approval, Submission response and follow-up, Write-offs and reopening), 20 (single-user approval); Data
  dictionary; test matrix CAS-03 to CAS-15, LED-01; ADRs 0013, 0018, 0038, 0041, 0042

## Context

Milestone 8's part B is the workbench: the Cases list and detail, the packet builder and the submission log, on top of
the packet records of ADR 0041 and the ledger of ADR 0042. The plan names the screens and their actions. It leaves open:

- where notes, assignments and approval requests live, since no table holds them;
- what "create a case from a payer pattern" means while triage opens one case per pattern on its own;
- what "set materiality" sets;
- how the screens name a practice's people, when the user table's policy shows each person only their own row;
- how the builder shows "live verifier results" while approval stays decided by the server's stored result.

## Decision

**One append-only activity table (migration 20261024110000).** `case_activity` is a PHI table: practice_id, forced
tenant policy, registry row, never updated, deleted or truncated. Each row is one of three kinds:

- a note, in the person's words, encrypted with the practice's key (`case_activity.body`, as ADR 0038 does for every
  text a person writes);
- an assignment, naming the case's new owner or none;
- an approval request, naming the packet's current version, with optional words, also encrypted.

Each is a person's own, in their own name (a restrictive insert policy and an AFTER trigger, so a row of another
practice meets the tenant policy first, ADR 0038). Notes and assignments need `case.work`. An owner must work the
practice's cases now (`case_owner_eligible`). A request needs `packet.draft` and a current, unapproved version that
passed the verifier. An assignment sets `case.owner_user_id` through a definer trigger, because the application role
cannot update a case and nothing else sets the owner. The rows are the assignment history the timeline shows. The
timeline itself is not stored: it is read from every record of the case (its opening, its lines' stage events,
write-offs and reopens, its activity, its packet's versions, approvals and exports, its submissions and the payer's
responses), in fixed words built by code. A note's words show only to the roles that read PHI.

**Opening a case from a waiting pattern.** Triage still opens a case when a pattern reaches the case materiality (CAS-03,
CAS-04). The Cases screen also lists the patterns waiting (`@tp/worker/triage`'s `waitingPatterns`, from the run in
effect, grouped by `patternId` as triage groups them) with their actionable total and one of three statuses: ready,
held below the case materiality, or joining an open case. A person with `case.work` opens a ready pattern by hand
(`openCaseOnPattern`). It takes the practice's triage lock, records the case materiality in force and the pursuit
estimate, adds only the lines whose windows are still open, and moves them to actionable in the person's name. A held
pattern is refused with its reason, so CAS-04 holds for people as it does for triage. Two restrictive insert policies
make `case.work` the only way a person adds a case or a case line; a job (triage) is unchanged.

**Materiality is the practice's two thresholds.** "Set materiality" sets the practice's per-line and per-case
materiality (`practice.settings` `line_materiality_cents` and `case_materiality_cents`, integer cents as text, the keys
`@tp/triage` and the console already use). It goes through `practice_set_materiality`, a definer function that checks
the person, the scope and `case.work`. The Cases screen states the consequence before the change: triage reads the new
thresholds from its next run, a case keeps the materiality in force when it opened, and the waiting patterns are judged
again at once.

**People by functions.** `practice_case_workers` lists who may own the practice's cases now. `practice_people_emails`
gives the email of each named person who is or was a member of the practice's group or of an organization granted the
practice. Both answer only for a practice the caller reaches, and leave anyone else out. No user row is otherwise
exposed.

**The live check is the server's own code.** The verifier's text checks moved to `@tp/packets/check`
(`findMismatches`, no node:crypto), and `verifyNarrative` is that check plus the narrative's SHA-256. The narrative
editor runs `checkNarrative` against the version's content on every keystroke and lists each mismatch with the words it
is about. That is advice only: saving writes a new version, the server verifies it again and stores the result, and
only the stored result decides approval (ADR 0041). A unit property holds that the two agree.

**The approval panel says ahead what the database will answer.** `approvalState` reads the stored facts: approved;
blocked (verifier, a later version, the case's lines changed, the regulation not confirmed); not an approver; the
drafter; waiting out the single-user delay, with a countdown; or ready, alone or not. The drafter is shown the refusal,
and the button submits anyway, so the database's own reason comes back. Every refusal from the packet services or a
check constraint reaches the form as `Refused: <reason>.`, never a stack.

**Permissions.**

- Reading the builder: `packet.draft`.
- Approving: `packet.approve`.
- Exporting and downloading the PDF and CSV: `phi.export`, since the export inserts the identifiers.
- Reading the submission log: `practice.open`.
- Logging a submission or recording a response: `submission.log`.

Each is checked in the handler and again in Postgres. Every mutation records an audit event and is made once:

- saving what the version already holds writes nothing (`notice=unchanged`);
- the same submission, response, assignment or approval request again does nothing.

The generated route tests rely on that, since they call every mutation with every role allowed it.

**Figures stay code's.** The case detail's payer approved and recovered totals come from the recovery ledger
(`practiceLedgerTotals` per case). A response records no ledger entry and moves no line (LED-01). The stage-three figure
counts lines still at actionable. A line past its window is struck through, marked `WINDOW_PASSED` and left out of the
actionable total. The dashboard lists cases whose latest submission has no response by its follow-up date
(`followUpsDue`; 45 days unless named), beside the cases nearing their deadline.

**Locks.** The application role cannot lock case rows `FOR UPDATE`, which needs the update privilege it lacks.
Assignments therefore take a transaction advisory lock per case, and approval requests take the packet services' own
per-case lock.

## Alternatives considered

| Option | Why not (or when we would switch) |
| --- | --- |
| A notes table, an assignments table and a requests table | Three tables, three policies and three timelines for one append-only history; the kinds differ only in their checks |
| An updatable `case.owner_user_id` granted to the application role | The owner could change with no record of who changed it; the activity row is the record |
| Letting a person open a case on any pattern, below materiality too | Breaks CAS-04 and the practice's own threshold; a person lowers the threshold instead, which is audited |
| A materiality per case, set after it opens | The case keeps the materiality in force when it opened (PRD 8); changing it later would rewrite why it opened |
| Calling the server to verify on each keystroke | A round trip per key, and text sent before the person saves; the same code runs in the browser on the version's own content |
| Hiding the approve button from the drafter | The database's reason is the authority; showing it keeps the refusal honest and tested |

## Consequences

- `pnpm test:db` gains `apps/web/src/lib/routes/workbench-routes.db.test.ts`, run through the routes:
  - CAS-04 and opening by hand; assignment and encrypted notes; `WINDOW_PASSED`;
  - CAS-08 to CAS-13 in the builder; CAS-10's countdown and audit flag; CAS-14's follow-ups and the dashboard;
  - LED-01, and isolation from another practice.
- The generated route tests, the cross-tenant tests and the catalog test cover `case_activity`. The route-test world
  gains a second case with an approved, exported and submitted packet. Its contract counts units per code, so its
  lines are priced at an expected amount.
- `apps/web/e2e/packets.spec.ts` is the milestone 8 done check in the browser:
  - a figure not in the input blocks approval;
  - the drafter is refused;
  - a second person approves and exports;
  - the export's SHA-256 is in the submission log.
- Not built: a contract specialist's confirmation of the Medicare Advantage regulation per case. Such a packet shows
  approval blocked with that reason until the console gains the action.

## Revisit when

The console gains the regulation confirmation; a practice wants a case reassigned in bulk; milestone 10's model drafts
narratives (the same live check and the same stored verifier); a customer asks for notes to be edited rather than
followed by another.
