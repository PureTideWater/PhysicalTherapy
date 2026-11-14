// rules42.ts: Queues item 42's candidate rules, a measuring prototype only (outside packages/; laid beside the base's
// reader as redact-core.ts by lay42.sh). Two finders over the NFKC text with square brackets written as parentheses
// (the coordinates of the reader's redactionSpans):
//   insertedHits  a stored member ID, claim number, name word or date of birth written with 1..N inserted characters
//                 (mechanism 1), and by the "deletion reading" a Social Security or phone number the reader's own
//                 patterns read once 1..N characters between its digits are taken out;
//   gluedHits     a stored name word inside a longer run of letters and digits (mechanism 2).
// Each hit carries what the census needs to tabulate every candidate and floor from one pass.
import * as core from './redact-core';

export type P = Parameters<typeof core.redactLetter>[1];
export type C = Parameters<typeof core.redactLetter>[2];
export interface Hit {
  rule: 'ins' | 'glue';
  kind: 'member' | 'claim' | 'name' | 'dob' | 'ssn' | 'phone';
  start: number;
  end: number;
  /** Letters and digits of the identifier (the floor reads this). */
  len: number;
  /** Inserted characters (ins) or 0 (glue). */
  n: number;
  /** The inserted characters' classes (ins); for glue: the class of the character before and after. */
  classes: string[];
  value: string;
  /** glue: the written word's case, UPPER, Capital, lower or mixed. */
  shape?: string;
  /** glue: which side holds a letter or digit: before, after or both. */
  side?: string;
  /** glue: lower, upper, letter (no case), digit, or none for each side. */
  before?: string;
  after?: string;
  digitsOnly?: boolean;
}

const NUMBER_JOINER = /^[\s\p{Pd}−⁃˗➖_|\\­'‘’ʼʹˊ′‵`~·‧∙⋅・•;"“”￼\p{Nl}\p{No}]$/u;
const NEAR_LETTER = /^[./:#(]$/u;
const NAME_JOINER = /^[\p{Pd}−⁃'‘’ʼʹˊ`´_­·‧∙⋅•]$/u;
const DATE_GAP = /^[\s/\\.,\p{Pd}−⁃_|]$/u;
const WORD = /^[\p{L}\p{N}]$/u;
const LETTER = /^\p{L}$/u;
const DIGIT = /^\p{Nd}$/u;
const IGNORABLE = /^\p{Default_Ignorable_Code_Point}$/u;
const SPACE = /^\s$/u;
const PLACEHOLDER = /\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_[1-9]\d*)\]/g;

export function classOf(ch: string): string {
  if (/^[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}]$/u.test(ch) && !/^[\p{L}\p{N}#*]$/u.test(ch) && ch.codePointAt(0)! > 0xff) return 'emoji';
  if (LETTER.test(ch)) return 'letter';
  if (DIGIT.test(ch)) return 'digit';
  if (/^\p{N}$/u.test(ch)) return 'number';
  if (/^\p{M}$/u.test(ch)) return 'mark';
  if (/^\p{Sc}$/u.test(ch)) return 'currency';
  if (/^\p{S}$/u.test(ch)) return 'symbol';
  if (/^\p{P}$/u.test(ch)) return 'punctuation';
  if (/^[\p{Z}\s]$/u.test(ch)) return 'space';
  return 'control';
}

interface Cp { ch: string; up: string; at: number }
interface Target { kind: Hit['kind']; chars: string[]; digitsOnly: boolean; value: string }

function codePoints(text: string): Cp[] {
  const out: Cp[] = [];
  let at = 0;
  for (const ch of text) { out.push({ ch, up: ch.toUpperCase(), at }); at += ch.length; }
  return out;
}
const compact = (value: string): string[] => [...value.normalize('NFKC').toUpperCase()].filter((ch) => WORD.test(ch));

/** The stored identifiers as targets: each member ID and claim number, each name word, each written form of each date of birth. */
export function targetsOf(patient: P, claims: C, minLen = 3): Target[] {
  const out: Target[] = [];
  const seen = new Set<string>();
  const push = (kind: Hit['kind'], chars: string[], value: string) => {
    const key = `${kind}:${chars.join('')}`;
    if (chars.length < minLen || seen.has(key)) return;
    seen.add(key);
    out.push({ kind, chars, digitsOnly: chars.every((ch) => DIGIT.test(ch)), value });
  };
  for (const id of patient.memberIds) push('member', compact(id), id);
  for (const claim of claims) for (const number of claim.claimNumbers) push('claim', compact(number), number);
  for (const name of patient.names) for (const word of name.normalize('NFKC').split(/[\s,;/]+/u)) push('name', compact(word), word);
  for (const iso of patient.datesOfBirth) for (const form of core.dateForms(iso)) push('dob', compact(form), form);
  return out;
}

function free(c: Cp, target: Target, k: number): boolean {
  if (IGNORABLE.test(c.ch)) return true;
  if (target.kind === 'name') return NAME_JOINER.test(c.ch);
  if (target.kind === 'dob') return DATE_GAP.test(c.ch);
  if (NUMBER_JOINER.test(c.ch)) return true;
  return NEAR_LETTER.test(c.ch) && (LETTER.test(target.chars[k - 1]!) || LETTER.test(target.chars[k]!));
}
function insertable(c: Cp, target: Target): boolean {
  if (c.ch <= '\u0003') return false;
  if (target.kind === 'name') return !SPACE.test(c.ch);
  if (target.kind === 'dob' || target.digitsOnly) return !DIGIT.test(c.ch);
  return true;
}

/** From cps[i], the target's characters from k on, with at most `budget` inserted characters; the end index or -1. */
function walk(cps: Cp[], barrier: Uint8Array, i: number, k: number, budget: number, target: Target, ins: number[]): number {
  for (;;) {
    if (k === target.chars.length) return i >= cps.length || !WORD.test(cps[i]!.ch) ? i : -1;
    if (i >= cps.length || barrier[i]) return -1;
    const c = cps[i]!;
    if (c.up === target.chars[k] || c.ch === target.chars[k]) {
      const end = walk(cps, barrier, i + 1, k + 1, budget, target, ins);
      if (end >= 0) return end;
    }
    if (free(c, target, k)) { i += 1; continue; }
    if (budget > 0 && insertable(c, target)) {
      ins.push(i);
      const end = walk(cps, barrier, i + 1, k, budget - 1, target, ins);
      if (end >= 0) return end;
      ins.pop();
    }
    return -1;
  }
}

function barriers(text: string, cps: Cp[]): Uint8Array {
  const units = new Uint8Array(text.length + 1);
  for (const m of text.matchAll(PLACEHOLDER)) units.fill(1, m.index, m.index + m[0].length);
  const out = new Uint8Array(cps.length);
  cps.forEach((c, i) => { out[i] = units[c.at]!; });
  return out;
}

/** Mechanism 1 over the stored identifiers: every start where the identifier is read with 1..maxN inserted characters and not with none. */
export function storedInsertedHits(text: string, patient: P, claims: C, maxN = 2, minLen = 3): Hit[] {
  const cps = codePoints(text);
  const barrier = barriers(text, cps);
  const hits: Hit[] = [];
  for (const target of targetsOf(patient, claims, minLen)) {
    const first = target.chars[0]!;
    for (let i = 0; i < cps.length; i += 1) {
      const c = cps[i]!;
      if ((c.up !== first && c.ch !== first) || barrier[i] || (i > 0 && WORD.test(cps[i - 1]!.ch))) continue;
      for (let budget = 0; budget <= maxN; budget += 1) {
        const ins: number[] = [];
        const end = walk(cps, barrier, i + 1, 1, budget, target, ins);
        if (end < 0) continue;
        if (budget > 0) {
          const inserted = ins.map((at) => cps[at]!.ch);
          hits.push({ rule: 'ins', kind: target.kind, start: c.at, end: end < cps.length ? cps[end]!.at : text.length, len: target.chars.length, n: inserted.length, classes: inserted.map(classOf), value: target.value, digitsOnly: target.digitsOnly });
        }
        break;
      }
    }
  }
  return hits;
}

const SHAPE = /^[\s\-.()+/,:]$/u;
/**
 * The deletion reading for what the reader reads by pattern: each run of 1..maxN characters that are no digit, no
 * white space and no shape punctuation, with a digit within two characters on each side, is taken out (every such
 * run at once, then alone where a span holds more than maxN); a Social Security or phone span the reader then reads
 * over a taken-out run, where it read none before, is a hit.
 */
export function patternInsertedHits(text: string, patient: P, claims: C, maxN = 2): Hit[] {
  const cps = codePoints(text);
  const barrier = barriers(text, cps);
  const digitNear = (i: number, step: number): boolean => {
    for (let d = 1; d <= 3; d += 1) {
      const c = cps[i + d * step];
      if (c === undefined || barrier[i + d * step]) return false;
      if (DIGIT.test(c.ch)) return true;
      if (!SHAPE.test(c.ch) || d === 3) return false;
    }
    return false;
  };
  const foreign = (i: number) => !barrier[i] && !DIGIT.test(cps[i]!.ch) && !SHAPE.test(cps[i]!.ch) && cps[i]!.ch > '\u0003';
  const sites: { from: number; to: number }[] = [];
  for (let i = 0; i < cps.length; i += 1) {
    if (!foreign(i)) continue;
    let j = i;
    while (j + 1 < cps.length && foreign(j + 1)) j += 1;
    if (j - i + 1 <= maxN && digitNear(i, -1) && digitNear(j, 1)) sites.push({ from: i, to: j });
    i = j;
  }
  if (sites.length === 0) return [];
  const before = core.redactionSpans(text, patient, claims).spans as readonly { start: number; end: number; placeholder: string }[];
  const covered = (at: number) => before.some((s) => s.start <= at && at < s.end);
  const open = sites.filter((s) => !covered(cps[s.from]!.at));
  const hits: Hit[] = [];
  const tryOut = (chosen: typeof sites, final: boolean): void => {
    // The text with the chosen runs taken out, and for each the index where it stood.
    let out = '';
    const cuts: number[] = [];
    let k = 0;
    for (let i = 0; i < cps.length; i += 1) {
      if (k < chosen.length && i === chosen[k]!.from) { cuts.push(out.length); i = chosen[k]!.to; k += 1; continue; }
      out += cps[i]!.ch;
    }
    for (const span of core.redactionSpans(out, patient, claims).spans as readonly { start: number; end: number; placeholder: string }[]) {
      if (span.placeholder !== '[SSN]' && span.placeholder !== '[PHONE]') continue;
      const inside = chosen.filter((_, n) => cuts[n]! > span.start && cuts[n]! < span.end);
      if (inside.length === 0) continue;
      const n = inside.reduce((sum, s) => sum + s.to - s.from + 1, 0);
      if (n > maxN) { if (!final) for (const s of inside) tryOut([s], true); continue; }
      const start = cps[inside[0]!.from]!.at - (cuts[chosen.indexOf(inside[0]!)]! - span.start);
      const last = inside[inside.length - 1]!;
      const end = Math.min(text.length, cps[last.to]!.at + cps[last.to]!.ch.length + (span.end - cuts[chosen.indexOf(last)]!));
      const classes = inside.flatMap((s) => cps.slice(s.from, s.to + 1).map((c) => classOf(c.ch)));
      if (!hits.some((h) => h.start === start && h.end === end)) hits.push({ rule: 'ins', kind: span.placeholder === '[SSN]' ? 'ssn' : 'phone', start: Math.max(0, start), end, len: span.placeholder === '[SSN]' ? 9 : 10, n, classes, value: '', digitsOnly: true });
    }
  };
  if (open.length > 0) tryOut(open, false);
  return hits;
}

const caseOf = (ch: string | undefined): string => (ch === undefined || !WORD.test(ch) ? 'none' : DIGIT.test(ch) || /^\p{N}$/u.test(ch) ? 'digit' : ch !== ch.toLowerCase() ? 'upper' : ch !== ch.toUpperCase() ? 'lower' : 'letter');
/**
 * Mechanism 2: each stored name word written whole inside a run of letters and digits with a letter or digit on at
 * least one side (marks and default-ignorable characters between the word and its neighbour are stepped over).
 */
export function gluedHits(text: string, patient: P, minLen = 2): Hit[] {
  const cps = codePoints(text);
  const barrier = barriers(text, cps);
  const hits: Hit[] = [];
  const words = new Map<string, string>();
  for (const name of patient.names) for (const word of name.normalize('NFKC').split(/[\s,;/]+/u)) { const c = compact(word); if (c.length >= minLen) words.set(c.join(''), word); }
  const skip = (i: number, step: number) => { while (cps[i] !== undefined && (/^\p{M}$/u.test(cps[i]!.ch) || IGNORABLE.test(cps[i]!.ch))) i += step; return i; };
  for (const [word, value] of words) {
    const chars = [...word];
    for (let i = 0; i + chars.length <= cps.length; i += 1) {
      let ok = true;
      for (let k = 0; k < chars.length && ok; k += 1) ok = !barrier[i + k] && cps[i + k]!.up === chars[k];
      if (!ok) continue;
      const b = skip(i - 1, -1), a = skip(i + chars.length, 1);
      const before = b >= 0 && !barrier[b] ? caseOf(cps[b]?.ch) : 'none', after = a < cps.length && !barrier[a] ? caseOf(cps[a]?.ch) : 'none';
      if (before === 'none' && after === 'none') continue;
      const written = cps.slice(i, i + chars.length).map((c) => c.ch).join('');
      const shape = written === written.toUpperCase() ? 'UPPER' : written === written.toLowerCase() ? 'lower' : written[0] !== written[0]!.toLowerCase() && written.slice(1) === written.slice(1).toLowerCase() ? 'Capital' : 'mixed';
      hits.push({ rule: 'glue', kind: 'name', start: cps[i]!.at, end: i + chars.length < cps.length ? cps[i + chars.length]!.at : text.length, len: chars.length, n: 0, classes: [], value, shape, side: before !== 'none' && after !== 'none' ? 'both' : before !== 'none' ? 'before' : 'after', before, after });
    }
  }
  return hits;
}

/** The case-aware glued match: an all-capitals or capitalised name word right after a lower-case letter, a boundary after it. */
export const caseAware = (h: Hit) => h.rule === 'glue' && h.side === 'before' && h.before === 'lower' && (h.shape === 'UPPER' || h.shape === 'Capital');

export interface Rule { ins: 0 | 1 | 2; insFloor: number; nameInsFloor: number; glue: 'none' | 'case' | 'any'; glueFloor: number; act: 'refuse' | 'replace' }
/** The rule read from RULE42 ("ins=1,insFloor=5,nameInsFloor=5,glue=case,glueFloor=4,act=refuse"). */
export function ruleOf(spec: string): Rule {
  const rule: Rule = { ins: 0, insFloor: 5, nameInsFloor: 5, glue: 'none', glueFloor: 4, act: 'refuse' };
  for (const pair of spec.split(',')) { const [k, v] = pair.split('='); (rule as unknown as Record<string, unknown>)[k!] = /^\d+$/.test(v!) ? Number(v) : v; }
  return rule;
}
const PLACE: Record<string, string> = { member: '[MEMBER_ID]', claim: '[MEMBER_ID]', name: '[PATIENT_NAME]', dob: '[DATE_OF_BIRTH]', ssn: '[SSN]', phone: '[PHONE]' };
export const placeholderOf = (h: Hit) => PLACE[h.kind]!;
/** A rule's hits on a text, largest first where two overlap. */
export function hitsOf(rule: Rule, text: string, patient: P, claims: C): Hit[] {
  const hits: Hit[] = [];
  if (rule.ins > 0) {
    for (const h of storedInsertedHits(text, patient, claims, rule.ins, Math.min(rule.insFloor, rule.nameInsFloor))) if (h.len >= (h.kind === 'name' ? rule.nameInsFloor : rule.insFloor)) hits.push(h);
    hits.push(...patternInsertedHits(text, patient, claims, rule.ins));
  }
  if (rule.glue !== 'none') for (const h of gluedHits(text, patient, rule.glueFloor)) if (rule.glue === 'any' || caseAware(h)) hits.push(h);
  hits.sort((x, y) => x.start - y.start || y.end - x.end);
  const kept: Hit[] = [];
  for (const h of hits) if (kept.length === 0 || h.start >= kept[kept.length - 1]!.end) kept.push(h);
  return kept;
}
export const normalOf = (text: string) => text.normalize('NFKC').replace(/[[\]]/g, (b) => (b === '[' ? '(' : ')'));
