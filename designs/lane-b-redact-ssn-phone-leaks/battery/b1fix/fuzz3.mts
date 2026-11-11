// The fold's side effects on words that are no identifier: labels, nouns, connectors, months and units spelled with characters the
// table says look like their letters (by appearance, whatever fold reads them as), beside a number. Differential base/head.
// node fuzz3.mts <runs> <seed>
import { pathToFileURL } from 'node:url';
import { load, outcome, digitsOf, plain, show, P1, C1 } from './lib.mts';
const B = await load('base'); const H = await load('head');
const T = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/confusables.ts').href);
const runs = Number(process.argv[2] ?? 2000); let seed = Number(process.argv[3] ?? 1);
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const looks: Record<string, string[]> = {};
for (const [ch, as] of T.LOOK_ALIKES as Map<string, string>) { if (/^\p{L}$/u.test(ch) && ch.codePointAt(0)! < 0x10000) (looks[as.toUpperCase()] ??= []).push(ch); }
const l2d = (text: string) => [...text].some((c) => c.charCodeAt(0) > 0x7F && /^\p{L}$/u.test(c) && /^[0-9]$/.test(H.fold(c)));
const spell = (word: string, p: number) => [...word].map((c) => (rnd() < p && looks[c.toUpperCase()] ? pick(looks[c.toUpperCase()]!) : c)).join('');
const LABELS = ['SSN', 'Social Security', 'Phone', 'Tel', 'Fax', 'Call', 'Contact', 'TTY', 'Cell', 'Mobile', 'Medicare', 'Telephone', 'Soc Sec', 'HICN'];
const WORDS = ['Claim', 'ICN', 'Ref', 'Case', 'NPI', 'TIN', 'EIN', 'Check', 'Auth', 'ZIP', 'Group', 'No', 'ID', 'Number', 'and', 'or', 'is', 'on', 'at', 'for', 'home', 'ext', 'x', 'May', 'Mar', 'June', 'July', 'Nov', 'min', 'hr', 'units', 'th', 'st', 'am', 'pm', 'Paid', 'DOB', 'born', 'CPT', 'Code', 'IL', 'OH', 'CO', 'to', 'a', 'the', 'Dr', 'Mr', 'Account', 'Member', 'Policy', 'Invoice', 'Trace', 'Control', 'Ticket', 'Order', 'Visit'];
const NUMS = ['555-0123', '555 0123', '900123456', '2025550123', '1234567893', '0123456789', 'XXXXX3456', 'XXX-XX-3456', '900-12-3456', '90012-3456', '900.12 3456', '202-555-0123', '(202) 555-0123', '20255 50123', '5550123', '900 12 3456', '555-\n0123', '900123456150.00', '900-12-3456150.00'];
const SEP = [' ', ': ', ' ', '. ', ', ', '\n', ' # ', ' - ', '('];
const GLUE = ['', ' ', '-', '.', ', ', '/', ' x', ')'];
let flips = 0; let unredact = 0; let l2dHits = 0; const by: Record<string, number> = {}; const lines: string[] = [];
for (let i = 0; i < runs; i += 1) {
  const label = pick(LABELS); const word = pick(WORDS); const num = pick(NUMS); const k = rnd();
  const W = spell(word, 0.7); const L = spell(label, 0.5);
  const text = k < 0.2 ? `${L}${pick(SEP)}${num}` : k < 0.55 ? `${label}${pick(SEP)}${W}${pick(SEP)}${num}` : k < 0.75 ? `${label} ${num}${pick(GLUE)}${W}` : k < 0.9 ? `${W}${pick(SEP)}${num}` : `${label} ${num} ${W} ${pick(NUMS)}`;
  if (text === text.normalize('NFKC') && /^[\x00-\x7F]*$/.test(text)) continue;
  const b = outcome(B, text, P1, C1); const h = outcome(H, text, P1, C1);
  if (h.threw !== null) { lines.push(`THREW ${show(text)} ${h.threw}`); continue; }
  if (h.refused) continue;
  const kind = b.refused ? 'FLIP' : digitsOf(h.sent).length > digitsOf(b.sent).length ? 'UNREDACT' : '';
  if (kind === '') continue;
  if (kind === 'FLIP') flips += 1; else unredact += 1;
  if (l2d(text)) { l2dHits += 1; continue; }
  const shape = k < 0.2 ? `label ${label}` : k < 0.55 ? `between ${word}` : k < 0.75 ? `after ${word}` : k < 0.9 ? `alone ${word}` : `list ${word}`;
  const key = `${kind} ${shape}`; by[key] = (by[key] ?? 0) + 1;
  if (by[key] === 1 && lines.length < 45) lines.push(`${key}: ${show(text, 80)} => base ${b.refused ? 'REFUSED' : show(b.sent, 60)} head ${show(h.sent, 60)}`);
}
for (const l of lines) console.log(l);
console.log(`runs ${runs}: flips ${flips}, unredact ${unredact}, of both with a letter the fold reads as a digit ${l2dHits}`);
console.log(Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${n} ${k}`).join(' | '));
