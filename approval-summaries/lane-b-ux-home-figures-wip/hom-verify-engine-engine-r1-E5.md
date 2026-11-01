# Verify engine-r1-E5 (PR #93 body 10k timing ambiguous)
- pr93-body.md:28 and live GitHub body: "On a 10,000-line month: 863.2 ms against 361.7 ms, and the pricing-check calls fall from 3,780 to 1,740."
- Source (progress/hom-build-core.md:22, builder journal wf_21e8bd67-64f): base three statements 410.7+389.1+63.5 = 863.2 ms; new HOME_CASES 361.7 ms; gate passes.
- So the sentence's order is base-then-PR, the same as the table columns; read in column order the new statement is 2.4x FASTER (0.42x), consistent with the 100k row (0.42x). The finding's reading inverts this; no regression exists.
- Verdict: not real as stated (failure rests on a misreading). Optional polish: label the numbers ("base 863.2 ms (410.7 + 389.1 + 63.5), HOME_CASES 361.7 ms (0.42x)") or add a table row.
