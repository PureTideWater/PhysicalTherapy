// Item 39 design harness. Synthetic data only. Loads redact.ts of the base (4d40557f, the checkout at REPO) or a variant
// of it patched by variants.mts into ./x, and times the letter check's two entries as W25's harness did.
import fs from 'node:fs';
import { patched } from './variants.mts';
const REPO = process.env.REPO ?? '/home/user/PhysicalTherapy';
const variant = process.env.VARIANT ?? 'base';
const HOLDS_END = '    return true;\n  } finally {\n    checkWorkSpent = before;\n  }\n}\n';
const base = fs.readFileSync(`${REPO}/packages/redact/src/redact.ts`, 'utf8');
if (base.split(HOLDS_END).length !== 2) throw new Error('harness patch: holdsIdentifier end not found once');
// Harness only: the whole check's count (redaction and check on one counter) left where the harness reads it.
const src = patched(base, variant)
  .replace(HOLDS_END, '    return true;\n  } finally {\n    (globalThis as any).__spent = checkWorkSpent;\n    checkWorkSpent = before;\n  }\n}\n')
  .replace("from './confusables'", `from '${REPO}/packages/redact/src/confusables.ts'`);
const file = new URL(`./x/redact-${variant}.ts`, import.meta.url);
if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== src) fs.writeFileSync(file, src);
const H = await import(file.href);
export const { redactLetterForScreen, holdsIdentifier, checkWorkOf, CHECK_WORK_BUDGET } = H;
export const stats = (H.item39Stats ?? null) as Record<string, number> | null;
const { calibrationMs } = await import(`${REPO}/packages/model-gateway/src/test-support/time-budget.ts`);
export { calibrationMs };
export const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const fill = '0918273645QWRTYPSDFGHJKLZXCVBNM';
/** W25's identifiers: SYN + six digits (+ fill) for nine characters or more; base 36 padded below that. */
export const numbers = (count: number, len: number) => Array.from({ length: count }, (_, i) => (len >= 9 ? `SYN${String(556000 + i)}${fill.slice(0, len - 9)}` : i.toString(36).toUpperCase().padStart(len, '0')));
export const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
export const one = (n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
export const across = (n: string[]) => n.map((x, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [x] })) as any;
export const TINY = 'The claim was paid.';
export const PROSE = 'The claim was reviewed and paid in full by the plan. '.repeat(110);
/** One letter check as the reader runs it: redaction, then the check over what it sends, on one counter. */
export function once(text: string, p: any, c: any) {
  const a = cpu();
  const r = redactLetterForScreen(text, p, c);
  const spent = checkWorkOf(r);
  const m = cpu();
  const held = spent > CHECK_WORK_BUDGET ? 'REFUSED' : holdsIdentifier(r.text, p, c, spent) ? 'HELD' : 'sent';
  const z = cpu();
  return { ms: z - a, redact: m - a, check: z - m, out: held, text: r.text as string, units: (globalThis as any).__spent as number, redactUnits: spent as number };
}
