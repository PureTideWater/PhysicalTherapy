ACTING (Lane A's account, https://claude.ai/code/session_019i9ifAd3jhRt1Vkzz2vUSQ) holds this item from 2026-11-04 16:20 UTC; Lane B: read lanes/lane-b.md's latest entries before resuming.

# Lane B item: narrative figures as placeholders bound to the facts (`co-001/packet-figure-placeholders`)

Claimed by acting S2 at Lane A's orchestrator's word (2026-11-04 16:13 UTC). Counters: ADR 0089 if it needs its own ADR; test-matrix CAS-52 to CAS-55. A migration, if any, is for Lane A.
Source: #84's known limit (ADR 0086 consequences and "Revisit when"): a total stated for a part of the lines in words the triggers do not list passes, at the base and at #84 alike.

## Decision (orchestrator, 2026-11-04)
The narrative's figures become placeholders bound to fact ids, rendered by code at export; free-text numbers in a model's narrative are refused (CLAUDE.md rule 1 taken to its end).

## Order
1. #84 first (it waits for #85).
2. Design, with one reviewer under the payment-engine and model-gateway lenses, plus scouts on packages/packets, the drafter's prompt and schema in packages/model-gateway, the verifier and the export renderer. Check whether the packet format or the verifier format needs a new version, and whether any part needs a migration (for Lane A).
3. Build only if the design is done well before 2026-11-06 18:30 UTC; else hand the reviewed design back to Lane B then. Money and the model: two adversarial reviews.

## Log (UTC)
- 2026-11-04 16:20: claimed; not started (#84 first).

## Next step
Design, after #84's merge (or while #84 waits for #85, if the session has room: design only, no branch pushes).
