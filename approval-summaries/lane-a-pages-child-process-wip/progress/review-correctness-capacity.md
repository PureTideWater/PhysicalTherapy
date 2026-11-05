# Review (correctness and capacity) progress
- Clone /home/user/rv-pcp-correctness-capacity at c369bc77... (started)
- Install ok; baseline pages.test.ts + infra heap.test.ts 28/28 pass (logs rv-cc/baseline.log)
- Mutation batch running (22 mutations; rv-cc/mutations.txt)
- Read pages.ts, page-reader.ts, tests, heap.ts, infra guard, ADR diffs, design.
- Suspected (to prove): after a done/refused frame the deadline and memory poll stop; a child that then hangs or grows is unbounded and holds the one reader slot (probe after-done.ts).
- Suspected (to prove): UTF-8 framing turns a lone surrogate (xlsx &#xD800;) into U+FFFD where the thread's structured clone kept it (probe surrogate.ts).
- Capacity probe peak.ts written (parent under 560 with heap filled, child peak RSS).
