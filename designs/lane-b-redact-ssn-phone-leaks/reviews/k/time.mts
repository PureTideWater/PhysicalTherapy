// node time.mts [family-prefix]: wall time of redactLetterForScreen + holdsIdentifier per letter on head, before and base;
// one child process per (family, tree) with a cap, so a letter that does not return is named. Each letter runs twice; the lower time counts.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { load, patient, claims } from './lib.mts';
type L = { id: string; text: string };
if (process.argv[2] === 'child') {
  const R = await load(process.argv[3] as string);
  for (const w of ['Claim 97110 2 150.00 on 01/15/2026', 'Claim No. 20260112345.01', 'Phone #: 900 77.3283150.00', '900-12-345601Jan 2020,150.00', 'Seq 90012345601Jan 2020', 'Service 01/01/2020-150.00 Paid\nClaim 802-456-78901']) R.holdsIdentifier(R.redactLetterForScreen(w, patient, claims).text, patient, claims);
  for (const { id, text } of JSON.parse(fs.readFileSync(process.argv[4] as string, 'utf8')) as L[]) {
    process.stdout.write(`start\t${id}\n`);
    let best = Infinity;
    let out = '';
    for (let k = 0; k < 2; k += 1) {
      const t0 = performance.now();
      try {
        const s = R.redactLetterForScreen(text, patient, claims);
        out = R.holdsIdentifier(s.text, patient, claims) ? 'REFUSED' : s.text === text ? 'same' : 'changed';
      } catch (e) {
        out = 'THROW ' + String(e).slice(0, 60);
      }
      best = Math.min(best, performance.now() - t0);
      if (best > 3000) break;
    }
    process.stdout.write(`done\t${id}\t${best.toFixed(1)}\t${out}\n`);
  }
  process.exit(0);
}
const DIR = '/home/user/review-k/t';
fs.mkdirSync(DIR, { recursive: true });
const fams = new Map<string, L[]>();
const add = (fam: string, id: string, text: string) => {
  if (!fams.has(fam)) fams.set(fam, []);
  (fams.get(fam) as L[]).push({ id, text });
};
const NUMS = ['20260112345.01', '802-45-678901.50', '900-12-3456150.00'];
const UNITS: [string, string][] = [['us', '_'], ['tilde', '~'], ['us-tilde', '_~'], ['us2-sp', '__ '], ['us3-sp', '___ '], ['us3-tilde3', '___~~~'], ['us3-bar', '___|'], ['dash', '-'], ['plus', '+'], ['dash-plus', '-+'], ['plus-dash', '+-'], ['eq', '='], ['eq-plus', '=+'], ['box', '─'], ['boxbar-sp', '│ '], ['bar', '|'], ['bar-sp', '| '], ['blank', ' '], ['tab', '\t'], ['hash', '#'], ['colon', ':'], ['hash-colon-sp', '#: '], ['(S)', '(S)'], ['(S)-sp', '(S) '], ['paren', '('], ['(S', '(S'], ['NO', 'NO '], ['ID', 'ID '], ['IS', 'IS'], ['IS-sp', 'IS '], ['NUMBERS', 'NUMBERS '], ['NUM', 'NUM '], ['lf', '\n'], ['crlf', '\r\n'], ['cr', '\r'], ['sp-lf', ' \n'], ['dot-sp', '. '], ['words', 'NO NOS NUMBER NBR NUM ID IS LINE CODE '], ['mix', '_~ -+=|#:(S)( NO ID IS\n___~~~'], ['quote', '"'], ['nel', '\u0085'], ['us3-(S)', '___(S)']];
UNITS.forEach(([name, u], i) => {
  const fam = `C${1 + Math.floor(i / 7)} connectors`;
  for (const len of [24, 60, 120, 5000]) {
    const run = u.repeat(Math.ceil(len / u.length)).slice(0, len);
    for (const num of NUMS) {
      add(fam, `${name}:${len}:word:${num}`, `Claim ${run} see ${num}`);
      add(fam, `${name}:${len}:reach:${num}`, `Claim ${run} ${num}`);
    }
    add(fam, `${name}:${len}:two-nouns`, `Claim ${run.slice(0, len >> 1)} Policy ${run.slice(0, Math.max(0, (len >> 1) - 8))} see ${NUMS[1]}`);
    add(fam, `${name}:${len}:under-label`, `Phone Claim ${run} see 202 555 0123150.00`);
    add(fam, `${name}:${len}:noun-run-noun-run`, `Claim${run}Claim${run}${NUMS[0]}`);
  }
});
for (const [name, u] of [['Claim', 'Claim '], ['ID', 'ID '], ['NO', 'NO '], ['ClaimNo', 'Claim No '], ['Remit', 'Remit Advice '], ['Remittance-sp', 'Remittance   '], ['PreAuth', 'Pre Auth '], ['OnFile', 'ON FILE '], ['TaxID', 'TAX ID '], ['Statement-lf', 'STATEMENT\n'], ['MemberID', 'Member ID: '], ['Claim(s)', 'Claim(s) '], ['File', 'File '], ['Remittance-lf3', 'Remittance\n\n\n'], ['RX', 'RX '], ['RX-glued', 'RX'], ['ClaimClaim', 'CLAIMCLAIM '], ['NoClaimNo', 'NO CLAIM NO ']] as const) {
  for (const n of [24, 120, 5000]) {
    for (const num of NUMS) {
      add('N nouns in a row', `${name}:${n}:reach:${num}`, `${u.repeat(n)}${num}`);
      add('N nouns in a row', `${name}:${n}:word:${num}`, `${u.repeat(n)}see ${num}`);
    }
  }
}
const LAB: [string, (n: number) => string][] = [['Phone No.xN', (n) => `Phone ${'No. '.repeat(n)}`], ['PhonexN', (n) => 'Phone '.repeat(n)], ['Phone #xN', (n) => `Phone ${'#'.repeat(n)} `], ['Phone :#xN', (n) => `Phone ${':#'.repeat(n)} `], ['Soc blanks Sec', (n) => `Soc${' '.repeat(n)}Sec `], ['Phone blanks', (n) => `Phone${' '.repeat(n)}`], ['SSN IDxN', (n) => `SSN ${'ID '.repeat(n)}`], ['S.S.N xN', (n) => 'S.S.N '.repeat(n)], ['Tel. No. #: xN', (n) => 'Tel. No. #: '.repeat(n)], ['Medicare ID No.xN', (n) => `Medicare ${'ID No. '.repeat(n)}`], ['Phone - xN', (n) => `Phone ${'- '.repeat(n)}`], ['Phone No. tabs', (n) => `Phone No.${'\t'.repeat(n)}`], ['S S xN N', (n) => `${'S S '.repeat(n)}N `], ['SOC. xN SEC', (n) => `${'SOC. '.repeat(n)}SEC `], ['Phone (xN', (n) => `Phone ${'('.repeat(n)}`], ['Phone lf xN', (n) => `Phone${'\n'.repeat(n)}`], ['Soc tabs Sec No', (n) => `Soc${'\t '.repeat(n)}Sec No. No. `], ['a number per label xN', (n) => 'Phone #: 250 75.123456 '.repeat(n)], ['SS# xN', (n) => 'SS# '.repeat(n)], ['HICN NUM xN', (n) => `HICN ${'NUM '.repeat(n)}`]];
for (const [name, f] of LAB) for (const n of [24, 120, 5000]) for (const num of ['900 77.3283150.00', '250 75.123456']) add('L label right before', `${name}:${n}:${num}`, `${f(n)}${num}`);
for (const n of [24, 120, 5000]) {
  const D: [string, string][] = [['01Jan xN', `900-12-3456${'01Jan '.repeat(n)}2020`], ['5Nov 2000.00 xN', `Row 366-535-1693${'5Nov 2000.00 '.repeat(n)}`], ['-September.xN', `90012345601${'-September.'.repeat(n)}, 2000.00`], ['12-September., 2020.00xN', `202-555-0123${'12-September., 2020.00'.repeat(n)}`], ['Seq ...Jan 2020,150.00 xN', 'Seq 90012345601Jan 2020,150.00 '.repeat(n)], ['JanJan xN', `900-12-345601${'JanJan'.repeat(n)} 2020`], ['Jan( ,)xN 2020', `900-12-345601Jan${' ,'.repeat(n)}2020`], ['2020(.00)xN', `900-12-345601Jan 2020${'.00'.repeat(n)}`], ['SSN 01Sept xN', `SSN 900.12 3456${'01Sept'.repeat(n)} 2020.00`]];
  for (const [name, text] of D) add('D dates after a number', `${name}:${n}`, text);
}
const fill = (line: string, size = 20000) => line.repeat(Math.ceil(size / line.length)).slice(0, size);
const HELD = 'Service 01/01/2020-150.00 Paid\n';
const LINES = [`Claim ${'-+'.repeat(20)} Total 20260112345.01\n`, 'Claim ___ ~~~ ___ see 802-45-678901.50\n', 'Phone #: 250 75.123456\n', 'Row 366-535-169012-September., 2000.00\n', 'Claim\nNumber\n20260112345.01\n', 'STATEMENT\n\nNo. 900-12-3456150.00\n', '| Claim | 20260112345.01 |\n', `Claim${' '.repeat(110)}20260112345.01\n`, 'Tel. No. #: 900 77.3283150.00\n', 'Member ID 900-12-3456150.00 Claim (S)(S)(S) NO ID IS 20260112345.01\n', `Claim ${'NO '.repeat(38)}x 20260112345.01\n`, 'Seq 90012345601Jan 2020,150.00 ', 'Medicare ID No. 110 32.74420 ', `Claim ${'_~'.repeat(30)} 802-456-78901\n`, `Claim ${'(S)'.repeat(36)} + 802-45-678901.50\n`, `Statement ${'___ '.repeat(26)}| see 900-12-3456150.00\n`];
LINES.forEach((line, i) => add(`W${1 + Math.floor(i / 4)} whole letters of 20,000 characters`, `line ${i}: ${JSON.stringify(line.slice(0, 44))}`, fill(line)));
LINES.forEach((line, i) => { if (i % 3 === 0) add('W5 held letters of 20,000 characters', `held + line ${i}: ${JSON.stringify(line.slice(0, 44))}`, HELD + fill(line)); });
add('W6 one run of 20,000 characters', 'Claim + 19,970 underscores + number', `Claim ${'_'.repeat(19970)} 20260112345.01`);
add('W6 one run of 20,000 characters', 'Claim + 9,985 "_~" + see number', `Claim ${'_~'.repeat(9985)} see 20260112345.01`);
add('W6 one run of 20,000 characters', 'Claim + 6,600 "(S)" + number', `Claim ${'(S)'.repeat(6600)} 802-45-678901.50`);
add('W6 one run of 20,000 characters', 'all 16 lines, mixed', fill(LINES.join('')));
add('W6 one run of 20,000 characters', '2,000 numbers, each under "Phone No. No.:"', fill('Phone No. No.: 900 77.3283150.00\n'));

const only = process.argv[2];
type Res = { ms: Map<string, string>; hung: string | null; err: string };
const CAP = 70000;
const runOne = (tree: string, idx: number) =>
  new Promise<Res>((resolve) => {
    const p = spawn(process.execPath, ['/home/user/review-k/time.mts', 'child', tree, `${DIR}/${idx}.json`], { timeout: CAP, killSignal: 'SIGKILL', stdio: ['ignore', 'pipe', 'pipe'] });
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
const tasks: (() => Promise<void>)[] = [];
for (const fam of names) {
  const idx = [...fams.keys()].indexOf(fam);
  fs.writeFileSync(`${DIR}/${idx}.json`, JSON.stringify(fams.get(fam)));
  for (const tree of TREES) tasks.push(async () => { results.set(`${fam}|${tree}`, await runOne(tree, idx)); });
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
  const cell = (r: Res, id: string) => r.ms.get(id) ?? (r.hung === id ? `NO RETURN in ${CAP / 1000}s (killed)` : 'not run');
  const num = (c: string) => (c.startsWith('NO') ? 1e9 : c === 'not run' ? -1 : Number.parseFloat(c));
  const tot = res.map((r) => [...r.ms.values()].reduce((s, v) => s + Number.parseFloat(v), 0));
  const worst = res.map((r) => [...r.ms.entries()].reduce((m, [id, v]) => (Number.parseFloat(v) > m.v ? { id, v: Number.parseFloat(v) } : m), { id: '', v: 0 }));
  console.log(`\n## ${fam}: ${letters.length} letters; sum head ${tot[0]?.toFixed(0)}ms, before ${tot[1]?.toFixed(0)}ms, base ${tot[2]?.toFixed(0)}ms; slowest head ${worst[0]?.v.toFixed(0)}ms (${worst[0]?.id}), before ${worst[1]?.v.toFixed(0)}ms, base ${worst[2]?.v.toFixed(0)}ms (${worst[2]?.id})${res.map((r, i) => (r.err && r.ms.size === 0 ? ` ${TREES[i]} ERR ${r.err}` : '')).join('')}`);
  for (const { id } of letters) {
    const cells = res.map((r) => cell(r, id));
    const [h, p, b] = cells.map(num) as [number, number, number];
    const outs = cells.map((c) => c.split(' ').slice(1).join(' '));
    if (fam.startsWith('W') || h >= 150 || (h >= 25 && h > 3 * Math.max(b, 1)) || (h >= 25 && h > 2 * Math.max(p, 1)) || cells.some((c) => c.startsWith('NO') || c.includes('THROW'))) console.log(`  ${id}: head ${cells[0]} | before ${cells[1]} | base ${cells[2]}`);
    void outs;
  }
}
console.log(`\ntotal ${((Date.now() - T0) / 1000).toFixed(0)}s`);
