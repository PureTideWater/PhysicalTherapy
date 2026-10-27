# gateway part: what the documents must now say (S1, S2, the nit on the person's event)

The code is in the worktree (gateway.ts, contract-proposals.ts, models.ts, permitted.ts and their tests). Each item
below names the passage at 9b7eadfe and what it must say instead or in addition. Line numbers are of
`docs/adr/0070-gate-models-on-wrong-but-verified-fields-...-before-the-model.md` (ADR 0070) unless another file is named.

## ADR 0070, Part 3, Decision

1. **"The gateway's order" (603-607). Corrected.** It must say:
   `limited()` checks, in order: the purpose served; the kill switch and a purpose's flag; the PHI boundary; `prepare`
   (the kind check and the framing as data); the call's own variant served; a completed call under the idempotency
   key (`DuplicateModelCallError`); a read of the day's logged spend against the budget (`ModelBudgetExceededError`,
   logged `MODEL_BUDGET_EXCEEDED`); the caller's step before the screen (`CallContext.beforeScreen`), when the purpose
   screens; and only then the screen; after it, the budget's hold and the call. Every refusal the gateway can make
   without the screen comes first, so no audited read of a practice's records runs for a call the gateway refuses
   anyway, and the screen is the last step that can refuse a call before it is made (combined audit item 120's
   review, S1). A refused call writes no `model_call` row, holds no budget and sends nothing. The budget's read counts
   no call in flight (`spentSince`), so it never refuses a call the hold would make; the hold, which adds the calls in
   flight under the practice's lock, still decides the rest. (The old text, "the screen runs before the idempotency
   key, the budget hold and the call ... no audited read runs for a call that would be refused anyway", was false for a
   replay and a spent budget: the review measured a full screen before each such refusal.)

2. **New paragraph after "The gateway's order": "When a screen may run" (S1).** It must say:
   - **The caller's step before the screen.** `CallContext.beforeScreen?: () => Promise<void>` runs once the gateway has
     refused everything it can without the screen, and only when the purpose has a screen. A throw refuses the call
     with the caller's own error: nothing is screened, held or sent, and the gateway logs nothing of it. It cannot skip,
     change or answer the screen, which runs after it on the prepared request. The web's proposal uses it for the
     screen's limits and the person's event (below); the worker passes none.
   - **The screen's limits** (`apps/web/src/lib/models/contract-proposals.ts`, `SCREEN_LIMITS`). Until F3 each screen
     reads, decrypts and audits every identifier the practice holds (up to 50,000 `audit_event` rows, which no role can
     remove), so the web counts screens in Postgres with `rate_limit_take` (fixed windows every web task shares; no
     migration: `rate_limit_counter.bucket` accepts any name of the pattern): 20 an hour and 60 a day per practice, 20
     an hour and 100 a day per person (buckets `model_screen` and `model_screen_day`; subjects are HMACs of the
     practice's or the user's ID under the server's key, in `rate-limit.ts`'s form). They are taken in the step before
     the screen, on the gateway's own pool (never the request's: ADR 0055), each its own transaction, the first one
     reached stopping the count. A screen past any limit is not run: the person sees the `screen_unavailable` notice
     (until a `screen_limited` notice is added: requests.md, gateway 4), the operator one line,
     `MODEL_SCREEN_LIMITED` with `practice_id`, and nothing is read, sent or recorded but the route's own
     `model_proposal_requested` event. A click the gateway refuses anyway (the kill switch, a spent budget, a variant
     not served) and a remembered document (below) count against no limit. The limits sit far above a specialist's
     day: a version's terms are proposed once (a proposal that records anything moves the version out of draft).
     The route's own bucket for the clicks (`rate-limit.ts` is a #42 file) is proposed for after #42 (requests.md,
     gateway 6); the skeptic's `model_screen` route bucket was not taken for the same reason, and because a route
     bucket counts clicks the gateway refuses anyway, while these count only screens about to read and also cap a
     practice across people.
   - **A document found naming a patient is remembered.** The web remembers, per server, for an hour, that a document
     of a practice named a patient (a `names_patient` refusal), under the practice, the document and a SHA-256 of the
     pages screened; a click on it again within the hour is refused as `names_patient` at once, unscreened (nothing
     read, decrypted or audited again) and uncounted. Only the refusal is held: nothing of the match (not which
     identifier, its kind, its row or how many), no identifier and no page text. It can go stale only toward refusing
     (the practice's records no longer hold the patient), never toward sending, so it needs no version of the
     practice's records. A `clear` is never remembered: records loaded meanwhile could make the same pages name a
     patient, and no record version exists to tell (one would be a migration). At most 1,000 documents per server,
     oldest out first.

3. **"Read as the screen, not as the person" (655-662). Corrected.** Replace "The web records one event in the person's
   own name before the gateway is called" with "The web records one event in the person's own name in the gateway's step
   before the screen (`CallContext.beforeScreen`), after every refusal the gateway can make without a screen and after
   the screen's limits, so the event is written exactly when a screen is about to read". Replace "so the trail says who
   caused the screen and joins to its reads" with "so the `audit_event` trail says who caused the screen and joins to
   its reads (the practice's access log cannot show the join yet: What it gives up)".

4. **"The callers", the web bullet (666-670). Corrected.** It must say: `proposeTerms` builds the check after the route's
   role check, the kind check, the pages and the gateway's availability (with no model configured nothing is screened
   or audited), from the request's scope as proof only, on the model pool, with `screenId` a fresh UUID; refuses at once
   a document this server found naming a patient within the hour; and passes the gateway the check and a step before
   the screen that takes the screen's limits and then records the person's event in the request's transaction. The
   worker bullet gains: "The check reads only when the gateway first screens, so a run whose calls are all refused
   before the screen (the kill switch, a spent budget, a retried job's completed calls) reads none of the practice's
   records."

5. **"The refusal" (687-688). Corrected.** Replace "The 'Propose the terms' card stays, and a second click runs the whole
   check again." with "The 'Propose the terms' card stays. A second click on the same server within the hour is refused
   at once, unscreened; on another server, or later, the check runs again, within the screen's limits."

6. **"What is recorded" (697-702). Corrected.** It must say: no `model_call` row; the route's own
   `model_proposal_requested` event, as before, on every click; and, only for a screen about to read, the person's
   `contract_screen_requested` event, then the audited reads. A call refused before the screen (busy, a purpose or
   variant not served, the kill switch or a flag, the PHI boundary, the input's checks, a completed call, a spent
   budget, a screen's limit) and a remembered document record no person's event and no read. Above the bound the
   screen reads nothing, and only the person's event is recorded.

7. **"What is logged" (708-716). Add:** `MODEL_SCREEN_LIMITED`, logged by the web (not the gateway) with `practice_id`,
   when a screen's limit stops a proposal before its screen. A remembered refusal logs nothing new (its first refusal
   was logged); the route's event records every click.

## ADR 0070, Part 3, What it gives up (728-750)

8. **"The audit trail" bullet. Corrected and extended.** Replace its second sentence ("The event is also recorded when
   the gateway then refuses before the screen runs (the kill switch, an unserved variant), with no reads after it.")
   with: "The event is written in the gateway's step before the screen, so no refusal before the screen leaves it
   without reads (the security review's nit: before this, every refusal before the screen did, not only the two this
   bullet named); it is still written with no reads after it when the screen itself reads nothing: above the bound
   (`screen_unavailable`, count only) or with a check the gateway did not issue (`screen_invalid`, which no production
   caller can pass)." Keep the rollback sentence (a request that later fails rolls back the event and leaves the reads).
   Add: "**The practice's access log** (`practice_access_log`, through `accessLogPage` in `settings.ts`) shows a screen's
   reads as 'a job of the practice' via 'system': it returns no request ID, so it cannot name the person who caused
   them, and the worker's permitted run writes reads that look the same with no person's event. Its cursor is `at`
   alone, and every read of one screen shares its transaction's `at`, so the log lists only the first page (50) of a
   screen's reads (up to 50,000) and the next page skips the rest; the record filter still finds each read, so 'who
   read claim X' is answered, without the cause. The `audit_event` rows are complete. Fixing the report needs a new
   version of the function (a migration: Lane A's, with F3 or beside it) and the route change after #42
   (requests.md, gateway 5 and 7); `models-routes.db.test.ts` pins today's behaviour and flips then. The person's
   `grant_id` is not put on the reads: the support ticket's trail would then say the person read every patient (M8)."

9. **New bullet: "The cost over time" (S1).** "Until F3, each screen still reads, decrypts and audits up to 50,000
   identifiers. The screen's limits bound that: at most 20 screens an hour and 60 a day of one practice, and 20 an hour
   and 100 a day caused by one person, so at most 3 million audit rows a practice a day at the bound (typically far
   fewer: one per patient with a member ID, per claim and per unmatched posting row), where the review measured a
   click loop writing 1 to 6 million a minute. A refusal for `names_patient` reads and audits the whole practice again
   only when a server has not seen that document refused within the hour: each web task remembers on its own, so N
   tasks may each screen it once an hour. Someone who reaches a limit, a scripted loop above all, keeps that practice's
   proposals from screening, for every specialist, until the window ends: the feature is unavailable there for the
   window (hand entry is not), which is the safer failure. A count that reached a limit still holds the hits taken
   before it in that click. The worker's permitted run has no limit of its own: it screens each practice at most once
   a run."

10. **New bullet: "A remembered refusal".** "For up to an hour a server refuses a document it found naming a patient
    without asking the records again; were the records to lose that patient meanwhile (a retention purge), the refusal
    would outlive it by that hour. It never sends a document unscreened: a clear is never remembered."

## ADR 0070, Part 3, other sections

11. **Consequences (851-853). Corrected.** Replace "Until F3, each proposal decrypts and audits every identifier of a
    practice below the bound, as the service screen, once per click" with "Until F3, a proposal the gateway would send
    decrypts and audits every identifier of a practice below the bound, as the service screen, once, within the
    screen's limits (20 an hour and 60 a day per practice, 20 an hour and 100 a day per person); a click the gateway
    refuses anyway reads nothing, and a document a server found naming a patient within the hour is refused unread".

12. **Where the build departs from the design. Add three:**
    - **20. The screen runs last of the gateway's refusals**, where the design (5.2, m3) put it before the idempotency
      key and the budget: a replay and a spent budget are now refused unscreened (the review's S1). The design's
      reasoning (no budget is held and no row written for a refused call) still holds: the two checks before it are
      reads; the hold stays after the screen.
    - **21. The person's event is written in the gateway's step before the screen** (`CallContext.beforeScreen`), not
      before the gateway is called (the design's 5.2), so it is written only for a screen about to read.
    - **22. The screen has limits, and a found `names_patient` is remembered for an hour per server** (S1); the design
      had neither. Both are code only; the limits use the existing `rate_limit_take`.

13. **Tests (MOD-12) (866-899). Add:**
    - `src/gateway.test.ts`: a replay under a completed key and a practice with a spent budget refused with no screen
      connection taken; the caller's step before the screen not run for any refusal before it (busy, the kill switch,
      the PHI boundary, the input's checks, a completed call, a spent budget, an unserved variant), run once before the
      screen's first connection otherwise, its throw refusing the call unscreened, unheld, unsent and unlogged, and never
      run for a purpose with no screen; the names_patient refusals now after the idempotency and budget reads, before
      the hold.
    - `src/gateway.db.test.ts`: on Postgres, a replay and a spent budget write no contract_screen audit row.
    - `apps/web/src/lib/routes/models-routes.db.test.ts`: per click at a spent budget, no read and no person's event
      (was 6 reads and one event each); a misfiled document clicked three times screened once (was three times); the
      limits counted only for a screen about to read and each of the four refusing a screen with nothing read or sent
      and `MODEL_SCREEN_LIMITED` logged; no person's event for the kill switch or an unserved variant; the access log's
      gap after a screen pinned (S2); a screen_failed screen's reads kept (F3).
    - `apps/worker/src/models/permitted.db.test.ts`: a spent budget reads none of the practice's records; two examples of
      a practice whose stored identifier does not decrypt both `refused:screen_failed`, read once each.

## ADR 0054 (its amendment for the contract screen, 279-282)

14. Replace "The gateway's order is unchanged and the screen keeps its place: serving, the kill switch and flags, the PHI
    boundary, `prepare` (the kind check and the framing), the variant's serving check, then `screen`, before the
    idempotency key, the budget hold and the call. No audited read runs for a call that would be refused." with "The
    screen runs last of the gateway's refusals: serving, the kill switch and flags, the PHI boundary, `prepare` (the kind
    check and the framing), the variant's serving check, a completed call under the idempotency key, a read of the day's
    spend against the budget and the caller's step before the screen, then `screen`; after it, the budget's hold and the
    call. No audited read runs for a call the gateway refuses without the screen (ADR 0070, Part 3; the review's S1)."

## docs/runbooks/model-evaluation.md (218-223)

15. Add to "A contract proposal is refused before it is sent": "The web logs `MODEL_SCREEN_LIMITED` (with `practice_id`)
    when the contract screen's limits stopped a proposal before its screen (20 screens an hour and 60 a day per practice,
    20 an hour and 100 a day per person; `contract-proposals.ts` `SCREEN_LIMITS`): the person sees that the document
    could not be checked and enters the terms by hand, or tries again after the window. Many lines for one practice are
    a loop to look into, not a capacity to raise: until F3 every screen audits every identifier of the practice."

## docs/product (the test matrix's MOD-12 row)

16. MOD-12's `assertedBy` (fixtures/synthetic/MOD-12/expected.json) already names every file these tests are in; no
    new file. The row in `docs/product/test-matrix.md:231` gains, after "a practice above the bound, or a check that
    cannot read the records, refused;": "a call the gateway refuses without the screen (a replay, a spent budget) reads
    none of the practice's records, a screen runs within limits per practice and per person, and the person's event is
    written only for a screen about to read;".
