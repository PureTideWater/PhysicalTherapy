// node marks.mts <seconds part 1> <seconds part 2>: 1(b). Part 1: one of the checks' three marks written inside or beside an
// identifier (inserted, in place of a character, in place of every separator). The head refuses any SENT text that holds a
// mark, so it can send only where its redaction cut the mark out with a match: every such letter is printed with the base's
// and before's outcome. Part 2: U+0004 written the same way, head against base and before.
import { load, outcome, show, worse, patient, claims, rng, shuffle } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const S1 = Number(process.argv[2] ?? 100), S2 = Number(process.argv[3] ?? 40);
const MARKS = ['\u0001', '\u0002', '\u0003'];
const IDS = ['Jane Zephyra', 'ZEPHYRA, JANE Q', 'J. Zephyra', 'Zephyra', 'Jane Q. Zephyra', 'ZZ7654321', 'SYNCLAIM0001', '03/14/1980', 'March 14, 1980', 'SSN 900-12-3456', 'SSN: 900 12 3456', 'Phone 202-555-0123', '(202) 555-0123', 'Tel. 202.555.0123', 'Call Jane Zephyra at 555-0123', 'Phone 1: 555-0100', 'Member ID ZZ7654321', 'Claim SYNCLAIM0001', 'DOB 03/14/1980', 'SSN 900123456', 'Zephyra-Jane', "Zephyra's"];
const CTX = ['{}', 'Dear {},', '{} 9 0 0 1 2 3 4 5 6', '9 0 0 1 2 3 4 5 6 {}', 'Total {} for45.00 and 9 0 0 1 2 3 4 5 6', 'Our office: 555-0123. {}', '{} 555-0124', 'Paid{}150.00 and 9 0 0 1 2 3 4 5 6', 'Service 01/01/2020-150.00 Paid {} 97110 1 45.00', '{}\n62701-1234 and 555-0199', 'Total for45.00 {} and 9 0 0 1 2 3 4 5 6', 'Patient {} 900.12 3456'];
const countMarks = (t: string) => (t.match(/[\u0001-\u0003]/g) ?? []).length;
const esc = (t: string) => JSON.stringify(t);
const letters: string[] = [];
const span: { text: string; lo: number; hi: number }[] = [];
for (const ctx of CTX) for (const id of IDS) {
  const at = ctx.indexOf('{}');
  const text = ctx.replace('{}', id);
  const lo = Math.max(0, at - 2), hi = Math.min(text.length, at + id.length + 2);
  span.push({ text, lo, hi });
  for (const m of MARKS) {
    for (let i = lo; i <= hi; i += 1) letters.push(text.slice(0, i) + m + text.slice(i));
    for (let i = at; i < at + id.length; i += 1) letters.push(text.slice(0, i) + m + text.slice(i + 1));
    for (const sep of new Set(id.replace(/[\p{L}\p{N}]/gu, ''))) letters.push(text.slice(0, at) + id.split(sep).join(m) + text.slice(at + id.length));
  }
}
const r = rng(5);
shuffle(letters, r);
let n = 0, consumed = 0, headSent = 0, baseRefused = 0, markKeptNotRefused = 0, baseRefusedAll = 0, sampled = 0;
const out: string[] = [], consumedEx: string[] = [];
const seen = new Set<string>();
let t0 = Date.now();
for (const text of letters) {
  if (Date.now() - t0 > S1 * 1000) break;
  if (seen.has(text)) continue;
  seen.add(text); n += 1;
  let s: any;
  try { s = H.redactLetterForScreen(text, patient, claims); } catch (e) { out.push(`THROW ${esc(text)} ${String(e).slice(0, 100)}`); continue; }
  const left = countMarks(s.text);
  if (left < countMarks(text)) { consumed += 1; if (consumedEx.length < 10) consumedEx.push(`${esc(text)} -> ${esc(s.text)}`); }
  if (left > 0) {
    if (n % 40 === 0) { sampled += 1; if (!H.holdsIdentifier(s.text, patient, claims)) markKeptNotRefused += 1; if (outcome(B, text).refused) baseRefusedAll += 1; }
    continue;
  }
  if (H.holdsIdentifier(s.text, patient, claims)) continue;
  headSent += 1;
  const h = { refused: false, text: s.text };
  const b = outcome(B, text), p = outcome(P, text);
  if (b.refused) baseRefused += 1;
  const tag = b.refused ? 'BASE-REFUSED' : worse(h, b) ? `BASE-${worse(h, b)}` : 'ok';
  if (tag === 'ok' ? out.filter((x) => x.startsWith('ok')).length < 8 : out.length < 90) out.push(`${tag} ${esc(text)} head=${esc(s.text)} base=${show(b, text)} before=${show(p, text)}`);
}
console.log(`## marks part 1: ran ${n} of ${letters.length} in ${Date.now() - t0} ms; redaction cut a mark out in ${consumed}; head SENT ${headSent}, of them base refused ${baseRefused}; sample of ${sampled} letters whose mark stayed: head not refused ${markKeptNotRefused}, base refused ${baseRefusedAll}`);
console.log('cut out, e.g.:\n' + consumedEx.join('\n'));
console.log(out.join('\n'));
// Part 2: U+0004 (and U+0005 as a control) written the same way.
const rows: string[] = [];
for (const { text, lo, hi } of span) for (const c of ['\u0004', '\u0005']) for (let i = lo; i <= hi; i += 1) rows.push(text.slice(0, i) + c + text.slice(i));
shuffle(rows, r);
t0 = Date.now();
let n2 = 0, sent2 = 0, flags2 = 0;
const out2: string[] = [];
for (const text of rows) {
  if (Date.now() - t0 > S2 * 1000) break;
  n2 += 1;
  const h = outcome(H, text);
  if (h.refused) continue;
  sent2 += 1;
  const b = outcome(B, text), p = outcome(P, text);
  const wb = worse(h, b), wp = worse(h, p);
  if (wb || wp) { flags2 += 1; if (out2.length < 25) out2.push(`${wb ? 'BASE ' + wb : 'BEFORE ' + wp} ${esc(text)} head=${show(h, text)} base=${show(b, text)} before=${show(p, text)}`); }
}
console.log(`## marks part 2 (U+0004, U+0005): ran ${n2} of ${rows.length} in ${Date.now() - t0} ms; head sent ${sent2}; flags ${flags2}`);
console.log(out2.join('\n'));
