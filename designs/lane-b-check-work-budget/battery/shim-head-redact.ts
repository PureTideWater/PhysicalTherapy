// The battery's "head": the head's reader, every call also run on the base (58fb29e5) and compared, letter for letter.
import fs from 'node:fs';
import * as H from '/home/user/headsrc/redact.ts';
import * as A from '/home/user/tree-base/packages/redact/src/redact.ts';
export * from '/home/user/headsrc/redact.ts';
const S = { script: process.argv.slice(1).join(' '), redactions: 0, checks: 0, textDiffers: 0, pastBudgetInRedaction: 0, baseRefusedHeadSent: 0, headRefusedBaseSent: 0, threwDiffers: 0, maxSpent: 0, maxLength: 0 };
const bad: unknown[] = [];
let last: { text: string; spent: number } | null = null;
const attempt = <T,>(f: () => T): { v?: T; e?: unknown } => { try { return { v: f() }; } catch (e) { return { e }; } };
export function redactLetterForScreen(t: string, P: any, C: any) {
  const h = attempt(() => H.redactLetterForScreen(t, P, C));
  const a = attempt(() => A.redactLetterForScreen(t, P, C));
  S.redactions += 1; S.maxLength = Math.max(S.maxLength, t.length);
  if (('e' in h) !== ('e' in a)) { S.threwDiffers += 1; bad.push({ k: 'threw', t: t.slice(0, 500) }); }
  if ('e' in h) throw h.e;
  const r = h.v!; const spent = H.checkWorkOf(r);
  if (spent > H.CHECK_WORK_BUDGET) S.pastBudgetInRedaction += 1;
  else { S.maxSpent = Math.max(S.maxSpent, spent); if (!('e' in a) && (a.v!.text !== r.text || a.v!.replaced !== r.replaced || JSON.stringify(a.v!.candidates) !== JSON.stringify(r.candidates))) { S.textDiffers += 1; bad.push({ k: 'text', t: t.slice(0, 500) }); } }
  last = { text: r.text, spent };
  return r;
}
export function holdsIdentifier(t: string, P: any, C: any, spent?: number) {
  const s = spent ?? (last !== null && last.text === t ? last.spent : 0);
  const h = attempt(() => H.holdsIdentifier(t, P, C, s));
  const a = attempt(() => A.holdsIdentifier(t, P, C));
  S.checks += 1;
  if (('e' in h) !== ('e' in a)) { S.threwDiffers += 1; bad.push({ k: 'threw-check', t: t.slice(0, 500) }); }
  if ('e' in h) throw h.e;
  if (!('e' in a) && h.v !== a.v) { if (h.v) { S.headRefusedBaseSent += 1; bad.push({ k: 'newly-refused', n: t.length, s, t: t.slice(0, 300) }); } else { S.baseRefusedHeadSent += 1; bad.push({ k: 'FLIP-TO-SENT', t: t.slice(0, 500) }); } }
  return h.v!;
}
process.on('exit', () => { try { fs.appendFileSync('/home/user/battery-out/shim.jsonl', JSON.stringify(S) + '\n'); if (bad.length) fs.appendFileSync('/home/user/battery-out/shim-bad.jsonl', bad.slice(0, 50).map((b) => JSON.stringify({ script: S.script, ...(b as object) })).join('\n') + '\n'); } catch {} });
