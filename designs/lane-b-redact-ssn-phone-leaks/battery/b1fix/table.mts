// Avenue 6: the look-alike table against what fold really reads. node table.mts
import { pathToFileURL } from 'node:url';
const R = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const T = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/confusables.ts').href);
const hex = (c: string) => 'U+' + (c.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0');
const dead: string[] = []; const other: string[] = []; let same = 0;
for (const [ch, as] of T.LOOK_ALIKES as Map<string, string>) {
  const f = R.fold(ch) as string;
  if (f === as.toUpperCase()) { same += 1; continue; }
  (/^\p{Nd}$/u.test(ch) ? dead : other).push(`${hex(ch)}:${as}->${f}`);
}
console.log('entries', (T.LOOK_ALIKES as Map<string, string>).size, 'fold agrees', same);
console.log('decimal digits the table reads as a letter or another digit, fold reads by value (table entry dead):', dead.join(' '));
console.log('letters the table reads as X, fold reads as something else:', other.join(' '));
// every letter (not a decimal digit) that fold reads as an ASCII digit
const toDigit: string[] = [];
for (let cp = 0x80; cp <= 0x1FFFF; cp += 1) {
  if (cp >= 0xD800 && cp <= 0xDFFF) continue;
  const ch = String.fromCodePoint(cp);
  if (ch.normalize('NFKC') !== ch || !/^\p{L}$/u.test(ch)) continue;
  const f = R.fold(ch) as string;
  if (/^[0-9]$/.test(f)) toDigit.push(`${hex(ch)}${ch}->${f}`);
}
console.log('letters fold reads as a digit (' + toDigit.length + '):', toDigit.join(' '));
