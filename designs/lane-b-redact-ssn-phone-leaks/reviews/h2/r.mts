// TREES=head,before,base,v1,v3,v4 node r.mts: the naming patterns asked directly, the letters of the findings on every tree, a rate over small tables, and a throw fuzz.
import { M, PATHS, out, rng, pick, int, digits } from './lib2.mts';
import { pathToFileURL } from 'node:url';
for (const k of ['v3', 'v4']) M[k] = await import(pathToFileURL(PATHS[k] ?? `/home/user/review-h2/v/${k}.mts`).href);
const rx = M.v3.__rx;
console.log('## the patterns of named(), asked directly (head)');
for (const before of ['ICN\n-----\n', 'ICN\n_____\n', 'ICN\n~~~~~\n', 'ICN\n+-----+\n', 'ICN: ______ ', '| CLAIM |\n|-------|\n| ', 'CLAIM\n-  \n', 'STATEMENT\n.  \n', 'STATEMENT\n-||\n']) {
  const noun = rx.NAMED_BEFORE.exec(before);
  const tail = rx.LABEL_TAIL.exec(before)?.[0] ?? '';
  console.log(`  before ${JSON.stringify(before)}: NAMED_BEFORE ${noun === null ? 'null' : JSON.stringify(noun[0])} | RULE_LINE on the tail ${JSON.stringify(tail)}: ${String(rx.RULE_LINE.test(tail))}`);
}
const W = (k: number) => `ICN\n${'-'.repeat(k)}\n12345678901234.01`;
const LET: [string, string[], string?][] = [
  ['ICN\n-----\n12345678901234.01', ['v4']], ['ICN\n_____\n12345678901234.01', ['v4']], ['Claim Number\n~~~~~~~~~~~~\n20260112345.01', ['v4']], ['Claim Number\n+------------+\n20260112345.01', ['v4']],
  ['Reference\n_________\n802-45-678901.50', ['v4']], ['| Claim |\n|-------|\n| 20260112345.01 |', ['v4']], ['Claim Number: ______ 20260112345.01', ['v4']],
  [W(100), [], 'ICN, a rule of 100 hyphens, 12345678901234.01'], [W(112), [], 'ICN, a rule of 112 hyphens, 12345678901234.01'], [W(118), [], 'ICN, a rule of 118 hyphens, 12345678901234.01'], [W(132), [], 'ICN, a rule of 132 hyphens, 12345678901234.01'],
  [`Claim Number\n${'-'.repeat(104)}\n20260112345.01`, [], 'Claim Number, a rule of 104 hyphens, 20260112345.01'], [`Claim Number\n${'-'.repeat(108)}\n20260112345.01`, [], 'Claim Number, a rule of 108 hyphens, 20260112345.01'],
  ['Claim Number    Service Date    Billed\n20260112345.01    01/15/2026    150.00', []], ['Claim Number    Service Date    Billed\n20260112345    01/15/2026    150.00', []], ['Claim Number: 20260112345.01    Service Date: 01/15/2026    Billed: 150.00', []],
  ['ICN | DOS | Billed\n12345678901234.01 | 01/15/2026 | 150.00', []], ['ICN\tDOS\tBilled\n12345678901234.01\t01/15/2026\t150.00', []],
  ['REMITTANCE ADVICE\n\n900-12-3456150.00', []], ['REMITTANCE ADVICE\n-  \n900-12-3456150.00', []], ['REMITTANCE ADVICE\n.\t \n900-12-3456150.00', []], ['STATEMENT\n-||\n802-45-678901.50', []], ['STATEMENT\n--\n802-45-678901.50', []],
  ['Seen 12345678901-September.-202612/31/2026', []], ['Seen 12345678901-September.-202612/31/20261', []], ['Seen 12345678901-September.-2026150.00', []], ['Seen 12345678901-September.-20261234567.00', []],
  ['MemberSSN 8 1234567893.1', ['v1']], ['PatientSSN 8 1234567893.1', ['v1']], ['Assoc. Sec. 8 1234567893.1', ['v1']], ['Member SSN 8 1234567893.1', ['v1']],
  ['SSN: Medicare rate 110 32.74420', []], ['SSN: Medicare claim 110 32.74420', []], ['Social Security Act. Medicare rate 110 32.74420', []], ['SSN/Fax rate 110 32.74420', []],
];
console.log('\n## letters');
for (const [text, extra, label] of LET) console.log(`${label ?? JSON.stringify(text)}\n     head: ${out('head', text)} | before: ${out('before', text)} | base: ${out('base', text)}${extra.map((t) => ` | ${t === 'v4' ? 'head with _ ~ + read after the noun' : 'head, no 2nd reading'}: ${out(t, text)}`).join('')}`);
// a rate: small tables, a header row whose first, middle or last column is the claim's number
const two = (n: number) => String(n).padStart(2, '0');
const CPT = ['97110', '97112', '97116', '97140', '97530', '97535', '97161', '97164'];
const COLS = ['Service Date', 'DOS', 'CPT', 'Units', 'Billed', 'Allowed', 'Paid', 'Patient Resp.'];
type R = () => number;
const amt = (r: R) => `${String(10 + int(r, 490))}.${two(int(r, 100))}`;
const cell = (r: R, col: string) => (col === 'Service Date' || col === 'DOS' ? `${two(1 + int(r, 12))}/${two(1 + int(r, 28))}/2026` : col === 'CPT' ? pick(r, CPT) : col === 'Units' ? String(1 + int(r, 8)) : amt(r));
const HEADS = ['Claim Number', 'ICN', 'Claim No.', 'Control Number', 'Reference No.', 'Claim #', 'DCN', 'Invoice No.'];
const IDF: [string, (r: R) => string][] = [
  ['14 digits and a line suffix .0n', (r) => `${digits(r, 14)}.0${1 + int(r, 9)}`],
  ['2026 + 7 digits and a line suffix .0n', (r) => `2026${digits(r, 7)}.0${1 + int(r, 9)}`],
  ['12 digits and one decimal', (r) => `${digits(r, 12)}.${1 + int(r, 9)}`],
  ['dashed 3-2-6 and a suffix .0n', (r) => `8${digits(r, 2, false)}-${digits(r, 2)}-${digits(r, 6)}.0${1 + int(r, 9)}`],
  ['14 digits, no suffix (control)', (r) => digits(r, 14)],
  ['2026 + 7 digits, no suffix (control)', (r) => `2026${digits(r, 7)}`],
];
console.log('\n## RATE small tables: a header row, the number in its column below (200 tables per form)');
for (const [name, id] of IDF) {
  const r = rng(77 + name.length * 7919);
  let base = 0, head = 0, before = 0, sameLine = 0; let ex = '';
  for (let i = 0; i < 200; i += 1) {
    const others = Array.from({ length: 2 + int(r, 3) }, () => pick(r, COLS));
    const at = int(r, others.length + 1);
    const noun = pick(r, HEADS);
    const sep = pick(r, ['    ', '  ', '\t', ' | ']);
    const rows = Array.from({ length: 1 + int(r, 4) }, () => { const cells = others.map((c) => cell(r, c)); cells.splice(at, 0, id(r)); return cells; });
    const header = [...others]; header.splice(at, 0, noun);
    const text = [header.join(sep), ...rows.map((cells) => cells.join(sep))].join('\n');
    const b = out('base', text); if (b === 'REFUSED') continue; base += 1;
    const h = out('head', text); if (h !== b) { head += 1; if (ex === '') ex = `${JSON.stringify(text)} head ${h}, before ${out('before', text)}, base ${b}`; }
    if (out('before', text) !== b) before += 1;
    // the same rows, each number on its noun's own line
    const flat = rows.map((cells) => `${noun}: ${cells[at] as string}  ${others.map((c, k) => `${c}: ${cells[k < at ? k : k + 1] as string}`).join('  ')}`).join('\n');
    if (out('head', flat) === out('base', flat)) sameLine += 1;
  }
  console.log(`  ${name}: base sends ${base}/200; head refuses ${head} (${((100 * head) / Math.max(1, base)).toFixed(0)}%), before ${before}; the same rows with the noun on the number's line: head as base on ${sameLine}/${base}\n     ${ex.slice(0, 300)}`);
}
// throws: random text of marks, controls, digits, joiners and label words
{
  const r = rng(4242);
  const A = ['\u0001', '\u0002', '\u0003', '\u0004', '­', '​', '\uD800', '\uDC00', '\n', '\r', '\f', '\t', ' ', ' ', '-', '/', '.', ',', '(', ')', '_', '|', '~', '$', ':', '#', '*', '=', '+', 'SSN', 'Phone', 'Claim', 'ICN', 'Jan', 'May', 'on', 'file', 'Remittance', 'Advice', 'No.', 'Jane', 'Zephyra', 'SYNCLAIM0001', '1)', '(2)', 'X', '—', '─'];
  let n = 0, th = 0, tb = 0; let ex = '';
  for (let i = 0; i < 3000; i += 1) {
    let s = '';
    for (let k = 4 + int(r, 14); k > 0; k -= 1) s += r() < 0.45 ? digits(r, 1 + int(r, 14), false) : pick(r, A);
    n += 1;
    const h = out('head', s);
    if (h.startsWith('THROW')) { th += 1; if (ex === '') ex = `${JSON.stringify(s)} ${h}`; }
    if (out('before', s).startsWith('THROW')) tb += 1;
  }
  console.log(`\n## throws over ${n} random texts: head ${th}, before ${tb} ${ex}`);
}
