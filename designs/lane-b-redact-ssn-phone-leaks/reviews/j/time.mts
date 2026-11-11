// node time.mts [only-prefix]: time of redactLetterForScreen + holdsIdentifier per letter, on head, before and base, one child
// process per (tree, family) with a cap, so a letter that does not return is named and the rest still runs.
// node time.mts child <tree> <file>: the child (prints "start" before a letter and "done" after it).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { load, patient, claims } from './lib.mts';

type L = { id: string; text: string };
if (process.argv[2] === 'child') {
  const R = await load(process.argv[3] as string);
  R.holdsIdentifier(R.redactLetterForScreen('Claim 97110 2 150.00 on 01/15/2026', patient, claims).text, patient, claims);
  for (const { id, text } of JSON.parse(fs.readFileSync(process.argv[4] as string, 'utf8')) as L[]) {
    process.stdout.write(`start\t${id}\n`);
    const t0 = performance.now();
    let out = '';
    try {
      const s = R.redactLetterForScreen(text, patient, claims);
      out = R.holdsIdentifier(s.text, patient, claims) ? 'REFUSED' : s.text === text ? 'same' : 'changed';
    } catch (e) {
      out = 'THROW ' + String(e).slice(0, 60);
    }
    process.stdout.write(`done\t${id}\t${(performance.now() - t0).toFixed(0)}\t${out}\n`);
  }
  process.exit(0);
}

const DIR = '/home/user/review-j/t';
fs.mkdirSync(DIR, { recursive: true });
const fams = new Map<string, L[]>();
const add = (fam: string, id: string, text: string) => {
  if (!fams.has(fam)) fams.set(fam, []);
  (fams.get(fam) as L[]).push({ id, text });
};
const NUMS = ['20260112345.01', '802-45-678901.50', '2026-0115-123-4567'];
// X: a "+" with a dash or "=" on both sides, between a listed noun and a word before the number (the noun stays inside NAMED_REACH = 120)
for (const n of [8, 12, 16, 18, 20, 22, 24, 26, 28, 50]) add('X1 "Claim "+"-+"xN+" Total 20260112345.01"', `N=${n}`, `Claim ${'-+'.repeat(n)} Total 20260112345.01`);
for (const n of [8, 16, 20, 22, 24, 26, 50]) add('X2 "Claim\\n"+"+-"xN+"+\\nTotal 20260112345.01"', `N=${n}`, `Claim\n${'+-'.repeat(n)}+\nTotal 20260112345.01`);
for (const n of [8, 16, 20, 22, 24, 26, 50]) add('X3 "Statement "+"=+"xN+"= see 802-45-678901.50"', `N=${n}`, `Statement ${'=+'.repeat(n)}= see 802-45-678901.50`);
for (const n of [4, 8, 12, 16, 20, 22, 24, 26, 28, 34]) add('X4 "Claim\\n+"+"--+"xN+"\\n| Line | 2026-0115-123-4567 |"', `N=${n}`, `Claim\n+${'--+'.repeat(n)}\n| Line | 2026-0115-123-4567 |`);
add('X5 the noun reaches (no word before the number)', '"Claim "+"-+"x50+" 20260112345.01"', `Claim ${'-+'.repeat(50)} 20260112345.01`);
add('X5 the noun reaches (no word before the number)', '"Claim\\n+"+"--+"x34+"\\n| 20260112345.01 |"', `Claim\n+${'--+'.repeat(34)}\n| 20260112345.01 |`);
add('X5 the noun reaches (no word before the number)', 'no noun: "Total "+"-+"x50+" paid 20260112345.01"', `Total ${'-+'.repeat(50)} paid 20260112345.01`);
// C: every connector and mixes, 40 to 108 characters (the noun inside the window) and 5,000 (outside it)
const UNITS: [string, string, string][] = [
  ['c1', '_', '_'], ['c1', '~', '~'], ['c1', '_~', '_~'], ['c1', '___~~~', '___~~~'], ['c1', '_-', '_-'], ['c1', '___-', '___-'], ['c1', '___sp', '___ '], ['c1', '~~~bar', '~~~|'],
  ['c2', 'box', '─'], ['c2', 'boxbar-sp', '│ '], ['c2', 'box_', '─_'], ['c2', 'box___', '─___'], ['c2', 'bar-sp', '| '], ['c2', 'blank', ' '], ['c2', 'tab', '\t'], ['c2', 'hash', '#'],
  ['c3', 'colon', ':'], ['c3', 'hash-colon-sp', '#: '], ['c3', 'nl', '\n'], ['c3', 'sp-nl', ' \n'], ['c3', 'nl-rule', '\n---'], ['c3', 'eq', '='], ['c3', 'star', '*'], ['c3', 'point', '.'],
  ['c4', '(S)', '(S)'], ['c4', '(S)sp', '(S) '], ['c4', 'sp-NO', ' NO'], ['c4', 'sp-ID.', ' ID.'], ['c4', 'NEL', '\u0085'], ['c4', 'quote', '"'], ['c4', 'comma-slash', ',/'], ['c4', 'words', ' NO IS LINE CODE ID NUMBERS NBR'],
  ['c5', '++', '++'], ['c5', 'sp+', ' +'], ['c5', '+bar', '+|'], ['c5', 'nl-blank-nl', '\n \n'], ['c5', 'rule-table', '|---+---|\n'], ['c5', 'box-table', '├──┼──┤\n'], ['c5', 'crlf', '\r\n'], ['c5', '_x2-dash', '__-'],
  ['p1', '+-', '+-'], ['p2', '-+', '-+'], ['p3', '+=', '+='], ['p4', '+-+sp', '+-+ '], ['p5', '-+-bar', '-+-|'], ['p6', '+-___', '+-___'], ['p7', '--+', '--+'], ['p8', '+--------', '+--------'],
];
for (const [group, name, u] of UNITS) {
  for (const len of [40, 80, 108, 5000]) {
    const run = u.repeat(Math.ceil(len / u.length)).slice(0, len);
    for (const [k, num] of NUMS.entries()) add(`C ${group}`, `${name}:${len}:word:${num}`, `Claim ${run} see ${num}`);
    add(`C ${group}`, `${name}:${len}:reach`, `Claim ${run} ${NUMS[0]}`);
    add(`C ${group}`, `${name}:${len}:two-nouns`, `Claim ${run.slice(0, len >> 1)} Policy ${run.slice(0, (len >> 1) - 8)} see ${NUMS[1]}`);
    add(`C ${group}`, `${name}:${len}:under-label`, `Phone Claim ${run} see 202 555 0123150.00`);
  }
}
// R: RULE_LINE and the two {0,8} classes on long tails
for (const len of [40, 100, 5000]) {
  add('R rule lines', `bars-and-corners:${len}`, `Claim\n${' |+'.repeat(Math.ceil(len / 3))}\n${NUMS[0]}`);
  add('R rule lines', `rule-mix:${len}`, `Claim\n${'-|+ =*_~─'.repeat(Math.ceil(len / 9))}\n${NUMS[0]}`);
  add('R rule lines', `marks-before:${len}`, `Claim${'.:#*),│'.repeat(Math.ceil(len / 7))}\n-----\n${'│| '.repeat(Math.ceil(len / 3))}${NUMS[0]}`);
  add('R rule lines', `blank-lines:${len}`, `Claim${' \n'.repeat(len >> 1)}No. ${NUMS[0]}`);
  add('R rule lines', `three-line-labels:${len}`, `${'Claim\nID\nNumber\n'.repeat(Math.ceil(len / 16))}${NUMS[0]}`);
}

const only = process.argv[2];
type Res = { ms: Map<string, string>; hung: string | null; err: string };
const runOne = (tree: string, idx: number, timeout: number) =>
  new Promise<Res>((resolve) => {
    const p = spawn(process.execPath, ['/home/user/review-j/time.mts', 'child', tree, `${DIR}/${idx}.json`], { timeout, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    p.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    p.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    p.on('close', () => {
      const ms = new Map<string, string>();
      let last: string | null = null;
      for (const row of out.split('\n')) {
        const f = row.split('\t');
        if (f[0] === 'start') last = f[1] as string;
        else if (f[0] === 'done') { ms.set(f[1] as string, `${f[2]}ms ${f[3]}`); last = null; }
      }
      resolve({ ms, hung: last, err: err.slice(-300) });
    });
  });
const TREES = ['head', 'before', 'base'];
const names = [...fams.keys()].filter((f) => only === undefined || f.startsWith(only));
const results = new Map<string, Res>();
const caps = new Map<string, number>();
const tasks: (() => Promise<void>)[] = [];
for (const fam of names) {
  const idx = [...fams.keys()].indexOf(fam);
  fs.writeFileSync(`${DIR}/${idx}.json`, JSON.stringify(fams.get(fam)));
  for (const tree of TREES) {
    const cap = fam.startsWith('X1') && tree === 'head' ? 45000 : 12000;
    caps.set(`${fam}|${tree}`, cap);
    tasks.push(async () => { results.set(`${fam}|${tree}`, await runOne(tree, idx, cap)); });
  }
}
const T0 = Date.now();
let next = 0;
await Promise.all([0, 1, 2].map(async () => {
  while (next < tasks.length) {
    const task = tasks[next] as () => Promise<void>;
    next += 1;
    await task();
  }
}));
for (const fam of names) {
  const letters = fams.get(fam) as L[];
  const res = TREES.map((tree) => results.get(`${fam}|${tree}`) as Res);
  const cell = (r: Res, tree: string, id: string) => r.ms.get(id) ?? (r.hung === id ? `NO RETURN in ${(caps.get(`${fam}|${tree}`) as number) / 1000}s (killed)` : 'not run');
  const max = res.map((r) => Math.max(0, ...[...r.ms.values()].map((v) => Number.parseInt(v, 10))));
  console.log(`\n## ${fam}: ${letters.length} letters; slowest that returned: head ${max[0]}ms, before ${max[1]}ms, base ${max[2]}ms${res.map((r, i) => (r.err && r.ms.size === 0 ? ` ${TREES[i]} ERR ${r.err}` : '')).join('')}`);
  for (const { id } of letters) {
    const cells = res.map((r, i) => cell(r, TREES[i] as string, id));
    const slow = cells.some((c) => c.startsWith('NO RETURN') || Number.parseInt(c, 10) >= 150);
    const differ = cells[0]?.split(' ').slice(1).join(' ') !== cells[1]?.split(' ').slice(1).join(' ');
    if (fam.startsWith('X') || slow || (differ && !cells.some((c) => c === 'not run'))) console.log(`  ${id}: head ${cells[0]} | before ${cells[1]} | base ${cells[2]}`);
  }
}
console.log(`\ntotal ${((Date.now() - T0) / 1000).toFixed(0)}s`);
