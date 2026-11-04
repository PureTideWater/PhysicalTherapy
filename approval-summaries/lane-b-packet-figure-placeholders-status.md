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
- 2026-11-04 16:55: design done while #84 waits for #85 (wf_8463f42c-8c6, `workflow-scripts/lane-b-packet-figure-placeholders-design-wf_8463f42c-8c6.js`): three scouts, the design `designs/lane-b-packet-figure-placeholders.md`, two adversarial reviews (payment-engine: 1 blocking, 5 should fix, 4 nits; model-gateway and AI safety: 2 blocking, 12 should fix, 1 nit), all answered in the revision ("Review and departures"). Shape: the stored narrative is a template with `{{fact:<id>}}` tokens; ids name a role over all lines, a code, a claim or an explicit row set, summed by code in bigint cents; code renders each token with its role and set named; free text refuses digits, money and percent signs and number words (one list shared with the scanner); the model gets fact ids without values or document text and returns segments; verifier /3 checks the template, then reads the rendered text only for contradiction; the report carries rendered_sha256 and approval binds to it. Seven slices. Open for the build: four items in the design's last section. For Lane A: one migration (verifier /3: report_valid accepts /3 with rendered_sha256 and the new codes; current_verifier requires /3; export_guard matches the rendered hash), CO-02 approval of record; ADR 0089 takes over the /3 ADR 0086 reserved (/4 if Lane A already merged a /3).

## Next step
Slice 1 (packages/packets fact catalog and renderer; two adversarial money reviews), after #84 merges, only if it can finish well before 2026-11-06 18:30 UTC; else hand back the reviewed design. Slice 3 (the verifier /3 migration) is Lane A's.
