// Avenue 3: the name and an SSN written through the fold (look-alikes, NFKC forms, marks, invisible runs, astral digits) between
// awkward neighbours: a throw, a placeholder over the wrong span, or the writing left in clear. node off1.mts <runs> <seed>
import { pathToFileURL } from 'node:url';
import { load, outcome, P1, C1, show } from './lib.mts';
const H = await load('head');
const T = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/confusables.ts').href);
const runs = Number(process.argv[2] ?? 5000); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const rev: Record<string, string[]> = {};
for (const [ch, as] of T.LOOK_ALIKES as Map<string, string>) { const f = H.fold(ch) as string; if (/^[A-Z]$/.test(f) && f === as.toUpperCase()) (rev[f] ??= []).push(ch); }
const nfkcForms = (c: string) => { const i = c.charCodeAt(0) - 65; return [String.fromCodePoint(0x1D400 + i), String.fromCodePoint(0x1D41A + i), String.fromCodePoint(0xFF21 + i), String.fromCodePoint(0xFF41 + i), String.fromCodePoint(0x24B6 + i), String.fromCodePoint(0x1D5D4 + i), String.fromCodePoint(0x1D68A + i)]; };
const INV = ['​', '­', '⁠', '️', '󠁡', '‍'];
const MARK = ['́', '̃', '̸', '⃝', '҉', '̲'];
const WEIRD = ['ß', 'ŉ', 'İ', 'ﬁ', 'ﬀ', '𝐀𝐛', 'ᴀʙ', 'Ａｂ', 'ǅ', '𐐀𐐨', 'é', 'éx', '́', '​', '½', '㎏', '№5', '℡', 'ⅷ', '٣', '३', '[x]', '(y)', 'the', 'paid', 'of', '—', '“', '$5', '€', '…', '文字', '\uD800', '\uDC00', 'ẞ', 'ΐ', 'և', 'ǆ', 'ﷺ', '㎒', '℀', '¨', '①', '﹏'];
const SEP_BEFORE = [' ', ' (', ': ', '\n', ' — ', '　', ' "'];
const SEP_AFTER = [' ', ',', '.', ')', '\n', ';', ' —', '"'];
const filler = () => Array.from({ length: Math.floor(rnd() * 4) }, () => pick(WEIRD)).join(' ');
const nameVariant = () => {
  let out = ''; const feats = new Set<string>(); const letters = [...'ZEPHYRA'];
  letters.forEach((c, i) => {
    const k = rnd();
    if (k < 0.3) out += c; else if (k < 0.5) out += c.toLowerCase();
    else if (k < 0.8 && rev[c]) { out += pick(rev[c]!); feats.add('lookalike'); }
    else { out += pick(nfkcForms(c)); feats.add('nfkc'); }
    if (rnd() < 0.08) { out += pick(MARK); feats.add('mark'); }
    if (i < letters.length - 1 && rnd() < 0.1) { out += pick(INV); feats.add('invisible'); }
    if (i >= 1 && i < letters.length - 2 && rnd() < 0.04) { out += pick(['-', '’', '·', '‧']); feats.add('joiner'); }
  });
  return { out, feats: [...feats].sort().join('+') || 'plain' };
};
const ZEROS = [0x30, 0x0660, 0x0966, 0xFF10, 0x1D7CE, 0x104A0, 0x1E950, 0x06F0, 0x0E50];
const ssnVariant = () => { let out = ''; [...'900-12-3456'].forEach((c) => { if (c === '-') { out += pick(['-', '-', '–', ' ', '.']); } else { out += String.fromCodePoint(pick(ZEROS) + Number(c)); if (rnd() < 0.08) out += pick(INV); } }); return out; };
const unbr = (s: string) => s.normalize('NFKC').replace(/[[\]]/g, (b) => (b === '[' ? '(' : ')'));
const stats: Record<string, number> = {}; const lines: string[] = []; const seen = new Set<string>();
for (let i = 0; i < runs; i += 1) {
  const isName = rnd() < 0.7;
  const v = isName ? nameVariant() : { out: ssnVariant(), feats: 'ssn' };
  const pre = filler() + pick(SEP_BEFORE); const post = pick(SEP_AFTER) + filler();
  const text = pre + v.out + post;
  const o = outcome(H, text, P1, C1);
  const ph = isName ? '[PATIENT_NAME]' : '[SSN]';
  let kind: string;
  if (o.threw !== null) kind = 'THREW';
  else if (o.sent === unbr(pre) + ph + unbr(post)) kind = 'ok';
  else if (o.sent.includes(unbr(v.out))) kind = o.refused ? 'unread-refused' : 'UNREAD-SENT';
  else if (unbr(text) !== unbr(pre) + unbr(v.out) + unbr(post)) kind = 'nfkc-joins-neighbours';
  else { const a = unbr(pre); const z = unbr(post); const mid = o.sent.startsWith(a) && o.sent.endsWith(z) ? o.sent.slice(a.length, o.sent.length - z.length) : null; kind = mid === null ? (o.refused ? "ends-differ-refused" : "ENDS-DIFFER-SENT") : /[\p{L}\p{N}]/u.test(mid.replace(/\[(?:PATIENT_NAME|SSN|PHONE)\]/g, "")) ? (o.refused ? "letter-left-refused" : "LETTER-LEFT-SENT") : "mark-or-invisible-left"; }
  const key = `${kind} ${v.feats}`; stats[key] = (stats[key] ?? 0) + 1;
  if (kind !== 'ok' && kind !== 'nfkc-joins-neighbours' && !seen.has(key) ) { seen.add(key); if (lines.length < 28) lines.push(`${key}: ${show(text, 90)} => ${o.threw ?? show(o.sent, 90)}`); }
  else if ((kind === 'OTHER-SPAN-SENT' || kind === 'THREW') && lines.length < 40) lines.push(`${key}: ${show(text, 90)} => ${o.threw ?? show(o.sent, 90)}`);
}
for (const l of lines) console.log(l);
console.log(JSON.stringify(stats));
