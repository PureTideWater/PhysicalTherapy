// node fuzz3.mts <seed> <n>: hunk 3's guard. A label or none, a Social Security or phone number in a tight, loose or pointed
// writing (or a bare nine or ten), a date glued after it with its month's word and a spaced year, and what follows the year.
// Asks whether the head sends more than the BASE anywhere, and counts what the head sends that "before" refused, by what
// follows the year and by label.
import { load, outcome, worse, show, rng, pick } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const seed = Number(process.argv[2] ?? 1);
const N = Number(process.argv[3] ?? 8000);
const r = rng(seed);
const T0 = Date.now();
const LABELS = ['', 'Row', 'Claim', 'SSN', 'SSN:', 'Soc. Sec.', 'Member SSN', 'Phone', 'Tel', 'Fax:', 'Call', 'Medicare', 'Medicare ID', 'Contact', 'Medicare rate', 'Contact: Billing'];
const SHAPES = ['900-12-3456', '900.12 3456', '900 12.3456', '900 12 3456', '900.12.3456', '202-555-0123', '202.555 0123', '202 555.0123', '(202) 555-0123', '250.75 1234', '250 75.1234', '9001234560', '900123456'];
const DATES = ['01Jan 2020', '01-Jan, 2020', '15MAR 2021', '01Jan. 2020', '01/Jan 2020', '01Jan, 2020', '01-JAN  2020', '01Sept 2020', '01-Jan-2020', '01Jan2020', '01 Jan 2020'];
const AFTER = ['', ',150.00', '.50', ',2021', '.5 units', ',1', '.01.15', ', 150.00', ' 150.00', '.', ',', '.00', ',00'];
const base = new Map<string, string>();
const flips = new Map<string, number>();
const seen = new Map<string, number>();
const flipsByLabel = new Map<string, number>();
const examples = new Map<string, string>();
let n = 0;
let throws = 0;
for (; n < N && Date.now() - T0 < 100000; n += 1) {
  const [label, shape, date, after] = [pick(r, LABELS), pick(r, SHAPES), pick(r, DATES), pick(r, AFTER)];
  const text = `${label}${label ? ' ' : ''}${shape}${date}${after}`;
  const [h, p, b] = [outcome(H, text), outcome(P, text), outcome(B, text)];
  if (h.text.startsWith('THROW')) throws += 1;
  const wb = worse(h, b);
  if (wb && !base.has(`${label}|${shape}|${date}|${after}`)) base.set(`${label}|${shape}|${date}|${after}`, `${JSON.stringify(text)} :: H ${show(h, text)} | P ${show(p, text)} | B ${show(b, text)}`);
  seen.set(after, (seen.get(after) ?? 0) + 1);
  if (worse(h, p)) {
    flips.set(after, (flips.get(after) ?? 0) + 1);
    flipsByLabel.set(label, (flipsByLabel.get(label) ?? 0) + 1);
    if (!examples.has(`${after}|${label}`)) examples.set(`${after}|${label}`, JSON.stringify(text));
  }
}
console.log(`## fuzz3 seed ${seed}: ${n} letters, ${throws} exceptions, ${((Date.now() - T0) / 1000).toFixed(0)}s; the head sends more than the BASE in ${base.size} distinct letters`);
for (const row of [...base.values()].slice(0, 12)) console.log(`  BASE ${row.slice(0, 300)}`);
console.log(`  the head sends what "before" refused, by what follows the year: ${AFTER.map((a) => `${JSON.stringify(a)} ${flips.get(a) ?? 0}/${seen.get(a) ?? 0}`).join(', ')}`);
console.log(`  by label: ${LABELS.map((l) => `${JSON.stringify(l)} ${flipsByLabel.get(l) ?? 0}`).join(', ')}`);
for (const after of [',150.00', ',2021', ',1']) for (const label of ['SSN', 'SSN:', 'Soc. Sec.', 'Member SSN', 'Tel', 'Call', '']) { const e = examples.get(`${after}|${label}`); if (e) console.log(`  e.g. ${e}`); }
