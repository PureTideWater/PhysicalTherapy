// Reviewer L: differential fuzz of the delta (head vs before vs base) on letters where a Social Security or phone pattern
// overlaps a match of the call's own. Synthetic twins only.
// usage: node diff-l.mts <seed> <seconds> [patientIndex]
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
const S = 'packages/model-gateway/src/redact.ts';
const H = await import(pathToFileURL('/home/user/review-d1/d1/inst/redact.ts').href);
const BF = await import(pathToFileURL(`/home/user/work/p17/before/${S}`).href);
const B = await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href);
const T = H.__t;
const seed0 = Number(process.argv[2] ?? 1); const budget = Number(process.argv[3] ?? 60) * 1000; const only = process.argv[4];
let seed = seed0 >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <X,>(xs: readonly X[]): X => xs[Math.floor(rnd() * xs.length)] as X;
const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const mk = (names: string[], dob: string[], memberIds: string[], claims: string[][]) => ({ P: { pseudonym: 'p', names, datesOfBirth: dob, memberIds }, C: claims.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers })) });
interface Pat { name: string; P: any; C: any[]; write: string[] }
const PATS: Pat[] = [
  { name: 'ends:ZZ7654321+7654321', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321', '7654321'], [['SYNCLAIM0001'], ['4455667']]), write: ['ZZ7654321', '7654321', 'SYNCLAIM0001', '4455667'] },
  { name: 'ends:ZZ7654321+654321', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321', '654321'], [['SYNCLAIM0001']]), write: ['ZZ7654321', '654321'] },
  { name: 'member0042', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['SYNMEMBER0042', '0042', 'MEMBER0042'], [['SYNCLAIM0001']]), write: ['SYNMEMBER0042', 'MEMBER0042'] },
  { name: 'claims-end', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321'], [['SYNCLAIM0001', '0001'], ['4455667', '667']]), write: ['SYNCLAIM0001', '4455667'] },
  { name: 'claims-two', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321'], [['SYNCLAIM0001'], ['0001'], ['4455667'], ['667'], ['SYNCLAIM']]), write: ['SYNCLAIM0001', '4455667'] },
  { name: 'names-end', ...mk(['JANE Q ZEPHYRA', 'HYRA VANTREE', 'TREE'], ['1980-03-14'], ['ZZ7654321'], [['SYNCLAIM0001']]), write: ['ZEPHYRA', 'VANTREE', 'HYRA', 'TREE'] },
  { name: 'begins:7654321+76543210', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['7654321', '76543210'], [['SYNCLAIM0001']]), write: ['76543210', '7654321'] },
  { name: 'dob-end', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ19800314', '800314', '03141980', '141980'], [['SYNCLAIM0001']]), write: ['ZZ19800314', '03141980', '800314'] },
  { name: 'crossed-settled', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['AB50123', 'S0123', 'ZZ1O0421', '100421'], [['SYNCLAIM0001'], ['SYN5501', 'SSO1']]), write: ['AB50123', 'ZZ1O0421', 'SYN5501'] },
  { name: 'three-nest', ...mk(['JANE Q ZEPHYRA'], ['1980-03-14'], ['ZZ7654321', '7654321', '54321', '321'], [['SYNCLAIM0001'], ['ZZ76']]), write: ['ZZ7654321', '7654321', '54321'] },
];
const D2L: Record<string, string[]> = { '0': ['O', 'o'], '1': ['l', 'I'], '2': ['Z', 'ꛯ'], '3': ['E'], '5': ['S'], '8': ['B'], '6': ['G'] };
const L2D: Record<string, string[]> = { O: ['0'], I: ['1'], L: ['1'], S: ['5'], Z: ['2'], B: ['8'], E: ['3'], A: ['4', 'А', 'Α'], T: ['7', 'Τ'], Y: ['Υ'], H: ['Н'], N: ['Ν'], M: ['М'], C: ['С'], R: [] };
const alikeOf = (ch: string): string[] => {
  if (/[0-9]/.test(ch)) { const d = ch.charCodeAt(0) - 48; return [String.fromCharCode(0x660 + d), String.fromCharCode(0x966 + d), String.fromCharCode(0x9E6 + d), String.fromCharCode(0x6F0 + d), ...(D2L[ch] ?? [])]; }
  return L2D[ch.toUpperCase()] ?? [];
};
const variant = (id: string): string => {
  const chars = [...id];
  const subs = pick([0, 1, 1, 1, 1, 2, 2, 3]);
  for (let k = 0; k < subs; k += 1) { const at = Math.floor(rnd() * chars.length); const alts = alikeOf(id[at] as string); if (alts.length > 0) chars[at] = pick(alts); }
  if (rnd() < 0.18) { const at = 1 + Math.floor(rnd() * (chars.length - 1)); chars.splice(at, 0, pick(['-', ' ', '·', '‧', '-\n', '.', '・'])); }
  let out = chars.join('');
  if (rnd() < 0.08) out = pick(['z', 'Z', 'q'].map(() => out.toLowerCase()).concat([out[0] + out.slice(1).toLowerCase()]));
  return out;
};
const HELD = 'Seen 01/01/2020-150.00Paid in full. ';
const GAPS = ['', ' ', '\n', ' \n', '-', '. ', '\t', '.', '/', '\r\n', ' - ', ', ', ' ', '​', ': '];
const TAILS = ['01-02-2020', '00-12-3456', '9-12-3456', '12-3456', '02-555-0123', '2-555-0123', '555-0123', '202-555-0123', '55-0123', '5-0123', '0123', '555 0123', '900 12 3456', '2025550123', '02 555 0123', '12 3456', '01/02/2020', '202.555.0123', '900-12-3456', '23-45-6789', '(202) 555-0123', '5550123', '00123456', '202 555\n0123', '01-02\n2020', '45-6789 0123', '555-0123 x12', '01-02-2020-150.00', '900-12-3456150.00', '1 202 555 0123', '02-20'];
const PRE = ['202-555-', '202-555 ', '900-12-', '900 12 ', '555-', '1-202-555-', '(202) 555-', '12-', '900-', '202 ', '+1 202 555 ', '555 01', '900-1', '202-555-0', '900 12\n', '555\n'];
const LABELS = ['ID ', 'Member ID: ', 'Claim ', 'Call ', 'SSN ', 'SSN: ', 'Phone ', 'Ph: ', 'Fax ', 'Tel. ', 'DOB ', '', '', 'Paid 150.00 ', 'Line 3. ', 'Re: Jane Zephyra ', 'SSN 1: ', 'Social Security No. '];
const ENDS = ['', '', ' Paid', '.', ' Zephyra', ' 150.00', '\nPaid in full.', ' Seen 01/01/2020-150.00Paid', ', 900123456', ' x12', '\n01/02/2020'];
const PH = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g;
/** Positions of the NFKC text hidden in `sent` (segments aligned leftmost, the last from the right); null if it cannot be aligned. */
const hidden = (normal: string, sent: string): Uint8Array | null => {
  const segs = sent.split(PH); const mask = new Uint8Array(normal.length).fill(1);
  if (segs.length === 1) return sent === normal ? mask.fill(0) : null;
  let at = 0;
  for (let i = 0; i < segs.length; i += 1) {
    const seg = segs[i] as string;
    let pos = i === 0 ? (normal.startsWith(seg) ? 0 : -1) : i === segs.length - 1 ? (normal.endsWith(seg) && normal.length - seg.length >= at ? normal.length - seg.length : -1) : normal.indexOf(seg, at);
    if (pos < 0) return null;
    for (let k = pos; k < pos + seg.length; k += 1) mask[k] = 0;
    at = pos + seg.length;
  }
  return mask;
};
const ALNUM = /[\p{L}\p{N}]/u;
const shownNotIn = (normal: string, a: Uint8Array, b: Uint8Array): string => { let out = ''; for (let i = 0; i < normal.length; i += 1) if (a[i] === 0 && b[i] === 1 && ALNUM.test(normal[i] as string)) out += normal[i]; return out; };
const run = (M: any, t: string, P: any, C: any) => { try { const s = M.redactLetterForScreen(t, P, C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, P, C) as boolean, cands: (s.candidates ?? []) as string[], exc: '' }; } catch (e) { return { text: '', refused: true, cands: [], exc: String(e).slice(0, 120) }; } };
const stats: Record<string, number> = {}; const ex: Record<string, string[]> = {}; const lines: string[] = [];
const bump = (k: string, rec?: () => unknown) => { stats[k] = (stats[k] ?? 0) + 1; if (rec !== undefined) { const r = esc(JSON.stringify(rec())).slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\'); lines.push(`${k}\t${r}`); (ex[k] ??= []).length < 5 && (ex[k] as string[]).push(r); } };
const t0 = Date.now(); let n = 0;
const pats = only === undefined ? PATS : [PATS[Number(only)] as Pat];
while (Date.now() - t0 < budget) {
  const pat = pick(pats); const { P, C } = pat; n += 1;
  const subject = T.letterSubject(P, C);
  const w = () => variant(pick(pat.write));
  const unc = () => pick(['9', 'X', 'Paid', '150.00', '2020']) + w();
  // Targeted: a pattern that begins in the run's last plain digits (right), ends in its first (left), or spans two runs.
  const FORMATS = ['DDD-DD-DDDD', 'DDD DD DDDD', 'DDD.DD.DDDD', 'DDD-DDD-DDDD', 'DDD DDD DDDD', 'DDD.DDD.DDDD', '1-DDD-DDD-DDDD', '1 DDD DDD DDDD', 'DDD-DDDD', 'DDD DDDD', 'DDD-DD DDDD', 'DDD DDD-DDDD', '+1 DDD DDD DDDD', 'DDD-DD-DDDD', 'DDD-DDD-DDDD', 'DDD\nDD-DDDD', 'DDD-DD\nDDDD', 'DDD\nDDD-DDDD', 'DDD - DD - DDDD', 'DDDDDDDDD', 'DDDDDDDDDD'];
  const FILL = '90012345620255501239001234560123';
  const slotsOf = (fmt: string) => [...fmt].map((c, i) => (c === 'D' || c === '1' ? i : -1)).filter((i) => i >= 0);
  const filled = (fmt: string) => { let q = Math.floor(rnd() * 12); return [...fmt].map((c) => (c === 'D' ? (FILL[q++] as string) : c)).join(''); };
  const trailing = (id: string) => (/[0-9]*$/.exec(id) as RegExpExecArray)[0].length;
  const leading = (id: string) => (/^[0-9]*/.exec(id) as RegExpExecArray)[0].length;
  const dress = (chars: string[], keepFrom: number, keepTo: number) => { // extra look-alikes outside [keepFrom, keepTo)
    const extra = pick([0, 0, 0, 1, 1, 2]);
    for (let k = 0; k < extra; k += 1) { const at = Math.floor(rnd() * chars.length); if (at >= keepFrom && at < keepTo) continue; const alts = alikeOf(chars[at] as string); if (alts.length > 0 && chars[at]!.length === 1 && /[A-Za-z0-9]/.test(chars[at] as string)) chars[at] = pick(alts); }
    return chars;
  };
  /** The run with k plain digits last, a look-alike right before them (or none: plain), and the rest of a pattern after it. */
  const right = (): { token: string; k: number; rest: (fmt: string) => string | null } => {
    let id = pick(pat.write); const names = /^[A-Z]+$/.test(id);
    let chars = [...id]; let k: number;
    if (names) { k = pick([1, 1, 2]); let ok = 0; for (let i = chars.length - 1; i >= chars.length - k; i -= 1) { const alts = (L2D[chars[i] as string] ?? []).filter((a) => /[0-9]/.test(a)); if (alts.length > 0) { chars[i] = pick(alts); ok += 1; } } if (ok < k) { chars = [...id.slice(0, -1), '4']; k = 1; } chars = dress(chars, chars.length - k, chars.length); }
    else { const tr = trailing(id); k = Math.max(1, Math.min(tr - 1, pick([1, 1, 2, 3, 3, 4]))); const at = chars.length - 1 - k; const plain = rnd() < 0.12; if (!plain && at >= 0) { const alts = alikeOf(chars[at] as string); if (alts.length > 0) chars[at] = pick(alts); } chars = dress(chars, chars.length - k - (plain ? 0 : 1), chars.length); }
    const token = chars.join(''); const tail = token.slice(-k);
    return { token, k, rest: (fmt) => { const sl = slotsOf(fmt); if (sl.length <= k) return null; for (let i = 0; i < k; i += 1) if (fmt[sl[i] as number] === '1' && tail[i] !== '1') return null; return filled(fmt.slice((sl[k - 1] as number) + 1)); } };
  };
  const left = (): { token: string; k: number; rest: (fmt: string) => string | null } | null => {
    const ids = pat.write.filter((x) => leading(x) >= 2); if (ids.length === 0) return null;
    const id = pick(ids); let chars = [...id]; const ld = leading(id); const k = Math.max(1, Math.min(ld - 1, pick([1, 2, 3, 4, 4])));
    if (rnd() < 0.88) { const alts = alikeOf(chars[k] as string); if (alts.length > 0) chars[k] = pick(alts); }
    chars = dress(chars, 0, k + 1);
    const token = chars.join('');
    return { token, k, rest: (fmt) => { const sl = slotsOf(fmt); if (sl.length <= k) return null; return filled(fmt.slice(0, sl[sl.length - k] as number)); } };
  };
  const core = (): string => {
    for (let tries = 0; tries < 20; tries += 1) {
      const kind = pick(['R', 'R', 'R', 'R', 'L', 'L', 'RL', 'RL']);
      const fmt = pick(FORMATS); const gap = pick(['', '', ' ', '\n', ' \n', '\r\n', '\t', ' ', '.', '-']);
      if (kind === 'R') { const r = right(); const rest = r.rest(fmt); if (rest === null) continue; return `${r.token}${gap}${rest}`; }
      if (kind === 'L') { const l = left(); if (l === null) continue; const rest = l.rest(fmt); if (rest === null) continue; return `${rest}${gap}${l.token}`; }
      const r = right(); const l = left(); if (l === null) continue; const sl = slotsOf(fmt); if (sl.length <= r.k + l.k) continue;
      const mid = filled(fmt.slice((sl[r.k - 1] as number) + 1, sl[sl.length - l.k] as number));
      return `${r.token}${gap}${mid}${pick(['', '', ' ', '\n'])}${l.token}${pick(['', '', '', 'X', '9', 'Paid'])}`;
    }
    return w();
  };
  const form = pick([0, 0, 0, 0, 1, 2, 3, 4, 5, 5]);
  let t: string;
  const lead = rnd() < 0.2 ? HELD : pick(LABELS);
  if (form === 0) t = `${lead}${core()}${pick(ENDS)}`;
  else if (form === 1) t = `${lead}${unc()}${pick(GAPS)}${core()}${pick(ENDS)}`;
  else if (form === 2) t = `${lead}${core()}${pick(GAPS)}${unc()}${pick(ENDS)}`;
  else if (form === 3) t = `${lead}${core()}${pick(GAPS)}${pick(TAILS)}${pick(ENDS)}`;
  else if (form === 4) t = `${lead}${pick(TAILS)}${pick(GAPS)}${core()}${pick(ENDS)}`;
  else t = `${lead}${core()}${pick(ENDS)}\n${pick(LABELS)}${core()}${pick(ENDS)}`;
  const normal = T.unbracketed(t);
  let all: any[];
  try { all = T.matchesIn(T.unmarked(normal), subject); } catch (e) { bump('EXC-matchesIn', () => ({ pat: pat.name, t, e: String(e).slice(0, 100) })); continue; }
  const isPat = (m: any) => m.kind === 'ssn' || m.kind === 'phone';
  const reach = all.some((p) => isPat(p) && p.withheld !== true && all.some((o) => !isPat(o) && o.start < p.end && p.start < o.end));
  if (!reach) {
    bump('no-reach');
    if (n % 40 === 0) { const h = run(H, t, P, C); const bf = run(BF, t, P, C); bump('no-reach-checked'); if (h.text !== bf.text || h.refused !== bf.refused) bump('NO-REACH-DIFFERS', () => ({ pat: pat.name, t, h, bf })); }
    continue;
  }
  bump('reach');
  const h = run(H, t, P, C); const bf = run(BF, t, P, C);
  if (h.exc !== '') bump('EXC-head', () => ({ pat: pat.name, t, e: h.exc }));
  // branch of appliedMatches
  const found = all.filter((m) => m.withheld !== true); const anyFresh = found.some((m) => m.fresh === true); const settled = found.filter((m) => m.fresh !== true);
  const settledText = T.written(normal, T.merge(settled));
  const ns = T.chainLeft(settledText, subject, C.length, false); const st = T.chainLeft(settledText, subject, C.length, true);
  const branch = !anyFresh ? 'nofresh' : ns ? 'settled' : 'all';
  bump(`branch:${branch}`);
  if (ns && !st) bump('A2-nonstrict-true-strict-false', () => ({ pat: pat.name, t, settledText }));
  if (ns && !H.holdsIdentifier(settledText, P, C)) bump('A1x-nonstrict-true-check-false', () => ({ pat: pat.name, t, settledText }));
  if (branch === 'settled') { bump(/\p{L}\[(?:SSN|PHONE)\]|[\p{L}\p{N}]\[(?:SSN|PHONE)\]/u.test(h.text) ? 'settled:cut-into-token' : 'settled:other'); if (!h.refused) bump('A1-SETTLED-BRANCH-SENT', () => ({ pat: pat.name, t, h: h.text })); }
  const same = h.text === bf.text && h.refused === bf.refused;
  if (same) { bump('same-as-before'); continue; }
  bump('differs-from-before');
  const b = run(B, t, P, C);
  const cls = `B:${b.refused ? 'REF' : 'sent'} BF:${bf.refused ? 'REF' : 'sent'} H:${h.refused ? 'REF' : 'sent'}`; bump(`cls ${cls}`);
  const rec = () => ({ pat: pat.name, t, base: b.refused ? 'REFUSED' : b.text, before: bf.refused ? 'REFUSED' : bf.text, head: h.refused ? 'REFUSED' : h.text, branch });
  if (b.refused && !h.refused) bump('F1-BASE-REFUSES-HEAD-SENDS', rec);
  const hh = hidden(normal, h.text); const hb = hidden(normal, b.text); const hbf = hidden(normal, bf.text);
  if (hh === null || hb === null || hbf === null) { bump('unaligned', rec); }
  if (!h.refused) {
    const allText = H.redactLetter(t, P, C).text;
    if (h.text !== allText) bump('P-LEFT-AS-WRITTEN-AND-SENT', () => ({ ...rec(), all: allText }));
    if (hh !== null && hb !== null && !b.refused) { const more = shownNotIn(normal, hh, hb); if (more !== '') bump('F2-HEAD-SHOWS-WHAT-BASE-HID', () => ({ ...rec(), shown: more })); }
    if (hh !== null && hbf !== null && !bf.refused) { const more = shownNotIn(normal, hh, hbf); if (more !== '') bump('F3-HEAD-SHOWS-WHAT-BEFORE-HID', () => ({ ...rec(), shown: more })); }
    if (bf.refused) { bump('before-refused-head-sent'); const ha = hidden(normal, allText); if (hh !== null && ha !== null && shownNotIn(normal, hh, ha) !== '') bump('F3b-BEFORE-REFUSED-HEAD-SHOWS-A-MATCH', rec); if (/[0-9]/.test(h.text.replace(PH, ''))) bump('before-refused-head-sent:digits-left', rec); }
    const lostBf = bf.cands.filter((c) => !h.cands.includes(c)); if (lostBf.length > 0) bump('D-CANDIDATES-BEFORE-NOT-HEAD', () => ({ ...rec(), lost: lostBf, headCands: h.cands }));
    if (!b.refused) { const lostB = b.cands.filter((c) => !h.cands.includes(c)); if (lostB.length > 0) bump('D-candidates-base-not-head', () => ({ ...rec(), lost: lostB, headCands: h.cands })); }
  }
  if (!b.refused && !bf.refused) {
    if (h.refused) bump('M1-BASE-SENT-BEFORE-SENT-HEAD-REFUSES', rec);
    else if (h.text === b.text) bump('M2-head-now-as-base');
    else { const more = hh !== null && hb !== null ? shownNotIn(normal, hb, hh) : '?'; bump(more === '' ? 'M2-head-differs-from-base-not-hiding-more' : 'M2-head-hides-more-than-base', rec); }
  }
}
writeFileSync(`/home/user/review-l/out-diff2-${seed0}${only === undefined ? '' : `-p${only}`}.tsv`, lines.join('\n') + '\n');
console.log(JSON.stringify({ seed: seed0, letters: n, ms: Date.now() - t0 }));
for (const k of Object.keys(stats).sort()) console.log(String(stats[k]).padStart(8), k);
for (const k of Object.keys(ex).sort()) { console.log(`== ${k}`); for (const e of ex[k] as string[]) console.log('  ', e.slice(0, 700)); }
