import { readFileSync, readdirSync } from 'node:fs';
const [, , a, b, cls] = process.argv;
const load = (dir) => {
  const m = new Map();
  for (const f of readdirSync(`${dir}/hits`)) {
    if (!f.startsWith(cls + '.')) continue;
    for (const line of readFileSync(`${dir}/hits/${f}`, 'utf8').split('\n')) {
      if (!line) continue;
      const row = JSON.parse(line);
      m.set(row.i, row);
    }
  }
  return m;
};
const A = load(a), B = load(b);
const lost = [...A.keys()].filter((i) => !B.has(i));
const gained = [...B.keys()].filter((i) => !A.has(i));
console.log(cls, 'in', a, A.size, 'in', b, B.size, 'only in first', lost.length, 'only in second', gained.length);
const bySource = new Map();
for (const i of lost) { const s = A.get(i).s; bySource.set(s, (bySource.get(s) ?? 0) + 1); }
console.log([...bySource].sort((x, y) => y[1] - x[1]).slice(0, 12).map(([s, n]) => `${s} ${n}`).join('\n'));
const show = Number(process.argv[5] ?? 8);
const step = Math.max(1, Math.floor(lost.length / show));
for (let k = 0; k < lost.length && k / step < show; k += step) {
  const r = A.get(lost[k]);
  console.log(JSON.stringify({ s: r.s, t: String(r.t).slice(0, 220), b: String(r.b).slice(0, 220) }));
}
