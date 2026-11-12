// Where the time of one fitted letter goes: self time by function (lines are redact.ts's own; the scratch copy changes none).
import fs from 'node:fs';
import inspector from 'node:inspector';
import { claimsOf, fit, once, rep, who } from './lib.mts';
const [shape = 'yensemi', k = '1'] = process.argv.slice(2);
const K = Number(k);
const C = K === 1 ? claimsOf() : (Array.from({ length: K }, (_, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [`SYN${String(556000 + i)}`] })) as any);
const gens: Record<string, (n: number) => string> = { prose: rep('The claim was reviewed and paid in full by the plan. '), yen: rep('㏾,'), yensemi: rep('㏾;'), asemi: rep('a;', 'Zeph∙yra Zephyra '), digitLF: rep('5\n') };
const gen = gens[shape] as (n: number) => string; const P = who();
const f = fit(gen, P, C); if (f === null) throw new Error('fit');
const text = gen(f.n); once(text, P, C);
const session = new inspector.Session(); session.connect();
const post = (m: string, p?: object) => new Promise<any>((res, rej) => session.post(m as any, p as any, (e: any, r: any) => (e ? rej(e) : res(r))));
await post('Profiler.enable'); await post('Profiler.setSamplingInterval', { interval: 500 }); await post('Profiler.start');
for (let i = 0; i < 3; i++) once(text, P, C);
const { profile } = await post('Profiler.stop');
const self = new Map<number, number>(); const dt = profile.timeDeltas as number[]; (profile.samples as number[]).forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (dt[i] ?? 0)));
const by = new Map<string, number>(); let total = 0;
for (const node of profile.nodes) { const t = self.get(node.id) ?? 0; total += t; const cf = node.callFrame; const key = `${cf.functionName || '(anonymous)'}:${cf.lineNumber + 1}${cf.url.includes('redact') ? '' : ' [' + (cf.url.split('/').pop() || 'native') + ']'}`; by.set(key, (by.get(key) ?? 0) + t); }
const lines = [`profile ${shape}, ${K} claim(s), ${text.length} ch, ${(f.got.units / 1e6).toFixed(0)} Mu, 3 runs, ${(total / 1000).toFixed(0)} ms sampled`, ...[...by].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([key, t]) => `  ${((100 * t) / total).toFixed(1).padStart(5)} %  ${key}`)];
console.log(lines.join('\n')); fs.appendFileSync('/home/user/review-time/out/prof.txt', lines.join('\n') + '\n');
