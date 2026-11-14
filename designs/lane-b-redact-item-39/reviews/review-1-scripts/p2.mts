// P-2: the entry's own mark. Base marks what its whole re-read's check holds anywhere; head only what a window holds.
import { B, H, once, short } from './lib.mts';
const prose = (n: number) => 'The claim was reviewed and paid in full by the plan. '.repeat(Math.ceil(n / 53)).slice(0, n);
for (const [name, text] of [
  ['number glued to a letter, a fraction 600 characters on', `Ref 76543210x on file. ${prose(600)} Paid ½ of the charge. ${prose(300)}`],
  ['the same, U+0085 in place of the fraction', `Ref 76543210x on file. ${prose(600)} Paid\u0085 half of the charge. ${prose(300)}`],
] as const) {
  const b = once(B, text), h = once(H, text);
  console.log(`${name}\n  in   ${short(text)}\n  BASE ${b.out} ends with U+0001: ${b.text.endsWith('\u0001')}\n  HEAD ${h.out} ends with U+0001: ${h.text.endsWith('\u0001')}; same but for the mark: ${b.text === h.text + '\u0001'}`);
}
