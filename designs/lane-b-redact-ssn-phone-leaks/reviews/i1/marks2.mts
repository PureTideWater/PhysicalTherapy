// node marks2.mts: 1(b), the marks written inside or beside the forms only the head reads (look-alikes, digit-for-letter,
// the new name joiners, invisible characters): does the head's redaction ever cut a mark out with a match, and send?
import { load, outcome, show, patient, claims } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const MARKS = ['\u0001', '\u0002', '\u0003'];
const IDS = ['Z3PHYRA', 'ZEPHYR4', 'J4NE ZEPHYRA', 'ZZ76S4321', 'SYNCLAIMOOO1', 'Jane∙Zephyra', 'Zephy∙ra', 'Zephуra', 'JАNE ZEPHYRA', 'ZEPHYRA·JANE', 'Jane · Zephyra', 'J.∙Zephyra', 'ZZ7654З21', 'Jane​Zephyra', 'Zeph­yra', 'Ze​phyra', 'SYNCLAIM​0001', 'SSN 900​-12-3456', 'Phone 202­555­0123', 'ZZ​7654321', '03​/14/1980', 'Call Z3PHYRA at 555-0123', 'Phone (2) 555-0100', 'SSN (Jane Zephyra, patient): 90012-3456', 'Jane  Q.  Zephyra', 'ZEPHYRA,JANE', 'Zephyra, J.', 'Jane\nZephyra', 'Jane\tQ\tZephyra', 'SSN 900 - 12 - 3456', 'SSN 900\n12\n3456', 'Ph. (202)555-0123 x12', 'March 14, 1980', '14 March 1980', '1980-03-14', 'ZZ-7654321', 'ZZ 7654321', 'SYN CLAIM 0001', 'SYNCLAIM-0001'];
const CTX = ['{}', 'Dear {},', '{} 555-0124', 'Total {} for45.00 and 9 0 0 1 2 3 4 5 6', 'Our office: 555-0123. {}'];
const countMarks = (t: string) => (t.match(/[\u0001-\u0003]/g) ?? []).length;
const esc = (t: string) => JSON.stringify(t);
let n = 0, consumed = 0, headSent = 0;
const out: string[] = [], ex: string[] = [];
const seen = new Set<string>();
const t0 = Date.now();
function tryLetter(text: string) {
  if (seen.has(text)) return;
  seen.add(text); n += 1;
  let s: any;
  try { s = H.redactLetterForScreen(text, patient, claims); } catch (e) { out.push(`THROW ${esc(text)} ${String(e).slice(0, 100)}`); return; }
  const left = countMarks(s.text);
  if (left < countMarks(text)) { consumed += 1; if (ex.length < 14) ex.push(`${esc(text)} -> ${esc(s.text)}`); }
  if (left > 0 || H.holdsIdentifier(s.text, patient, claims)) return;
  headSent += 1;
  const b = outcome(B, text), p = outcome(P, text);
  if (out.length < 60) out.push(`${b.refused ? 'BASE-REFUSED' : 'base-sent'} ${esc(text)} head=${esc(s.text)} base=${show(b, text)} before=${show(p, text)}`);
}
for (const ctx of CTX) for (const id of IDS) {
  const at = ctx.indexOf('{}');
  const text = ctx.replace('{}', id);
  const lo = Math.max(0, at - 2), hi = Math.min(text.length, at + id.length + 2);
  for (const m of MARKS) {
    for (let i = lo; i <= hi; i += 1) tryLetter(text.slice(0, i) + m + text.slice(i));
    for (let i = at; i < at + id.length; i += 1) tryLetter(text.slice(0, i) + m + text.slice(i + 1));
    for (const sep of new Set(id.replace(/[\p{L}\p{N}]/gu, ''))) tryLetter(text.slice(0, at) + id.split(sep).join(m) + text.slice(at + id.length));
    for (let i = at; i < at + id.length; i += 1) for (let j = i + 1; j <= at + id.length; j += 3) tryLetter(text.slice(0, i) + m + text.slice(i, j) + m + text.slice(j));
  }
}
console.log(`## marks2: ${n} letters in ${Date.now() - t0} ms; redaction cut a mark out in ${consumed}; head SENT ${headSent}`);
console.log(ex.join('\n'));
console.log(out.join('\n'));
