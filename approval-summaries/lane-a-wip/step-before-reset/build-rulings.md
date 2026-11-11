# Item 28, the build's reviews: rulings (W9, 2026-11-11)

Reviews of f5d1c05e: `build-review-security.md` (1 blocking, 4 should-fix, 8 notes), `build-review-database.md`
(0 blocking, 2 should-fix, 8 notes). No wording review: the build adds no words on any screen. Each finding was
checked against the code; the provider facts stay unverified (no pool) and are read on the safer side.

| Finding | Ruling | Change |
| --- | --- | --- |
| SEC B1: a key registered across a reset is removed with a token the reset's sign-out has ended | Real by construction (the reset signs out after its commit; the second judgement refuses only after that commit). Fixed, the safer side | New `sign_in_lock_key_across_reset(target_user, request)` in the migration: when the key is not removed the account is locked (as ten failures lock it), recorded and paged; the runbook removes the key before unlocking. Holding the account's lock across the provider call stays rejected: the key would then exist "before" the reset and stay |
| SEC S1: the crossed state is judged by the flow but the insert trigger and the reset cover one account | Real. Fixed | `authenticated()` refuses a crossed state outright (the typed address names an account that is not the subject's): no session, no key step, a security line by IDs. Detecting and repairing it stays Schema PR 6 |
| SEC S2: an unknown outcome on a request never sent | Real for failures before any byte is sent. Fixed in part | Connection failures that cannot have reached the provider (refused, name not resolved) are the platform's failure, nothing ended. A timeout, a reset connection and a 5xx stay unknown. Once-a-window: the `sign_in` rate limit for the address already bounds it (design D9) |
| SEC S3: a throw after the provider stored the key | Real. Fixed | try/finally: a judgement that throws is read as refused; the grant is always released; the line is always logged |
| SEC S4: the reset's transaction failing twice leaves the mark unmoved | Real, a known limit (design section 5; ADR 0091 D15 pages it). Not in this PR | The runbook step for that page gains the owner's SQL that records the reset (which moves the mark and sweeps). A job that retries until it commits is handed on |
| SEC N3 and DB S2: the paging line fires with no audit row; `sign_in_step_refused()` records on every call | Real. Fixed | The function answers the reason (`no_account`, `no_start`, `ahead_of_clock`, `before_reset`, or NULL) and records once for an account, a step and a mark. The flow pages only for `before_reset`; `ahead_of_clock` logs an error line of its own |
| SEC N6: three paths leave the grant unreleased | To verify and fix in the round | |
| SEC N7: the rethrown 4xx on confirm may carry the provider's message into a log | To verify in the round; fix if the route logs more than the name | |
| DB S1: a session with no start is unchecked and `began?` is optional | Real. Fixed | `began` is required on `OpenSessionRequest`; tests that open sessions directly stamp one. The migration that refuses a row with no start once no earlier image can run stays handed on (design section 7, item 3) |
| DB N1: the preflight's trigger text depends on `search_path` | Real, fails closed. Fixed | Either spelling of the function's schema is accepted |
| DB N3: REPEATABLE READ on the session insert is a serialization failure | Sound. A test asserts it | |
| SEC N1, N2, N4, N5, N8; DB N2, N4 to N8 | Notes: known limits, recorded in ADR 0093 | N4's replay now adds no row |
