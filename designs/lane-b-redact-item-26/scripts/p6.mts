// node p6.mts <label=redact.ts>...: P6's stored numbers, written as stored and otherwise. Synthetic values only.
import { pathToFileURL } from 'node:url';
const mods = await Promise.all(process.argv.slice(2).map(async (t) => ({ label: t.split('=')[0]!, R: await import(pathToFileURL(t.split('=')[1]!).href) })));
const C = (n: string[]) => [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: n }];
const cases: [string, string[], string[]][] = [];
for (const sep of ['/', '.', ',', '+', ' / ', '&', ')(']) {
  const id = `ZZ12345${sep}01`;
  cases.push([`The member ${id} was paid short.`, [id], ['SYNCLAIM0001']], [`Member ID: ${id} was paid short.`, [id], ['SYNCLAIM0001']], [`The member ZZ12345-01 was paid short.`, [id], ['SYNCLAIM0001']], [`Paid 12345${sep}01 today`, [id], ['SYNCLAIM0001']]);
}
cases.push(['Your claim 1234/56 was denied.', ['SYNMEMBER0042'], ['1234/56']], ['Claim number: 1234/56 was denied.', ['SYNMEMBER0042'], ['1234/56']], ['Your claim 2026.00123 was denied.', ['SYNMEMBER0042'], ['2026.00123']], ['Paid $2026.00 on 12/34', ['SYNMEMBER0042'], ['2026.00123']], ['Paid $1,234.56 for 1234.56 units', ['SYNMEMBER0042'], ['1234.56']], ['Seen 2026/03/05 and paid', ['SYNMEMBER0042'], ['2026/03/05']], ['Claim 2026/03/05 and paid', ['SYNMEMBER0042'], ['2026/03/05']], ['The member ZZ12345 was paid', ['ZZ12345 01'], ['SYNCLAIM0001']]);
for (const [text, ids, claims] of cases) {
  const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ids };
  console.log(JSON.stringify(text).padEnd(46), JSON.stringify(ids.concat(claims)).padEnd(30), mods.map(({ label, R }) => { const s = R.redactLetterForScreen(text, P, C(claims)); return `${label}: ${R.holdsIdentifier(s.text, P, C(claims)) ? 'REFUSED' : s.text === text ? 'same' : JSON.stringify(s.text)}`; }).join(' | '));
}
