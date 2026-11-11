// Exhaustive form of the new property: letters where redactLetterForScreen leaves as written what redactLetter replaces and the check does not refuse.
import { pathToFileURL } from 'node:url';
const path = process.argv[2] ?? '/home/user/leaks/packages/model-gateway/src/redact.ts';
const R = await import(pathToFileURL(path).href);
const B = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const P = { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321', '7654321'] };
const C = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }, { claimId: 'd', patientPseudonym: 'p', claimNumbers: ['4455667'] }];
const HELD = 'Seen 01/01/2020-150.00Paid in full. ';
const ids = ['ZZ76543ꛯ1', 'ZZ765432١', 'ZZ76543Z1', 'ZZ7654E21', 'ZZ76S4321', 'ZZ765432l', 'ZZ765432I', 'ZZ7654321', 'ΖΖ7654321', 'ZZ7654৩21', '76543ꛯ1', '765432١'];
const leads = ['ID ', 'Member ID: ', 'Call ', '', 'Paid 150.00', HELD];
const gaps = [' ', '\n', '  ', ' \n', '. ', ', ', ': ', '-', ' - ', '\t', ''];
const tails = ['202 555 0123', '202-555-0123', '(202) 555-0123', '2025550123', '555-0123', '555 0123', '01-02-2020', '00-12-3456', '00 12 3456', '23-45-6789', '900-12-3456', '900 12 3456', '8005550123', '202555 0123'];
const ends = ['', ' Paid', '.', ' Zephyra'];
const clear = (s: string) => s.replace(/\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|SSN|PHONE|CLAIM_\d+)\]/g, '|');
// is `shown` (digits and letters the head sends) more than a subsequence of what the base sends? approximate: every alnum char of head's clear text must be a subsequence of base's clear text
const subseq = (a: string, b: string) => { let j = 0; for (const ch of a) { j = b.indexOf(ch, j); if (j < 0) return false; j += 1; } return true; };
const alnum = (s: string) => clear(s).replace(/[^\p{L}\p{N}|]/gu, '').replace(/\|/g, '');
let n = 0, viol = 0, sent = 0, refusedN = 0, shows = 0, flips = 0; const ex: string[] = []; const exShow: string[] = []; const byCls: Record<string, number> = {};
const t0 = Date.now();
for (const lead of leads) for (const id of ids) for (const gap of gaps) for (const tail of tails) for (const end of ends) {
  const t = `${lead}${id}${gap}${tail}${end}`; n += 1;
  const s = R.redactLetterForScreen(t, P, C).text; const all = R.redactLetter(t, P, C).text; const r = R.holdsIdentifier(s, P, C);
  const bs = B.redactLetterForScreen(t, P, C).text; const br = B.holdsIdentifier(bs, P, C);
  if (r) refusedN += 1; else sent += 1;
  if (s !== all && !r) { viol += 1; if (ex.length < 6) ex.push(JSON.stringify({ t, s, all })); }
  if (!r && br) { flips += 1; }
  if (!r && !br && !subseq(alnum(s), alnum(bs))) { shows += 1; if (exShow.length < 8) exShow.push(JSON.stringify({ t, b: bs, h: s })); }
  const cls = `${br ? 'B:REF' : 'B:sent'} ${r ? 'H:REF' : 'H:sent'}`; byCls[cls] = (byCls[cls] ?? 0) + 1;
}
console.log(JSON.stringify({ path: path.split('/').slice(3, 4)[0], n, sent, refused: refusedN, leftAsWrittenAndSent: viol, baseRefusedHeadSent: flips, headShowsWhatBaseHides: shows, byCls, ms: Date.now() - t0 }));
for (const e of ex) console.log('  LEFT', e.slice(0, 300)); for (const e of exShow) console.log('  SHOWS', e.slice(0, 300));
