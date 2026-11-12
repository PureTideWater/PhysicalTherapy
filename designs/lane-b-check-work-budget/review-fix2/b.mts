// Warm-process time of the letter check at the real budget, one identifier set per fresh process. Synthetic data only.
// tsx b.mts <kind:count:len> <tiny|prose|near>   (BUDGET=420000000 in the environment)
import fs from 'node:fs';
import { B, calib, fit, line, once, rep, timed, who } from '/home/user/review-time/lib.mts';
const [spec = 'c:6600:9', mode = 'tiny'] = process.argv.slice(2);
const [kind, k, l] = spec.split(':'); const count = Number(k); const len = Number(l ?? 0);
const fill = '0918273645QWRTYPSDFGHJKLZXCVBNM';
const id = (i: number): string => len >= 9 ? `SYN${String(556000 + i)}${fill.slice(0, len - 9)}` : i.toString(36).toUpperCase().padStart(len, '0').slice(-len);
const digits = (i: number): string => String(10 ** (len - 1) + i * 7).slice(0, len);
const L = 'BCDFGHJKLMNPQRSTVWXZ';
const part = (i: number) => L[i % 20]! + L[Math.floor(i / 20) % 20]! + L[Math.floor(i / 400) % 20]! + (i >= 8000 ? L[Math.floor(i / 8000) % 20]! : '');
const one = (n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const across = (n: string[]) => n.map((x, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [x] })) as any;
const ids = Array.from({ length: count }, (_, i) => id(i));
let p: any = who(); let c: any = one(['SYN555001']); let items: string[] = ids;
if (kind === 'c') c = one(ids);
else if (kind === 'a') c = across(ids);
else if (kind === 'm') p = who(undefined, ids);
else if (kind === 'd') { items = Array.from({ length: count }, (_, i) => digits(i)); c = one(items); }
else if (kind === 'u') { items = Array.from({ length: count }, () => id(1)); c = one(items); }
else if (kind === 'e') { items = ['SYN555001']; c = one([...Array.from({ length: count }, () => ''), 'SYN555001']); }
else if (kind === 'n') { items = Array.from({ length: count }, (_, n) => Array.from({ length: len }, (_, w) => [0, 1, 2].map((q) => part((n * len + w) * 3 + q)).join('-')).join(' ')); p = who(items); }
else if (kind === 'w') { items = Array.from({ length: count }, (_, n) => Array.from({ length: len }, (_, w) => part(n * len + w)).join(' ')); p = who(items); }
else throw new Error('kind');
const chars = [...p.names, ...p.memberIds, ...c.flatMap((x: any) => x.claimNumbers)].reduce((s: number, x: string) => s + x.length, 0);
const log = (s: string) => { console.log(s); fs.appendFileSync('/home/user/review-fix2/out/time.txt', s + '\n'); };
const name = `${spec} ${mode} [${chars} id chars]`;
const c0 = await calib();
const seq = (n: number) => { let s = ''; for (let i = 0; s.length < n; i++) s += items[i % items.length]!.slice(0, -1) + ' '; return s.slice(0, n); };
let text = 'The claim was paid.';
const cold = once(text, p, c);
if (mode !== 'tiny') { const gen = mode === 'near' ? seq : rep('The claim was reviewed and paid in full by the plan. '); const f = fit(gen, p, c, 2000); if (f === null) { log(`${name} not fitted (first call: ${cold.units} units, ${cold.ms.toFixed(0)} ms, ${cold.held ? 'HELD' : 'sent'})`); process.exit(0); } text = gen(f.n); }
const c1 = await calib(); const g = timed(text, p, c, 3); const c2 = await calib();
const refFresh = (144 / c0) * g.ms;
log(line(name, text.length, g, Math.min(c1, c2)) + `  [cal ${c1.toFixed(0)}/${c2.toFixed(0)}; fresh cal ${c0.toFixed(0)} -> ref ${refFresh.toFixed(0)} ms; first call ${cold.ms.toFixed(0)} ms; read ${g.units <= B && g.first <= B}]`);
