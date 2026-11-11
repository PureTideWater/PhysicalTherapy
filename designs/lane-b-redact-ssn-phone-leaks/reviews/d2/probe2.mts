// node probe2.mts [seed]: review D2, second round. Reads probe1.jsonl, then deepens the findings of probe1 (base tree-ef3 against head fix).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const T0 = Date.now();
const H: any = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const B: any = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const pat = (names = ['JANE Q ZEPHYRA'], dob = ['1980-03-14'], memberIds = ['SYNMEMBER0042']) => ({ pseudonym: 'p', names, datesOfBirth: dob, memberIds });
const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const JANE = pat();
let seed = Number(process.argv[2] ?? 19);
const rnd = () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo + 1));
type Out = { refused: boolean; text: string };
const memo = new Map<string, Out>();
function run(which: 'b' | 'h', text: string, p: any = JANE): Out {
  const key = `${which}${p.datesOfBirth[0]}${p.names[0]}${p.memberIds[0]}\u0000${text}`;
  let o = memo.get(key);
  if (o === undefined) {
    const R = which === 'b' ? B : H;
    try {
      const s = R.redactLetterForScreen(text, p, CLAIMS);
      o = { refused: R.holdsIdentifier(s.text, p, CLAIMS) === true, text: s.text };
    } catch (e) {
      o = { refused: true, text: `THROW ${String(e).slice(0, 80)}` };
    }
    memo.set(key, o);
  }
  return o;
}
const kindOf = (text: string, p: any = JANE) => {
  const b = run('b', text, p);
  const h = run('h', text, p);
  return b.refused ? (h.refused ? 'both' : 'UNREFUSED') : h.refused ? 'NEW' : b.text === h.text ? 'same' : 'CHANGED';
};
const J = (s: string) => JSON.stringify(s);
const clip = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}...` : s);
const describe = (text: string, p: any = JANE) => {
  const b = run('b', text, p);
  const h = run('h', text, p);
  const f = (o: Out) => (o.refused ? 'REFUSED' : o.text === text.normalize('NFKC') ? 'SENT same' : `SENT ${J(o.text)}`);
  return `${kindOf(text, p).padEnd(9)} ${J(text)}  base: ${f(b)} | head: ${f(h)}`;
};
const list = (title: string, texts: readonly string[], p: any = JANE, onlyDiff = false) => {
  const kinds: Record<string, number> = {};
  const lines: string[] = [];
  for (const t of texts) {
    const k = kindOf(t, p);
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (!onlyDiff || (k !== 'same' && k !== 'both')) lines.push(`  ${clip(describe(t, p), 330)}`);
  }
  console.log(`\n## ${title}: ${texts.length} letters ${JSON.stringify(kinds)}`);
  for (const l of lines) console.log(l);
};
const out: string[] = [];

// ---------- A. what probe1 found, read again
{
  const recs = fs.readFileSync('/home/user/review-d2/probe1.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const s3 = recs.filter((r: any) => r.section === 'S3 rows' && r.kind === 'NEW');
  const long = /[0-9]{7,}[-/._|][0-9]{2,3}[-/._|][0-9]{4,}/;
  const multi = s3.filter((r: any) => /[|,;\t]|  /.test(r.min));
  const single = s3.filter((r: any) => !/[|,;\t]|  /.test(r.min));
  console.log(`## A. probe1 S3: ${s3.length} NEW rows; minimal window of several fields: ${multi.length}; one field: ${single.length} (of them a group of seven digits or more before two or three and four: ${single.filter((r: any) => long.test(r.min)).length})`);
  console.log(`  several fields: ${clip([...new Set(multi.map((r: any) => J(r.min)))].join('  '), 2400)}`);
  console.log(`  one field, no group of seven before two or three and four: ${clip([...new Set(single.filter((r: any) => !long.test(r.min)).map((r: any) => J(r.min)))].join('  '), 1800)}`);
  const s1 = recs.filter((r: any) => r.section.startsWith('S1') && r.kind === 'NEW');
  const by: Record<string, Record<string, number>> = {};
  for (const r of s1) ((by[r.c.num] ??= {})[r.c.suf] = ((by[r.c.num] ??= {})[r.c.suf] ?? 0) + 1);
  for (const [num, sufs] of Object.entries(by)) console.log(`  S1 NEW ${num}: ${Object.entries(sufs).map(([s, n]) => `${J(s)} ${n}`).join('  ')}`);
}

// ---------- B. rows with pipes (and the other tight joiners) between cells
list('B1 rows delimited by pipes and other tight joiners', [
  'NPI|POS|CPT|Units|Billed\n1234567893|11|97110|2|150.00', '1234567893|11|97110|2|150.00', '1234567893|12-3456789', 'NPI|TIN\n1234567893|12-3456789', '12-3456789|1234567893', '20260105|11|97110|GP|2|150.00', '20260105|20260112|11|97110', '0012345|11|97110', '0001234567|150|2026',
  '1234567|12|97110', 'SYNCLAIM0001|1234567893|11|97110|2|150.00|82.14', '2026011500123|01|97110|150.00', 'Claim|1234567893|11|97110', 'Paid|1234567893|11|97110', '1234567893 | 11 | 97110 | 2 | 150.00', '1234567893\t11\t97110\t2\t150.00', '1234567893,11,97110,2,150.00',
  '1234567893|420|97110|150.00', '01/05/2026|1234567893|11|97110', '97110|GP|2|150.00|1234567893|11|62701', '1234567893|22|0420|150.00', '0001234567|01/15/2026|150.00', '1234567893|62701|1234', '1234567893/11/97110', '1234567893/123/97110', '1234567893_11_97110', '1234567893.11.97110',
  '1234567893\\11\\97110', '1234567893~11~97110', '1234567893^11^97110', '1234567893*11*97110', '1234567893;11;97110', '1234567893:11:97110', 'remit_20260115_01_0001.pdf', 'EOB_20260115_123_45678.pdf', 'File 835_20260115_001_2345.txt', 'FT1|1|||20260105|20260105|CG|97110', 'IN1|1|0012345|802|45678',
  'Rendering NPI|Billing TIN\n1234567893|12-3456789', '1234567893|12-3456789|Synth Clinic|Springfield', 'Synth Clinic|1234567893|12-3456789', 'W2026011500123|1234567893|11|97110',
]);
{
  const CELLS: Record<string, readonly string[]> = { npi: ['1234567893'], tin: ['12-3456789'], date8: ['20260105', '20260112'], date: ['01/05/2026', '2026-01-05'], pos: ['11', '22'], cpt: ['97110', '97140', 'G0283'], units: ['1', '2', '12'], amt: ['150.00', '82.14', '1,250.00', '0.00'], claim: ['SYNCLAIM0001', 'W2026011500123', '2026011500123'],
    check: ['0001234567', '1234567'], group: ['0012345', '00123'], zip: ['62701', '62701-1234'], icd: ['M54.50', 'M25.561'], mod: ['GP', 'KX', '59'], rev: ['0420', '420'], line: ['1', '01', '001'], text: ['Paid', 'Denied', 'CO-45', 'Synth Clinic', 'ZEPHYRA, JANE'], member: ['SYNMEMBER0042'], phone: ['800-555-0100'], acct: ['00123456', 'A0012345'] };
  const names = Object.keys(CELLS);
  for (const sep of ['|', ',', '\t', ' | ']) {
    const start = Date.now();
    const kinds: Record<string, number> = {};
    const sig: Record<string, { n: number; ex: string }> = {};
    let done = 0;
    while (Date.now() - start < 9000 && done < 1500) {
      const cells: { cls: string; text: string }[] = [];
      const len = int(4, 8);
      for (let i = 0; i < len; i += 1) {
        const cls = pick(names);
        cells.push({ cls, text: pick(CELLS[cls] ?? ['']) });
      }
      const text = cells.map((c) => c.text).join(sep);
      const k = kindOf(text);
      done += 1;
      kinds[k] = (kinds[k] ?? 0) + 1;
      if (k !== 'NEW' && k !== 'CHANGED') continue;
      let best = cells;
      outer: for (let w = 1; w < cells.length; w += 1) {
        for (let s = 0; s + w <= cells.length; s += 1) {
          const sub = cells.slice(s, s + w);
          if (kindOf(sub.map((c) => c.text).join(sep)) === k) {
            best = sub;
            break outer;
          }
        }
      }
      const e = (sig[`${k} ${best.map((c) => c.cls).join(sep === '\t' ? '<tab>' : sep)}`] ??= { n: 0, ex: best.map((c) => c.text).join(sep) });
      e.n += 1;
      out.push(JSON.stringify({ section: `B2 rows ${J(sep)}`, kind: k, text }));
    }
    const sorted = Object.entries(sig).sort((a, b) => b[1].n - a[1].n);
    console.log(`\n## B2 rows of realistic cells joined by ${J(sep)}: ${done} rows ${JSON.stringify(kinds)}; minimal windows: ${clip(sorted.slice(0, 26).map(([key, e]) => `${e.n} ${key} e.g. ${J(e.ex)}`).join('; '), 2300)}`);
  }
}

// ---------- C. a noun that should name the number, and does not
{
  const NOUNS = ['Claim ', 'Claim number: ', 'ICN ', 'Ref ', 'Reference # ', 'Case ', 'Authorization ', 'Tracking number ', 'Policy No. ', 'Account # ', 'Member ID ', 'Invoice ', 'Claim number(s): ', 'Claim number for this service: ', 'Remittance Advice Number ', 'Claim # (original) ', 'Your claim, ', 'Claim ID is ',
    'Claim/ICN: ', 'Check or EFT number ', `Claim Number:${' '.repeat(30)}`, `Claim Number:${' '.repeat(50)}`, `Claim Number ${'.'.repeat(50)} `, 'Claim Number:\n', 'Claim Number\n\n', 'CLAIM NUMBER\tDATE\tBILLED\n', 'Claim Number: ', 'Claim No.: ', 'Claim Nbr ', 'Payer Claim Control Number: ', 'Claim Number : # '];
  const PREFIX = ['', 'A', 'W', 'EP', 'CL', 'PT-', 'H', 'ZZ', 'w', '00-A'];
  const NUMS = ['20260115-12-3456', '1234567-01-2026', '2026011-123-4567', '8024567-89-0123', '802-456-78901.01', '802-45-678901/01/05/2026', '2026008123456.01', '80245678901.5', '20260115-001-0001', '802-45-6789012-34-5678'];
  const kinds: Record<string, number> = {};
  const byNoun: Record<string, [number, number]> = {};
  const byPrefix: Record<string, [number, number]> = {};
  const byNum: Record<string, [number, number]> = {};
  const ex: string[] = [];
  for (const noun of NOUNS) for (const prefix of PREFIX) for (const num of NUMS) {
    const text = `${noun}${prefix}${num}`;
    const k = kindOf(text);
    kinds[k] = (kinds[k] ?? 0) + 1;
    for (const [tally, key] of [[byNoun, prefix === '' ? noun : '(with a prefix)'], [byPrefix, prefix], [byNum, num]] as const) {
      const t = (tally[key] ??= [0, 0]);
      t[1] += 1;
      if (k === 'NEW') t[0] += 1;
    }
    if (k === 'NEW' && ex.length < 400) ex.push(text);
    if (k === 'NEW') out.push(JSON.stringify({ section: 'C naming', text }));
  }
  const show = (tally: Record<string, [number, number]>) => Object.entries(tally).map(([v, t]) => `${J(v)} ${t[0]}/${t[1]}`).join('  ');
  console.log(`\n## C. a listed noun, a prefix, a number with structure: ${JSON.stringify(kinds)}\n  NEW by noun (no prefix): ${clip(show(byNoun), 1500)}\n  NEW by prefix: ${show(byPrefix)}\n  NEW by number: ${show(byNum)}`);
  for (let i = 0; i < 8; i += 1) console.log(`  NEW e.g. ${J(ex[Math.floor((i * ex.length) / 8)] ?? '')}`);
}
list('C2 named references as letters write them', [
  'Claim W20260115-12-3456', 'Claim number: EP1234567-01-2026', 'Your claim number is A2026011-123-4567.', 'ICN E20260115-001-0001', 'Reference # CL8024567-89-0123', 'Claim 20260115-12-3456', 'Claim number: 1234567-01-2026', 'Claim W802-456-78901.01', 'Claim 802-456-78901.01',
  'Claim number(s): 20260115-12-3456', 'Claim numbers: 20260115-12-3456', `Claim Number:${' '.repeat(40)}20260115-12-3456`, `Claim Number:${' '.repeat(20)}20260115-12-3456`, 'Claim Number:\n20260115-12-3456', 'Claim Number\tDate of Service\n20260115-12-3456\t01/05/2026',
  'Re: Claim W20260115-12-3456 for Jane Zephyra', 'Authorization PA20260115-12-3456 approved for 12 visits.', 'Tracking number 1Z20260115-12-3456', 'Order # SO-20260115-12-3456', 'Policy No. GRP-0123456-78-9012',
]);

// ---------- D. a phone word or "Medicare" before a reference a noun names
list('D sentences with a phone word or Medicare before a named reference', [
  'Call us about tracking number 802-456-78901.', 'Call about your tracking number 802-456-78901.', 'Please call Member Services about tracking number 802-456-78901.', 'If you call, give tracking number 802-456-78901.', 'Fax confirmation 802-456-78901', 'Fax confirmation number: 802-456-78901',
  'Fax this page with your policy number 802-45-678901.', 'Contact us regarding account 802-456-789012.', 'Contact Customer Service and mention ticket 802-456-78901.', 'When calling, mention order 802-456-78901.', 'Toll-free help line. Your confirmation number is 802-456-78901.',
  'TTY users should use session ID 802-456-78901.', 'Phone payment confirmation 802-456-78901', 'Paid by phone. Confirmation number 802-456-78901.', 'Telephone inquiry 802-456-78901 was closed.', 'Call reference 802-456-78901', 'Fax cover sheet, document 802-456-78901, 3 pages.',
  'Medicare Advantage plan 802-456-78901', 'Medicare Advantage policy number 802-45-678901.', 'Medicare Summary Notice 802-45-678901', 'Your Medicare Part B premium account 802-456-78901.', 'Medicare secondary payer file 802-456-78901.', 'This is not a Medicare plan. Policy 802-456-78901.',
  'Medicare crossover. Payer ID 802-456-78901', 'Medicare claim 802-45-678901', 'Call us. Your policy number is 802 456 78901.', 'Contact: Provider Relations. Contract 802-456-78901-02.', 'Mobile app order 802.456.78901', 'Contact lens order 802-456-78901', 'Contact dermatitis; encounter 802-456-78901',
  'No contact needed. Transaction 802-456-78901.', 'Point of contact: billing. Account 802-456-78901.', 'Primary contact on file 802-456-78901', 'Policy 802-456-78901', 'Account 802-456-789012', 'Order 802.456.78901', 'Your policy number is 802 456 78901.', 'Confirmation number 802-456-78901.',
  'Questions? Call the number on your ID card.\nAccount number: 802-456-78901', 'Fax: see below\nTracking number: 802-456-78901', 'Customer Service\nPhone\nPolicy 802-456-78901',
]);

// ---------- E. a comma or a point before a number of five, two or three, and four or more
list('E rows with a comma before a 5-2-4 or 5-3-4 number', [
  'Line,Group,Billed\n1,00123-456-7890,150.00', '2,12345-678-9012', '01/05/2026,00123-45-6789,150.00', '97110,2,20345-678-90123', '12.50,20345-67-8901', 'Total 1,20345-67-8901', '2, 20345-678-9012', '2,\t20345-678-9012', 'A,20345-678-9012', '2,"20345-678-9012"',
  '1,20345-678-9012\n2,20345-678-9013', '2026,20345-67-8901', '150.00, 20345-67-8901', '3.20345-678-9012', 'v2.20345-67-8901', 'Units 12,20345 678 9012', '1,20345/678/9012', '1,20345.678.9012',
]);

// ---------- F. the rule for a held letter asks the group's noun, not the whole number's
const HELD = 'Service 01/01/2020-150.00 Paid\n';
list("F held letter: 'shape' and the noun of the whole joined number", [`${HELD}Policy No. 802-45-678901`, `${HELD}Policy No. 01-802-45-678901`, `${HELD}Policy No. 22-802-456-78901`, `${HELD}Claim 2026-802-45-678901`, `${HELD}Tracking 802-456-78901`, `${HELD}Tracking # 4-802-456-78901`, 'Policy No. 01-802-45-678901', 'Tracking # 4-802-456-78901',
  `${HELD}Web ID 802-456-78901`, `${HELD}Re: #802-456-78901`, `${HELD}Number: 802-456-78901`]);

fs.writeFileSync('/home/user/review-d2/probe2.jsonl', out.join('\n') + '\n');
console.log(`\ntotal ${((Date.now() - T0) / 1000).toFixed(0)}s, ${memo.size} runs`);
