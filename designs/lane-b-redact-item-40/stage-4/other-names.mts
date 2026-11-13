// other-names.mts <tree> [detail.jsonl]: ruling (A) beyond names of Z and of A (the design note tried eight rows). For each of 40
// ordinary synthetic names of two or three parts, each part of four letters or more is written cut in two at every
// place by a space, "/", "." or "-", then a chain of 1 to 4 of the name's own initials in four writings ("A.B",
// "A.B.", "A. B.", "A B"), in three frames, through redactLetterForScreen and the whole check. Printed: letters,
// and clear / hidden / refused, where clear is a letter of the WRITTEN NAME OR CHAIN left outside the placeholders; and,
// apart, the letters whose name written the same way with NO chain is clear too (the cut alone is not read as the
// name: not ruling (A)'s). Counts only on stdout; the clear rows, synthetic, go to the detail file when one is named.
import fs from 'node:fs'; import path from 'node:path'; import { pathToFileURL } from 'node:url';
const [tree, detail] = process.argv.slice(2);
const H = await import(pathToFileURL(path.join(tree!, 'redact.ts')).href);
const NAMES = ['MARIA LOPEZ', 'OLIVIA BROWN', 'JOSHUA KIM', 'DANIEL OKAFOR', 'ROBERT E NGUYEN', 'SARAH COHEN', 'MIGUEL TORRES', 'EMILY WATSON', 'HANNAH PRICE', 'JANE Q ZEPHYRA',
  'THOMAS WRIGHT', 'PRIYA RAMAN', 'CARLOS MENDEZ', 'GRACE ABARA', 'WILLIAM T HARLOW', 'NAOMI FELDSTEIN', 'DMITRI VOLKOV', 'AISHA BELLO', 'KENJI MORITA', 'LUCIA FERRANTE',
  'PATRICK QUILL', 'ELENA SORVINO', 'MARCUS DELACROIX', 'INGRID HALVORSEN', 'SAMUEL OYELARAN', 'BEATRIZ ANDRADE', 'TREVOR MCALLEN', 'YASMIN KHOURY', 'OWEN PELLETIER', 'FATIMA ZAHRANI',
  'GEORGE U VANTREE', 'HELEN IVERSON', 'XAVIER DUPONT', 'RUTH ELLISON', 'VICTOR ARANDA', 'JUNE WHITLOCK', 'CALEB STROUD', 'NORA KESTREL', 'ISAAC BRANDT', 'ZELDA MARLOWE'];
const FRAMES: [string, string][] = [['', ''], ['12: ', ' (34)'], ['Patient: ', ' was seen on the date of service.']];
const title = (s: string) => s[0] + s.slice(1).toLowerCase();
const out = detail ? fs.createWriteStream(detail) : null;
const t = { letters: 0, clear: 0, hidden: 0, refused: 0, clearWithNoChain: 0 };
for (const name of NAMES) {
  const parts = name.split(' '); const initials = parts.map((p) => p[0]!);
  const P = { pseudonym: 'synthetic-patient-r3', names: [name], datesOfBirth: ['1961-03-03'], memberIds: ['SYN555001'] };
  const C = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: ['ZZ99887'] }];
  const run = (letter: string, before: string, after: string) => {
    const r = H.redactLetterForScreen(letter, P, C);
    if (H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r))) return 'refused';
    let rest = r.text as string;
    if (!rest.startsWith(before) || !rest.endsWith(after)) return 'clear';
    rest = rest.slice(before.length, rest.length - after.length).replace(/\[PATIENT_NAME\]/gu, '');
    return /\p{L}/u.test(rest) ? 'clear' : 'hidden';
  };
  for (const part of parts) {
    if (part.length < 4) continue;
    for (const upper of [true, false]) for (let cut = 1; cut < part.length; cut += 1) for (const mark of [' ', '/', '.', '-']) {
      const piece = upper ? part : title(part);
      const written = `${piece.slice(0, cut)}${mark}${upper ? piece.slice(cut) : piece.slice(cut).toUpperCase()}`;
      for (let n = 1; n <= 4; n += 1) {
        const chain = Array.from({ length: n }, (_, i) => initials[i % initials.length]!);
        for (const initialsWritten of [chain.join('.'), `${chain.join('.')}.`, `${chain.join('. ')}.`, chain.join(' ')]) for (const sep of ['.', ' ', ', ']) for (const [before, after] of FRAMES) {
          const letter = `${before}${written}${sep}${initialsWritten}${after}`;
          const got = run(letter, before, after);
          t.letters += 1; t[got as 'clear'] += 1;
          if (got === 'clear') {
            const alone = run(`${before}${written}${after}`, before, after) === 'clear';
            if (alone) t.clearWithNoChain += 1;
            else out?.write(JSON.stringify({ name, letter, sent: H.redactLetterForScreen(letter, P, C).text }) + '\n');
          }
        }
      }
    }
  }
}
out?.end();
console.log(`names ${NAMES.length} letters ${t.letters} clear ${t.clear} (of which the name so written is clear with no chain too: ${t.clearWithNoChain}; the rest: ${t.clear - t.clearWithNoChain}) hidden ${t.hidden} refused ${t.refused}`);
