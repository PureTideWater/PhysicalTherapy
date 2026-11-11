// Review A: counts over the fuzzer's runs, and what the letter-path rows show. Run: node analyze.mts
import { readFileSync, readdirSync } from 'node:fs';
const OUT = '/home/user/ops/designs/lane-b-redact-item-26/reviews/a/out';
const base = await import('/home/user/rev/base/redact.ts');
const head = await import('/home/user/rev/head/redact.ts');
const total: Record<string, number> = {};
const time: Record<string, number> = {};
let generated = 0;
const runs = readdirSync(OUT).filter((name) => /^(fuzz|k1)-[0-9]+\.json$/u.test(name) && name !== 'fuzz-99.json');
for (const name of runs) {
  const run = JSON.parse(readFileSync(`${OUT}/${name}`, 'utf8'));
  generated += run.generated;
  for (const [key, value] of Object.entries(run.counts)) total[key] = (total[key] ?? 0) + (value as number);
  for (const [key, value] of Object.entries(run.time)) time[key] = (time[key] ?? 0) + (value as number);
  console.log(name, 'generated', run.generated, 'worst ratio', run.worst.ratio.toFixed(1), JSON.stringify(run.worst.letter).slice(0, 160), run.worst.baseMs.toFixed(1), run.worst.headMs.toFixed(1));
}
console.log('runs', runs.join(' '), 'generated', generated);
console.log('counts', JSON.stringify(total, null, 1));
console.log('time ms', JSON.stringify(time));
const rows = (category: string) => readdirSync(OUT).filter((name) => new RegExp(`^(fuzz|k1)-[0-9]+-${category}\\.jsonl$`, 'u').test(name) && !name.startsWith('fuzz-99-')).flatMap((name) => readFileSync(`${OUT}/${name}`, 'utf8').split('\n').filter((line) => line !== '').map((line) => JSON.parse(line)));
const n = (text: string, placeholder: string) => text.split(placeholder).length - 1;
const TWIN = /9\D{0,3}0\D{0,3}0\D{0,3}1\D{0,3}2\D{0,3}3\D{0,3}4\D{0,3}5\D{0,3}6|555\D{0,2}01[0-9]{2}/u;
const CUT = /900\D{0,3}12\D{0,3}\[(?:MEMBER_ID|CLAIM_[0-9]+)\]|555\D{0,2}\[(?:MEMBER_ID|CLAIM_[0-9]+)\]/u;
const p2 = rows('p2_base_refuses_head_sends');
const classes: Record<string, unknown[]> = {};
for (const row of p2) {
  const names = n(row.headLetter, '[PATIENT_NAME]') > n(row.baseLetter, '[PATIENT_NAME]');
  const numbers = n(row.headLetter, '[MEMBER_ID]') + n(row.headLetter, '[CLAIM_') > n(row.baseLetter, '[MEMBER_ID]') + n(row.baseLetter, '[CLAIM_');
  const twin = TWIN.test(row.headLetter) ? 'TWIN-IN-CLEAR' : CUT.test(row.headLetter) ? 'CHAIN-CUT' : 'no-twin';
  const key = `${names ? 'name' : ''}${numbers ? 'number' : ''}${!names && !numbers ? 'merged-only' : ''}:${twin}`;
  (classes[key] ??= []).push(row);
}
console.log('\nletter path, base refuses and head sends (kept rows):', p2.length);
for (const [key, list] of Object.entries(classes)) {
  console.log(' ', key, list.length);
  for (const row of list.slice(0, key.startsWith('name:') && !key.endsWith('no-twin') ? 6 : 2) as { letter: string; patient: number; baseLetter: string; headLetter: string }[]) console.log('     ', JSON.stringify({ letter: row.letter, patient: row.patient, headLetter: row.headLetter }).slice(0, 700));
}
for (const category of ['a_base_refuses_head_sends', 'b_base_replaced_head_shows', 'b_exact_first_span_not_covered', 'c_candidate_missing', 'd_head_throws', 'f_refused_letter_written_otherwise', 'p2_base_span_not_covered', 'p2_spans_text_differs', 'e_no_crlf', 'e_crlf_lf_SENT', 'k1_sent_with_crlf_refused_with_lf_no_wider_match', 'k1_sent_with_crlf_refused_with_lf_wider_applied', 'p2_head_paths_part']) {
  const list = rows(category);
  console.log(`\n${category}: kept ${list.length}`);
  for (const row of list.slice(0, 4)) console.log('   ', JSON.stringify(row).slice(0, 800));
}
const slow = rows('slow').sort((a, b) => b.headMs / b.baseMs - a.headMs / a.baseMs);
console.log('\nslow rows', slow.length, slow.slice(0, 3).map((row) => `${row.baseMs.toFixed(1)}->${row.headMs.toFixed(1)}`).join(' '));
// One line ending more, in LF alone: is the "\r\r\n" row the recorded residual (one character further)?
const JANE = { pseudonym: 'synthetic-patient-1', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] };
const CLAIMS = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers: ['SYNCLAIM0001'] }];
for (const ending of ['\n', '\n\n', ' \n', '\r\n', '\r\r\n', '\n\r', '\r\n\r\n', '\r\n\n']) {
  const letter = `SSN verified. Account ${ending}No. 900-12-345678`;
  const answer = (m: typeof head) => { const r = m.redactLetterForScreen(letter, JANE, CLAIMS); return m.holdsIdentifier(r.text, JANE, CLAIMS) ? 'REFUSED' : JSON.stringify(r.text); };
  console.log('ending', JSON.stringify(ending), 'base', answer(base), 'head', answer(head));
}
