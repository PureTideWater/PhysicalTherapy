// node redos4.mts: the two letters of I1-1 on base, before and head (each tree's first use of its patterns), outcome and time.
import { load, patient, claims } from './lib.mts';
const A = `Member ID: ${'_'.repeat(52)}\nPlease complete and return. Reference 2026-0115-123-4567`;
const T = `Date        Description        Payment\n${'─'.repeat(50)}\nLine 1: 20260112345.01  150.00`;
for (const tree of ['base', 'before', 'head']) {
  const R = await load(tree);
  for (const [name, text] of [['A', A], ['T', T]] as const) {
    let t = performance.now();
    const s = R.redactLetterForScreen(text, patient, claims);
    const t1 = performance.now() - t;
    t = performance.now();
    const refused = R.holdsIdentifier(s.text, patient, claims);
    console.log(`${tree.padEnd(6)} ${name}: ${refused ? 'REFUSED' : s.text === text ? 'same' : 'redacted'}; redactLetterForScreen ${t1.toFixed(0)} ms, holdsIdentifier ${(performance.now() - t).toFixed(0)} ms`);
  }
}
console.log(JSON.stringify(A));
console.log(JSON.stringify(T));
