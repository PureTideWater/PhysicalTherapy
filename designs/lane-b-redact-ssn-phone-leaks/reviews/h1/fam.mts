// node fam.mts <seconds per family> i ii iii iv : the four give-back families of round H, head against before and base
import { load, outcome, show, worse, rng } from './lib.mts';
const [H, P, B] = [await load('head'), await load('before'), await load('base')];
const args = process.argv.slice(2);
const budget = Number(args.find((a) => /^[0-9]+$/.test(a)) ?? 30) * 1000;
const fams = new Set(args);
type Job = [string, string, string];
const jobs: Record<string, Job[]> = { i: [], ii: [], iii: [], iv: [] };
const q = (s: string) => JSON.stringify(s);
// (i) a date with its month's word glued after a shape's last four
{
  const shapes: [string, string][] = [['', '900-12-3456'], ['', '202-555-0123'], ['', '(202) 555-0123'], ['SSN ', '900.12 3456'], ['Tel ', '202.555 0123'], ['SSN ', '900 12 3456']];
  for (const pre of ['', 'Ref ']) for (const [lab, shape] of shapes) for (const day of ['01', '1']) for (const j1 of ['', '-', '/', '.', ' ']) for (const mon of ['Jan', 'JAN.', 'may']) for (const j2 of ['', '-', '/', ' ', ', ', ',', '. ', ' - ', '-,', '.']) for (const yr of ['2020', '20'])
    jobs.i!.push([`i|j1=${q(j1)}|j2=${q(j2)}|y${yr.length}`, `${lab}${shape}`, `${pre}${lab}${shape}${day}${j1}${mon}${j2}${yr}`]);
}
// (ii) a date glued after a bare nine or ten
{
  const labels = ['', 'Seen ', 'SSN: ', 'Phone ', 'Medicare ', 'SSN/Phone: ', 'PatientSSN ', 'Claim '];
  const styles: [string, (j: string) => string][] = [['dmy', (j) => `01${j}02${j}2020`], ['dMony', (j) => `01${j}Jan${j}2020`], ['ymd', (j) => `2020${j}01${j}02`], ['ymd1', (j) => `2020${j}1${j}5`], ['short', (j) => `9${j}9${j}2020`]];
  const afters = ['', ' ', '1234', '150.00', '1,250.00', '150.5', '150,00', '$150.00', '01/31/2020', '1/5/2021', '01-Jan-2020', 'Jan 31, 2020', '2020-01-31', '01/31/20', '01/31/2020150.00', '01/31/2020 150.00', '150.00120.00', '150.00-120.00', '150.00 120.00', '1234567.89', '10:30', '97110'];
  const joinsWide = ['/', '-', '.', '|', '_', '\\', '~', '\u2043', '\u00B7', '\u2215', '\u2212', '\u2013'];
  for (const label of labels) for (const bare of ['900123456', '2025550123']) for (const [style, make] of styles) {
    for (const j of ['/', '-']) for (const after of afters) jobs.ii!.push([`ii|after=${q(after)}|j=${j}`, `${label.trim() || 'none'}:${style}`, `${label}${bare}${make(j)}${after} Paid`]);
    for (const j of joinsWide) for (const after of ['', '150.00']) jobs.ii!.push([`ii|joiner=${q(j)}(U+${j.codePointAt(0)!.toString(16)})`, `${label.trim() || 'none'}:${style}`, `${label}${bare}${make(j)}${after} Paid`]);
  }
}
// (iii) a reference's noun and the line breaks before its number
{
  const nouns = ['Statement', 'Claim', 'Remittance Advice', 'Remittance\n\n\nAdvice', 'ICN', 'Please keep this notice.', 'regarding your claim.'];
  const mids = ['', 'No.', 'Number:', 'ID', '#', 'is', 'Line'];
  const gap1s = [' ', '\n', '\n\n', '\n\n\n\n', '\n-----\n'];
  const gap2s = [' ', '\n', '\n\n', '\n\n\n', '\n-----\n', '\n...\n', '\n-  \n', '\n\n# ', '\n\n: ', '\n=====\n\n'];
  for (const noun of nouns) for (const mid of mids) for (const gap1 of mid === '' ? [''] : gap1s) for (const gap2 of gap2s) for (const number of ['900-12-3456150.00', '900123456150.00']) {
    const n1 = (gap1.match(/\n/g) ?? []).length + (noun.includes('\n') ? 100 : 0);
    jobs.iii!.push([`iii|breaksInsideLabel=${n1}${gap1.includes('-') ? '(rule)' : ''}${mid === '' ? '(no second word)' : ''}|afterLabel=${q(gap2)}`, `${noun}/${mid}`, `Hello,\n${noun}${gap1}${mid}${gap2}${number}\nThank you.`]);
  }
}
// (iv) a date before a year glued to a shape
{
  const pres = ['01/02/', '01 / 02 / ', '01/ 02/ ', '01/02/ ', '01 /02 /', '01-02-', '1.2.', '01.02. ', 'Jan ', 'January ', 'Jan. ', 'Jan, ', 'Jan 1, ', 'Jan 1 ', 'PaidJan 1, ', 'PaidJanuary ', 'Dismay ', '5January ', '-Jan-', '/Jan/', '(Jan) ', 'sep ', '1 January ', '01JAN', '01-Jan-', '1st of January, ', 'Dec/', '3/', '12-', 'Jan\n', 'January, ', 'Sept. ', "Jan '", 'mid-Jan ', 'Jan.-', 'DOS:Jan ', 'DOSJan ', '\u00E9Jan ', '_Jan ', '1Jan ', 'Jan  ', 'JAN\t'];
  for (const lead of ['', 'Paid on ', 'Service ']) for (const pre of pres) for (const shape of ['2020900-12-3456', '2020202-555-0123', '1999900-12-3456']) jobs.iv!.push([`iv|pre=${q(pre)}`, lead.trim() || 'none', `${lead}${pre}${shape} thank you`]);
}
for (const fam of Object.keys(jobs)) {
  if (!fams.has(fam)) continue;
  const list = jobs[fam]!;
  const r = rng(7);
  for (let k = list.length - 1; k > 0; k -= 1) { const j = Math.floor(r() * (k + 1)); [list[k], list[j]] = [list[j]!, list[k]!]; }
  const t0 = Date.now();
  const tallies = new Map<string, { n: number; sent: number; vsBefore: number; vsBase: number; dims: Set<string>; ex: string[] }>();
  let done = 0;
  let headSent = 0;
  for (const [key, dim, text] of list) {
    if (Date.now() - t0 > budget) break;
    done += 1;
    let t = tallies.get(key);
    if (!t) { t = { n: 0, sent: 0, vsBefore: 0, vsBase: 0, dims: new Set(), ex: [] }; tallies.set(key, t); }
    t.n += 1;
    const h = outcome(H, text);
    if (h.refused) continue;
    headSent += 1;
    t.sent += 1;
    const p = outcome(P, text);
    const b = outcome(B, text);
    const wp = worse(h, p);
    const wb = worse(h, b);
    if (wp) t.vsBefore += 1;
    if (wb) t.vsBase += 1;
    if (wp || wb) { t.dims.add(dim); if (t.ex.length < 1) t.ex.push(`${q(text).slice(0, 150)} head=${show(h, text).slice(0, 40)} before=${show(p, text).slice(0, 40)} base=${show(b, text).slice(0, 40)}`); }
  }
  console.log(`## family ${fam}: ran ${done}/${list.length} letters in ${Date.now() - t0} ms; head sent ${headSent}`);
  for (const [key, t] of [...tallies].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
    if (t.vsBefore + t.vsBase === 0) continue;
    console.log(`${key} vsBefore=${t.vsBefore}/${t.n} vsBase=${t.vsBase}/${t.n} dims=[${[...t.dims].slice(0, 14).join(' ; ').replace(/\n/g, '\\n')}]\n    ${t.ex.join('\n    ')}`);
  }
}
