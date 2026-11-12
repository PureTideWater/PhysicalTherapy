import fs from 'node:fs';
const B = 420_000_000;
const src = fs.readFileSync('/home/user/PhysicalTherapy/packages/redact/src/redact.ts', 'utf8').replace(/export const CHECK_WORK_BUDGET = [\d_]+;/, 'export const CHECK_WORK_BUDGET = 1e18;').replace('    checkWorkSpent = before;\n    viewsOfCheck = null;', '    (globalThis as any).__spent = checkWorkSpent; checkWorkSpent = before;\n    viewsOfCheck = null;');
if (!src.includes('__spent')) throw new Error('patch');
fs.writeFileSync(new URL('./x/redact.ts', import.meta.url), src);
const { redactLetterForScreen, holdsIdentifier, checkWorkOf } = await import('./x/redact.ts');
const { rows } = await import('./rowsdef.mts');
const who = (names: string[]) => ({ pseudonym: 'p1', names, memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] }) as any;
const claims = (n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const run = (names: string[], text: string, nums: string[]) => { const a = cpu(); const r = redactLetterForScreen(text, who(names), claims(nums)); const first = checkWorkOf(r); (globalThis as any).__spent = first; holdsIdentifier(r.text, who(names), claims(nums), first); return { ms: cpu() - a, units: (globalThis as any).__spent as number }; };
const sized = (text: string, n: number) => (n <= text.length ? text.slice(0, n) : text.repeat(Math.ceil(n / text.length)).slice(0, n));
const out: string[] = [];
for (const [name, names, text, nums] of rows) {
  if (name.startsWith('ct2') && name !== 'ct2plain') continue;
  let n = text.length; let got = run(names, text, nums);
  for (let i = 0; i < 4; i++) { n = Math.floor(n * Math.min(4, (0.985 * B) / got.units)); got = run(names, sized(text, n), nums); if (got.units <= B && got.units > 0.95 * B) break; }
  if (got.units > B) { out.push(`${name} not fitted`); continue; }
  const again = run(names, sized(text, n), nums);
  out.push(`${String(Math.round(Math.min(got.ms, again.ms))).padStart(5)} ms ${name.padEnd(13)} ${String(n).padStart(7)} chars ${(got.units / 1e6).toFixed(0)} Mu`);
}
// CT-2's shape sized to the budget: k initials beside a name and a look-alike
for (const [name, mk] of [['ct2@budget', (k: number) => 'Vantree' + ' J'.repeat(k) + ' х'], ['ct2joiner@budget', (k: number) => 'Van∙tree Vantree' + ' J'.repeat(k) + ' х']] as const) {
  let lo = 1000, hi = 50000; while (hi - lo > 200) { const mid = (lo + hi) >> 1; if (run(['JANE Q VANTREE'], mk(mid), ['SYN555001']).units <= B) lo = mid; else hi = mid; }
  const g = [1, 2].map(() => run(['JANE Q VANTREE'], mk(lo), ['SYN555001'])); out.push(`${String(Math.round(Math.min(...g.map((x) => x.ms)))).padStart(5)} ms ${name.padEnd(13)} ${String(mk(lo).length).padStart(7)} chars ${(g[0].units / 1e6).toFixed(0)} Mu`);
}
console.log(out.sort().reverse().join('\n'));
