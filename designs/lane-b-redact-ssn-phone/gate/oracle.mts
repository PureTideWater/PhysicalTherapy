// The gate's oracle, independent of either tree: where the call's own identifiers, SSNs and phones are written in a letter
// (auto-annotation for letters that carry no generator metadata), and what kind of must-stay token a changed character
// belongs to. Synthetic data only.

export type Occ = [kind: string, at: number, len: number];
export interface Patient { names: readonly string[]; datesOfBirth: readonly string[]; memberIds: readonly string[] }
export interface Claim { claimNumbers: readonly string[] }

/** The letter as redaction reads it: NFKC, its own square brackets made parentheses (same positions). */
export const unbracketed = (text: string) => text.normalize('NFKC').replace(/[[\]]/g, (b) => (b === '[' ? '(' : ')'));

const IGNORABLE = /[­​-‍⁠﻿]/;
const LETTER = /\p{L}/u;
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const ND = /\p{Nd}/u;
const ZEROS = [0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xe50, 0xed0, 0xf20, 0x1040, 0x17e0, 0x1810, 0xff10];
export function digitValue(ch: string): number {
  const cp = ch.codePointAt(0)!;
  for (const z of ZEROS) if (cp >= z && cp <= z + 9) return cp - z;
  return -1;
}
const isDigit = (ch: string | undefined) => ch !== undefined && ND.test(ch);
const isLetter = (ch: string | undefined) => ch !== undefined && LETTER.test(ch);

/** One base letter per UTF-16 unit, lower case (accents dropped), so positions stay. */
function folded(text: string): string {
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    const code = ch.charCodeAt(0);
    if (code >= 0xd800 && code <= 0xdfff) { out += ch; continue; }
    const base = ch.normalize('NFD')[0] ?? ch;
    out += base.toLowerCase()[0] ?? ch;
  }
  return out;
}

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const LABEL_BEFORE = /(?:dear|ms|mr|mrs|dr|patient|re|member|for|name|paid|seen)\W{0,3}$/i;

function dobPatterns(iso: string): RegExp[] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return [];
  const [, y4, mm, dd] = m as unknown as [string, string, string, string];
  const y2 = y4.slice(2);
  const M = `0?${String(Number(mm))}`;
  const D = `0?${String(Number(dd))}`;
  const Y = `(?:${y4}|['’]?${y2})`;
  const S = `[\\/\\-.\\s_|\\\\–−]{1,3}`;
  const word = MONTHS[Number(mm) - 1]!;
  const W = `(?:${word.charAt(0)}${word.slice(1).toLowerCase()}|${word}|${word.toLowerCase()}|${MON[Number(mm) - 1]!.replace(/^./, (c) => `[${c}${c.toUpperCase()}]`)}\\.?|${MON[Number(mm) - 1]!.toUpperCase()}\\.?)`;
  const ORD = `(?:st|nd|rd|th)?`;
  return [
    new RegExp(`(?<!\\d)${M}${S}${D}${S}${Y}`, 'g'),
    new RegExp(`(?<!\\d)${D}${S}${M}${S}${Y}`, 'g'),
    new RegExp(`${y4}${S}${M}${S}${D}(?!\\d)`, 'g'),
    new RegExp(`${y4}${mm}${dd}|${mm}${dd}${y4}`, 'g'),
    new RegExp(`${W}\\s{0,2}${D}${ORD},?\\s{0,2}${Y}`, 'g'),
    new RegExp(`(?<!\\d)${D}${ORD}\\s{0,2}(?:of\\s+)?${W},?\\s{0,2}${Y}`, 'g'),
    new RegExp(`(?<!\\d)${D}[-/]${W}[-/]${Y}`, 'g'),
  ];
}

/** Every SSN (900-xx-xxxx, or a leading 0/1 before it) and phone (NPA-555-xxxx, 555-xxxx) written in a run of digits. */
function numbersIn(text: string): Occ[] {
  const out: Occ[] = [];
  const RUN = /\p{Nd}(?:\p{Nd}|[ .,\-–—−()/+­​]{1,3}(?=\(?\p{Nd}))*/gu;
  for (const run of text.matchAll(RUN)) {
    const base = run.index!;
    const pos: number[] = [];
    const starts: boolean[] = [];
    let digits = '';
    let prevDigit = false;
    for (let i = 0; i < run[0].length; i += 1) {
      const v = digitValue(run[0][i]!);
      if (v >= 0) { pos.push(base + i); starts.push(!prevDigit); digits += String(v); prevDigit = true; } else prevDigit = false;
    }
    for (let k = 0; k < digits.length; k += 1) {
      if (!starts[k]) continue;
      const rest = digits.slice(k);
      let m: RegExpExecArray | null;
      let kind = '';
      let skip = 0;
      if ((m = /^1?[2-9]\d\d555\d{4}/.exec(rest))) kind = 'phone';
      else if ((m = /^555\d{7}/.exec(rest))) kind = 'phone';
      else if ((m = /^[01]?900\d{6}/.exec(rest))) { kind = 'ssn'; skip = m[0].length === 10 ? 1 : 0; }
      else if ((m = /^555\d{4}/.exec(rest))) kind = 'phone';
      if (m && kind) {
        const first = k + skip;
        const last = k + m[0].length - 1;
        out.push([kind, pos[first]!, pos[last]! - pos[first]! + 1]);
        k = last;
      }
    }
  }
  return out;
}

/** The planted digits a harness looked for (its own oracle), placed in the letter by its digits in order. */
function digitsAt(text: string, d: string): Occ | null {
  const pos: number[] = [];
  let digits = '';
  for (let i = 0; i < text.length; i += 1) { const v = digitValue(text[i]!); if (v >= 0) { pos.push(i); digits += String(v); } }
  const k = digits.indexOf(d);
  if (k < 0) return null;
  const kind = /^(?:1?[2-9]\d\d)?555\d{4}$|^555\d{7}$/.test(d) ? 'phone' : 'ssn';
  return [kind, pos[k]!, pos[k + d.length - 1]! - pos[k]! + 1];
}

/** Where the call's own identifiers, and SSNs and phones, are written in a letter with no generator metadata. */
export function annotate(normal: string, patient: Patient, claims: readonly Claim[], planted?: readonly string[]): Occ[] {
  const out: Occ[] = [];
  const fold = folded(normal);
  // Numbers: SSN and phone shapes, and the harness's own digits.
  out.push(...numbersIn(normal));
  for (const d of planted ?? []) { const o = digitsAt(normal, d); if (o && !out.some((x) => x[1] <= o[1] && o[1] < x[1] + x[2])) out.push(o); }
  // Member IDs and claim numbers, with a separator or an invisible character allowed between characters.
  const numbers: [string, string][] = [...patient.memberIds.map((v): [string, string] => ['member', v]), ...claims.flatMap((c) => c.claimNumbers.map((v): [string, string] => ['claim', v]))];
  for (const [kind, value] of numbers) {
    const compact = value.normalize('NFKC').replace(/[^\p{L}\p{N}]/gu, '');
    if (compact.length < 4) continue;
    const digitsOnly = /^\d+$/.test(compact);
    const re = new RegExp(`${digitsOnly ? '(?<!\\d)' : ''}${[...compact].map(esc).join('[\\s\\-.\\u00AD\\u200B]?')}${digitsOnly ? '(?!\\d)' : ''}`, 'giu');
    for (const m of normal.matchAll(re)) out.push([kind, m.index!, m[0].length]);
  }
  // Dates of birth in their written forms.
  for (const iso of patient.datesOfBirth) for (const re of dobPatterns(iso)) for (const m of normal.matchAll(re)) out.push(['dob', m.index!, m[0].length]);
  // Names: long parts anywhere (inside glued words too), short parts and initials only beside another part or a label.
  const parts = [...new Set(patient.names.flatMap((n) => n.normalize('NFKC').toUpperCase().split(/[\s,.\-'’]+/u)).filter((p) => p.length > 0))];
  const long = parts.filter((p) => [...p].length >= 4);
  const short = [...new Set([...parts.filter((p) => [...p].length <= 3), ...parts.map((p) => [...p][0]!)])];
  const accepted: [number, number][] = [];
  for (const part of long) {
    const re = new RegExp([...folded(part)].map(esc).join('[\\u00AD\\u200B-\\u200D\\u2060\\uFEFF]?'), 'g');
    for (const m of fold.matchAll(re)) {
      const at = m.index!;
      const len = m[0].length;
      if (MONTHS.includes(part)) {
        const after = normal.slice(at + len, at + len + 8);
        const before = normal.slice(Math.max(0, at - 8), at);
        if (/^\.?,?\s{0,2}\d{1,4}/.test(after) || /\d{1,2}(?:st|nd|rd|th)?\s{0,2}(?:of\s+)?$/i.test(before)) continue;
      }
      accepted.push([at, at + len]);
      out.push(['name', at, len]);
    }
  }
  const near = (s: number, e: number) => accepted.some(([as, ae]) => (ae <= s && s - ae <= 3 && !/[\p{L}\p{N}]/u.test(normal.slice(ae, s))) || (e <= as && as - e <= 3 && !/[\p{L}\p{N}]/u.test(normal.slice(e, as))));
  const candidates: [number, number, string][] = [];
  for (const part of short) {
    const fp = folded(part);
    let from = 0;
    for (;;) {
      const at = fold.indexOf(fp, from);
      if (at < 0) break;
      from = at + 1;
      const end = at + fp.length;
      if (accepted.some(([s, e]) => at < e && end > s)) continue;
      const prev = normal[at - 1];
      const next = normal[end];
      const leftOk = !isLetter(prev) || (LOWER.test(prev!) && UPPER.test(normal[at]!)) || accepted.some(([, e]) => e === at) || (UPPER.test(normal[at]!) && /(?:Dear|Ms|Mr|Mrs|Dr|PAID|Paid)$/.test(normal.slice(Math.max(0, at - 4), at)));
      const rightOk = (!isLetter(next) && !isDigit(next) && !(next !== undefined && IGNORABLE.test(next))) || (next !== undefined && UPPER.test(next) && LOWER.test(normal[end - 1]!)) || accepted.some(([s]) => s === end);
      if (leftOk && rightOk) candidates.push([at, end, fp.length === 1 ? 'initial' : 'name']);
    }
  }
  for (let pass = 0; pass < 3; pass += 1) {
    let added = false;
    for (const [s, e, kind] of candidates) {
      if (accepted.some(([as, ae]) => as === s && ae === e)) continue;
      const labeled = LABEL_BEFORE.test(normal.slice(Math.max(0, s - 10), s)) && (normal[s - 1] === undefined || !isLetter(normal[s - 1]) || UPPER.test(normal[s]!));
      const glued = accepted.some(([as, ae]) => ae === s || as === e);
      const pairShort = candidates.some(([s2, e2]) => (s2 !== s || e2 !== e) && ((e2 <= s && s - e2 <= 3 && !/[\p{L}\p{N}]/u.test(normal.slice(e2, s))) || (e <= s2 && s2 - e <= 3 && !/[\p{L}\p{N}]/u.test(normal.slice(e, s2)))));
      if (near(s, e) || glued || (kind === 'name' && (labeled || pairShort))) { accepted.push([s, e]); out.push([kind, s, e - s]); added = true; }
    }
    if (!added) break;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Must-stay classes of a changed character, by the whitespace token it is in.
const CODE_RES = [/(?:CO|PR|OA|PI|CR)-?\d{1,3}(?!\d)/g, /MA\d{2,3}(?!\d)/g, /(?<![A-Za-z])[A-V]\d{4}(?:[A-Z]{2})?(?!\d)/g, /(?<![A-Za-z])[A-TV-Z]\d{2}\.[A-Z0-9]{1,4}/g, /(?<![A-Za-z])[MN]\d{1,3}(?!\d)/g, /(?<!\d)\d{5}(?:-?(?:GP|GO|GN|KX|XU|XE|XS|XP|CQ|LT|RT|59|25|76|77))+/g, /(?<![\d.,/-])\d{5}(?![\d.,/-]?\d)/g];
const UNIT_RE = /\d+\s?(?:min|mins|minutes?|hrs?|hours?|units?|u)(?![a-z])/gi;
const AMOUNT_RES = [/\$\s?\d[\d,]*(?:\.\d+)?/g, /(?<![\d/])\d{1,3}(?:,\d{3})*\.\d{2}(?!\d)/g, /(?<![\d/])\d+\.\d{2}(?![\d/])/g];
const DATE_RES = [/\d{1,4}\s?[/.\-–−_|]\s?\d{1,2}\s?[/.\-–−_|]\s?['’]?\d{2,4}/g, /(?<![A-Za-z])(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)(?:uary|ruary|ch|il|e|y|ust|tember|ober|ember)?\.?(?![a-z])/gi, /\d{1,2}(?:st|nd|rd|th)/gi, /(?<!\d)(?:19|20)\d{2}(?!\d)/g];
const ID_RES = [/(?<!\d)\d{2}-\d{7}(?!\d)/g, /(?<!\d)\d{5}-\d{4}(?!\d)/g, /(?<!\d)\d{9,15}(?!\d)/g];
const REF_RES = [/[A-Za-z]+[-#:]?[A-Za-z]*\d[\w-]*/g, /#\d+/g, /\d+[A-Za-z]+\d*/g];
const MODIFIER = /^(?:GP|GO|GN|KX|XU|XE|XS|XP|59|25|CQ|LT|RT)[.,;]?$/;
const UNIT_WORD = /^(?:min|mins|minutes?|hrs?|hours?|units?)[.,;]?$/i;

const covers = (res: RegExp[], tok: string, rel: number) => res.some((re) => { re.lastIndex = 0; for (const m of tok.matchAll(re)) if (m.index! <= rel && rel < m.index! + m[0].length) return true; return false; });

export function classAt(normal: string, i: number, keep?: readonly Occ[]): string {
  if (keep) for (const [cls, at, len] of keep) if (at <= i && i < at + len) return cls;
  let s = i, e = i + 1;
  while (s > 0 && !/\s/u.test(normal[s - 1]!)) s -= 1;
  while (e < normal.length && !/\s/u.test(normal[e]!)) e += 1;
  const tok = normal.slice(s, e);
  const rel = i - s;
  const prevTok = normal.slice(0, s).trimEnd().split(/\s+/u).at(-1) ?? '';
  if (MODIFIER.test(tok) && /^\d{5}[.,;]?$/.test(prevTok)) return 'code';
  if (UNIT_WORD.test(tok) && /^\d+$/.test(prevTok)) return 'unit';
  if (covers([UNIT_RE], tok, rel)) return 'unit';
  if (covers(CODE_RES, tok, rel)) return 'code';
  if (covers(DATE_RES.slice(0, 1), tok, rel)) return 'date';
  if (covers(AMOUNT_RES, tok, rel)) return 'amount';
  if (covers(DATE_RES.slice(1), tok, rel)) return 'date';
  if (covers(ID_RES, tok, rel)) return 'id';
  if (covers(REF_RES, tok, rel)) return 'ref';
  if (isDigit(normal[i])) return 'number';
  return 'text';
}

/** Whether an SSN or phone word stands before 7 or more digits within 40 characters on its line: a fuzz letter of an SSN or phone the
 * generator wrote with no recorded position, or a must-stay row after a phone or contact sentence (the fail-safe class of review GATEWAY2-1). */
export function labeledNumber(normal: string): boolean {
  for (const m of normal.matchAll(/(?:SSN|S\.S\.N|Social Security|Soc\.? ?Sec|Phone|Tel\b|Tel\.|Telephone|Fax|Call|TTY|Contact|Cell|Mobile|Medicare|HICN)/giu)) {
    const after = normal.slice(m.index! + m[0].length, m.index! + m[0].length + 40).split(/\n\s*\n/u)[0]!;
    if ((after.match(/\p{Nd}/gu) ?? []).length >= 7) return true;
  }
  return false;
}
