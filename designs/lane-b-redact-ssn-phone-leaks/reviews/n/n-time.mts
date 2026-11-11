// node n-time.mts: head / before time of redactLetterForScreen on letters of repeated lines. Synthetic only.
import { T, patient, claimsOf } from './nlib.mts';
const kinds: Record<string, { line: string; P: any; C: any }> = {
  'm1-lines (look-alike own, number, short claim inside)': { line: 'Member ID: ZZ1980O314\n555-0123\n', P: patient(['ZZ19800314']), C: claimsOf([['SYNCLAIM0001'], ['0123']]) },
  'plain lines (own id, claim, phone with short claim inside)': { line: 'ID ZZ19800314 claim SYNCLAIM0001 tel 202-555-0123 paid 150.00\n', P: patient(['ZZ19800314']), C: claimsOf([['SYNCLAIM0001'], ['0123']]) },
};
const sizes = (process.argv[2] ?? '5000,20000,50000,200000').split(',').map(Number);
for (const [name, k] of Object.entries(kinds)) for (const size of sizes) {
  const t = k.line.repeat(Math.ceil(size / k.line.length)); const ms: Record<string, number[]> = { before: [], head: [] }; let same = true; let err = '';
  const reps = Number(process.argv[3] ?? (size <= 20000 ? 3 : 2));
  for (let r = 0; r < reps; r += 1) for (const tree of r % 2 === 0 ? ['before', 'head'] : ['head', 'before']) {
    const s = performance.now(); let out: any; try { out = T[tree].redactLetterForScreen(t, k.P, k.C); } catch (e) { err = `${tree} threw ${String(e).slice(0, 120)}`; }
    (ms[tree] as number[]).push(performance.now() - s); if (out !== undefined) (ms as any)[`${tree}Out`] = `${out.text.length}/${out.candidates.length}`;
  }
  const min = (l: number[]) => Math.min(...l);
  console.log(`${name} | ${t.length} bytes | before min ${min(ms.before as number[]).toFixed(0)} ms, head min ${min(ms.head as number[]).toFixed(0)} ms, ratio ${(min(ms.head as number[]) / min(ms.before as number[])).toFixed(2)} | text length/candidates before ${(ms as any).beforeOut} head ${(ms as any).headOut} ${err}`);
}
