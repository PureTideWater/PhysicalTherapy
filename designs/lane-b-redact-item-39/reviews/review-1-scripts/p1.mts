// P-1: an identifier written with an unseen (or number) character and a gap longer than a window that holds white space.
import { B, H, once, letterPath, short, who, claims } from './lib.mts';
const sp = (n: number) => ' '.repeat(n), hy = (n: number) => '-'.repeat(n);
const V: [string, string][] = [
  ['a member, 256 spaces', `Member ID 7654\u0085${sp(256)}3210`],
  ['a member, 255 spaces (control: one window is the whole letter)', `Member ID 7654\u0085${sp(255)}3210`],
  ['b member, 255 hyphens then one space', `Member ID 7654\u0085${hy(255)} 3210`],
  ['c member, 256 hyphens then U+FEFF (white space to the window, invisible joiner to the readings)', `Member ID 7654\u0085${hy(256)}﻿3210`],
  ['d member, hyphen, line break, 255 spaces of indent', `Member ID 7654\u0085-\n${sp(255)}3210 was denied.`],
  ['e member, unseen first then far', `Member ID 7\u0085654 3210 ok`.replace(' 3210', `${sp(260)}3210`)],
  ['f claim', `Claim ZZ\u0085${sp(256)}99887 was denied.`],
  ['g date of birth', `DOB 03/14/\u0085${sp(256)}1980 on file.`],
  ['h written date of birth', `DOB March\u0085${sp(256)}14, 1980 on file.`],
  ['i name', `Patient Jane Q\u0085${sp(256)}Zephyra was seen.`],
  ['j member, number character, spaces both sides', `Member ID 76${sp(256)}54½32${sp(256)}10 was denied.`],
  ['k member, U+0000', `Member ID 7654\u0000${sp(256)}3210`],
];
for (const [name, text] of V) {
  const b = once(B, text), h = once(H, text), lb = letterPath(B, text), lh = letterPath(H, text);
  const off = H.matchingForTests.withWindows({ off: true }, () => once(H, text)).result;
  const frag = (t: string) => (t.match(/7654|3210|765?4?|99887|ZZ(?=\u0085)|1980|03\/14|March|Jane Q|Zephyra|\b10\b|\b32\b/gu) ?? []).join(',');
  console.log(`${name}\n  in   ${short(text)}\n  BASE ${b.out} marked=${b.text.endsWith('\u0001')} clear=[${frag(b.text)}]\n  HEAD ${h.out} marked=${h.text.endsWith('\u0001')} clear=[${frag(h.text)}] out=${short(h.text)}\n  HEAD windows off: ${off.out}; redactLetter path BASE ${lb.out} HEAD ${lh.out} same=${lb.text === lh.text}`);
}
