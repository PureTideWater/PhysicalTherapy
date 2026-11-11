// Every finding of the C1 review, each letter on the base (ef3e8d20), aea2852d and the head (/home/user/fix, a64cc9af when run).
// Synthetic data only. node repro.mts
import fs from 'node:fs';
import { load, P1, C1, tag, outcome, digitsOf } from './lib.mts';
const B = await load('base'); const A = await load('aea'); const H = await load('head');
const PA = { pseudonym: 'p', names: ['JANE Q ZEPHYRA', 'SIMONE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] };
const od = (s: string, z: number) => s.replace(/[0-9]/g, (d) => String.fromCodePoint(z + Number(d)));
const esc = (s: string) => JSON.stringify(s).replace(/[^\x20-\x7e]/gu, (c) => `\\u{${c.codePointAt(0)!.toString(16)}}`);
const row = (id: string, text: string, P: any = P1, C: any = C1, note = '') => {
  const [b, a, h] = [tag(B, text, P, C), tag(A, text, P, C), tag(H, text, P, C)]; const full = JSON.stringify(H.redactLetter(text, P, C).text);
  console.log(`${id} ${esc(text)}${note ? `  # ${note}` : ''}\n    base ${b}\n    aea  ${a}\n    head ${h}${h.startsWith('SENT') && h.slice(5) !== full ? `\n    head redactLetter ${full}` : ''}`);
};
console.log('== C1-1: the space CASE_GLUED_LABEL adds only when strict is true loses a label (or adds a keep-noun) the strict-false reading and the base have');
row('C1-1a', 'Call Zephyra at 555-0123.\nTel claimSS#b 20255 50123', P1, C1, 'the withheld [PHONE] is sent');
row('C1-1b', 'Tel claimSS#b 20255 50123');
row('C1-1c', 'Tel (to verify memberSS#s) 20255 50123', P1, C1, 'the label at its reach of 24');
row('C1-1d', 'SSN zipSS#B 9 0 0 1 2 3 4 5 6');
row('C1-1e', 'Tel caseHICé 20255 50123');
row('C1-1f', 'Call Zephyra at 555-0123.\nFax (to verify memberSS#s) 20 25 55 01 23', P1, C1, 'the withheld [PHONE] is sent');
row('C1-1g', 'HIC - department aSS Noé, \t202 555012', PA);
row('C1-1h', 'Phone Zephyra 555-0123. Phone refSS#s: 20 25 55 01 23', P1, C1, 'the withheld [PHONE] is sent');
console.log('== C1-2: a match the base did not make that is not marked fresh (a name with a new joiner or a look-alike letter, a date of birth in other-script digits or with a look-alike month) is a list\'s item or takes digits from a chain');
row('C1-2a', 'Claim Zephy∙ra, 900123456', P1, C1, 'joiner added in the fix round');
row('C1-2b', 'Claim Zeph•yra and 900123456', P1, C1, 'joiner added in the fix round');
row('C1-2c', 'Ref Zeph⋅yra, 2025550123', P1, C1, 'joiner added in the fix round');
row('C1-2d', 'Claim Zephyrа, 900123456');
row('C1-2e', 'Ref Zephyrа and 2025550123');
row('C1-2f', `Claim ${od('03/14/1980', 0x660)}, 900123456`);
row('C1-2g', 'Claim Mаrch 14 1980, 900123456');
row('C1-2h', 'Claims Zephyrа, 900123456 and 900551234');
row('C1-2i', 'Mаrch 14, 1980 555 01 23', P1, C1, 'base refuses for the chain 1980 555 01 23');
row('C1-2k', 'Claim Zeph∙yra, 900123456. Phone Zephy∙ra 800 555 0118');
// The fuzzer's UNREDACT letter, minimised here: the base redacts a chain the head's date of birth takes the first group of.
const un = fs.readdirSync('out').filter((f) => /^fz2\..*\.jsonl$/.test(f)).flatMap((f) => fs.readFileSync(`out/${f}`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))).find((r) => r.k === 'UNREDACT');
if (un !== undefined) {
  const more = (t: string) => { const h = outcome(H, t, PA, C1); const b = outcome(B, t, PA, C1); return !h.refused && !b.refused && h.threw === null && b.threw === null && digitsOf(h.sent).length > digitsOf(b.sent).length && /\[SSN\]|\[PHONE\]/.test(b.sent); };
  let cur = [...un.t]; let changed = true; let guard = 0;
  while (changed && guard < 6) { changed = false; guard += 1; for (const size of [24, 12, 6, 3, 2, 1]) for (let i = 0; i + size <= cur.length; ) { const cand = [...cur.slice(0, i), ...cur.slice(i + size)]; if (cand.length > 0 && more(cand.join(''))) { cur = cand; changed = true; } else i += 1; } }
  row('C1-2l', cur.join(''), PA, C1, 'minimised from the fuzzer');
}
console.log('== C1-3: in a held letter, a number with a look-alike letter for a digit after the name: the glued check reads the look-alike fold (a digit), the patterns and the scan the plain fold (a letter)');
row('C1-3a', 'Seen 01/01/2020-150.00Paid in full. Zephyra Ꝯ00-12-3456', P1, C1, 'U+A76E looks like 9');
row('C1-3b', 'Seen 01/01/2020-150.00Paid in full. Zephyra 202-555-01Ꝛ3', P1, C1, 'U+A75A looks like 2');
row('C1-3c', 'Seen 01/01/2020-150.00Paid in full. Jane Zephyra, Ꝯ00123456');
row('C1-3d', 'Seen 01/01/2020-150.00Paid in full. Zephyra\nꝮ00 12 3456');
row('C1-3e', '1/01/20-150.00 Zephyra б0', P1, C1, 'U+0431 looks like 6');
row('C1-3x', 'Zephyra Ꝯ00-12-3456', P1, C1, 'comparison: no held range');
row('C1-3y', 'Seen 01/01/2020-150.00Paid in full. SSN Ꝯ00-12-3456', P1, C1, 'comparison: no name');
console.log('== C1-4 (the same at aea2852d): a name with a number character that is no decimal digit glued to it');
let flips = 0; let tested = 0; const first: string[] = [];
for (let cp = 0x80; cp <= 0x1ffff; cp += 1) {
  if (cp >= 0xd800 && cp <= 0xdfff) continue;
  const c = String.fromCodePoint(cp);
  if (!/^[\p{No}\p{Nl}]$/u.test(c) || c.normalize('NFKC') !== c) continue;
  tested += 1;
  for (const text of [`Zephyra${c}`, `${c}Zephyra`]) { const h = outcome(H, text); if (h.refused || !h.sent.includes('Zephyra')) continue; const b = outcome(B, text); if (!b.refused) continue; flips += 1; if (text.startsWith('Z')) first.push(`U+${cp.toString(16).toUpperCase()}`); }
}
console.log(`number characters tested ${tested} (No or Nl, unchanged by NFKC), each before and after the name: base REFUSED and head SENT with the name in clear ${flips} (${first.join(' ')})`);
row('C1-4a', 'Zephyra〇');
row('C1-4b', 'Seen Jane Zephyra〇 on 01/02/2020, paid 150.00');
row('C1-4c', '〇Zephyra');
row('C1-4d', 'Jane〇 Zephyra');
row('C1-4e', 'SYNCLAIM0001〇');
row('C1-4f', '〇SYNMEMBER0042');
row('C1-4x', 'Zephyra0', P1, C1, 'comparison: the ASCII digit');
