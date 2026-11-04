# Review: payment-engine, PR #118 (co-001/pricing-run-cutoff), at 82bafc0a

Verdict: no B, no S. Five N, all confirmed real (nits), none refuted.

| ID | Finding | Disposition (fix round) |
| --- | --- | --- |
| N1 | The cut-off is a transaction start; visibility is commit order, so a load open at creation can be priced by a re-run or impact but not the original. Predates the PR. | Comments corrected (bf33d5b9: lines.ts known limit, create.ts no longer claims more). Fix itself recorded as a follow-up (commit-ordered stamp or a lock loads share with run creation). |
| N2 | rerunReasons returns [] when the run is not found or not visible. | Fixed red then green: 488a07f3 (test), 93998d27 (throws RerunRefusedError not_found). |
| N3 | PracticeLocation.updatedAt is a millisecond Date with no consumer. | Removed (61480939). |
| N4 | No golden line or property test; correct, no amount changes. | Said in the PR description. |
| N5 | CI not all green at review time. | Rechecked after the fix-round push (see fix-round summary). |
