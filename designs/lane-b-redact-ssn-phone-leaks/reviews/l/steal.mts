// Reviewer L: (1) a true Social Security number, phone number or own identifier written right beside a covered look-alike run:
// does the head send any of its digits in clear where "before" refused or hid them, and is its compact form still among
// the screen's candidates; (2) strict chainLeft against non-strict on texts with a pattern placeholder cut into a run.
// usage: node steal.mts <seed> <seconds-phase-1> <seconds-phase-2>. Synthetic twins only.
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const S = 'packages/model-gateway/src/redact.ts';
const H = await import(pathToFileURL('/home/user/review-d1/d1/inst/redact.ts').href);
const BF = await import(pathToFileURL(`/home/user/work/p17/before/${S}`).href);
const B = await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href);
const T = H.__t;
const seed0 = Number(process.argv[2] ?? 1); const budget1 = Number(process.argv[3] ?? 60) * 1000; const budget2 = Number(process.argv[4] ?? 30) * 1000;
let seed = seed0 >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <X,>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)] as X;
const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const mk = (names: string[], dob: string[], memberIds: string[], claims: string[][]) => ({ P: { pseudonym: 'p', names, datesOfBirth: dob, memberIds }, C: claims.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers })) });
const PATS = [
  { name: 'ends:ZZ7654321+7654321', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321', '7654321'], [['SYNCLAIM0001'], ['4455667']]), write: ['ZZ7654321', '7654321'], own: ['SYNCLAIM0001', '4455667', '7654321', 'ZZ7654321'] },
  { name: 'ends:ZZ7654321+654321', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321', '654321'], [['SYNCLAIM0001']]), write: ['ZZ7654321'], own: ['654321', 'SYNCLAIM0001'] },
  { name: 'member0042', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042', '0042', 'MEMBER0042'], [['SYNCLAIM0001']]), write: ['SYNMEMBER0042', 'MEMBER0042'], own: ['0042', 'SYNCLAIM0001'] },
  { name: 'claims-end', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321'], [['SYNCLAIM0001', '0001'], ['4455667', '667']]), write: ['SYNCLAIM0001', '4455667'], own: ['0001', '667', 'ZZ7654321'] },
  { name: 'begins:7654321+76543210', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['7654321', '76543210'], [['SYNCLAIM0001']]), write: ['76543210'], own: ['7654321', 'SYNCLAIM0001'] },
  { name: 'dob-end', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ19800314', '800314', '03141980', '141980'], [['SYNCLAIM0001']]), write: ['ZZ19800314', '03141980'], own: ['800314', '141980', '03/14/1980'] },
  { name: 'three-nest', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321', '7654321', '54321', '321'], [['SYNCLAIM0001'], ['ZZ76']]), write: ['ZZ7654321', '7654321', '54321'], own: ['321', '54321', 'ZZ76'] },
  { name: 'crossed-settled', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['AB50123', 'S0123', 'ZZ1O0421', '100421'], [['SYNCLAIM0001'], ['SYN5501', 'SSO1']]), write: ['AB50123', 'ZZ1O0421', 'SYN5501'], own: ['S0123', '100421'] },
];
const D2L: Record<string, string[]> = { '0': ['O'], '1': ['l', 'I'], '2': ['Z', 'ꛯ'], '3': ['E'], '5': ['S'], '8': ['B'] };
const L2D: Record<string, string[]> = { O: ['0'], I: ['1'], S: ['5'], Z: ['2', 'Ζ'], B: ['8'], E: ['3', 'Е'], A: ['4', 'А'], M: ['М'], N: ['Ν'], C: ['С'] };
const alikeOf = (ch: string): string[] => { if (/[0-9]/.test(ch)) { const d = ch.charCodeAt(0) - 48; return [String.fromCharCode(0x660 + d), String.fromCharCode(0x966 + d), String.fromCharCode(0x9E6 + d), ...(D2L[ch] ?? [])]; } return L2D[ch] ?? []; };
const token = (id: string) => { const chars = [...id]; const subs = pick([0, 1, 1, 1, 1, 2]); for (let k = 0; k < subs; k += 1) { const at = Math.floor(rnd() * chars.length); const alts = alikeOf(id[at] as string); if (alts.length > 0) chars[at] = pick(alts); } return chars.join(''); };
const NUMBERS = ['900-12-3456', '900 12 3456', '900123456', '900.12.3456', '900-12 3456', '900\n12-3456', '900-12\n3456', '202-555-0123', '202 555 0123', '202.555.0123', '(202) 555-0123', '2025550123', '1-202-555-0123', '1 202 555 0123', '+1 202 555 0123', '555-0123', '555 0123', '555.0123', '5550123', '202-555 0123', '202 555-0123', '202\n555-0123', '202-555\n0123', '900 12-3456', '555\n0123'];
const GAPS = ['', ' ', '-', '.', '\n', ' \n', '\r\n', '\t', '/', ' - ', ', ', ': ', ' ', '·', '  ', '\n\n', ' #', ' x'];
const LABELS = ['ID ', 'Member ID: ', 'Claim ', 'Call ', 'SSN ', 'SSN: ', 'Phone ', 'Ph: ', 'Fax ', 'Tel. ', '', '', 'Paid 150.00 ', 'Line 3. ', 'SSN 1: ', 'Seen 01/01/2020-150.00Paid in full. '];
const ENDS = ['', '', ' Paid', '.', ' Zephyra', ' 150.00', '\nPaid in full.', ' Seen 01/01/2020-150.00Paid', '\n01/02/2020', ' ext 12'];
const PH = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g;
const hidden = (normal: string, sent: string): Uint8Array | null => {
  const segs = sent.split(PH); const mask = new Uint8Array(normal.length).fill(1);
  if (segs.length === 1) return sent === normal ? mask.fill(0) : null;
  let at = 0;
  for (let i = 0; i < segs.length; i += 1) { const seg = segs[i] as string; const pos = i === 0 ? (normal.startsWith(seg) ? 0 : -1) : i === segs.length - 1 ? (normal.endsWith(seg) && normal.length - seg.length >= at ? normal.length - seg.length : -1) : normal.indexOf(seg, at); if (pos < 0) return null; for (let k = pos; k < pos + seg.length; k += 1) mask[k] = 0; at = pos + seg.length; }
  return mask;
};
const run = (M: any, t: string, P: any, C: any) => { const s = M.redactLetterForScreen(t, P, C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, P, C) as boolean, cands: (s.candidates ?? []) as string[] }; };
const stats: Record<string, number> = {}; const ex: Record<string, string[]> = {}; const lines: string[] = [];
const bump = (k: string, rec?: () => unknown) => { stats[k] = (stats[k] ?? 0) + 1; if (rec !== undefined) { const r = esc(JSON.stringify(rec())).slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'); lines.push(`${k}\t${r}`); (ex[k] ??= []).length < 6 && (ex[k] as string[]).push(r); } };
let t0 = Date.now(); let n = 0;
while (Date.now() - t0 < budget1) {
  const pat = pick(PATS); const { P, C } = pat; n += 1; const subject = T.letterSubject(P, C);
  const isOwn = rnd() < 0.2; const number = isOwn ? pick(pat.own) : pick(NUMBERS);
  const tok = token(pick(pat.write)); const gap = pick(GAPS); const lead = pick(LABELS); const after = rnd() < 0.6;
  const second = rnd() < 0.15 ? `${pick(GAPS)}${pick(['9', 'X', '2020'])}${token(pick(pat.write))}` : '';
  const head = after ? `${lead}${tok}${gap}` : lead;
  const t = after ? `${head}${number}${second}${pick(ENDS)}` : `${head}${number}${gap}${tok}${second}${pick(ENDS)}`;
  const normal = T.unbracketed(t); if (normal.length !== t.length || !normal.startsWith(T.unbracketed(head))) { bump('skipped-nfkc'); }
  const at = T.unbracketed(head).length; const numberN = T.unbracketed(number);
  const all = T.matchesIn(T.unmarked(normal), subject);
  const isPat = (m: any) => m.kind === 'ssn' || m.kind === 'phone';
  if (!all.some((p: any) => isPat(p) && p.withheld !== true && all.some((o: any) => !isPat(o) && o.start < p.end && p.start < o.end))) { bump('no-reach'); continue; }
  bump('reach');
  const h = run(H, t, P, C); const bf = run(BF, t, P, C);
  if (h.text === bf.text && h.refused === bf.refused && h.cands.join('|') === bf.cands.join('|')) { bump('same-as-before'); continue; }
  bump('differs-from-before');
  const b = run(B, t, P, C);
  bump(`cls B:${b.refused ? 'REF' : 'sent'} BF:${bf.refused ? 'REF' : 'sent'} H:${h.refused ? 'REF' : 'sent'}`);
  const rec = () => ({ pat: pat.name, t, number, base: b.refused ? 'REFUSED' : b.text, before: bf.refused ? 'REFUSED' : bf.text, head: h.refused ? 'REFUSED' : h.text });
  if (b.refused && !h.refused) bump('F1-BASE-REFUSES-HEAD-SENDS', rec);
  if (!b.refused && !bf.refused && h.refused) bump('M1-BASE-SENT-BEFORE-SENT-HEAD-REFUSES', rec);
  if (h.refused) continue;
  const hh = hidden(normal, h.text); const hbf = hidden(normal, bf.text); const hb = hidden(normal, b.text);
  if (hh === null || hbf === null || hb === null) { bump('unaligned', rec); continue; }
  const shownDigits = (m: Uint8Array) => { let c = 0; for (let i = at; i < at + numberN.length; i += 1) if (m[i] === 0 && /[\p{L}\p{N}]/u.test(normal[i] as string)) c += 1; return c; };
  const sh = shownDigits(hh);
  if (sh > 0 && (bf.refused || shownDigits(hbf) < sh)) bump(`STEAL-number-shown-by-head-where-before-${bf.refused ? 'refused' : 'hid'}${isOwn ? ':own' : ''}`, () => ({ ...rec(), shown: sh }));
  if (sh > 0 && !b.refused && shownDigits(hb) < sh) bump('STEAL-number-shown-by-head-where-base-hid', () => ({ ...rec(), shown: sh }));
  if (!isOwn) {
    const compact = number.replace(/[^0-9]/g, ''); const core = compact.length === 11 ? compact.slice(1) : compact;
    const offered = (c: string[]) => c.includes(compact) || c.includes(core);
    if (!offered(h.cands) && (offered(bf.cands) || offered(b.cands))) bump(`D-NUMBER-NOT-AMONG-HEAD-CANDIDATES(before:${offered(bf.cands) ? 'offered' : 'no'},base:${b.refused ? 'refused' : offered(b.cands) ? 'offered' : 'no'},shown:${sh > 0 ? 'yes' : 'no'},fmt:${compact.length})`, () => ({ ...rec(), headCands: h.cands }));
    else bump(offered(h.cands) ? 'number-offered-by-head' : 'number-offered-by-none');
  }
}
console.log(JSON.stringify({ phase: 1, seed: seed0, letters: n, ms: Date.now() - t0 }));
// Phase 2: strict against non-strict, on texts with a pattern placeholder cut into a look-alike run (the settled branch's text).
t0 = Date.now(); let m = 0;
const CUT = ['[SSN]', '[PHONE]', '[SSN]', '[PHONE]', '[MEMBER_ID]', '[CLAIM_1]', '[PATIENT_NAME]', '[DATE_OF_BIRTH]'];
const FILL = ['', ' Paid', ' 150.00', '.', ' Seen 01/01/2020-150.00Paid', '\n01/02/2020', ', 900123456', ' 12-3456', '-0123', ' Zephyra', '\n555', ' 2020', '150.00', 'Paid'];
while (Date.now() - t0 < budget2) {
  const pat = pick(PATS); const { P, C } = pat; m += 1; const subject = T.letterSubject(P, C);
  const tok = token(pick(pat.write)); const cutAt = 1 + Math.floor(rnd() * (tok.length - 1)); const side = rnd() < 0.7;
  const piece = side ? `${tok.slice(0, cutAt)}${pick(CUT)}` : `${pick(CUT)}${tok.slice(cutAt)}`;
  const lead = rnd() < 0.5 ? 'Seen 01/01/2020-150.00Paid in full. ' : pick(LABELS);
  const text = T.unbracketed(`${lead}${rnd() < 0.3 ? pick(['12', '555-', '900-12-', '2020', '01/02/']) : ''}`) + piece + T.unbracketed(`${pick(FILL)}${pick(FILL)}`) + (rnd() < 0.3 ? ` ${pick(CUT)}${pick(FILL)}` : '');
  const ns = T.chainLeft(text, subject, C.length, false);
  if (!ns) { bump('p2:non-strict-false'); continue; }
  bump('p2:non-strict-true');
  if (!T.chainLeft(text, subject, C.length, true)) bump('P2-NONSTRICT-TRUE-STRICT-FALSE', () => ({ pat: pat.name, text }));
  if (!H.holdsIdentifier(text, P, C)) bump('P2-NONSTRICT-TRUE-CHECK-FALSE', () => ({ pat: pat.name, text }));
}
console.log(JSON.stringify({ phase: 2, texts: m, ms: Date.now() - t0 }));
writeFileSync(`/home/user/review-l/out-steal-${seed0}.tsv`, lines.join('\n') + '\n');
for (const k of Object.keys(stats).sort()) console.log(String(stats[k]).padStart(8), k);
for (const k of Object.keys(ex).sort()) { console.log(`== ${k}`); for (const e of ex[k] as string[]) console.log('  ', e.slice(0, 620)); }
