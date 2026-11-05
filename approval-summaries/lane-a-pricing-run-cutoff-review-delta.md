# Review: delta, PR #118 (co-001/pricing-run-cutoff), 82bafc0a..bf33d5b9

The fix round's six commits, reviewed with skeptics and mutation runs (prc2/mut). Verdict: no B, no S. Three N, all
confirmed real (nits), none refuted. packages/pricing/src untouched; base 35422a92 contained.

| ID | Finding | Disposition (finish round) |
| --- | --- | --- |
| N1 | The new console test did not pin the `current` query half of 022bd261: reverting only that query to a millisecond JS Date (mutation m2) still passed. | Fixed in 9bb14cc6: the earlier same-millisecond suspension now carries a note and a suspended-to-suspended change of reason; the test asserts neither shows. Red under m2 (note and reasonChangedBy leak), green on the fix. |
| N2 | status_since was read again in each statement at READ COMMITTED while `since` came from the first read. Theoretical. | Fixed in 2c9750e2: the page reads status_since once as text, to the microsecond, and passes that one value to every change-row statement. console-routes.db 36/36. |
| N3 | create.ts:122 said the check and the job "send" the cut-off. | Fixed in df632136: "use the same cut-off". |

Mutations: m1 (all of console.ts reverted) fails the test; m2 (query only) passed before N1's fix and fails after;
m3 (rerunReasons reverted) fails its test.
