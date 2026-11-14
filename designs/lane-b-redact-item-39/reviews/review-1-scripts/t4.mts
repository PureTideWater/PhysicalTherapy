// Lemma 4 (sourceOf against V8's own source) and the dense rule's boundary.
import { B, H, once, esc } from './lib.mts';
const { sourceOf } = H.matchingForTests;
let s = 77; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
const toks = ['/', '\\/', '[', ']', '\\[', '\\]', '[/]', '[^/]', '[^]', '[]', '\\\\', '\\', '\n', '\r', ' ', ' ', 'a', '-', '(?:', ')', '\\p{L}', '[\\]/]', '\u{1F600}', '\\u{2028}', '(?<![\\p{L}\\p{N}])', '[\\s\\p{Pd}/]*', '*', '\\-', '[a-]', '[[]', '[\\\\]', '\\u002F', '\\x2F', '\\cJ', '(?<=/)', '{', '}', '|', '^', '$', '.', '\t', '\0'.replace('\0', '\\0')];
let built = 0, bad = 0; const badOnes: string[] = [];
for (let k = 0; k < 300000; k++) {
  const n = 1 + Math.floor(rnd() * 7); let t = ''; for (let i = 0; i < n; i++) t += pick(toks);
  let v8: string; try { v8 = new RegExp(t, 'gu').source; } catch { continue; }
  built++; let mine: string; try { mine = sourceOf(t); } catch (e) { mine = 'THROW'; }
  if (mine !== v8) { bad++; if (badOnes.length < 8) badOnes.push(`${esc(t)} -> sourceOf ${esc(mine)} v8 ${esc(v8)}`); }
}
console.log('sourceOf: patterns that compile', built, 'where sourceOf differs from V8', bad, badOnes);
// Dense rule: a member ID written k times (k around DENSE_PLACES = 16), each written a different way, some not matches.
const ways = ['76543210', '7654 3210', '7654-3210', 'x76543210', '76543210x', '7654.3210', '76-54-32-10', '765432109', '(76543210)', '7 6 5 4 3 2 1 0', 'ID#76543210', '76543210/', "76'543'210", '7654­3210', '76543210.50', '$76543210'];
let dd = 0, dn = 0;
for (let k = 13; k <= 20; k++) for (let r = 0; r < 150; r++) {
  let text = 'Our letter. '; for (let i = 0; i < k; i++) text += pick(ways) + pick([' ', '. ', ' and ', '\n', ' Member ID ', ' paid 12.00 ', '']);
  const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['76543210'], datesOfBirth: ['1980-03-14'] }; const c = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: [pick(['76543210', '3210', '765432', 'ZZ99887'])] }];
  const b = once(B, text, who, c), h = once(H, text, who, c); dn++; if (b.out !== h.out || b.text !== h.text) { dd++; if (dd < 4) console.log('DENSE DIFF', esc(text), b.out, h.out); }
}
console.log('dense boundary: cases', dn, 'differing', dd);
// Overlapping and self-overlapping numbers and names, glued, labeled.
const ov = ['12121212', '1212', '121212', 'ABAB1212', '11111111', 'AAAA', 'ANNA', 'NAN', 'ANNA NAN', 'AB12AB12', '2121'];
const bits = ['12', '1', '2', '1212', '12121212', '-', ' ', '.', '/', 'A', 'B', 'AB', 'Anna', 'Nan', 'na', 'n', 'x', 'Claim ', 'ID#', 'Member ID ', '\n', '121', "'", ':', '#', '(', 'é', '１２'];
let od = 0, on = 0; const oc: Record<string, number> = {};
for (let r = 0; r < 6000; r++) {
  const who = { pseudonym: 'p1', names: [pick(['ANNA NAN', 'AB ABAB', 'NAN ANNA-NAN'])], memberIds: [pick(ov)], datesOfBirth: ['1980-03-14'] }; const c = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: [pick(ov), pick(ov)] }];
  let text = ''; const n = 2 + Math.floor(rnd() * 40); for (let i = 0; i < n; i++) text += pick(bits);
  const b = once(B, text, who, c), h = once(H, text, who, c); on++; oc[b.out + '/' + h.out] = (oc[b.out + '/' + h.out] ?? 0) + 1; if (b.out !== h.out || b.text !== h.text) { od++; if (od < 4) console.log('OVERLAP DIFF', esc(text), JSON.stringify(who), JSON.stringify(c), b.out, h.out, esc(b.text), esc(h.text)); }
}
console.log('overlapping: cases', on, 'differing', od, JSON.stringify(oc));
