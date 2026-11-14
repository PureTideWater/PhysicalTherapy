// Repeats one chain case in one process: node rep.mts L n sep reps. REPO picks the tree. Synthetic data only.
import { once, who, one, tag, cpu } from './h.mts';
const [L, n, sep, reps] = [Number(process.argv[2]), Number(process.argv[3]), process.argv[4] ?? '=', Number(process.argv[5] ?? 6)];
const chain = Array.from({ length: L }, (_, k) => 'A'.repeat(k + 1)).slice(1);
const text = `A${sep}`.repeat(n);
const rows: string[] = [];
for (let i = 0; i < reps; i += 1) {
  (globalThis as any).__po = { ns: 0n, calls: 0, places: 0 };
  const r = once(text, who, one(chain));
  const po = (globalThis as any).__po;
  rows.push(`${Math.round(r.ms)}ms/${r.out}/${Math.round(r.units / 1e6)}M/po${Math.round(Number(po.ns) / 1e6)}`);
  if (cpu() > 150000) break;
}
console.log(tag, `L=${L} n=${n} sep=${sep}`, rows.join('  '));
