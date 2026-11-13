// Source patches that make each candidate out of the base's redact.ts (4d40557f), so that all are timed and compared in
// one harness. Prototypes for measuring, not the build: each patch asserts that it applied. Synthetic data only.
//
//   base     the base as merged.
//   viewmap  the check's store of views (viewOf) a Map by (key, text) in place of an array searched from the front:
//            G-1's square (numberForm asks viewOf once per identifier, each ask scanned every view stored so far).
//   cache    viewmap + "patterns kept per process": every per-form pattern the readers build is taken from a Map by
//            (source, flags) held for the process, lastIndex reset.
//   ac       viewmap + "one pass over a prepared set": the letter's view cut to its letters and digits (the skeleton),
//            one Aho-Corasick automaton over the forms' compacts built per call, and each form's own pattern run
//            sticky only at the places its compact starts in the skeleton (kept per process by source).
//   aclazy   ac + patternOf builds no RegExp: a form holds its source and flags, compiled only when a place needs it.
//   acproc   aclazy + the automaton kept per process, keyed by the forms' compacts.
//   acnokeep aclazy with nothing held past the check: the sticky patterns' store emptied when the entry returns.
type Patch = [string | RegExp, string, number?];
function apply(src: string, patches: Patch[], name: string): string {
  for (const [from, to, times = 1] of patches) {
    const count = typeof from === 'string' ? src.split(from).length - 1 : (src.match(new RegExp(from.source, from.flags.includes('g') ? from.flags : from.flags + 'g')) ?? []).length;
    if (count !== times) throw new Error(`${name}: patch found ${count} times, not ${times}: ${String(from).slice(0, 80)}`);
    src = typeof from === 'string' ? src.split(from).join(to) : src.replace(from, to);
  }
  return src;
}
const VIEWMAP: Patch[] = [
  ["let viewsOfCheck: ({ readonly normal: string; readonly key: string; readonly view: View } & Stored)[] | null = null;",
   "let viewsOfCheck: Map<string, { readonly normal: string; readonly key: string; readonly view: View } & Stored> | null = null;"],
  ["  const at = viewsOfCheck.findIndex((each) => each.key === key && each.normal === normal);\n  const known = viewsOfCheck[at];",
   "  const known = viewsOfCheck.get(`${key}\\u0000${normal}`);"],
  ["  viewsOfCheck[known === undefined ? viewsOfCheck.length : at] = { normal, key, view, cost: workSince(before), paid: storeScope };",
   "  viewsOfCheck.set(`${key}\\u0000${normal}`, { normal, key, view, cost: workSince(before), paid: storeScope });"],
  ["  viewsOfCheck = [];", "  viewsOfCheck = new Map();"],
];
const KEPT_REGEXP = `
// item 39 prototype: patterns kept per process, by (source, flags).
const item39Kept = new Map<string, RegExp>();
function item39KeptRegExp(source: string, flags: string): RegExp {
  const key = flags + '\\u0000' + source;
  let found = item39Kept.get(key);
  if (found === undefined) { found = new RegExp(source, flags); item39Kept.set(key, found); }
  found.lastIndex = 0;
  return found;
}
`;
const CACHE: Patch[] = [
  ["    const pattern = new RegExp(form.pattern.source, form.pattern.flags);", "    const pattern = item39KeptRegExp(form.pattern.source, form.pattern.flags);"],
  ["      const labeled = new RegExp(form.labeled.source, form.labeled.flags);", "      const labeled = item39KeptRegExp(form.labeled.source, form.labeled.flags);"],
  ["        const glued = new RegExp(`(?<=\\\\p{L})${source.source.slice(BEFORE.length)}`, source.flags);", "        const glued = item39KeptRegExp(`(?<=\\\\p{L})${source.source.slice(BEFORE.length)}`, source.flags);"],
  ["        return [...cores].some((core) => new RegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'u').test(text));", "        return [...cores].some((core) => item39KeptRegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'u').test(text));"],
  ["        const glued = new RegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'gu');", "        const glued = item39KeptRegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'gu');"],
];
const AC_CODE = `
// item 39 prototype: one pass over a prepared set. Synthetic data only.
export const item39Stats = { forms: 0, formsWithPlaces: 0, places: 0, regexRuns: 0, fallbacks: 0, automata: 0, dense: 0 };
const ITEM39_DENSE = Number(process.env.ITEM39_DENSE ?? '16');
const ITEM39_KEPT_CHAR = /^[\\p{L}\\p{N}]$/u;
const ITEM39_APOSTROPHE = /^[\\u02BC\\u02B9\\u02CA]$/u;
/** The text's letters and digits (as compactFolded keeps them), each with the index in the text where it starts. */
function item39Skeleton(text: string): { readonly points: string[]; readonly at: number[] } {
  const points: string[] = []; const at: number[] = [];
  for (let i = 0; i < text.length;) {
    const cp = String.fromCodePoint(text.codePointAt(i) as number);
    if (ITEM39_KEPT_CHAR.test(cp) && !ITEM39_APOSTROPHE.test(cp)) { points.push(cp); at.push(i); }
    i += cp.length;
  }
  return { points, at };
}
interface Item39Automaton { readonly next: Map<string, number>[]; readonly fail: number[]; readonly out: number[][]; readonly words: string[]; readonly lengths: number[] }
function item39Build(words: readonly string[]): Item39Automaton {
  item39Stats.automata += 1;
  const next: Map<string, number>[] = [new Map()]; const out: number[][] = [[]]; const lengths: number[] = [];
  words.forEach((word, w) => {
    let node = 0; const points = [...word]; lengths.push(points.length);
    for (const p of points) { let to = next[node]!.get(p); if (to === undefined) { to = next.length; next.push(new Map()); out.push([]); next[node]!.set(p, to); } node = to; }
    out[node]!.push(w);
  });
  const fail = new Array<number>(next.length).fill(0); const queue: number[] = [];
  for (const to of next[0]!.values()) queue.push(to);
  for (let h = 0; h < queue.length; h += 1) {
    const node = queue[h]!;
    for (const [p, to] of next[node]!) {
      let f = fail[node]!; while (f !== 0 && !next[f]!.has(p)) f = fail[f]!;
      const g = next[f]!.get(p); fail[to] = g !== undefined && g !== to ? g : 0;
      out[to] = out[to]!.concat(out[fail[to]!]!); queue.push(to);
    }
  }
  return { next, fail, out, words: [...words], lengths };
}
const item39Automata = new Map<string, Item39Automaton>();
function item39AutomatonOf(words: readonly string[]): Item39Automaton {
  if (!ITEM39_PER_PROCESS) return item39Build(words);
  const key = words.join('\\u0000');
  let found = item39Automata.get(key);
  if (found === undefined) { found = item39Build(words); item39Automata.set(key, found); }
  return found;
}
/** For each form compact present, the text indices where it starts, in increasing order. */
function item39Places(text: string, forms: readonly Form[]): Map<string, number[]> {
  const words = [...new Set(forms.map((form) => form.compact))].sort();
  const automaton = item39AutomatonOf(words);
  const { points, at } = item39Skeleton(text);
  const places = new Map<string, number[]>();
  let node = 0;
  for (let i = 0; i < points.length; i += 1) {
    const p = points[i]!;
    while (node !== 0 && !automaton.next[node]!.has(p)) node = automaton.fail[node]!;
    node = automaton.next[node]!.get(p) ?? 0;
    for (const w of automaton.out[node]!) {
      const word = automaton.words[w]!; const start = at[i - automaton.lengths[w]! + 1]!;
      let list = places.get(word); if (list === undefined) { list = []; places.set(word, list); }
      list.push(start);
    }
  }
  for (const list of places.values()) list.sort((a, b) => a - b);
  return places;
}
/** Whether a form's pattern can match only where its compact stands in the skeleton (else it is searched whole). */
function item39Prefilterable(form: Form): boolean {
  const ok = compactFolded(form.compact) === form.compact;
  if (!ok) item39Stats.fallbacks += 1;
  return ok;
}
/** A RegExp-shaped search that runs the pattern sticky at the given starts only: the same matches as a global exec. */
function item39Search(source: string, flags: string, starts: readonly number[] | undefined): { lastIndex: number; exec(text: string): RegExpExecArray | null } {
  return {
    lastIndex: 0,
    exec(text: string) {
      if (starts !== undefined) {
        let lo = 0; let hi = starts.length;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (starts[mid]! < this.lastIndex) lo = mid + 1; else hi = mid; }
        for (let i = lo; i < starts.length; i += 1) {
          const sticky = item39KeptRegExp(source, flags.replace('g', '') + 'y');
          sticky.lastIndex = starts[i]!; item39Stats.regexRuns += 1;
          const match = sticky.exec(text);
          if (match !== null) { this.lastIndex = match.index + match[0].length; return match; }
        }
      }
      this.lastIndex = 0;
      return null;
    },
  };
}
function item39SearchOf(form: Form, which: RegExp, places: Map<string, number[]>, prefix = ''): { lastIndex: number; exec(text: string): RegExpExecArray | null } {
  const source = prefix === '' ? which.source : prefix + which.source.slice(BEFORE.length);
  if (!item39Prefilterable(form)) { const whole = new RegExp(source, which.flags); return whole as never; }
  const starts = places.get(form.compact);
  // Dense places (a letter that writes a name part hundreds of times): one global scan, as the base runs it, is
  // cheaper than a sticky run at each place. Both find the same matches; only the cost differs.
  if (starts !== undefined && starts.length > ITEM39_DENSE) { item39Stats.dense += 1; return item39KeptRegExp(source, which.flags) as never; }
  return item39Search(source, which.flags, starts);
}
`;
const AC: Patch[] = [
  ["  const view = viewOf(normal, 'join');\n  const names: Range[] = [];\n  for (const form of forms) {\n    const pattern = new RegExp(form.pattern.source, form.pattern.flags);",
   "  const view = viewOf(normal, 'join');\n  const names: Range[] = [];\n  const item39 = item39Places(view.text, forms);\n  item39Stats.forms += forms.length; item39Stats.formsWithPlaces += forms.filter((f) => item39.has(f.compact)).length; item39Stats.places += [...item39.values()].reduce((s, l) => s + l.length, 0);\n  for (const form of forms) {\n    const pattern = item39SearchOf(form, form.pattern, item39);"],
  ["      const labeled = new RegExp(form.labeled.source, form.labeled.flags);", "      const labeled = item39SearchOf(form, form.labeled, item39);"],
  ["        const glued = new RegExp(`(?<=\\\\p{L})${source.source.slice(BEFORE.length)}`, source.flags);", "        const glued = item39SearchOf(form, source, item39, '(?<=\\\\p{L})');"],
  ["      const view = viewOf(normal, 'join');\n      const { text } = view;\n      if (hidden === undefined) {",
   "      const view = viewOf(normal, 'join');\n      const { text } = view;\n      const item39All = [...formsOf(subject), ...formsOf(subject, true)];\n      const item39Present = item39Places(text, item39All);\n      const live = new Set(item39All.filter((form) => !item39Prefilterable(form) || item39Present.has(form.compact)).flatMap(gluedCoresOf));\n      if (hidden === undefined) {"],
  ["        return [...cores].some((core) => new RegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'u').test(text));", "        return [...cores].some((core) => live.has(core) && item39KeptRegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'u').test(text));"],
  ["  const numbers = new Set(forms.map((form) => form.compact));\n", "  const numbers = new Set(forms.map((form) => form.compact));\n  const item39Present = item39Places(text, forms);\n"],
  ["    if (glued(core)) {\n      return true;\n    }\n    if (!marked) {", "    if ((!item39Prefilterable(form) || item39Present.has(form.compact)) && glued(core)) {\n      return true;\n    }\n    if (!marked) {"],
  ["      return [...cores].some((core) => {\n        const glued = new RegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'gu');", "      return [...cores].some((core) => {\n        if (!live.has(core)) return false;\n        const glued = item39KeptRegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'gu');"],
];
const LAZY_CODE = `
export const item39Lazy = { built: 0, escapedFallback: 0 };
/** The source V8 gives a RegExp of this text, without building one where the text needs no escaping (no "/" outside a class, no line terminator). */
function item39SourceOf(text: string): string {
  let inClass = false; let plain = true;
  for (let i = 0; i < text.length && plain; i += 1) {
    const c = text[i];
    if (c === '\\\\') { i += 1; continue; }
    if (c === '[') inClass = true; else if (c === ']') inClass = false;
    else if ((c === '/' && !inClass) || c === '\\n' || c === '\\r' || c === '\\u2028' || c === '\\u2029') plain = false;
  }
  if (plain && !process.env.ITEM39_CHECK_SOURCE) return text;
  item39Lazy.escapedFallback += plain ? 0 : 1;
  const built = new RegExp(text, 'gu').source;
  if (plain && built !== text) throw new Error('item39: lazy source differs');
  return built;
}
`;
const LAZY: Patch[] = [
  ["  return new RegExp(`${BEFORE}${characters.map((character, i) => `${escapeRegExp(character)}${gaps[i] ?? ''}`).join('')}${AFTER}`, 'gu');",
   "  return { source: item39SourceOf(`${BEFORE}${characters.map((character, i) => `${escapeRegExp(character)}${gaps[i] ?? ''}`).join('')}${AFTER}`), flags: 'gu' } as unknown as RegExp;"],
];
export function patched(src: string, variant: string): string {
  if (variant === 'base') return src;
  let out = apply(src, VIEWMAP, 'viewmap');
  if (variant === 'viewmap') return out;
  out += KEPT_REGEXP;
  if (variant === 'cache') return apply(out, CACHE, 'cache');
  const perProcess = variant === 'acproc';
  out = apply(out, AC, 'ac') + AC_CODE + `\nconst ITEM39_PER_PROCESS = ${String(perProcess)};\n`;
  if (variant === 'ac') return out;
  out = apply(out, LAZY, 'lazy') + LAZY_CODE;
  if (variant === 'aclazy' || variant === 'acproc') return out;
  if (variant === 'acnokeep') return apply(out, [["    formsOfCheck = null;\n    alikeOfWider = null;", "    formsOfCheck = null;\n    alikeOfWider = null;\n    item39Kept.clear();"]], 'nokeep');
  throw new Error(`unknown variant ${variant}`);
}
