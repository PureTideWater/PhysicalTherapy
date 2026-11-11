// D1 review fuzzer, second round. node fz3.mts <seconds> <seed> letter|chk
// letter: base against head over gen3 (the oracles of fz.mts). chk: redacted texts written with placeholders, the base's
// check against the head's (CHK-WEAKER: the base refuses the text and the head does not), each such text then run as a
// letter with the identifiers put back.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGen3 } from './gen3.mts';
const load = async (p: string): Promise<any> => import(pathToFileURL(p).href);
const B = await load('/home/user/tree-ef3/packages/model-gateway/src/redact.ts');
const H = await load('/home/user/fix/packages/model-gateway/src/redact.ts');
let I: any = null;
try { I = await load('/home/user/review-d1/d1/inst/redact.ts'); if (I.__t === undefined) I = null; } catch { I = null; }
const budget = Number(process.argv[2] ?? 30) * 1000; const seed = Number(process.argv[3] ?? 1); const mode = process.argv[4] ?? 'letter'; const t0 = Date.now();
const g = makeGen3(seed, { ph: mode === 'chk' });
const digitValue = (cp: string) => { const at = cp.codePointAt(0) ?? 0; let zero = at; while (zero > 0 && /^\p{Nd}$/u.test(String.fromCodePoint(zero - 1))) zero -= 1; return String((at - zero) % 10); };
const plain = (sent: string) => sent.normalize('NFKC').replace(/\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g, '|').replace(/[\p{Cf}\p{Default_Ignorable_Code_Point}\u0000-\u0008\u000E-\u001F\u007F-\u0084\u0086-\u009F]/gu, '').replace(/\p{Nd}/gu, digitValue);
const clear = (s: string) => plain(s).toUpperCase().replace(/[^A-Z0-9]/g, '');
const firstMiss = (a: string, b: string) => { let j = 0; for (let i = 0; i < a.length; i += 1) { j = b.indexOf(a[i]!, j); if (j < 0) return i; j += 1; } return -1; };
const ownClear = (sent: string, own: readonly string[]) => { const up = plain(sent).toUpperCase().replace(/[^A-Z0-9|]/g, ''); return own.filter((o) => up.includes(o)); };
const ADJ = /\[(?:SSN|PHONE)\][^\p{L}\p{N}\[\]]{0,2}\p{Nd}{3,}|\p{Nd}{3,}[^\p{L}\p{N}\[\]]{0,2}\[(?:SSN|PHONE)\]/u;
const shapeOf = (t: string) => plain(t).replace(/[0-9]+/g, '9').replace(/\p{L}+/gu, 'a').slice(0, 48);
const n: Record<string, number> = { letters: 0, headSent: 0, flip: 0, withheldRefused: 0 };
const recs: string[] = []; const seen = new Set<string>(); const shown: Record<string, string[]> = {};
const add = (k: string, o: Record<string, unknown>, shapeSrc: string) => {
  n[k] = (n[k] ?? 0) + 1;
  const key = `${k}|${shapeOf(shapeSrc)}`;
  if (seen.has(key) || recs.length >= 8000) return;
  seen.add(key);
  const line = JSON.stringify({ k, ...o });
  recs.push(line);
  const list = (shown[k] ??= []);
  if (list.length < (k.startsWith('flip-other') || k === 'asym-held' ? 2 : 5)) list.push(line.slice(0, 330));
};
function examine(t: string, P: any, C: any, who: string, own: readonly string[], asym: boolean) {
  let hs = ''; let hr = false;
  try { hs = H.redactLetterForScreen(t, P, C).text; hr = H.holdsIdentifier(hs, P, C); } catch (e) { add('THREW', { who, t, e: String(e).slice(0, 120) }, t); return; }
  if (I !== null && asym) {
    try {
      const tt = I.__t; const normal: string = tt.unbracketed(t); const subject = tt.letterSubject(P, C);
      const found: any[] = tt.matchesIn(tt.unmarked(normal), subject);
      const texts: [string, string][] = [['full', tt.written(normal, tt.merge(found))]];
      if (found.some((m) => m.fresh === true)) texts.push(['settled', tt.written(normal, tt.merge(found.filter((m) => m.fresh !== true)))]);
      for (const [kind, T] of texts) {
        if (!tt.chainLeft(T, subject, C.length, false) || tt.chainLeft(T, subject, C.length, true)) continue;
        add(I.holdsIdentifier(T, P, C) ? 'asym-held' : 'ASYM-SENT', { kind, who, T, t }, T);
      }
    } catch { n.instThrew = (n.instThrew ?? 0) + 1; }
  }
  let all = hs;
  try { all = H.redactLetter(t, P, C).text; } catch { /* the screen text stands */ }
  if (hr) { if (all !== hs) n.withheldRefused += 1; return; }
  n.headSent += 1;
  if (all !== hs) add('SENT_WITHHELD', { who, t, h: hs, all }, hs);
  let bs = ''; let br = false;
  try { bs = B.redactLetterForScreen(t, P, C).text; br = B.holdsIdentifier(bs, P, C); } catch { n.baseThrew = (n.baseThrew ?? 0) + 1; return; }
  const hc = clear(hs); const bc = clear(bs); const at = firstMiss(hc, bc);
  const three = /[0-9]{3,}/.test(plain(hs));
  if (br) {
    n.flip += 1;
    const kinds: string[] = [];
    let chk = false; try { chk = B.holdsIdentifier(hs, P, C) as boolean; } catch { chk = false; }
    if (chk) kinds.push(three ? 'FLIP-CHK' : 'FLIP-CHK0');
    if (at >= 0) kinds.push('FLIP-SHOWS');
    if (ADJ.test(hs)) kinds.push('FLIP-ADJ');
    if (ownClear(hs, own).length > 0) kinds.push('FLIP-OWN');
    if (kinds.length === 0) kinds.push(three ? 'flip-other3' : 'flip-other0');
    for (const k of kinds) add(`${k}${who === 'M' ? '.M' : ''}`, { who, t, b: bs, h: hs }, hs);
  } else {
    if (at >= 0) add('SHOWS', { who, t, b: bs, h: hs, ctx: hc.slice(Math.max(0, at - 5), at + 6) }, hs);
    const bo = ownClear(bs, own);
    if (ownClear(hs, own).some((o) => !bo.includes(o))) add('UNREDACT-OWN', { who, t, b: bs, h: hs }, hs);
  }
}
const SUB: Record<string, string> = { '[PATIENT_NAME]': 'Zephyra', '[MEMBER_ID]': 'SYNMEMBER0042', '[CLAIM_1]': 'SYNCLAIM0001', '[DATE_OF_BIRTH]': '03/14/1980', '[SSN]': '900-12-3456', '[PHONE]': '202-555-0123' };
for (;;) {
  if ((n.letters & 31) === 0 && Date.now() - t0 > budget) break;
  n.letters += 1;
  const { t, P, C, who, own } = g.letter();
  if (mode === 'chk') {
    let b = false; let h = false;
    try { b = B.holdsIdentifier(t, P, C); h = H.holdsIdentifier(t, P, C); } catch { n.chkThrew = (n.chkThrew ?? 0) + 1; continue; }
    if (b) n.baseRef = (n.baseRef ?? 0) + 1;
    if (h) n.headRef = (n.headRef ?? 0) + 1;
    if (!b || h) continue;
    add('CHK-WEAKER', { who, T: t }, t);
    examine(t.replace(/\[(?:PATIENT_NAME|MEMBER_ID|CLAIM_1|DATE_OF_BIRTH|SSN|PHONE)\]/g, (m) => SUB[m] ?? m), P, C, who, own, false);
  } else {
    examine(t, P, C, who, own, n.letters % 3 === 0);
  }
}
fs.writeFileSync(`/home/user/review-d1/d1/out/fz3.${mode}.${seed}.jsonl`, `${recs.join('\n')}\n`);
console.log(`fz3 ${mode} seed ${seed} in ${((Date.now() - t0) / 1000).toFixed(0)} s inst=${I !== null}`, JSON.stringify(n));
for (const [k, list] of Object.entries(shown)) for (const line of list) console.log(line);
