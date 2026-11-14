// Review harness. Synthetic data only. Loads both trees' redact.ts (copied with the one relative import made absolute).
import fs from 'node:fs';
async function load(repo: string, tag: string) {
  const src = fs.readFileSync(`${repo}/packages/redact/src/redact.ts`, 'utf8').replace("from './confusables'", `from '${repo}/packages/redact/src/confusables.ts'`);
  const file = new URL(`./x/redact-${tag}.ts`, import.meta.url);
  if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== src) fs.writeFileSync(file, src);
  return await import(file.href);
}
export const B = await load('/home/user/PhysicalTherapy', 'base');
export const H = await load('/home/user/item39', 'head');
export const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['76543210'], datesOfBirth: ['1980-03-14'] } as any;
export const claims = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: ['ZZ99887'] }] as any;
export function once(M: any, text: string, p: any = who, c: any = claims) {
  try {
    const r = M.redactLetterForScreen(text, p, c);
    const spent = M.checkWorkOf(r);
    const out = spent > M.CHECK_WORK_BUDGET ? 'REFUSED' : M.holdsIdentifier(r.text, p, c, spent) ? 'HELD' : 'sent';
    return { out, text: r.text as string };
  } catch (e) { return { out: 'THROW:' + String((e as Error).message).slice(0, 80), text: '' }; }
}
export function letterPath(M: any, text: string, p: any = who, c: any = claims) {
  try { const r = M.redactLetter(text, p, c); return { out: M.holdsIdentifier(r.text, p, c) ? 'HELD' : 'sent', text: r.text as string }; }
  catch (e) { return { out: 'THROW:' + String((e as Error).message).slice(0, 80), text: '' }; }
}
export const esc = (s: string) => JSON.stringify(s).replace(/[\u0080-￿]/g, (ch) => '\\u' + ch.charCodeAt(0).toString(16).padStart(4, '0'));
export const short = (s: string) => { const e = esc(s); return e.length > 300 ? e.slice(0, 140) + ' ... ' + e.slice(-140) + ` (len ${s.length})` : e; };
export function diff(name: string, text: string, p: any = who, c: any = claims) {
  const b = once(B, text, p, c), h = once(H, text, p, c);
  const same = b.out === h.out && b.text === h.text;
  const worse = h.out === 'sent' && (b.out !== 'sent' || b.text !== h.text);
  return { name, same, worse, b, h };
}
