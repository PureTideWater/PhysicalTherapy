// false-finds42.mts <base src> <docs dir>: Queues item 42's false finds on ordinary text, where no identifier is written.
//   (A) Numbers: for each real-shaped body (bodies42.mts, the patient's own numbers left out), every string of digits
//       a digits-only stored number would match with one or two inserted characters and not with none, by the same
//       walk as rules42.ts (a digit is taken, a number joiner is stepped over, an insertable character costs one). A
//       drawn number of L digits is refused on a letter with probability (distinct strings of length L) / (9 x 10^(L-1)).
//       Variants: any character; no amount or date punctuation (. , / :); no letters; neither.
//   (B) Names: each short or common surname and given name (bodies42.mts) against the bodies and against the
//       repository's own prose (docs/**/*.md: ordinary English with payer vocabulary, and code words in camel case),
//       by rules42.ts's own finders: glued anywhere, glued case-aware, and one or two inserted characters.
// Run from the gate's directory: node --import ./ts-resolve.mjs <this> <base src> <docs dir>
import fs from 'node:fs';
import path from 'node:path';
const [src, docs] = process.argv.slice(2) as [string, string];
const rules = await import(path.resolve(src, 'rules42.ts'));
const { BODIES, SURNAMES, GIVEN } = await import(new URL('./bodies42.mts', import.meta.url).href);
const plain = (body: string) => body.replace('{NAME}', 'the patient').replace(/\{(?:GIVEN|SURNAME)\}/g, 'Patient').replace(/\{(?:MEMBER|CLAIM)\}/g, 'on file').replace('{DOB}', 'on file');
const bodies: [string, string][] = BODIES.map(([name, body]: [string, string]) => [name, plain(body)]);

// ---- (A)
const JOINER = /^[\s\p{Pd}−⁃˗➖_|\\­'‘’ʼʹˊ′‵`~·‧∙⋅・•;"“”￼\p{Nl}\p{No}]$/u;
const WORD = /^[\p{L}\p{N}]$/u, DIGIT = /^\p{Nd}$/u, LETTER = /^\p{L}$/u;
const VARIANTS: Record<string, (ch: string) => boolean> = {
  'any character': () => true,
  'no . , / :': (ch) => !/^[.,/:]$/.test(ch),
  'no letter': (ch) => !LETTER.test(ch),
  'no letter, no . , / :': (ch) => !LETTER.test(ch) && !/^[.,/:]$/.test(ch),
  'letters only': (ch) => LETTER.test(ch),
};
function spelled(text: string, maxN: number, may: (ch: string) => boolean): Map<string, { n: number; w: string }> {
  const cps = [...text];
  const found = new Map<string, { n: number; w: string }>();
  for (let i = 0; i < cps.length; i += 1) {
    if (!DIGIT.test(cps[i]!) || (i > 0 && WORD.test(cps[i - 1]!))) continue;
    let run = '', n = 0;
    for (let j = i; j < cps.length; j += 1) {
      const ch = cps[j]!;
      if (DIGIT.test(ch)) {
        run += ch;
        if (n > 0 && (j + 1 >= cps.length || !WORD.test(cps[j + 1]!)) && run.length <= 14) { const had = found.get(run); if (had === undefined || had.n > n) found.set(run, { n, w: cps.slice(i, j + 1).join('') }); }
      } else if (JOINER.test(ch)) continue;
      else if (n < maxN && may(ch)) n += 1;
      else break;
    }
  }
  return found;
}
console.log('## (A) Digit strings a digits-only stored number would match on a real-shaped letter with no identifier in it');
console.log(`bodies ${bodies.length}, characters ${bodies.reduce((s, [, b]) => s + b.length, 0)}`);
for (const [variant, may] of Object.entries(VARIANTS)) for (const N of [1, 2]) {
  const perLength: Record<number, { strings: number; rate: number; ex: string[] }> = {};
  for (const [, body] of bodies) {
    const found = spelled(body, N, may), zero = spelled(body, 0, () => false);
    for (const [run, hit] of found) {
      if (zero.has(run)) continue;
      const L = run.length, cell = (perLength[L] ??= { strings: 0, rate: 0, ex: [] });
      cell.strings += 1; cell.rate += 1 / (9 * 10 ** (L - 1));
      if (cell.ex.length < 3) cell.ex.push(JSON.stringify(hit.w));
    }
  }
  console.log(`\n### ${variant}, up to ${N} inserted`);
  console.log('| digits | strings matched, all bodies | a drawn number refused, per letter (mean) | examples |\n|---|---|---|---|');
  for (let L = 3; L <= 12; L += 1) { const c = perLength[L] ?? { strings: 0, rate: 0, ex: [] }; console.log(`| ${L} | ${c.strings} | ${(c.rate / bodies.length).toExponential(2)} | ${c.ex.join(' ')} |`); }
}

// ---- (B)
const files: string[] = [];
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (e.name.endsWith('.md')) files.push(p); } };
walk(docs);
const prose = files.sort().map((f) => fs.readFileSync(f, 'utf8').normalize('NFKC')).join('\n\n');
const corpora: [string, string][] = [['real-shaped bodies', bodies.map(([, b]) => b).join('\n\n')], ['repository prose', prose]];
const names: string[] = [...new Set([...SURNAMES, ...GIVEN] as string[])];
console.log('\n## (B) Name words found in ordinary text that holds no name');
for (const [label, text] of corpora) {
  console.log(`\n### ${label}: ${text.length} characters${label === 'repository prose' ? `, ${files.length} files` : ''}; ${names.length} name words`);
  const ruleNames = ['glued, any case', 'glued, case-aware', 'inserted, 1', 'inserted, 1 or 2', 'inserted, 1, no letter', 'inserted, 1 or 2, no letter'] as const;
  const table: Record<string, Record<number, { names: Set<string>; finds: number; ex: Map<string, number> }>> = {};
  const lengths: Record<number, number> = {};
  for (const name of names) {
    const L = name.length; lengths[L] = (lengths[L] ?? 0) + 1;
    const P = { pseudonym: 'synthetic-patient-ff', names: [name], datesOfBirth: [], memberIds: [] };
    const note = (rule: string, written: string) => { const cell = ((table[rule] ??= {})[L] ??= { names: new Set(), finds: 0, ex: new Map() }); cell.names.add(name); cell.finds += 1; const key = `${name} in ${written}`; cell.ex.set(key, (cell.ex.get(key) ?? 0) + 1); };
    const token = (h: { start: number; end: number }) => { let a = h.start, b = h.end; while (a > 0 && WORD.test(text[a - 1]!)) a -= 1; while (b < text.length && WORD.test(text[b]!)) b += 1; return text.slice(a, b); };
    for (const h of rules.gluedHits(text, P, 2)) { note('glued, any case', token(h)); if (rules.caseAware(h)) note('glued, case-aware', token(h)); }
    for (const h of rules.storedInsertedHits(text, P, [], 2, 2)) {
      const letter = h.classes.includes('letter') || h.classes.includes('digit');
      const w = text.slice(h.start, h.end);
      note('inserted, 1 or 2', w); if (h.n === 1) note('inserted, 1', w);
      if (!letter) { note('inserted, 1 or 2, no letter', w); if (h.n === 1) note('inserted, 1, no letter', w); }
    }
  }
  for (const rule of ruleNames) {
    console.log(`\n#### ${rule}\n| letters in the name | names of that length | names with a find | finds | most frequent |\n|---|---|---|---|---|`);
    for (const L of Object.keys(lengths).map(Number).sort((a, b) => a - b)) {
      const cell = table[rule]?.[L];
      const top = cell ? [...cell.ex].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k} (${n})`).join('; ') : '';
      console.log(`| ${L} | ${lengths[L]} | ${cell?.names.size ?? 0} | ${cell?.finds ?? 0} | ${top} |`);
    }
  }
}
