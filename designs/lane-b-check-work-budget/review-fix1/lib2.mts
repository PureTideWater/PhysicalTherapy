// Review harness (scope: TIME). Synthetic data only. Builds a scratch copy of the reader with the budget set from
// BUDGET (default lifted, 1e18) and the whole check's counter exported after holdsIdentifier.
import fs from 'node:fs';
const REPO = '/home/user/PhysicalTherapy'; const TRIAL = process.env.TRIAL ?? '';
export const B = 420_000_000;
const budget = process.env.BUDGET ?? '1e18';
let src = fs.readFileSync(`${REPO}/packages/redact/src/redact.ts`, 'utf8')
  .replace(/export const CHECK_WORK_BUDGET = [\d_]+;/, `export const CHECK_WORK_BUDGET = ${budget};`)
  .replace('    checkWorkSpent = before;\n    viewsOfCheck = null;', '    (globalThis as any).__spent = checkWorkSpent; checkWorkSpent = before;\n    viewsOfCheck = null;');
if (TRIAL) { const before = src; src = src.replace('function ownMatchesIn(normal: string, subject: Subject): Found[] {\n  work(WORK.formCharacter * identifiersOf(subject) * normal.length);', 'function ownMatchesIn(normal: string, subject: Subject): Found[] {\n  work(WORK.formCharacter * Number(TRIALW) * formsOf(subject).length * normal.length);'.replace('TRIALW', TRIAL)).replace('  work(WORK.formCharacter * identifiersOf(subject) * normal.length);\n  const forms = confusableForms(subject);', '  work(WORK.formCharacter * Number(TRIALW) * formsOf(subject).length * normal.length);\n  const forms = confusableForms(subject);'.replace('TRIALW', TRIAL)); if (src === before || src.split('formsOf(subject).length').length !== 3) throw new Error('trial patch'); }
if (!src.includes('__spent') || !src.includes(`CHECK_WORK_BUDGET = ${budget};`)) throw new Error('patch');
const file = new URL(`./x/redact-lifted${TRIAL ? '-trial' + TRIAL : ''}.ts`, import.meta.url);
if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== src) fs.writeFileSync(file, src);
const mod = await import(file.href);
export const { redactLetterForScreen, holdsIdentifier, checkWorkOf } = mod;
const G = globalThis as any;
export const who = (names: string[] = ['JANE Q ZEPHYRA'], memberIds: string[] = ['ZZ1234567']) => ({ pseudonym: 'p1', names, memberIds, datesOfBirth: ['1961-03-03'] }) as any;
export const claimsOf = (n: string[] = ['SYN555001']) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
export const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
export const tcpu = () => { const f = (process as any).threadCpuUsage; if (!f) return NaN; const u = f.call(process); return (u.user + u.system) / 1000; };
export interface Got { ms: number; tms: number; msRedact: number; units: number; first: number; held: boolean; outLen: number }
export function once(text: string, p: any, c: any): Got {
  const a = cpu(); const ta = tcpu();
  const r = redactLetterForScreen(text, p, c); const first = checkWorkOf(r);
  const m = cpu();
  G.__spent = first; const held = holdsIdentifier(r.text, p, c, first);
  const z = cpu(); const tz = tcpu();
  return { ms: z - a, tms: tz - ta, msRedact: m - a, units: G.__spent, first, held, outLen: r.text.length };
}
export function timed(text: string, p: any, c: any, reps = 3): Got {
  let best: Got | null = null;
  for (let i = 0; i < reps; i++) { const g = once(text, p, c); if (best === null || g.ms < best.ms) best = g; }
  return best as Got;
}
export const rep = (u: string, pre = '') => (n: number) => (pre + u.repeat(Math.max(0, Math.ceil((n - pre.length) / u.length)))).slice(0, Math.max(n, pre.length));
/** Sizes gen(n) so the whole check's count is in (0.96 B, B]; null if it cannot be. */
export function fit(gen: (n: number) => string, p: any, c: any, start = 20_000): { n: number; got: Got } | null {
  let n = start; let got = once(gen(n), p, c); let pn = 0; let pu = 0; let power = 1;
  for (let i = 0; i < 10; i++) {
    if (got.units <= B && got.units > 0.96 * B) return { n, got };
    if (pn > 0 && pn !== n && pu !== got.units) power = Math.min(2.2, Math.max(0.8, Math.log(got.units / pu) / Math.log(n / pn)));
    pn = n; pu = got.units;
    const f = Math.pow((0.985 * B) / got.units, 1 / power);
    n = Math.min(3_000_000, Math.max(10, Math.floor(n * Math.min(5, Math.max(0.2, f)))));
    if (n === pn) break;
    got = once(gen(n), p, c);
  }
  return got.units <= B && got.units > 0.5 * B ? { n, got } : null;
}
let calibrationMs: (() => number) | null = null;
export async function calib(): Promise<number> {
  if (calibrationMs === null) calibrationMs = (await import(`${REPO}/packages/model-gateway/src/test-support/time-budget.ts`)).calibrationMs;
  return (calibrationMs as any)();
}
export function line(name: string, chars: number, g: Got, cal: number): string {
  const ref = (144 / cal) * g.ms;
  return `${name.padEnd(26)} ${String(chars).padStart(8)} ch ${(g.units / 1e6).toFixed(1).padStart(7)} Mu  cpu ${g.ms.toFixed(0).padStart(6)} ms (thread ${g.tms.toFixed(0)}, redact ${g.msRedact.toFixed(0)})  ref ${ref.toFixed(0).padStart(6)} ms  ${((ref / g.units) * 1e6).toFixed(2).padStart(6)} ns/u@ref  out ${g.outLen} ${g.held ? 'HELD' : 'sent'}${ref > 3000 && g.units <= B ? '  <<< OVER 3 s' : ''}`;
}
export async function fitAndTime(name: string, gen: (n: number) => string, p: any, c: any, log: (s: string) => void): Promise<void> {
  const f = fit(gen, p, c);
  if (f === null) { log(`${name.padEnd(26)} not fitted`); return; }
  const text = gen(f.n);
  const c1 = await calib();
  const g = timed(text, p, c, 3);
  const c2 = await calib();
  log(line(name, text.length, g, Math.min(c1, c2)) + `  [cal ${c1.toFixed(0)}/${c2.toFixed(0)}]`);
}
