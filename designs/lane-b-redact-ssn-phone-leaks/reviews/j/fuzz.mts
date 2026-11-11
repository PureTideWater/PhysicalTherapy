// node fuzz.mts <seed> <n1> <per2>: two generators aimed at the delta 24ad1075..f2f9f05e.
// Part 1 (PHI): a person label or none, a separator, a noun with this round's connectors and layouts, and a Social Security or
//   phone number or an own identifier with digits glued; asks whether the head sends more than the BASE anywhere (the rule),
//   and counts what the head sends that "before" refused, by layout.
// Part 2 (must stay): ordinary lines with a reference under its noun, written with "\n" and with "\r\n", padded or not; the
//   outcome pattern head/before/base per template ("=" sent unchanged, "R" refused, "c" sent changed).
import { load, outcome, worse, show, rng, pick } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const seed = Number(process.argv[2] ?? 1);
const N1 = Number(process.argv[3] ?? 6000);
const PER2 = Number(process.argv[4] ?? 120);
const r = rng(seed);
const T0 = Date.now();

const LABELS = ['', '', 'Phone', 'Fax:', 'Tel.', 'SSN', 'SSN:', 'Social Security', 'Medicare', 'Medicare ID', 'Member SSN', 'Contact', 'Call', 'TTY'];
const SEPS = [' ', '\n', ' | ', ' │ ', '\u0085', '\r\n', ' - ', '\n\n', ': ', ' ─ '];
const LAYOUTS = [
  'Account\nID\nNumber\n', 'Statement\n#\n', 'Record\n:\n', 'Account\n-------\nNo. ', 'Claim Number │ ', 'Acct.\n-----\n', 'Invoice │\n│ ', 'Statement\n.\nNo. ',
  'Policy\n|  |\nID ', 'Reference\u0085', 'Record\u0085No.\u0085', 'Claim\n+-----+\n| ', 'File\n═════\n', 'Notice ─── ', 'Plan\n#####\n', 'Member\nID\nNo.:\n-----\n',
  'Group ║ ', 'Case\n┌──────┐\n│ ', 'Check\n:\n', 'Visit\nNo\nID ', 'Account ', 'Claim: ', 'Statement\n', 'Record\n-----\n', 'Document ___ ', 'Order\n|:-----|\n| ', 'Batch =+= ', 'Letter\n-+-+-\n',
];
const PAYLOADS = [
  '900-12-3456150.00', '202-555-0123150.00', '900 12 3456150.00', '202 555 0123150.00', '(202) 555-0123150.00', '900-12-345601/02/2020', '90012345601/02/2020', '900123456150.00',
  '2025550123150.00', '900.12.3456150.00', '202.555.0123150.00', '900-12-34567', '202-555-01234', '900-12-3456', '202-555-0123', '555-0123150.00', 'ZZ7654321150.00', '+1-202-555-0123150.00',
  '900 12.3456150.00', '900-12-3456 150.00', '900-12-345601Jan 2020', '90012345601Jan 2020', '900-12-345601Jan 2020,150.00', 'SYNCLAIM0001150.00', '900 12 3456', '(202) 555 0123', '9001234561', 'ZEPHYRA900-12-3456',
];
const SUFFIX = ['', ' Paid', '\n', ' |', ' │', ' 120.00'];
const HELD = ['', '', '\nService 01/01/2020-150.00 Paid'];
let [n1, throws] = [0, 0];
const baseFlags = new Map<string, string>();
const phiByLayout = new Map<string, number>();
const sentByLayout = new Map<string, number>();
for (; n1 < N1 && Date.now() - T0 < 75000; n1 += 1) {
  const [label, sep, layout, payload] = [pick(r, LABELS), pick(r, SEPS), pick(r, LAYOUTS), pick(r, PAYLOADS)];
  const text = `${label}${label ? sep : ''}${layout}${payload}${pick(r, SUFFIX)}${pick(r, HELD)}`;
  const [h, p, b] = [outcome(H, text), outcome(P, text), outcome(B, text)];
  if (h.text.startsWith('THROW') || p.text.startsWith('THROW')) { throws += 1; console.log(`THROW ${JSON.stringify(text)} H ${show(h, text)} P ${show(p, text)}`); }
  const wb = worse(h, b);
  if (wb) { const key = `${wb}|${label}|${JSON.stringify(sep)}|${JSON.stringify(layout)}|${payload}`; if (!baseFlags.has(key)) baseFlags.set(key, `${JSON.stringify(text)} :: H ${show(h, text)} | P ${show(p, text)} | B ${show(b, text)}`); }
  if (worse(h, p)) phiByLayout.set(layout, (phiByLayout.get(layout) ?? 0) + 1);
  // SHOW=<text>: print each letter of a layout holding that text that the head sends and "before" refused
  if (worse(h, p) && process.env.SHOW && layout.includes(process.env.SHOW)) console.log(`  FLIP ${JSON.stringify(text)} :: H ${show(h, text)} | P ${show(p, text)} | B ${show(b, text)}`);
  if (!h.refused) sentByLayout.set(layout, (sentByLayout.get(layout) ?? 0) + 1);
}
console.log(`## Part 1, seed ${seed}: ${n1} letters, ${throws} exceptions; the head sends more than the BASE in ${baseFlags.size} distinct (label, separator, layout, payload)`);
for (const row of [...baseFlags.values()].slice(0, 14)) console.log(`  BASE ${row.slice(0, 380)}`);
console.log(`  the head sends what "before" refused, by layout: ${LAYOUTS.map((l) => `${JSON.stringify(l)} ${phiByLayout.get(l) ?? 0}`).join(', ')}`);

// Part 2
const NOUNS = ['Claim', 'Reference', 'Invoice', 'Check', 'Policy', 'Account', 'Authorization', 'Case', 'Tracking', 'Confirmation', 'Statement', 'Group', 'Member', 'Subscriber', 'Document', 'Payment', 'Encounter', 'Visit'];
const two = () => String(Math.floor(r() * 100)).padStart(2, '0');
const four = () => String(Math.floor(r() * 10000)).padStart(4, '0');
const ref = () => pick(r, [`2026011${four()}.${two()}`, `802-45-6789${two()}.${two()}`, `1234567890${four()}.${two()}`, `2025${two()}${four()}7.${two()}`]);
const noun = () => pick(r, NOUNS);
const rule = () => pick(r, ['-', '=', '_', '*', '~', '─']);
const sp = (n: number) => ' '.repeat(n);
const between = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const TEMPLATES: [string, (e: string) => string][] = [
  ['prose, the label wrapped: "Please refer to <noun>|number <ref> when calling."', (e) => `Please refer to ${noun().toLowerCase()}${e}number ${ref()} when calling.`],
  ['"<Noun>|Number: <ref>"', (e) => `${noun()}${e}Number: ${ref()}`],
  ['"<Noun>|No. <ref> 150.00"', (e) => `${noun()}${e}No. ${ref()} 150.00`],
  ['"Your <noun>|ID is <ref>."', (e) => `Your ${noun().toLowerCase()}${e}ID is ${ref()}.`],
  ['"<Noun>|<ref>"', (e) => `${noun()}${e}${ref()}`],
  ['"<Noun> Number:||<ref>"', (e) => `${noun()} Number:${e}${e}${ref()}`],
  ['"<Noun>|rule|<ref>"', (e) => { const n = noun(); return `${n}${e}${rule().repeat(n.length)}${e}${ref()}`; }],
  ['"<Noun>|rule|<ref>", all indented 0..8', (e) => { const [n, pad] = [noun(), sp(between(0, 8))]; return `${pad}${n}${e}${pad}${rule().repeat(n.length)}${e}${pad}${ref()}`; }],
  ['"<Noun>|rule|<ref>", all indented 9..40', (e) => { const [n, pad] = [noun(), sp(between(9, 40))]; return `${pad}${n}${e}${pad}${rule().repeat(n.length)}${e}${pad}${ref()}`; }],
  ['a cell padded to the number\'s width: "| <Noun>pad |/|rule|/| <ref> |"', (e) => { const [n, x] = [noun(), ref()]; const w = Math.max(n.length, x.length); return `| ${n.padEnd(w)} |${e}|${'-'.repeat(w + 2)}|${e}| ${x.padEnd(w)} |`; }],
  ['a cell, the number right-aligned in 24..40', (e) => { const [n, x, w] = [noun(), ref(), between(24, 40)]; return `| ${n.padEnd(w)} |${e}|${'-'.repeat(w + 2)}|${e}| ${x.padStart(w)} |`; }],
  ['a dash-bordered box, tight: "+---+/| <Noun> |/+---+/| <ref> |"', (e) => { const n = noun(); return `+${'-'.repeat(n.length + 2)}+${e}| ${n} |${e}+${'-'.repeat(n.length + 2)}+${e}| ${ref()} |`; }],
  ['one line: "<Noun> <ref> 150.00 120.00"', () => `${noun()} ${ref()} 150.00 120.00`],
  ['three-line label (this round\'s give-back): "<Noun>|ID|Number|<ref>"', (e) => `${noun()}${e}ID${e}Number${e}${ref()}`],
  ['a rule inside the label (this round\'s give-back): "<Noun>|rule|No. <ref>"', (e) => { const n = noun(); return `${n}${e}${rule().repeat(n.length)}${e}No. ${ref()}`; }],
  ['"<Noun>|#|<ref>" (this round\'s give-back)', (e) => `${noun()}${e}#${e}${ref()}`],
];
console.log(`\n## Part 2, seed ${seed}: ${PER2} letters per template and line ending; pattern head/before/base ("=" sent unchanged, "R" refused, "c" sent changed)`);
const mark = (o: { refused: boolean; text: string }, text: string) => (o.refused ? 'R' : o.text === text ? '=' : 'c');
let n2 = 0;
for (const [name, make] of TEMPLATES) {
  const cells: string[] = [];
  for (const [eolName, eol] of [['\\n', '\n'], ['\\r\\n', '\r\n']] as const) {
    const hist = new Map<string, number>();
    let example = '';
    for (let i = 0; i < PER2; i += 1) {
      const text = make(eol);
      n2 += 1;
      const pattern = `${mark(outcome(H, text), text)}${mark(outcome(P, text), text)}${mark(outcome(B, text), text)}`;
      hist.set(pattern, (hist.get(pattern) ?? 0) + 1);
      if (pattern === 'R==' && example === '') example = JSON.stringify(text);
    }
    cells.push(`${eolName}: ${[...hist.entries()].map(([k, v]) => `${k} ${v}`).join(', ')}${example ? `  e.g. ${example}` : ''}`);
  }
  console.log(`- ${name}\n    ${cells.join('\n    ')}`);
}
console.log(`\n${n1} + ${n2} letters in ${((Date.now() - T0) / 1000).toFixed(0)}s`);
