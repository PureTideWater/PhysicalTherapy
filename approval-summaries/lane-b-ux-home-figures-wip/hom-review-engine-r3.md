# hom-review-engine-r3 progress
- reuse rev-engine clone @87691be4
- r3: candidate R3-1 firstOn can be a recoupment date (recouped counted in entryIds.recovered) -> since predates any proof; probing
- R3-1 CONFIRMED by probe: approved+recouped only (deposited level): recovered -4000, firstOn 2026-06-09 (recoupment); with deposit 2026-08-01 firstOn still 2026-06-09
- R3-2 candidate: reopened-by-partial-recoupment line counted full variance actionable (3000) beside recovered 1200 + approved 3000; pinned by reconciliation-routes.db.test.ts:421,425 (should-fix, not regression on home, extends to statement/digest)
- R3-3 nit: stale-cause doc comments omit MAPPING_NOT_IN_FORCE / NOT_SIGNED_OFF (dashboard/queries.ts:52, actionable-now.ts:56)
- checked sound r3: uploads gate move (pure refactor, re-export keeps importers), quarter() key guard, HOME_CASES numeric->parseCents, Cases CASES() paging + header same predicate, statement/PDF words (ADR 0082 covers pre-change statements), line_status writers never leave a case line null/below actionable, synth HOM module 20 no ISA13 clash with #42 (6c28d6a2, mb bce57f16), frozen paths empty, no migration
- FINAL r3: R3-1 should-fix statements.ts:71; R3-2 should-fix reconciliation-routes.db.test.ts:421; R3-3 nit. freeze: none. Returning.
