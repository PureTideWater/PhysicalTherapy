// Review 2 (time and cost) harness. Synthetic data only. Loads redact.ts of the tree at REPO, with the check's count
// exposed and (HEAD only) placesOf wrapped to time it. Writes the patched copy under /home/user/rv2/x, never the tree.
import fs from 'node:fs';
const REPO = process.env.REPO ?? '/home/user/item39';
export const tag = REPO.endsWith('item39') ? 'head' : 'base';
const CALL = '  return holdsIdentifierCounted(text, patient, claims, spent);\n';
let src = fs.readFileSync(`${REPO}/packages/redact/src/redact.ts`, 'utf8');
if (src.split(CALL).length !== 2) throw new Error('harness patch: holdsIdentifier body not found once');
src = src
  .replace(CALL, '  const counted = { spent: 0 };\n  try {\n    return holdsIdentifierCounted(text, patient, claims, spent, counted);\n  } finally {\n    (globalThis as any).__spent = counted.spent;\n  }\n')
  .replace("from './confusables'", `from '${REPO}/packages/redact/src/confusables.ts'`);
const PO = 'function placesOf(text: string, words: readonly string[]): Map<string, number[]> {';
if (src.includes(PO) && process.env.NOINSTR !== '1') {
  src = src.replace(PO, PO.replace('placesOf(', 'placesOf0(')) + `
function placesOf(text: string, words: readonly string[]): Map<string, number[]> {
  const t = process.hrtime.bigint();
  const r = placesOf0(text, words);
  const g = ((globalThis as any).__po ??= { ns: 0n, calls: 0, places: 0 });
  g.ns += process.hrtime.bigint() - t;
  g.calls += 1;
  for (const v of r.values()) g.places += v.length;
  return r;
}
`;
}
fs.mkdirSync('/home/user/rv2/x', { recursive: true });
const file = `/home/user/rv2/x/redact-${tag}${process.env.NOINSTR === '1' ? '-plain' : ''}.ts`;
if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== src) fs.writeFileSync(file, src);
export const H = await import(file);
const T = await import(`${REPO}/packages/model-gateway/src/test-support/time-budget.ts`);
export const calibrationMs = T.calibrationMs as () => number;
export const REFERENCE_CALIBRATION_MS = T.REFERENCE_CALIBRATION_MS as number;
export const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
export const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
export const one = (n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
/** One letter check as the reader runs it: redaction, then the check over what it sends, on one counter. */
export function once(text: string, p: any, c: any) {
  (globalThis as any).__spent = undefined;
  const a = cpu();
  const r = H.redactLetterForScreen(text, p, c);
  const spent = H.checkWorkOf(r);
  const m = cpu();
  const out = spent > H.CHECK_WORK_BUDGET ? 'REFUSED' : H.holdsIdentifier(r.text, p, c, spent) ? 'HELD' : 'sent';
  const z = cpu();
  return { ms: z - a, redact: m - a, out, text: r.text as string, units: ((globalThis as any).__spent ?? spent) as number, redactUnits: spent as number };
}
