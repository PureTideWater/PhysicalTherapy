# R1 verify (firstOn counts reversed entries) - DONE
Clone: vR1 at 87691be4. Read statements.ts:66-73, ledger totals.ts:110-137 (recovered ids pushed by countedStage, a reversal counts toward its target's stage), stages.ts correctedEntry/countedStage, recovered-periods.test.ts:64-68 (oracle same rule) and :95-102 (expects firstOn 2026-09-30 with recovered 0), queries.ts:164 -> headline.tsx:46-47 renders "to date, since <date>".
reverseMatch (manual.ts:177) writes reversals of a wrongly matched deposit; the original keeps its early effectiveOn -> firstOn earliest.
Verdict: REAL, should-fix. Fix as proposed is sound (same reversedIds idiom as manual.ts); add unit case + oracle change + fully-reversed -> null.
