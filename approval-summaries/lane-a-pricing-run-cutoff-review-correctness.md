# Review: correctness with a skeptic, PR #118 (co-001/pricing-run-cutoff), at 82bafc0a

Verdict: no B, no S. Three N, all confirmed real (nits), none refuted.

| ID | Finding | Disposition (fix round) |
| --- | --- | --- |
| N1 | Creation and the job can still see different line sets when a load commits after creation (created_at is a transaction start). Predates the PR. | Same as payment-engine N1: the known limit is recorded in lines.ts and create.ts (bf33d5b9); the fix is a follow-up item. |
| N2 | runsPricedElsewhere joins practice_site by practice_id and relies on one site per practice. | No change; flagged for the multi-site PR (dated locations replace this comparison). |
| N3 | console.ts:295/368 and the access-log cursor (settings.ts:837) are the same class. | console.ts fixed red then green: b51a2614 (test), 022bd261 (status_since compared in SQL). Access log left to item #49 (ADR 0070 Part 3). |
