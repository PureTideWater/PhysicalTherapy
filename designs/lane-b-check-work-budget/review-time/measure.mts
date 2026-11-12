import fs from 'node:fs';
const src = fs.readFileSync('/home/user/PhysicalTherapy/packages/redact/src/redact.ts', 'utf8').replace(/export const CHECK_WORK_BUDGET = [\d_]+;/, 'export const CHECK_WORK_BUDGET = Number(process.env.BUDGET ?? 1e18);').replace('    checkWorkSpent = before;\n    viewsOfCheck = null;', '    (globalThis as any).__spent = checkWorkSpent; checkWorkSpent = before;\n    viewsOfCheck = null;');
if (!src.includes('__spent')) throw new Error('patch');
fs.writeFileSync(new URL('./x/redact.ts', import.meta.url), src);
const { redactLetterForScreen, holdsIdentifier, checkWorkOf } = await import('./x/redact.ts');
const { rows } = await import(process.argv[2] ?? './rowsdef.mts');
const who = (names: string[]) => ({ pseudonym: 'p1', names, memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] }) as any;
const claims = (n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const out: [string, number, number, number, boolean][] = [];
for (const [name, names, text, nums] of rows) {
  let best = Infinity; let held = false; let units = 0; let first = 0;
  for (let i = 0; i < 2; i++) {
    const a = cpu(); const r = redactLetterForScreen(text, who(names), claims(nums)); first = checkWorkOf(r); (globalThis as any).__spent = first; held = holdsIdentifier(r.text, who(names), claims(nums), first); best = Math.min(best, cpu() - a); units = (globalThis as any).__spent;
  }
  out.push([name, text.length, best, units, held]);
}
out.sort((a, b) => b[2] / b[3] - a[2] / a[3]);
for (const [name, len, ms, units, held] of out) console.log(name.padEnd(14), String(len).padStart(6), String(Math.round(ms)).padStart(6) + ' ms', held ? 'H' : '-', (units / 1e6).toFixed(0).padStart(7) + ' Mu', (ms / units * 1e6).toFixed(2).padStart(6) + ' ns/u');
