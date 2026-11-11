import { pathToFileURL } from 'node:url';
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321', '7654321'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }, { claimId: 'd', patientPseudonym: 'p', claimNumbers: ['4455667'] }];
const S = 'packages/model-gateway/src/redact.ts';
const K = await import(pathToFileURL(`/home/user/leaks/${S}`).href);
const B = await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href);
const ids = ['ZZ76543ꛯ1', 'ZZ765432١', 'ZZ76543Z1', 'ZZ7654E21', 'ZZ76S4321', 'ZZ765432l', 'ZZ765432I', 'ZZ7654321', 'ΖΖ7654321', 'ZZ7654৩21'];
const seps = [' ', '\n', '  ', ' \n', '. ', ', ', ': ', '-', ' - ', '\t'];
const tails = ['202 555 0123', '202-555-0123', '202.555.0123', '(202) 555-0123', '2025550123', '202 555-0123', '202/555-0123', '555-0123', '555 0123', '01-02-2020', '00-12-3456', '00 12 3456', '23-45-6789', '900-12-3456', '900 12 3456', '800 555 0123', '8005550123', '202 5550123', '202555 0123'];
const clear = (s: string) => s.replace(/\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g, '|');
let n = 0; const out: Record<string, number> = {}; const shown: string[] = [];
for (const id of ids) for (const sep of seps) for (const tail of tails) for (const lead of ['ID ', 'Member ID: ', 'Call ', '']) {
  const t = `${lead}${id}${sep}${tail}`;
  n += 1;
  const ks = K.redactLetterForScreen(t, P, C).text; const kr = K.holdsIdentifier(ks, P, C);
  const bs = B.redactLetterForScreen(t, P, C).text; const br = B.holdsIdentifier(bs, P, C);
  const tailDigits = tail.replace(/[^0-9]/g, '');
  const kShows = !kr && clear(ks).replace(/[^0-9]/g, '').includes(tailDigits);
  const bShows = !br && clear(bs).replace(/[^0-9]/g, '').includes(tailDigits);
  const cls = `${br ? 'B:REF' : bShows ? 'B:shows' : 'B:hides'} ${kr ? 'K:REF' : kShows ? 'K:shows' : 'K:hides'}`;
  out[cls] = (out[cls] ?? 0) + 1;
  if (kShows && !bShows && shown.length < 400) shown.push(JSON.stringify({ t, b: br ? 'REFUSED' : bs, k: ks }));
}
console.log(n, out);
const byTail: Record<string, number> = {};
for (const s of shown) { const o = JSON.parse(s); const tail = tails.find((x) => o.t.endsWith(x)) ?? '?'; byTail[tail] = (byTail[tail] ?? 0) + 1; }
console.log('head shows the tail where the base hides or refuses, by tail:', byTail);
for (const s of shown.slice(0, 12)) console.log(s.slice(0, 260));
