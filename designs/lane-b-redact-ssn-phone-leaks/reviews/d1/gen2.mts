// D1 review generator (synthetic data only): new label, joiner and number vocabulary, and the fresh kinds in new positions
// (two fresh matches, a fresh match in a held letter, next to a claim placeholder, wrapped, an own number under a list
// number, look-alike digits in the own member ID after a label).
import { pathToFileURL } from 'node:url';
const { LOOK_ALIKES } = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/confusables.ts').href);
const INV: Record<string, string[]> = {};
for (const [k, v] of LOOK_ALIKES as Map<string, string>) if (typeof v === 'string' && v.length === 1) (INV[v.toUpperCase()] ??= []).push(k);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dobForms = (y: number, m: number, d: number) => {
  const mm = String(m).padStart(2, '0'); const dd = String(d).padStart(2, '0'); const yy = String(y).slice(2); const M = MON[m - 1]!; const Mo = M.slice(0, 3);
  return [`${mm}/${dd}/${y}`, `${m}/${d}/${yy}`, `${M} ${d}, ${y}`, `${d} ${Mo} ${y}`, `${y}-${mm}-${dd}`, `DOB ${mm}/${dd}/${y}`, `${y}${mm}${dd}`, `${mm}-${dd}-${yy}`, `${mm}${dd}${yy}`, `${Mo} ${d}`];
};
const claim = (id: string, n: string) => ({ claimId: id, patientPseudonym: 'p', claimNumbers: [n] });
export interface X { who: string; P: any; C: any[]; names: string[]; ids: string[]; dobs: string[]; own: string[] }
const ZN = ['Zephyra', 'Jane Zephyra', 'JANE Q ZEPHYRA', 'Zephyra, Jane', 'J. Zephyra', 'Jane Q. Zephyra', 'Zephyra, J.', 'Jane', 'J Q Zephyra', 'Zephyra J', 'Jane-Zephyra', 'Zephyra’s'];
export const XD: X = { who: 'D', P: { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042'] }, C: [claim('c', 'SYNCLAIM0001')], names: ZN,
  ids: ['SYNMEMBER0042', 'SYNCLAIM0001', 'SYN-MEMBER-0042', 'SYNCLAIM 0001', 'SYNMEMBER 0042', 'Member ID SYNMEMBER0042', 'Claim # SYNCLAIM0001'], dobs: dobForms(1980, 3, 14), own: ['ZEPHYRA', 'JANE', 'SYNMEMBER0042', 'SYNCLAIM0001'] };
export const XA: X = { who: 'A', P: { pseudonym: 'p', names: ['JANE Q ZEPHYRA', 'SIMONE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] }, C: [claim('c', 'SYNCLAIM0001')], names: [...ZN, 'Vantree', 'Simone Vantree', 'S. Vantree', 'Zephyra-Vantree'],
  ids: ['SYNMEMBER0042', 'ZZ7654321', 'SYNCLAIM0001', 'SYN-MEMBER-0042', 'ZZ 7654321', 'ZZ-765-4321', 'SYNCLAIM 0001', 'ZZ765-4321', 'Member ID ZZ7654321', 'Claim # SYNCLAIM0001'], dobs: dobForms(1980, 3, 14), own: ['ZEPHYRA', 'JANE', 'SIMONE', 'VANTREE', 'SYNMEMBER0042', 'ZZ7654321', 'SYNCLAIM0001'] };
export const XE: X = { who: 'E', P: { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['ZZ7654321', '7654321'] }, C: [claim('c', 'SYNCLAIM0001'), claim('d', '4455667')], names: ZN,
  ids: ['ZZ7654321', '7654321', 'ZZ 7654321', '765-4321', 'SYNCLAIM0001', '4455667', '445-5667', 'ZZ-765-4321', 'SYNCLAIM 0001', 'ID# 7654321', 'Claim 4455667'], dobs: dobForms(1980, 3, 14), own: ['ZEPHYRA', 'JANE', 'ZZ7654321', '7654321', 'SYNCLAIM0001', '4455667'] };
export const XM: X = { who: 'M', P: { pseudonym: 'p', names: ['JUNE MARCH'], datesOfBirth: ['1975-05-02'], memberIds: ['SYNMEMBER0042'] }, C: [claim('c', 'SYNCLAIM0001')], names: ['March', 'June March', 'June', 'March, June', 'J. March', '12 March', 'June 2020', 'June 12', 'March 5', '5 June', 'June 103', 'March 2021', 'June 5, 2020', '12 March 2020'],
  ids: ['SYNMEMBER0042', 'SYNCLAIM0001', 'SYNMEMBER 0042', 'Claim # SYNCLAIM0001'], dobs: dobForms(1975, 5, 2), own: ['SYNMEMBER0042', 'SYNCLAIM0001'] };
export const XN: X = { who: 'N', P: { pseudonym: 'p', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['900456789', '5550177'] }, C: [claim('c', '2025550142')], names: ZN,
  ids: ['900456789', '900-45-6789', '900 45 6789', '5550177', '555-0177', '2025550142', '202-555-0142', '(202) 555-0142', '90045-6789', '9004 56789', '555 0177', '202 555 0142'], dobs: dobForms(1980, 3, 14), own: ['ZEPHYRA', 'JANE', '900456789', '5550177', '2025550142'] };
const NJ = ['·', '‧', '∙', '⋅', '•', ' • ', '• ', '··'];
const PERSON = ['SSN', 'S.S.N', 'S S N', 'SS #', 'SS#', 'SS NO', 'SS No.', 'Soc Sec', 'Soc. Sec. No.', 'Social Security No.', 'Social Sec #', 'HICN', 'HIC', 'HICN #', 'Medicare', 'Medicare No.', 'Medicare #', 'Medicare ID', 'Phone', 'Phones', 'Ph', 'Ph.', 'PH#', 'Phone #', 'Phone No.', 'Tel', 'Tel.', 'Telephone', 'Telephone No.', 'Tels', 'Fax', 'Fax #', 'Faxes', 'Facsimile', 'Call', 'Called', 'Calling', 'Calls', 'TTY', 'TDD', 'TTY/TDD', 'Toll Free', 'Toll-Free', 'Cell', 'Cell #', 'Mobile', 'Contact', 'Contacts', 'Contacted', 'Contacting', 'call', 'phone', 'tel', 'fax', 'ssn'];
const KEEP = ['Claim', 'Claims', 'Claim #', 'Claim No.', 'ICN', 'DCN', 'Reference', 'Ref', 'Ref.', 'Ref #', 'Appeal', 'Case', 'Case No.', 'NPI', 'TIN', 'EIN', 'Tax ID', 'Check', 'Check #', 'EFT', 'Trace', 'Control', 'Control No.', 'Invoice', 'Authorization', 'Auth', 'Auth #', 'ZIP', 'Group', 'Group #'];
const NAMED = ['Account', 'Acct', 'Policy', 'Policy No.', 'Member', 'Member ID', 'Subscriber', 'Subscriber ID', 'Ticket', 'Tracking', 'TCN', 'MRN', 'Payment', 'Referral', 'Receipt', 'Voucher', 'Remit', 'Statement', 'Docket', 'Loan', 'Session', 'Customer', 'Employer', 'Payer', 'Rx', 'NDC', 'Pre-Auth', 'Precert', 'Patient', 'Patient #', 'ID', 'ID#', 'Paid', 'Balance', 'Total', 'Amount', 'Units', 'Line 1', 'DOS', 'Date'];
const CODES = ['CPT', 'CPT-4', 'HCPCS', 'Code', 'Codes', 'Code(s)', 'Modifier', 'Rev', 'Revenue', 'ICD-10', 'ICD'];
const ZIPS = ['TX', 'NY', 'AE', 'AP', 'D.C.', 'N.Y.', 'NY,', 'TX.', 'Texas', 'ZIP Code:', 'Zip', 'PR', 'MP', 'AS'];
const TAIL = ['', '', '', ':', ' No.', ' #', ' number', ' -', ' no', ' (home)', ' 1:', ' (2):', ' 1)', ' (1) :', ' 2nd:', ' 1 (cell):', ' No. 1:', ' # 2)', '.', ' (', ' is', ' =', ' Nbr', ' Num.', '\n', ':\n', ' 3 :', ' 12:', ' 1st)', ' (3)', ' 4.'];
const LISTSUF = [':', ')', ' :', 'st:', 'nd)', ' (home):', ' (cell) :', '.', ' -', ' (Jane):', ' (h) :', 'th:', ':\n', ') '];
const MID = [' ', ' ', ' ', ': ', ' for ', ' at ', ', ', ' - ', ' (', ') ', '\n', '', '-', '/', '\t', ' is ', ':', ' #', '. ', '; ', ' or ', ' and ', ' & ', '\n\n', ' \n', ' – '];
const LISTJ = [', ', ' and ', ' or ', ' & ', '/', '; ', ', and ', ',', ' / '];
const NUMS = ['555-0123', '555 0123', '555.0123', '555-\n0123', '900-12-3456', '90012-3456', '9001-23456', '900 12 3456', '900.12 3456', '900123456', '900-123456', '90012 3456', '202-555-0123', '2025550123', '(202) 555-0123', '202 555 0123', '20255 50123', '202-5550123', 'XXXXX3456', 'XXX-XX-3456', '***-**-3456', '1234567893', '5550123', '900-12-3456150.00', '900123456150.00', '1-202-555-0123', '+1 202 555 0123', '20 25 55 01 23', '900 12 34 56', '90 01 23 45 6', '202.555.0123', '202/555-0123', '900-12-\n3456', '900 - 12 - 3456', '555-01 23', '(202)555-0123', '202 5550123', '900-12-345678', '202-555-01234567', '0123456789', '555-0123 x45', '555-0123/0124',
  '555-0123 456', '555-0123-45', '555 0123 4567', '900 12 3456 78', '900-12-34567', '9 00-12-3456', '900-12-3456-01', '202-555-0123-4', '2025550123,5', '900123456,50', '900123456.50', '202) 555-0123', '1 (202) 555-0123', '555-0123 or 555-0124', '555-0123/24', '555-0123, 0124', 'xxx-xx-3456', '###-##-3456', '900-12-xxxx', '900 12 3456.', '900.12.3456', '900/12/3456', '900_12_3456', '900·12·3456', '900‧12‧3456', '900•12•3456', '555•0123', '202·555·0123', "900'12'3456", '900~12~3456', '900 12-3456', '900-12 3456', '90 012 3456', '9001 23 456', '2025 550 123', '202 55 50 123', '5550 123', '55 50123', '900,12 3456', '900 12,3456', '202,555,0123', '555,0123', '900-12-3456, 7', '555-0123, 4', '2025550123, 45', '09012-3456', '900123456 7', '12 900123456', '5550123 5550124', '555-0123 555-0124', '900-12-3456 900-12-3457', '900-12-3456/57'];
const EXTRA = ['900-12', '3456', '12-3456', '555', '9001', '150.00', '$150.00', '2020', '01/01/2020', '1', '45', '555-0124', '202', '900', '0124', '9', '90012', '2025550124', '$1,234.56', '97110', '12', '1,234.56', '12345.67', '01/01/2020-150.00', '01/01/2020-01/31/2020', '2020-01-02', '97110 2 150.00', '97110GP', 'M54.50', 'G0283', '10/1/2025-12/31', '12:30', '8am', '4th', '2nd', '(2)', '90%', '3 units', '711', '1-800', '60601', 'IL 60601-1234', 'Suite 200',
  '150,00', '$150', '(150.00)', '-150.00', '150.00-', '1.234,56', 'USD 150.00', '150.00 CR', '12:30:45', '1/2/20', '01-02-2020', '01.02.2020', '2020/01/02', 'Jan 2, 2020', '2 Jan 2020', 'January 2020', '01/2020', '1/2', '20200102', '97110-GP', '97110 GP 2 150.00', '97110 (2) 150.00', 'x2', '2 units', '#12', 'No. 5', 'Line 3', 'Page 1 of 2', 'ext. 12', 'x123', 'PO Box 1234', 'TX 75001', 'TX 75001-1234', 'AE 09012-3456', 'D.C. 20001-1234', '12345-6789', '1st', '(3)', '5.', '6)', '7:', 'TCN 12345678901234.01', 'Case No. 123-45-678901-02', 'ICN 20260112345', 'EIN 12-3456789', 'NPI 1234567893', 'N235', 'CO-45', 'PR-1', '99213 25', '0.00', '80.00', '1,250.00'];
const GLUE = [' ', '-', '/', ', ', ' or ', ' and ', '\n', ' x', ' ext ', '.', '', 'Paid', ' Paid ', '(', ')', ') ', ' (', ':', ': ', ';', ' #', '#', '*', ' | ', '|', '~', '·', '•', '∙', '‧', '⋅', '\t', ' / ', ',', '; ', ' – ', '–', '"', "'", '\n\n', ' \n', '\r\n', '  ', '=', '+', ' ', ' (home) ', ' (home): ', ', home: ', ' weekdays ', ' our office at ', ' desk '];
const HELD = ['DOS 01/01/2020-01/31/2020 ', 'Service period 01/01/2020 - 01/31/2020.\n', 'Seen 01/01/2020-150.00Paid in full. ', 'Paid $150.00 900.12 on 01/02/2020. ', '01/01/2020 97110 2 150.00\n', '$1,234.56-$900.12 ', '2020-01-02 150.00 80.00 ', '12/31/2019 - 150.00 ', 'Stmt 01/31/20 Bal 1,234.56 Pd 900.12 '];
const WORDS = ['a', 'of', 'at', 'the', 'desk', 'line', 'home', 'office', 'please', 'between', 'regarding', 'department', 'weekdays', 'questions', 'mobile', 'direct', 'main', 'her', 'his'];
const SCRIPTS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0e50, 0x1d7ce, 0x0a66, 0x0ce6];
const CROSS: Record<string, string[]> = { O: ['0'], I: ['1'], L: ['1'], S: ['5'], B: ['8'], E: ['3'], '0': ['O', 'o'], '1': ['l', 'I'], '5': ['S'], '8': ['B'], '3': ['E'] };
const INVIS = ['​', '­', '⁠', '‍', '﻿', '͏', '‎'];
const JOIN = [' ', '-', '_', '|', '\\', '.', '/', ':', '#', '(', '·', '•', '∙', '⋅', '‧', '・', '~', '*', "'", '’', ',', ';', '=', '+', '‑', '−', '˗', '➖', '\t', '\n', '-\n', ' - ', '–', '—', '⁃', ' ', ' ', '"', '`', '´', 'ʼ'];
export function makeGen2(seed0: number) {
  let seed = seed0;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const chance = (p: number) => rnd() < p;
  const D = () => String(Math.floor(rnd() * 10));
  const randomNumber = () => { const groups = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Array.from({ length: 1 + Math.floor(rnd() * 5) }, D).join('')); return groups.map((gr, i) => (i === 0 ? gr : pick(['-', ' ', '.', '\n', '', '/', ')', '-\n', ', ', '(', ' - ', ',', '•', '·']) + gr)).join(''); };
  const od = (all: boolean) => (s: string) => { const z = pick(SCRIPTS); return s.replace(/[0-9]/g, (d) => (all || chance(0.5) ? String.fromCodePoint(z + Number(d)) : d)); };
  const alike = (all: boolean) => (s: string) => [...s].map((c) => { const o = /[A-Za-z]/.test(c) ? INV[c.toUpperCase()] : undefined; return o && (all || chance(0.3)) ? pick(o) : c; }).join('');
  const lookdigit = (s: string) => { const a = [...s]; const idx = a.map((c, i) => (/[0-9]/.test(c) && INV[c] ? i : -1)).filter((i) => i >= 0); if (idx.length === 0) return s; const i = pick(idx); a[i] = pick(INV[a[i]!]!); return a.join(''); };
  const crossed = (s: string) => { const a = [...s]; const idx = a.map((c, i) => (CROSS[c.toUpperCase()] ? i : -1)).filter((i) => i >= 0); if (idx.length === 0) return s; const k = 1 + Math.floor(rnd() * Math.min(2, idx.length)); for (let j = 0; j < k; j += 1) { const i = pick(idx); a[i] = pick(CROSS[a[i]!.toUpperCase()] ?? [a[i]!]); } return a.join(''); };
  const invis = (s: string) => { const a = [...s]; a.splice(Math.floor(rnd() * (a.length + 1)), 0, pick(INVIS)); return a.join(''); };
  const nj = (s: string) => { const a = [...s]; const seps = a.map((c, i) => (/[ \-,.]/.test(c) && i > 0 && i < a.length - 1 ? i : -1)).filter((i) => i >= 0); const j = pick(NJ); if (seps.length > 0 && chance(0.7)) { const i = pick(seps); a.splice(i, a[i + 1] === ' ' ? 2 : 1, j); } else a.splice(1 + Math.floor(rnd() * Math.max(1, a.length - 1)), 0, j); return a.join(''); };
  const wrap = (s: string) => { const a = [...s]; const seps = a.map((c, i) => (/[ \-]/.test(c) && i > 0 && i < a.length - 1 ? i : -1)).filter((i) => i >= 0); if (seps.length > 0 && chance(0.75)) { const i = pick(seps); a[i] = a[i] === '-' ? pick(['-\n', '-\r\n', '-\n  ', '-\n\t']) : pick(['\n', '\r\n', ' \n', '\n ', '\n\n']); } else a.splice(1 + Math.floor(rnd() * Math.max(1, a.length - 1)), 0, pick(['-\n', '\n', '-\n ', '­\n'])); return a.join(''); };
  const joiner = (s: string) => { const a = [...s]; const seps = a.map((c, i) => (/[ \-.,/]/.test(c) ? i : -1)).filter((i) => i >= 0); if (seps.length > 0 && chance(0.6)) a[pick(seps)] = pick(JOIN); else a.splice(1 + Math.floor(rnd() * Math.max(1, a.length - 1)), 0, pick(JOIN)); return a.join(''); };
  const recase = (s: string) => pick([s.toUpperCase(), s.toLowerCase(), s]);
  const MUT_NAME = [nj, nj, nj, alike(false), alike(true), crossed, invis, wrap, joiner, recase];
  const MUT_ID = [od(false), od(true), lookdigit, lookdigit, crossed, crossed, alike(false), invis, wrap, joiner, joiner];
  const MUT_NUM = [od(false), od(true), invis, joiner, wrap, lookdigit];
  const mut = (list: ((s: string) => string)[], s: string, p: number) => { let out = s; if (chance(p)) { out = pick(list)(out); if (chance(0.25)) out = pick(list)(out); } return out; };
  const nameOf = (x: X, p = 0.5) => mut(MUT_NAME, pick(x.names), p);
  const idOf = (x: X, p = 0.5) => mut(MUT_ID, pick(x.ids), p);
  const dobOf = (x: X, p = 0.3) => mut(MUT_NUM, pick(x.dobs), p);
  const ownOf = (x: X, p = 0.5) => { const r = rnd(); return r < 0.5 ? nameOf(x, p) : r < 0.85 ? idOf(x, p) : dobOf(x, p); };
  const num = (p = 0.12) => (chance(0.85) ? mut(MUT_NUM, pick(NUMS), p) : randomNumber());
  const label = () => { const r = rnd(); return (r < 0.6 ? pick(PERSON) : r < 0.8 ? pick(KEEP) : r < 0.92 ? pick(NAMED) : r < 0.96 ? pick(CODES) : pick(ZIPS)) + pick(TAIL); };
  const fill = () => { const k = Math.floor(rnd() * 5); let s = ''; for (let i = 0; i < k; i += 1) s += ` ${pick(WORDS)}`; return s + pick([' ', ': ', ' ', ') ', ', ', '\n', ' - ']); };
  const listNo = () => ` ${1 + Math.floor(rnd() * 12)}${pick(LISTSUF)}`;
  const seg1 = (x: X) => {
    const lab = label(); const k = rnd(); let through = '';
    if (k < 0.3) through = pick(MID) + nameOf(x, 0.6);
    else if (k < 0.42) through = pick(MID) + ownOf(x, 0.4);
    else if (k < 0.55) through = listNo();
    else if (k < 0.63) through = pick(MID) + ownOf(x, 0.4) + listNo();
    else if (k < 0.7) through = listNo() + pick(MID) + ownOf(x, 0.4);
    else if (k < 0.8) through = pick(MID) + ownOf(x, 0.4) + pick(MID) + ownOf(x, 0.4);
    else if (k < 0.9) through = fill();
    const number = num();
    let body = `${lab}${through}${pick(MID)}${number}`; const e = rnd();
    if (e < 0.35) body = `${body}${pick(GLUE)}${chance(0.8) ? pick(EXTRA) : randomNumber()}`;
    else if (e < 0.5) body = `${lab}${through}${pick(MID)}${pick(EXTRA)}${pick(GLUE)}${number}`;
    else if (e < 0.6) body = `${pick(EXTRA)}${pick(GLUE)}${body}`;
    else if (e < 0.72) body = `${body}${pick(GLUE)}${label()}${pick(MID)}${num()}`;
    else if (e < 0.8) body = `${body}${pick(LISTJ)}${num()}`;
    return body;
  };
  const seg2 = (x: X) => {
    const own = ownOf(x, 0.75);
    const left = pick([num(), pick(EXTRA), randomNumber(), label(), '']); const right = pick([num(), pick(EXTRA), randomNumber(), '']);
    return `${chance(0.35) ? `${label()} ` : ''}${left}${pick(GLUE)}${own}${pick(GLUE)}${right}`;
  };
  const seg3 = (x: X) => { const k = 3 + Math.floor(rnd() * 5); let s = ''; for (let i = 0; i < k; i += 1) { const c = rnd(); const atom = c < 0.25 ? label() : c < 0.45 ? num(0.1) : c < 0.6 ? pick(EXTRA) : c < 0.9 ? ownOf(x, 0.45) : randomNumber(); s += (i === 0 ? '' : pick(GLUE)) + atom; } return s; };
  const seg4 = (x: X) => {
    const cl = chance(0.7) ? pick(x.ids) : idOf(x, 0.8); const k = rnd();
    if (k < 0.3) return `${pick(KEEP)}${pick(TAIL)} ${cl}${pick(LISTJ)}${num()}${chance(0.4) ? pick(LISTJ) + num() : ''}`;
    if (k < 0.5) return `${pick(PERSON)}${pick(TAIL)} ${cl}${pick(MID)}${num()}${chance(0.4) ? pick(GLUE) + pick(EXTRA) : ''}`;
    if (k < 0.7) return `${cl}${pick(GLUE)}${num()}${pick(GLUE)}${nameOf(x, 0.6)}`;
    if (k < 0.85) return `${num()}${pick(GLUE)}${cl}${pick(GLUE)}${num()}`;
    return `${pick(PERSON)} ${nameOf(x, 0.3)}${pick(LISTJ)}${cl}${pick(LISTJ)}${num()}`;
  };
  const seg5 = (x: X) => { const lab = pick(PERSON) + pick(TAIL); const o = wrap(chance(0.6) ? pick(x.names) : pick(x.ids)); const nm = chance(0.5) ? wrap(pick(NUMS)) : num(); const br = () => pick(['\n', '\r\n', ' \n', '\n ', '\n\n', ' ']); return `${lab}${br()}${chance(0.8) ? o : ''}${br()}${nm}${chance(0.3) ? br() + pick(EXTRA) : ''}`; };
  const seg6 = (x: X) => { const a = `${pick(PERSON)}${listNo()} ${chance(0.6) ? idOf(x, 0.4) : num()}`; const b = `${pick(PERSON)}${pick(MID)}${nameOf(x, 0.4)}${pick(MID)}${num()}`; const sep = pick(['\n', '. ', '; ', ' ']); return chance(0.5) ? `${a}${sep}${b}` : `${b}${sep}${a}`; };
  const seg7 = (x: X) => { const id = pick([od(false), od(true), lookdigit, (s: string) => lookdigit(lookdigit(s)), crossed, alike(false)])(pick(x.ids)); return `${pick(['Member ID', 'Member', 'ID', 'Subscriber ID', 'Claim', 'Claim #', 'SSN', 'Phone', 'Medicare', 'HICN', 'Member #', 'ID No.', 'Tel', 'Call'])}${pick(TAIL)} ${id}${chance(0.6) ? pick(MID) + num() : ''}${chance(0.3) ? pick(GLUE) + pick(EXTRA) : ''}`; };
  const letter = () => {
    const r0 = rnd(); const x = r0 < 0.4 ? XA : r0 < 0.6 ? XE : r0 < 0.75 ? XN : r0 < 0.87 ? XM : XD;
    const n = 1 + (chance(0.4) ? 1 : 0) + (chance(0.12) ? 1 : 0); const segs: string[] = [];
    for (let i = 0; i < n; i += 1) { const c = rnd(); segs.push(c < 0.3 ? seg1(x) : c < 0.45 ? seg2(x) : c < 0.55 ? seg3(x) : c < 0.67 ? seg4(x) : c < 0.79 ? seg5(x) : c < 0.9 ? seg6(x) : seg7(x)); }
    const prefix = chance(0.25) ? pick(HELD) : pick(['', '', '', 'Paid $10.00. ', `Dear ${x.names[1]},\n`, '150.00 ', `Claim ${x.ids[x.ids.length - 1]} `, `Re: ${x.names[0]}\n`]);
    const suffix = pick(['', '', '', '', '.', ' Paid $1.00', '150.00', ` ${x.names[0]}`, 'th', ' ext 12', '-1', '\n150.00', ' 2020', 'A', ` cc ${nj(x.names[1]!)}`, ` ${pick(x.ids)}`, ', 12', ',5']);
    return { t: `${prefix}${segs.join(pick(['\n', '. ', ' ', '.\n', '; ', '\n\n']))}${suffix}`, P: x.P, C: x.C, who: x.who, own: x.own };
  };
  return { letter, rnd, pick };
}

export const VOCAB = { NJ, PERSON, KEEP, NAMED, CODES, ZIPS, TAIL, LISTSUF, MID, LISTJ, NUMS, EXTRA, GLUE, HELD, WORDS, SCRIPTS, CROSS, INVIS, JOIN, INV };
