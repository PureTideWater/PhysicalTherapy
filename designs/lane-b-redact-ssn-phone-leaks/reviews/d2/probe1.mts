// node probe1.mts [seed]: review D2, base (tree-ef3) against head (fix). Prints only letters the base SENT and the head REFUSES (NEW) or sends otherwise (CHANGED).
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

const T0 = Date.now();
const H: any = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/redact.ts').href);
const B: any = await import(pathToFileURL('/home/user/tree-ef3/packages/model-gateway/src/redact.ts').href);
const pat = (names = ['JANE Q ZEPHYRA'], dob = ['1980-03-14'], memberIds = ['SYNMEMBER0042']) => ({ pseudonym: 'p', names, datesOfBirth: dob, memberIds });
const CLAIMS = [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }];
const JANE = pat();

let seed = Number(process.argv[2] ?? 7);
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
const full: string[] = [];
const J = (s: string) => JSON.stringify(s);
const clip = (s: string, n = 260) => (s.length > n ? `${s.slice(0, n)}...` : s);
const describe = (text: string, p: any = JANE) => {
  const b = run('b', text, p);
  const h = run('h', text, p);
  const f = (o: Out) => (o.refused ? 'REFUSED' : o.text === text.normalize('NFKC') ? 'SENT same' : `SENT ${J(o.text)}`);
  return `${kindOf(text, p).padEnd(9)} ${J(text)}  base: ${f(b)} | head: ${f(h)}`;
};

interface GridOpts { sample?: number; budget?: number; p?: any; show?: number; cross?: (c: Record<string, string>) => string }
function grid(title: string, spec: Record<string, readonly string[]>, build: (c: Record<string, string>) => string, opts: GridOpts = {}) {
  const names = Object.keys(spec);
  const combos: Record<string, string>[] = [];
  const total = names.reduce((n, k) => n * (spec[k]?.length ?? 1), 1);
  if (opts.sample !== undefined && total > opts.sample) {
    for (let i = 0; i < opts.sample; i += 1) {
      const c: Record<string, string> = {};
      for (const k of names) c[k] = pick(spec[k] ?? ['']);
      combos.push(c);
    }
  } else {
    const idx = names.map(() => 0);
    for (;;) {
      const c: Record<string, string> = {};
      names.forEach((k, i) => {
        c[k] = (spec[k] ?? [''])[idx[i] ?? 0] ?? '';
      });
      combos.push(c);
      let i = names.length - 1;
      while (i >= 0) {
        idx[i] = (idx[i] ?? 0) + 1;
        if ((idx[i] ?? 0) < (spec[names[i] ?? '']?.length ?? 1)) break;
        idx[i] = 0;
        i -= 1;
      }
      if (i < 0) break;
    }
    for (let i = combos.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      const t = combos[i] as Record<string, string>;
      combos[i] = combos[j] as Record<string, string>;
      combos[j] = t;
    }
  }
  const start = Date.now();
  const kinds: Record<string, number> = {};
  const tally: Record<string, Record<string, [number, number]>> = {};
  const crossTally: Record<string, [number, number]> = {};
  const news: string[] = [];
  const changed: string[] = [];
  let done = 0;
  for (const c of combos) {
    if (opts.budget !== undefined && Date.now() - start > opts.budget * 1000) break;
    const text = build(c);
    const k = kindOf(text, opts.p ?? JANE);
    done += 1;
    kinds[k] = (kinds[k] ?? 0) + 1;
    for (const n of names) {
      const t = ((tally[n] ??= {})[c[n] ?? ''] ??= [0, 0]);
      t[1] += 1;
      if (k === 'NEW') t[0] += 1;
    }
    if (opts.cross !== undefined) {
      const t = (crossTally[opts.cross(c)] ??= [0, 0]);
      t[1] += 1;
      if (k === 'NEW') t[0] += 1;
    }
    if (k === 'NEW') news.push(text);
    if (k === 'CHANGED') changed.push(text);
    if (k !== 'same' && k !== 'both') full.push(JSON.stringify({ section: title, kind: k, text, c, base: run('b', text, opts.p ?? JANE).text, head: run('h', text, opts.p ?? JANE).text }));
  }
  console.log(`\n## ${title}: ${done}/${combos.length} letters ${JSON.stringify(kinds)} (${((Date.now() - start) / 1000).toFixed(0)}s)`);
  for (const n of names) {
    const hits = Object.entries(tally[n] ?? {}).filter(([, t]) => t[0] > 0).sort((a, b) => b[1][0] / b[1][1] - a[1][0] / a[1][1]);
    if (hits.length > 0) console.log(`  NEW by ${n}: ${clip(hits.map(([v, t]) => `${J(v)} ${t[0]}/${t[1]}`).join('  '), 1400)}`);
  }
  if (opts.cross !== undefined) {
    const hits = Object.entries(crossTally).filter(([, t]) => t[0] > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
    console.log(`  NEW by cross: ${clip(hits.map(([v, t]) => `${v} ${t[0]}/${t[1]}`).join('; '), 2600)}`);
  }
  const show = Math.min(opts.show ?? 8, news.length);
  for (let i = 0; i < show; i += 1) console.log(`  NEW e.g. ${clip(J(news[Math.floor((i * news.length) / show)] ?? ''))}`);
  const showChanged = Math.min(6, changed.length);
  for (let i = 0; i < showChanged; i += 1) {
    const t = changed[Math.floor((i * changed.length) / showChanged)] ?? '';
    console.log(`  CHANGED e.g. ${clip(J(t), 150)} base ${clip(J(run('b', t, opts.p ?? JANE).text), 150)} head ${clip(J(run('h', t, opts.p ?? JANE).text), 150)}`);
  }
  return { news, changed };
}

const HELD = 'Service 01/01/2020-150.00 Paid\n';

// ---------- S9 explicit hypotheses first (cheap)
console.log('## S9 explicit');
for (const t of [
  'Line,Ref,Billed\n1,20345-67-8901,150.00', '2,20345-67-8901', '01/05/2026,20345-678-9012,150.00', '97110,2,20345-67-89012', '150.00,20345-67-8901', 'Qty 2,20345-67-8901', '1.20345-67-8901',
  '2, 20345-67-8901', '2,2034-67-8901', '2,203456-67-8901', '20345-67-8901', '2;20345-67-8901', '2|20345-67-8901',
  'Please call us about tracking number 802-456-78901.', 'When you call, have your policy number 802-45-678901 ready.', 'Fax confirmation 802-456-78901', 'Contact us regarding account 802-456-789012.', 'Tracking number 802-456-78901.', 'Please call us about reference number 802-456-78901.',
  'Medicare Summary Notice 802-45-678901', 'Your Medicare plan contract 802-456-78901', 'Summary Notice 802-45-678901',
  '802-45-6789012-34-5678', 'Ref 802-45-6789012-34-5678', 'Tel 202 555 0123 x45678', 'Call 711 or 800 555 0100',
  'Call 8:00 a.m. to 5:00 p.m.', 'Call 8:30-5:00, Springfield, IL 62701-1234', 'Fax 2: 150.00 120.00 30.00', 'Fax 2 pages: 150.00 120.00 30.00',
  `${HELD}Card ending 4XXXXX1234`, `${HELD}Acct 1***-**-2026`, `${HELD}Card XXXXXXXXXXXX1234`, `${HELD}Incident 802-456-78901`, `${HELD}No. 802-456-78901`, `${HELD}Tracking,Date\n802-456-78901,01/05/2026`,
]) console.log(`  ${describe(t)}`);
console.log('## S8 May, patient born 2000-05-12, held letter');
const MAY = pat(['JANE Q ZEPHYRA'], ['2000-05-12']);
for (const t of [
  'Up to 12 may, at our discretion, be approved.', 'Visits over 12 may; see policy.', 'No more than 12 may.', 'Of the 20 visits, 12 may: (a) be denied', 'You may 12. Submit', 'Limit 12 May', '12 may be covered', 'the 12th may require review',
  'Visits 1-12 may, with authorization, be extended.', 'A maximum of 12 may, however, be billed per year.', 'by May 12.', 'On May 12, we received your appeal.', 'You may\n12. Appeal within 180 days', 'You may 12 visits.', 'Sessions 12. May require auth.',
  'visits (12) may, if approved, continue', 'Up to 12, may be approved', 'Units billed: 12 May', 'Received 12 May\nProcessed 14 May', 'May 12 - June 3', 'May 12 through May 30',
]) console.log(`  ${describe(HELD + t, MAY)}   [alone, head: ${run('h', t, MAY).refused ? 'REFUSED' : 'sent'}]`);

// ---------- S5 names with the new joiners
const NAMEFORMS = ['Jane•Zephyra', 'Jane·Zephyra', 'Jane∙Zephyra', 'Jane⋅Zephyra', 'Jane‧Zephyra', 'Jane • Zephyra', 'Zephyra•Jane', 'Zephyra · Jane', '•Jane Zephyra', '• Jane Zephyra', 'Jane Zephyra•',
  'Jane Zephyra•DOB: 03/14/1980', 'Jane Zephyra • DOB 03/14/1980', 'Name•Jane Zephyra', 'Patient•Jane Zephyra•Member ID•SYNMEMBER0042', 'Patient · Jane Zephyra · Member SYNMEMBER0042', 'Zephyra, Jane·SYNMEMBER0042·SYNCLAIM0001',
  'JANE·Q·ZEPHYRA', 'J·Zephyra', 'Zephyra•97110', 'Zephyra•150.00', 'Subscriber•Zephyra', 'Zephyra·Subscriber', 'Jane Zephyra·Self', 'Zephyra•', '•Zephyra', 'Jane Q. Zephyra•PT', 'Dr. Vantree•Jane Zephyra', 'Zephyra∙Jane∙Q'];
const CTX = ['{}', 'Patient: {}', 'Re: {}, claim SYNCLAIM0001', '{}\nCall 800-555-0100', '{}\n97110 2 150.00 82.14', 'Dear {},', '{} 01/05/2026 150.00', 'Phone {} 555-0123'];
grid('S5 names with new joiners', { form: NAMEFORMS, ctx: CTX }, (c) => (c.ctx ?? '').replace('{}', c.form ?? ''), { show: 14 });

// ---------- S6 masks and blanks, alone and in a held letter
const MASKS = ['Card ending in XXXX-XXXX-XXXX-1234', 'Acct XXXXXX1234', 'Account: ******1234', 'Member ID: XXXXX1234', 'SSN: XXX-XX-1234', 'Last four: ***-**-1234', 'Bank acct ####1234', 'Routing XXXXX1234', 'ACH ****1234 150.00', 'Check #____ Amount $____',
  'Phone: (___) ___-____', 'DOB __/__/____', 'ID#XXX-XX-1234', 'Policy#XXXX1234', 'Card#XXXX-XXXX-XXXX-1234 exp 01/27', 'Visa x1234', 'EFT to account ending in 1234 on 01/15/2026 150.00', 'Acct. No.XXXXX1234', 'TIN XX-XXX1234', 'TIN: **-***1234', 'NPI: XXXXXX1234',
  'Date: ____/____/2026', 'Signed this ___ day of ________, 2026', 'Signature___________ Date________ 2026', 'Initials___ __ 2026', 'Card 4XXXXXXXXXXX1234', 'Card 4***********1234', 'Acct 12XXXXX6789', 'Account 0XXXXX1234', 'Total due*** ** 2026', 'Paid in full ***** 2026',
  'Tax ID XX-XXX1234', 'Fax XXX-XXX-1234', 'Tax XXX-XX-1234', 'Rx# XXXXX1234', 'Loan 12*****1234', 'Card ************1234', 'Acct # XXX XX 1234', 'Member # XXXXX-1234', 'ID XXXXX 1234', 'Policy XXX-XX-12345', 'Acct ending in XX1234', 'Bank account XXXXXXXXX1234 150.00',
  'Card ending 4XXXXX1234', 'Acct 4XXX-XX-1234', 'Deductible met*** 2026', 'Date__ __ 2026', 'Day___ Month__ 2026', 'Item 3___ __ 2026', 'No.___-__-2026', 'Acct#XXX-XX-1234', 'SSN#XXX-XX-1234', 'Medicare ID: XXXXX1234A', 'Check ****1234', 'Claim XXXXXXX1234'];
grid('S6 masks and blanks', { held: ['', HELD], line: MASKS }, (c) => `${c.held ?? ''}${c.line ?? ''}`, { show: 20 });

// ---------- S1 dashed shapes by noun and what follows
const NOUNS = ['', 'Ref ', 'Reference number ', 'Tracking ', 'Tracking number: ', 'Policy No. ', 'Account # ', 'Member ID ', 'ID ', 'No. ', '#', 'Confirmation number ', 'Interaction ID ', 'Incident ', 'Submission ID ', 'Case ', 'Claim ', 'Invoice ', 'Order # ', 'Our file ',
  'Document Control Number ', 'DCN ', 'ICN ', 'Payer ID ', 'Group ', 'Plan ', 'Contract ', 'Provider ID ', 'License ', 'Routing ', 'Application number ', 'Enrollment ID ', 'Request ID ', 'Authorization ', 'Rx ', 'NDC ', 'Check ', 'Trace ', 'Web ID ', 'Serial number ', 'Item ', 'Form ',
  'Bulletin ', 'Section ', 'Lockbox ', 'Appeal ', 'Dispute number ', 'Predetermination ', 'Eligibility verification number ', 'Medicaid ID ', 'Subscriber ', 'Encounter ', 'Patient account ', 'Visit '];
const LISTED = /\b(CLAIMS?|ICN|DCN|REFERENCE|REF|APPEAL|CASE|NPI|TIN|EIN|CHECK|EFT|TRACE|CONTROL|INVOICE|AUTHORIZATION|AUTH|ZIP|GROUP|ACCOUNT|ACCT|POLICY|CERTIFICATE|CONTRACT|MEMBER|SUBSCRIBER|TICKET|INQUIRY|TRACKING|GRIEVANCE|CORRESPONDENCE|DOCUMENT|CONFIRMATION|ORDER|FILE|RECORD|REQUEST|TRANSACTION|ENCOUNTER|VISIT|BATCH|LETTER|NOTICE|PLAN|PROVIDER|FACILITY|LOCATION|TCN|CCN|MRN|PCN|NDC|RX|PAYMENT|REFERRAL|RECEIPT|SESSION|CUSTOMER|VOUCHER|DOCKET|STATEMENT|EMPLOYER|PAYER|LOAN|COMPLAINT)\b/i;
const nounClass = (n: string) => (/^(?:|#|No\. |ID )$/.test(n) ? 'none' : LISTED.test(n) ? 'listed' : 'unlisted');
const SHAPES = ['802-45-67890', '802-45-678901', '802-456-78901', '802-456-789012', '8024-56-7890', '80245-67-8901', '80245-678-9012', '802456-78-9012', '8024567-89-0123', '20260115-12-3456', '802-45-67890-01', '802-456-78901-02', '2026-0115-123-4567', '802-91-69413-01-2026',
  '01-23456-78-9012', '802-45-6789012-34-5678', '802.456.78901', '802/456/78901', '802-456-7890123', '80-2456789', '802456789012', '80245678901', '2026008123456', '802-4567-8901', '8024-5678-9012', '802 456 78901', 'A802-456-78901', '802-456-78901A', '24680-13579', '0802-456-7890', '26-80245-67-8901', '3-80245-678-9012'];
const SUFFIX = ['', '.', ' 01/05/2026', ' 150.00', ',01/05/2026', ',150.00', ', 150.00', ' | 150.00', '\t150.00', '  150.00', '/01/05/2026', '.01', '.5', ' $150.00', ' (2)', ' 97110 2 150.00', '; 150.00', ' - 01/05/2026', '-A', '/2'];
grid('S1 dashed shapes x noun x what follows', { noun: NOUNS, num: SHAPES, suf: SUFFIX }, (c) => `${c.noun ?? ''}${c.num ?? ''}${c.suf ?? ''}`, { sample: 5200, budget: 32, show: 6, cross: (c) => `${c.num ?? ''}[${nounClass(c.noun ?? '')}]` });

// ---------- S2 a phone word (or Medicare) before a named reference
const PHRASES = ['Call us about ', 'Please call regarding ', 'When calling, have your ', 'If you call, give your ', 'Contact us regarding ', 'Contact: ', 'Fax ', 'Fax your ', 'Phone inquiry ', 'By phone: ', 'Tel. ', 'TTY users: ', 'Call center ', 'Toll-free ', 'Calls about ',
  'Contact us.\n', 'Questions? Call.\n', 'Fax:\n', 'Called provider re: ', 'Mobile app ', 'Medicare ', 'Medicare Advantage ', 'Medicare Summary Notice ', 'Your Medicare plan ', 'Medicare Part B ', ''];
const NOUNS2 = ['tracking number ', 'ticket ', 'policy ', 'policy number ', 'account number ', 'inquiry ', 'order ', 'confirmation number ', 'member ID ', 'subscriber ID ', 'file ', 'request ', 'transaction ', 'document ', 'plan ', 'payment ', 'session ', 'customer number ',
  'reference ', 'claim ', 'case ', 'authorization ', 'ID ', 'number ', '', 'incident '];
const NUMS2 = ['802-456-78901', '802-45-678901', '802-456-789012', '802-45-67890', '8024-56-7890', '80245-67-8901', '802456-78-9012', '80245678901', '802456789012', '8024567890123', '2026-0115-123-4567', '802-456-78901-02', '802.456.78901', '802 456 78901', '20260115-0001',
  '24680-13579', '802-4567-8901', '80245-678', 'W802456789', '0012345'];
grid('S2 phone word or Medicare before a named reference', { phrase: PHRASES, noun: NOUNS2, num: NUMS2 }, (c) => `${c.phrase ?? ''}${c.noun ?? ''}${c.num ?? ''}.`, { sample: 3600, budget: 30, show: 10 });

// ---------- S7 held letter: the 'shape' rule by noun
grid('S7 held letter, a longer last group by noun', { noun: NOUNS, num: ['802-456-78901', '802-45-678901', '802-456-789012', '802-456-78901-02'], suf: ['', '.', ' 150.00'] }, (c) => `${HELD}${c.noun ?? ''}${c.num ?? ''}${c.suf ?? ''}`, { budget: 18, show: 5, cross: (c) => nounClass(c.noun ?? '') });

// ---------- S3 rows of a CSV or a table
const POOL: Record<string, readonly string[]> = {
  line: ['1', '2', '3', '10'], date: ['01/05/2026', '2026-01-05', '1/5/26', '01-05-2026', '20260105', 'Jan 5, 2026', '01/05/2026-01/12/2026', '01/05/26 - 01/12/26'], cpt: ['97110', '97140', '97530', 'G0283', '97110-GP', '97110 GP'], units: ['1', '2', '4', '12', '2.0', '1.00'],
  amt: ['150.00', '82.14', '1,250.00', '$150.00', '0.00', '-20.00', '(20.00)', '150', '75.5', '$1,250.00', '150.00 CR'], npi: ['1234567893'], tin: ['12-3456789'], pos: ['11', '22'], icd: ['M54.50', 'M25.561', 'S83.511A'], mod: ['GP', 'KX', '59'], zip: ['62701', '62701-1234'], pct: ['80%', '20%'],
  text: ['Paid', 'Denied', 'CO-45', 'PR-2', 'N130', 'Synth Mutual', 'Physical therapy', 'Y', 'N'], phone: ['800-555-0100', '(800) 555-0100'], check: ['0001234567', '1234567'], group: ['0012345', '00123'],
};
const CLASSES = ['id', 'id', 'id', 'id', 'line', 'date', 'date', 'cpt', 'units', 'amt', 'amt', 'npi', 'tin', 'pos', 'icd', 'mod', 'zip', 'text', 'text', 'phone', 'check', 'group', 'pct'];
const SEPS = [',', ',', ',', ', ', '|', ' | ', '\t', '  ', ';', ' ', '   ', ' - ', '/'];
function randomId(): string {
  const groups = int(2, 5);
  const joiner = pick(['-', '-', '-', '-', '-', '/', '.', ' ', '_']);
  const parts: string[] = [];
  for (let i = 0; i < groups; i += 1) {
    const len = pick([1, 2, 2, 3, 3, 3, 4, 4, 4, 5, 5, 6, 7, 8, 9, 10]);
    let s = '';
    for (let j = 0; j < len; j += 1) s += String(int(j === 0 ? 2 : 0, 9));
    parts.push(s);
  }
  if (rnd() < 0.2) parts[0] = pick(['2026', '20260115', '26', '2025', '202601']);
  return (rnd() < 0.15 ? pick(['A', 'CL', 'W', 'EP', 'H']) : '') + parts.join(joiner);
}
{
  const start = Date.now();
  const kinds: Record<string, number> = {};
  const sig: Record<string, { n: number; ex: string }> = {};
  let done = 0;
  while (Date.now() - start < 38000 && done < 6000) {
    const sep = pick(SEPS);
    const fields: { cls: string; text: string }[] = [];
    const len = int(2, 6);
    for (let i = 0; i < len; i += 1) {
      const cls = pick(CLASSES);
      fields.push({ cls, text: cls === 'id' ? randomId() : pick(POOL[cls] ?? ['']) });
    }
    const text = fields.map((f) => f.text).join(sep);
    const k = kindOf(text);
    done += 1;
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (k !== 'NEW' && k !== 'CHANGED') continue;
    let best = fields;
    outer: for (let w = 1; w < fields.length; w += 1) {
      for (let s = 0; s + w <= fields.length; s += 1) {
        const sub = fields.slice(s, s + w);
        if (kindOf(sub.map((f) => f.text).join(sep)) === k) {
          best = sub;
          break outer;
        }
      }
    }
    const subText = best.map((f) => f.text).join(sep);
    const key = `${k} ${best.map((f) => (f.cls === 'id' ? `id:${f.text.replace(/[0-9]+/g, (m) => String(m.length))}` : f.cls)).join(` ${J(sep)} `)}`;
    const e = (sig[key] ??= { n: 0, ex: subText });
    e.n += 1;
    full.push(JSON.stringify({ section: 'S3 rows', kind: k, text, min: subText, base: run('b', subText).text, head: run('h', subText).text }));
  }
  console.log(`\n## S3 rows of a CSV or table: ${done} rows ${JSON.stringify(kinds)} (${((Date.now() - start) / 1000).toFixed(0)}s); minimal windows:`);
  const sorted = Object.entries(sig).sort((a, b) => b[1].n - a[1].n);
  for (const [key, e] of sorted.slice(0, 45)) console.log(`  ${String(e.n).padStart(3)} ${clip(key, 110)}  e.g. ${clip(J(e.ex), 110)}${key.startsWith('CHANGED') ? `  base ${clip(J(run('b', e.ex).text), 90)} head ${clip(J(run('h', e.ex).text), 90)}` : ''}`);
  if (sorted.length > 45) console.log(`  ... ${sorted.length - 45} more signatures (see probe1.jsonl)`);
}

// ---------- S4 phone, fax and TTY lines of a plan
const WORD = ['Call', 'Phone', 'Phone:', 'Tel', 'Tel.', 'Telephone:', 'Fax', 'Fax:', 'TTY', 'TTY:', 'TTY/TDD', 'Toll-free', 'Toll free:', 'Contact', 'Contact:', 'Customer Service', 'Member Services:', 'Provider Services', 'Call us at', 'Please call', 'Questions? Call', 'Cell', 'Mobile',
  'Fax to', 'Fax No.', 'Phone number', 'Ph', 'Ph:', 'Helpline', 'Hotline:', 'Call 8:00 a.m. to 5:00 p.m. at', 'Call 24/7:', 'Fax 2 pages to', 'Call 7 days a week:', 'Phone 24 hours:', 'Call 8-5 M-F:', 'Fax 3 pages:', 'Call Monday-Friday 8:00-4:30:', 'TTY 711 or', 'Fax 1:',
  'Phone 2)', 'Tel (1):', 'Call 1st:', 'Phone 1 (cell):', 'Contact 2:', 'Fax #1:', 'Phone No. 1:', 'Tel. 2 -', 'Call 1 of these numbers:', 'TTY users call 711;', 'Phone (24 hours):', 'Call 2 business days before:'];
const NUM = ['800-555-0100', '1-800-555-0100', '(800) 555-0100', '800.555.0100', '1 (800) 555-0100', '+1 800 555 0100', '555-0100', '711', '1-800-555-0100 (TTY 711)', '800-555-0100 x1234', '800-555-0100 ext. 1234', '800-555-0100, ext 12345', '800-555-0100, option 2', '800-555-0100 opt 3',
  '800-555-0100 / 800-555-0199', '800-555-0100 or 800-555-0199', '1: 800-555-0100', '(1) 800-555-0100', '1) 800-555-0100', '800-555-0100 (toll-free)', '800 555 0100', '8005550100', '18005550100', '(800)555-0100', '800/555-0100', '800-555-0100 #2', '1.800.555.0100', '', 'us', 'the number on your ID card'];
const HOURS = ['', '', ', Monday through Friday, 8:00 a.m. to 6:00 p.m.', ' 8 a.m. - 8 p.m. ET', ', 8:00-17:00 CT', ' 24 hours a day, 7 days a week', ' (24/7)', ' M-F 8-5', ', Mon-Fri 8:30am-5:00pm', ' between 8:00 and 4:30', ', 7 days a week, 8 to 8', ' from 8 a.m. to 8 p.m., 7 days a week, October 1 - March 31', ' within 30 days', ' by 01/15/2026'];
const TAIL = ['', '.', ' Fax: 800-555-0199', ' | Fax 800-555-0199', '  TTY 711', '\nFax: 800-555-0199', ' Payer ID 12345', '\nP.O. Box 14463, Lexington, KY 40512-4463', '\n97110 2 150.00', '\nClaim total 150.00 82.14 67.86', ' Group 0012345', '\nNPI 1234567893', '\nTIN 12-3456789', ' Ref 802-456-78901',
  '\nCheck 0001234567 150.00', '\n01/05/2026 97110 GP 2 150.00 82.14', ' Page 2 of 3', '\nSuite 200, 100 Main St, Springfield, IL 62701', ' Reference number 20260115-0001', '\n2026 Benefit Year', '\nDate: 01/15/2026', ' 30 days', ' within 180 days of 01/05/2026', '\nAmount due: $150.00', '\nTotal 1,250.00',
  '\nUnits 12 Visits 30', ' 150.00', ' 62701', '\n62701-1234', ' 12 visits', '\n1234 Main St', ' Room 204', ' Dept 4410', '\nATTN: Appeals Dept 4410', ' MS 12-345', '\nPO Box 30555, Salt Lake City, UT 84130-0555', ' Plan 00123 Group 0012345', '\nPolicy 802-456-78901'];
{
  const start = Date.now();
  const kinds: Record<string, number> = {};
  const sig: Record<string, { n: number; ex: string }> = {};
  let done = 0;
  while (Date.now() - start < 34000 && done < 6000) {
    const [w, n, h, t] = [pick(WORD), pick(NUM), pick(HOURS), pick(TAIL)];
    const make = (hh: string, tt: string) => `${w} ${n}${hh}${tt}`;
    const text = make(h, t);
    const k = kindOf(text);
    done += 1;
    kinds[k] = (kinds[k] ?? 0) + 1;
    if (k !== 'NEW' && k !== 'CHANGED') continue;
    const min = kindOf(make('', '')) === k ? make('', '') : kindOf(make(h, '')) === k ? make(h, '') : kindOf(make('', t)) === k ? make('', t) : text;
    const key = `${k} ${J(min)}`;
    const e = (sig[key] ??= { n: 0, ex: min });
    e.n += 1;
    full.push(JSON.stringify({ section: 'S4 phone lines', kind: k, text, min, base: run('b', min).text, head: run('h', min).text }));
  }
  console.log(`\n## S4 phone, fax and TTY lines: ${done} letters ${JSON.stringify(kinds)} (${((Date.now() - start) / 1000).toFixed(0)}s); minimal forms:`);
  const sorted = Object.entries(sig).sort((a, b) => b[1].n - a[1].n);
  const newOnes = sorted.filter(([key]) => key.startsWith('NEW'));
  const changedOnes = sorted.filter(([key]) => key.startsWith('CHANGED'));
  console.log(`  NEW minimal forms: ${newOnes.length}; CHANGED minimal forms: ${changedOnes.length}`);
  for (const [key, e] of newOnes.slice(0, 30)) console.log(`  ${String(e.n).padStart(3)} ${clip(key, 200)}`);
  for (const [, e] of changedOnes.slice(0, 22)) console.log(`  ${String(e.n).padStart(3)} CHANGED ${clip(J(e.ex), 110)} base ${clip(J(run('b', e.ex).text), 100)} head ${clip(J(run('h', e.ex).text), 100)}`);
}

// ---------- S4b the call's own identifier between a phone word and figures: beyond "refused without it too"
const PWORD = ['Call', 'Phone', 'Phone:', 'Tel.', 'Fax', 'Fax:', 'TTY', 'Contact', 'Contact:', 'Contacted', 'Called', 'Cell', 'Mobile:', 'Toll-free', 'Calling', 'Phone (', 'Call re:'];
const IDENT = ['Jane Zephyra', 'Zephyra', 'Jane Q. Zephyra', 'ZEPHYRA, JANE', 'Ms. Zephyra', 'SYNMEMBER0042', 'member SYNMEMBER0042', 'claim SYNCLAIM0001', 'Jane Zephyra (SYNMEMBER0042)', 'Jane Zephyra, DOB 03/14/1980'];
const GLUE = [' at ', ': ', ', ', ' - ', '\n', ' re: ', ' regarding claim ', ' about ', ' on 01/05/2026 at ', ' (home): ', ') ', '; ', '. ', ' tel ', ' ', ',\n', ' – ', ' / ', ' | ', '\n\n', ' for ', ' x'];
const FIG = ['555-0123', '800-555-0100', '150.00', '97110 2 150.00', '01/05/2026', '62701-1234', 'Springfield, IL 62701-1234', '150.00 120.00 30.00', 'P.O. Box 14463', '2 visits on 01/05/2026', 'ext. 1234', '30 days', 'NPI 1234567893', 'ICN 20260115123456', 'Ref 802-456-78901',
  'Group 0012345', 'Check 0001234567', '12 visits 150.00', '$1,250.00 01/05/2026', 'Page 1 of 3', 'CPT 97110 97140', '711', '1234', '12345', '123456', '1234567', '12345678', '101-1024', 'Rooms 204-2100', '2025-2026', '555 0123', '555.0123', '1,250.00 2 97110', '97110-97140', '4 units 97110', '100 Main St 62701'];
{
  const start = Date.now();
  const kinds: Record<string, number> = {};
  const beyond: Record<string, { n: number; ex: string }> = {};
  const more: Record<string, { n: number; ex: string; b0: string; h: string }> = {};
  let done = 0;
  let recorded = 0;
  const marks = (s: string) => (s.match(/\[(?:SSN|PHONE)\]/g) ?? []).length;
  while (Date.now() - start < 38000 && done < 6000) {
    const [w, id, g, f] = [pick(PWORD), pick(IDENT), pick(GLUE), pick(FIG)];
    const text = `${w} ${id}${g}${f}`;
    const without = `${w} ${g}${f}`;
    const k = kindOf(text);
    done += 1;
    kinds[k] = (kinds[k] ?? 0) + 1;
    const b0 = run('b', without);
    if (k === 'NEW') {
      if (b0.refused) recorded += 1;
      else {
        const e = (beyond[`${J(g)} ${J(f)}`] ??= { n: 0, ex: text });
        e.n += 1;
        full.push(JSON.stringify({ section: 'S4b beyond', text, without }));
      }
    } else if (k === 'CHANGED' || k === 'same') {
      const h = run('h', text);
      if (!b0.refused && marks(h.text) > marks(b0.text)) {
        const e = (more[`${J(g)} ${J(f)}`] ??= { n: 0, ex: text, b0: b0.text, h: h.text });
        e.n += 1;
        full.push(JSON.stringify({ section: 'S4b redacts-more', text, without, head: h.text, baseWithout: b0.text }));
      }
    }
  }
  console.log(`\n## S4b own identifier between a phone word and figures: ${done} letters ${JSON.stringify(kinds)} (${((Date.now() - start) / 1000).toFixed(0)}s); NEW that the base refuses without the identifier too (recorded): ${recorded}`);
  console.log(`  NEW where the base SENDS the letter without the identifier too (beyond recorded): ${Object.values(beyond).reduce((n, e) => n + e.n, 0)} in ${Object.keys(beyond).length} forms`);
  for (const [key, e] of Object.entries(beyond).sort((a, b) => b[1].n - a[1].n).slice(0, 25)) console.log(`  ${String(e.n).padStart(3)} ${key}  e.g. ${clip(J(e.ex), 140)}`);
  console.log(`  head redacts a number the base leaves in the letter without the identifier: ${Object.values(more).reduce((n, e) => n + e.n, 0)} in ${Object.keys(more).length} forms`);
  for (const [key, e] of Object.entries(more).sort((a, b) => b[1].n - a[1].n).slice(0, 18)) console.log(`  ${String(e.n).padStart(3)} ${key}  e.g. ${clip(J(e.ex), 110)} head ${clip(J(e.h), 110)} | base without it ${clip(J(e.b0), 90)}`);
}

fs.writeFileSync('/home/user/review-d2/probe1.jsonl', full.join('\n') + '\n');
console.log(`\ntotal ${((Date.now() - T0) / 1000).toFixed(0)}s, ${memo.size} runs, ${full.length} records in /home/user/review-d2/probe1.jsonl`);
