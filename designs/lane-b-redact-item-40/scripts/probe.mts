// probe.mts <tree's packages/model-gateway/src> [detail file]: Queues item 40's three forms and their families, measured
// through the letter's real path (redactLetterForScreen, then holdsIdentifier with the work the redaction spent).
// Synthetic values only. Prints counts; the detail file gets one line per row that is sent with the value in clear.
// Run: node --import /home/user/ops/designs/lane-b-redact-ssn-phone/gate/ts-resolve.mjs probe.mts <dir> [detail]
import { writeFileSync } from 'node:fs';
const [dir, detailFile] = process.argv.slice(2);
const H = await import(`${dir}/redact.ts`);
const claims = (...n: string[]) => [{ claimId: 'synthetic-claim-40', patientPseudonym: 'synthetic-patient-40', claimNumbers: n }];
const patient = (names: string[], memberIds: string[]) => ({ pseudonym: 'synthetic-patient-40', names, datesOfBirth: ['1980-03-14'], memberIds });
type Out = 'refused' | 'clear' | 'hidden';
/** Refused; or sent with `shown` true of the sent text (the value in clear); or sent without it. */
const outcome = (letter: string, p: unknown, c: unknown, shown: (sent: string) => boolean): Out => {
  const r = H.redactLetterForScreen(letter, p, c);
  return H.holdsIdentifier(r.text, p, c, H.checkWorkOf(r)) ? 'refused' : shown(r.text) ? 'clear' : 'hidden';
};
const detail: string[] = [];
const tally = new Map<string, Record<Out, number>>();
const count = (key: string, out: Out, row: () => string) => {
  const t = tally.get(key) ?? { clear: 0, hidden: 0, refused: 0 };
  t[out] += 1;
  tally.set(key, t);
  if (out === 'clear') detail.push(`${key}\t${row()}`);
};
const hex = (cp: number) => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;
const esc = (text: string) => JSON.stringify(text).replace(/[^\x20-\x7e]/g, (ch) => `<${hex(ch.codePointAt(0) ?? 0)}>`);
const all = function* () { for (let cp = 0; cp <= 0x10ffff; cp += 1) if (cp < 0xd800 || cp > 0xdfff) yield cp; };
const category = (ch: string) => ['Nl', 'No', 'Cc', 'Cf', 'Zl', 'Zp', 'Zs', 'Co', 'Cn', 'Mn', 'Mc', 'Me'].find((c) => new RegExp(`^\\p{${c}}$`, 'u').test(ch)) ?? '??';

// ---- R1-3: a number character that is no decimal digit, right beside a stored value.
const NUMERIC = [...all()].filter((cp) => /^\p{N}$/u.test(String.fromCodePoint(cp)) && !/^\p{Nd}$/u.test(String.fromCodePoint(cp)));
const digitsOnly = [patient(['JANE Q ZEPHYRA'], ['76543210']), claims('ZZ99887')] as const;
const lettered = [patient(['JANE Q ZEPHYRA'], ['ZZ7654321']), claims('ZZ99887')] as const;
const holds = (value: string) => (sent: string) => sent.toUpperCase().includes(value);
for (const cp of NUMERIC) {
  const ch = String.fromCodePoint(cp);
  const kept = ch.normalize('NFKC') === ch ? 'NFKC-same' : 'NFKC-changed';
  const cat = category(ch);
  const rows: [string, string, readonly [unknown, unknown], string][] = [
    ['digits bare before', `Ref ${ch}76543210 on file.`, digitsOnly, '76543210'],
    ['digits bare after', `Ref 76543210${ch} on file.`, digitsOnly, '76543210'],
    ['digits labeled before', `Member ID ${ch}76543210 paid`, digitsOnly, '76543210'],
    ['digits labeled after', `Member ID 76543210${ch} paid`, digitsOnly, '76543210'],
    ['lettered number before', `Ref ${ch}ZZ7654321 on file.`, lettered, 'ZZ7654321'],
    ['lettered number after', `Ref ZZ7654321${ch} on file.`, lettered, 'ZZ7654321'],
    ['name before', `Dear ${ch}Zephyra, your claim`, digitsOnly, 'ZEPHYRA'],
    ['name after', `Dear Zephyra${ch}, your claim`, digitsOnly, 'ZEPHYRA'],
  ];
  for (const [form, letter, [p, c], value] of rows) count(`R1-3 | ${kept} | ${form}`, outcome(letter, p, c, holds(value)), () => `${hex(cp)} ${cat} ${esc(letter)}`);
  for (const [form, letter, [p, c], value] of rows.slice(0, 2)) count(`R1-3 by category | ${kept} ${cat} | ${form}`, outcome(letter, p, c, holds(value)), () => '');
}

// ---- R1-4: a control or other unseen character inside, before and after a stored number.
const UNSEEN = [...all()].filter((cp) => /^[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Zs}]$/u.test(String.fromCodePoint(cp)));
UNSEEN.push(0xe000, 0xf8ff, 0xf0000, 0x0378, 0xfdd0, 0xffff, 0x10ffff);
const group = (cp: number, ch: string) =>
  cp >= 1 && cp <= 3 ? 'Cc the checks\' own marks U+0001-3' : /^\s$/u.test(ch) ? `${category(ch)} white space (\\s)` : cp === 0x85 ? 'Cc U+0085' : /^\p{Default_Ignorable_Code_Point}$/u.test(ch) ? `${category(ch)} default-ignorable` : `${category(ch)} other`;
// Whether the eight digits go out with nothing between them but that character (or nothing at all).
const digitsShown = (ch: string) => (sent: string) => /7\D{0,2}6\D{0,2}5\D{0,2}4\D{0,2}3\D{0,2}2\D{0,2}1\D{0,2}0/u.test(sent.split(ch).join(''));
for (const cp of UNSEEN) {
  const ch = String.fromCodePoint(cp);
  const g = group(cp, ch);
  const rows: [string, string][] = [
    ['inside, labeled', `Member ID 7654${ch}3210 paid`],
    ['inside, bare', `Ref 7654${ch}3210 on file.`],
    ['inside, glued to a letter', `Fax X7654${ch}3210 ext`],
    ['inside after the first digit, labeled', `Member ID 7${ch}6543210 paid`],
    ['inside twice, labeled', `Member ID 76${ch}543${ch}210 paid`],
    ['inside after a dash, labeled', `Member ID 7654-${ch}3210 paid`],
    ['inside before a space, bare', `Ref 7654${ch} 3210 on file.`],
    ['before, bare', `Ref ${ch}76543210 on file.`],
    ['after, bare', `Ref 76543210${ch} on file.`],
    ['between a letter and the number', `Fax X${ch}76543210 ext`],
    ['between the number and a letter', `Fax 76543210${ch}B ext`],
    ['inside a lettered number', `Ref ZZ76${ch}54321 on file.`],
  ];
  for (const [form, letter] of rows) {
    const [p, c] = form === 'inside a lettered number' ? lettered : digitsOnly;
    const shown = form === 'inside a lettered number' ? (sent: string) => sent.split(ch).join('').toUpperCase().includes('ZZ7654321') : digitsShown(ch);
    count(`R1-4 | ${g} | ${form}`, outcome(letter, p, c, shown), () => `${hex(cp)} ${esc(letter)}`);
  }
}

// ---- (A): a name of one repeated letter, written in pieces with its initials after or before it.
const SUBJECT = (name: string) => [patient([name], ['SYN555001']), claims('ZZ99887')] as const;
for (const L of ['Z', 'A']) {
  for (let n = 2; n <= 12; n += 1) {
    const name = L.repeat(n);
    const writings = new Set<string>([name]);
    for (let k = 1; k < n; k += 1) for (const mark of ['/', ' ', '.', '-']) writings.add(`${L.repeat(k)}${mark}${L.repeat(n - k)}`);
    for (let k = 1; k < n - 1; k += 1) writings.add(`${L.repeat(k)}/${L.repeat(n - k - 1)} ${L}`);
    const chains: string[] = [];
    for (let m = 1; m <= 4; m += 1) chains.push(Array(m).fill(L).join('.'), Array(m).fill(`${L}.`).join(''), Array(m).fill(`${L}.`).join(' '), Array(m).fill(L).join(' '));
    for (const w of writings) for (const chain of chains) for (const letter of [`${w} ${chain}`, `${chain} ${w}`, `${w}, ${chain}`, `Dear ${w} ${chain}, your claim`]) {
      const [p, c] = SUBJECT(name);
      const shown = (sent: string) => sent.replace(/\[[A-Z_0-9]+\]/g, '').replace(/Dear|your claim/g, '').toUpperCase().includes(L);
      count(`(A) | length ${String(n).padStart(2, '0')}`, outcome(letter, p, c, shown), () => `${name} ${esc(letter)}`);
      count('(A) | all lengths', outcome(letter, p, c, shown), () => '');
    }
  }
}
// The same shape for names that are not one repeated letter: a part that ends in an initial of the name.
for (const [name, letter] of [['ANNA', 'Ann A.A.'], ['ANNA', 'Ann/a A.'], ['OTTO', 'Ott O.O.'], ['ELLE', 'Ell E.E.'], ['ANA ZEPHYRA', 'Zephyr A.A.'], ['ANA ZEPHYRA', 'Zephyr/A A.Z.'], ['JANE Q ZEPHYRA', 'Zephyr A.J.Q.'], ['JANE Q ZEPHYRA', 'Zephyr/a J.Q.']] as const) {
  const [p, c] = SUBJECT(name);
  const r = H.redactLetterForScreen(letter, p, c);
  console.log(`(A) other names | ${name} | ${esc(letter)} | ${H.holdsIdentifier(r.text, p, c, H.checkWorkOf(r)) ? 'REFUSED' : esc(r.text)}`);
}
// The three pinned rows themselves.
for (const [letter, [p, c]] of [['Ref ↀ76543210 on file.', digitsOnly], ['Ref 76543210፩ on file.', digitsOnly], ['Member ID 7654\u00853210 paid', digitsOnly], ['Fax X7654\u00853210 ext', digitsOnly], ['Member ID 7654\u00003210 paid', digitsOnly], ['ZZ/ZZZZ Z.Z.Z', SUBJECT('ZZZZZZ')], ['AA/AAAAAA A.A.A', SUBJECT('AAAAAAAA')]] as const) {
  const r = H.redactLetterForScreen(letter, p, c);
  console.log(`pinned | ${esc(letter)} | ${H.holdsIdentifier(r.text, p, c, H.checkWorkOf(r)) ? 'REFUSED' : esc(r.text)}`);
}
console.log(`sets: numeric not decimal ${NUMERIC.length}; unseen ${UNSEEN.length}`);
console.log('key | sent in clear | sent hidden | refused');
for (const [key, t] of [...tally].sort(([a], [b]) => a.localeCompare(b))) console.log(`${key} | ${t.clear} | ${t.hidden} | ${t.refused}`);
if (detailFile) writeFileSync(detailFile, `${detail.filter((line) => !line.endsWith('\t')).join('\n')}\n`);
