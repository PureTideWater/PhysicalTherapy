// How often the per-form passes run in one whole check, and the counter's arithmetic on a text that holds nothing.
import fs from 'node:fs';
const REPO = '/home/user/PhysicalTherapy';
const G = globalThis as any; G.__calls = {};
let src = fs.readFileSync(`${REPO}/packages/redact/src/redact.ts`, 'utf8').replace(/export const CHECK_WORK_BUDGET = [\d_]+;/, 'export const CHECK_WORK_BUDGET = 1e18;');
let hits = 0;
src = src.replace(/(\nfunction (ownMatchesIn|confusedMatchesIn|confusedGluedIn|datesIn)\(.*\{\n)/g, (_m, head: string, name: string) => { hits += 1; return `${head}  { const c = (globalThis as any).__calls; c.${name} = (c.${name} ?? 0) + 1; }\n`; });
fs.writeFileSync(new URL('./x/redact-calls.ts', import.meta.url), src);
const { redactLetterForScreen, holdsIdentifier, checkWorkOf } = await import('./x/redact-calls.ts');
const real = await import(`${REPO}/packages/redact/src/redact.ts`);
const P = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const claims = (k: number) => Array.from({ length: k }, (_, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [k === 1 ? 'SYN555001' : `SYN${String(556000 + i)}`] })) as any;
const log = (s: string) => { console.log(s); fs.appendFileSync('/home/user/review-time/out/calls.txt', s + '\n'); };
log(`instrumented ${hits} functions`);
for (const [name, text] of [['asemi 20k', 'Zeph∙yra Zephyra ' + 'a;'.repeat(10_000)], ['yen 20k', '㏾,'.repeat(10_000)], ['prose 20k', 'The claim was reviewed and paid in full by the plan. '.repeat(400)], ['digitLF 20k', '5\n'.repeat(10_000)]] as const) {
  for (const k of [1, 50]) { G.__calls = {}; const c = claims(k); const r = redactLetterForScreen(text, P, c); const first = { ...G.__calls }; holdsIdentifier(r.text, P, c, checkWorkOf(r)); log(`${name}, ${k} claim(s): calls in the redaction ${JSON.stringify(first)}; in the whole check ${JSON.stringify(G.__calls)}`); }
}
const B = real.CHECK_WORK_BUDGET as number; const small = 'The plan paid the amount in full.'; const C1 = claims(1);
log(`clean text of ${small.length} characters: redaction spent ${real.checkWorkOf(real.redactLetterForScreen(small, P, C1))}`);
let need = 0; { let lo = 0; let hi = B; while (lo < hi) { const mid = Math.floor((lo + hi + 1) / 2); if (real.holdsIdentifier(small, P, C1, mid) === false) lo = mid; else hi = mid - 1; } need = B - lo; }
log(`the check of that text spends ${need} units: read at spent = B - ${need} (${String(real.holdsIdentifier(small, P, C1, B - need))} = holds), refused at B - ${need} + 1 (${String(real.holdsIdentifier(small, P, C1, B - need + 1))})`);
for (const spent of [0, -0, 0.5, B - need - 0.5, B - need + 0.5, B, B + 1, -1, -1e-9, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER, 5e-324, '5', '0', '', ' ', 0n, null, undefined, true, false, [], [7], {}] as any[]) {
  let said: string;
  try { said = real.holdsIdentifier(small, P, C1, spent) ? 'REFUSED (holds)' : 'read (holds nothing)'; } catch (e) { said = `THROWS ${(e as Error).constructor.name}: ${(e as Error).message}`; }
  const shown = typeof spent === 'bigint' ? '0n' : typeof spent === 'string' ? `'${spent}'` : typeof spent === 'number' ? String(spent) : spent === undefined ? 'undefined (default 0)' : JSON.stringify(spent);
  log(`  spent = ${shown.padEnd(22)} -> ${said}`);
}
log(`after those calls: clean text read ${String(real.holdsIdentifier(small, P, C1, 0) === false)}, redaction spent ${real.checkWorkOf(real.redactLetterForScreen(small, P, C1))} (counter state not left behind)`);
