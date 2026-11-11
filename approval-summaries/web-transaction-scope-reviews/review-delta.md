# Adversarial review: delta 766467cd..866f4891

Result: no blocker and no should-fix found. Four notes. Read-only; nothing edited.

## Findings

### R1 (note) apps/web/src/lib/http/request-sends.ts:8 and :82 - the order is by payload text and by locale collation, not by the lock's own key
- The lock two requests wait on is pg-boss's unique index on (queue, singletonKey); the sort key is `type + "\n" + JSON.stringify(payload)` compared with `localeCompare`.
- Reasoned, not a failing case today: for every schema in apps/worker/src/jobs/registry.ts the parsed payload (Zod strictObject, keys in schema order) starts with practice_id and then the subject field, both fixed-width lower-case IDs or dates, and the only non-key field (packet_export.words_version, monitor.months) comes after the subject. So text order agrees with key order, and two sends that share a key but differ in text (same packet_version_id, different words_version) take the same lock, where their relative order does not matter.
- It is brittle in two ways: (a) a future payload with a non-key field before its subject would let two requests order the same two keys differently, with no test to catch it; (b) `localeCompare` depends on the process's ICU locale and version (verified here: default collator en-US; case and whitespace compare as expected for ASCII), so the "one order" is one per runtime, not one by definition.
- Suggested: sort by `singletonKey(type, payload)` (exported from @tp/worker/jobs) with a plain code-unit comparison (`a < b ? -1 : a > b ? 1 : 0`).

### R2 (note) apps/web/src/lib/http/request-sends.test.ts:74-89 - the new order test covers two different types only
- It asserts price,reconcile for both send orders (verified passing). It does not cover two sends of the same type with different payloads, which is the case the payload half of the key exists for, and nothing exercises the deadlock itself against PostgreSQL. The three edited expectations (lines 69-71, 148, 160-163) do assert the sorted order for hold and for the direct re-send.

### R3 (note) apps/web/src/lib/http/transaction-scope.db.test.ts:361-380 - the remembered-refusals cache through a request's view is not asserted
- The test asserts the limiter and the injected model path are shared by two real requests' views, equal the server's, and differ for another server (not run here: db test; read only). The third map moved to `serverOf` (contract-proposals.ts:222-237, `remembered`) has no assertion that a refusal remembered in one request is found in the next. The code is the same pattern, so this is coverage only.

### R4 (note, unverified) packages/db/src/authz/scope.ts:80 - a non-English lc_messages turns every certain rollback at COMMIT into "unknown"
- Verified: pg-protocol 1.16.1 dist/parser.js:307 sets `severity = fields.S`, the localized field (it never reads V). Under English messages every server ERROR has severity 'ERROR', so 55P03, 23514, 40001 at COMMIT are rethrown as before and the web's mappings (invoke.ts:397 isPgError 55P03, :443 23514) still see them.
- Reasoned: if a database were ever run with another lc_messages, each such COMMIT error would become CommitOutcomeUnknownError, and RequestSends.settle (request-sends.ts:99) commits the held jobs for a request that certainly rolled back, and the 55P03 "busy" answer becomes the unknown-outcome answer. The comment says the deployment is English; I did not check whether anything pins or tests lc_messages (out of budget). A startup or catalog check of `SHOW lc_messages` would make the assumption enforced.

## Tried and could not break

Verified by reading or running:
- No other state keyed on the per-request object: the only WeakMaps in apps/web/src are `servers`, `limiters`, `injected`, `remembered`; all three consumers now go through `serverOf` on every get, set and delete.
- No caller passes a copy `serverOf` cannot map: `signedInServices` has one caller (invoke.ts:362); no `...services` spread exists in non-test apps/web/src; routes/models.ts, coverage.ts, abstraction.ts, packets.ts pass the handler's `services` itself. Test-built plain objects (routes/test-support/model-world.ts:71) fall back to themselves, which is the old behaviour and correct for them.
- No cross-server leak: a view maps only to the services it was made from; an unmapped object maps to itself. No memory hold: the WeakMap is keyed by the per-request view, and its value (the server's services) lives for the process anyway.
- No client-bundle or cycle problem from path.ts importing server/services.ts: server/services.ts does not import models/*, and the one component touching models (components/models/display.tsx) imports types and models/notices only.
- Stricter COMMIT classification: `committed` is the only user of `refusedByServer`; real pg errors carry severity. Stand-ins without severity elsewhere (worker password-notices.test.ts:327 with 40001, http.test.ts:75 and request-sends.test.ts:92 with 55P03) do not pass through `committed` and still pass.
- Ran, all green: packages/db src/authz/scope.test.ts (38), apps/web src/lib/http/request-sends.test.ts + http.test.ts (64), apps/worker src/platform/password-notices.test.ts (23).
- scope.test.ts:150-152 does assert the new behaviour: EPIPE, a code with no severity, a foreign severity, PANIC and severity without code are each CommitOutcomeUnknownError; 40001 with ERROR is rethrown as itself.
- Sorting and send order: nothing relied on it. Types are separate pg-boss queues, the direct re-send iterates the same (sorted) array, and a duplicate key inside one request is refused by its own row as before.

Not done: the db tests (transaction-scope.db.test.ts, commit-answer.db.test.ts) were read, not run; no deadlock reproduction against PostgreSQL.
