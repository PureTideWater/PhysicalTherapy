import { A, B, run } from './lib.mts';
const HELD = 'Paid $0,000.00. Service 01/01/2020-01/02/2020Paid $0,000.00. ';
const more = { datesOfBirth: ['2009-05-20'] };
for (const t of ['May/2009     20', 'May/2009 20', 'May/2009  20', '05/2009     20', 'Mar/1980     14', 'May 2009     20', 'May/09     20', '20     May/2009', '2009/May     20']) {
  const letter = `${HELD}Seen ${t}`;
  const { patient, claims } = (await import('./lib.mts')).judge1(['JANE Q ZEPHYRA'], t.startsWith('Mar') ? {} : more);
  const r = B.redactLetterForScreen(letter, patient, claims);
  console.log(JSON.stringify(t), 'A', JSON.stringify(run(A, letter, ['JANE Q ZEPHYRA'], t.startsWith('Mar') ? {} : more)?.slice(60) ?? null), 'B', JSON.stringify(run(B, letter, ['JANE Q ZEPHYRA'], t.startsWith('Mar') ? {} : more)?.slice(60) ?? null), 'Bred', JSON.stringify(r.text.slice(60)));
}
