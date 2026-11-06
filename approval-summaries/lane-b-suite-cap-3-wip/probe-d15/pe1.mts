import { partialShare } from '/tmp/claude-0/-home-user-PhysicalTherapy/6c15628c-0d1e-52dc-840b-36ff1c157316/scratchpad/cap3-rev/packages/ledger/src/allocation.ts';
const c = (n: number) => BigInt(n) as never;
// share 500 cents of a 1,000-cent check; two partial check-level postings of 300 cents each; then 100 and 200.
for (const [s, T, a, b] of [[5, 10, 3, 3], [500, 1000, 300, 300], [7, 30, 10, 20], [1, 3, 1, 1]]) {
  const ab = [partialShare(c(s), c(0), c(a), c(T)), partialShare(c(s), c(a), c(b), c(T))];
  const ba = [partialShare(c(s), c(b), c(a), c(T)), partialShare(c(s), c(0), c(b), c(T))];
  console.log(JSON.stringify({ share: s, check: T, a, b, aFirst: ab.map(String), bFirst_as_a_b: ba.map(String) }));
}
