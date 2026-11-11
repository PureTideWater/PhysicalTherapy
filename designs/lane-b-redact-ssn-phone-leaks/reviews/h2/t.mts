// node t.mts [cap seconds] [first index]: times every letter of tests.mts on before and head (and base for the first 13), one process each.
import { spawnSync } from 'node:child_process';
import { TESTS } from './tests.mts';
const T0 = Date.now();
const CAP = Number(process.argv[2] ?? 190) * 1000;
const from = Number(process.argv[3] ?? 0);
for (let i = from; i < TESTS.length; i += 1) {
  const test = TESTS[i] as [string, string, any?];
  if (Date.now() - T0 > CAP) { console.log(`${i} ${test[0]}: not run (time cap)`); continue; }
  const row: string[] = []; const ms: Record<string, number> = {};
  for (const tree of i < 13 ? ['before', 'head', 'base'] : ['before', 'head']) {
    const p = spawnSync(process.execPath, ['/home/user/review-h2/t1.mts', String(i), tree], { timeout: i === 2 ? 90000 : 45000, encoding: 'utf8' });
    const o = (p.stdout ?? '').trim();
    if (p.status !== 0 || o === '') { row.push(`${tree} ${p.signal ? 'TIMEOUT' : `ERR ${(p.stderr ?? '').slice(-200)}`}`); continue; }
    const [m, oc] = o.split(' ');
    ms[tree] = Number(m);
    row.push(`${tree} ${m}ms ${oc}`);
  }
  const ratio = ms.head !== undefined && ms.before !== undefined ? (ms.head / Math.max(1, ms.before)).toFixed(2) : 'n/a';
  console.log(`${i} ${test[0]} [${test[1].length} chars]: ${row.join(' | ')} | head/before ${ratio}`);
}
