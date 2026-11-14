// Many identifiers sharing prefixes and suffixes (the trie's fail and output links): base vs head.
import { B, H, once, esc } from './lib.mts';
let s = 5; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const word = (al: string[], lo: number, hi: number) => { let w = ''; const n = lo + Math.floor(rnd() * (hi - lo + 1)); for (let i = 0; i < n; i++) w += pick(al); return w; };
let n = 0, d = 0; const oc: Record<string, number> = {};
for (let r = 0; r < 500; r++) {
  const al = pick([['1', '2'], ['1', '2', 'A'], ['7', '8', '9', 'Z'], ['1', '٣', 'A', '\u{1D7CE}']]);
  const nums = Array.from({ length: pick([3, 40, 300]) }, () => word(al, 4, 10));
  const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: [word(al, 6, 9), word(al, 6, 9)], datesOfBirth: ['1980-03-14'] };
  const c = rnd() < 0.5 ? [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: nums }] : nums.map((x, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [x] }));
  let text = 'Re: '; const k = 3 + Math.floor(rnd() * 30); for (let i = 0; i < k; i++) text += pick([...al, ...al, ' ', ' ', '-', '. ', 'Claim ', pick(nums), pick(nums).toLowerCase(), ' and ', '\n', 'x']);
  const b = once(B, text, who, c), h = once(H, text, who, c); n++; oc[b.out + '/' + h.out] = (oc[b.out + '/' + h.out] ?? 0) + 1;
  if (b.out !== h.out || b.text !== h.text) { d++; if (d < 4) console.log('DIFF', esc(text), b.out, h.out); }
}
console.log('many identifiers: cases', n, 'differing', d, JSON.stringify(oc));
