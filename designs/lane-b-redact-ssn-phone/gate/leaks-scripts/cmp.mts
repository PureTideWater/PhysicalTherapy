// node cmp.mts <file of letters, one JSON string per line> <label=redact.ts>...: each letter's outcome on each tree
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const [, , file, ...trees] = process.argv;
const patient = { pseudonym: 'p', names: (process.env.NAMES ?? 'JANE Q ZEPHYRA').split(';'), datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321'] };
const claims = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const mods = await Promise.all(trees.map(async (t) => ({ label: t.split('=')[0]!, R: await import(pathToFileURL(t.split('=')[1]!).href) })));
for (const line of fs.readFileSync(file!, 'utf8').split('\n')) {
  if (!line.trim()) continue;
  const text = JSON.parse(line) as string;
  const out = mods.map(({ label, R }) => {
    const s = R.redactLetterForScreen(text, patient, claims);
    return `${label}: ${R.holdsIdentifier(s.text, patient, claims) ? 'REFUSED' : s.text === text ? 'same' : JSON.stringify(s.text)}`;
  });
  console.log(JSON.stringify(text), '\n   ', out.join(' | '));
}
