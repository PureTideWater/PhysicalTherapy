// Wide letter generator for the C1 review (synthetic data only): labels, the call's own identifiers in plain, look-alike,
// other-script-digit, digit-for-letter, invisible and joined writings, numbers, ranges, masks, case-glued labels, fillers.
import { pathToFileURL } from 'node:url';
const { LOOK_ALIKES } = await import(pathToFileURL('/home/user/fix/packages/model-gateway/src/confusables.ts').href);
const INV: Record<string, string[]> = {};
for (const [k, v] of LOOK_ALIKES as Map<string, string>) if (typeof v === 'string' && v.length === 1) (INV[v.toUpperCase()] ??= []).push(k);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dobForms = (y: number, m: number, d: number) => {
  const mm = String(m).padStart(2, '0'); const dd = String(d).padStart(2, '0'); const yy = String(y).slice(2); const M = MON[m - 1]!; const Mo = M.slice(0, 3);
  return [`${mm}/${dd}/${y}`, `${m}/${d}/${yy}`, `${M} ${d}, ${y}`, `${d} ${Mo} ${y}`, `${y}-${mm}-${dd}`, `${Mo} ${d}th, ${y}`, `${dd}.${mm}.${y}`, `DOB ${mm}/${dd}/${y}`, `DOB: ${mm}${dd}${y}`, `born ${M} ${d} ${y}`, `${y}${mm}${dd}`, `${dd}${Mo.toUpperCase()}${y}`, `${Mo}. ${d} ${y}`, `${mm}-${dd}-${yy}`, `${y}/${mm}/${dd}`, `Date of Birth: ${M} ${d}, ${y}`, `${d}-${Mo}-${yy}`, `${mm}${dd}${yy}`, `${Mo} ${d}`, `${d}/${m}/${y}`, `D.O.B. ${m}-${d}-${y}`];
};
const XA = { who: 'A', P: { pseudonym: 'p', names: ['JANE Q ZEPHYRA', 'SIMONE VANTREE'], datesOfBirth: ['1980-03-14'], memberIds: ['SYNMEMBER0042', 'ZZ7654321'] }, C: [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNCLAIM0001'] }],
  names: ['Zephyra', 'Jane Zephyra', 'JANE Q ZEPHYRA', 'Zephyra, Jane', 'J. Zephyra', 'Jane Q. Zephyra', 'Zephyra, J.', 'Vantree', 'Simone Vantree', 'S. Vantree', 'Zephyra’s', 'ZEPHYRA', 'Jane', 'J Q Zephyra', 'Zephyra J'],
  ids: ['SYNMEMBER0042', 'ZZ7654321', 'SYNCLAIM0001', 'SYN-MEMBER-0042', 'ZZ 7654321', 'ZZ-765-4321', 'SYNCLAIM 0001', 'SYNMEMBER 0042', 'ZZ 765 4321', 'ZZ765-4321', 'Member ID ZZ7654321', 'Claim # SYNCLAIM0001', 'ZZ 765-4321'],
  dobs: dobForms(1980, 3, 14), own: ['ZEPHYRA', 'JANE', 'SIMONE', 'VANTREE', 'SYNMEMBER0042', 'ZZ7654321', 'SYNCLAIM0001'] };
const XB = { who: 'B', P: { pseudonym: 'p', names: ['ANA MARIE COLE'], datesOfBirth: ['1975-05-02'], memberIds: ['SYN042', '7654321'] }, C: [{ claimId: 'c', patientPseudonym: 'p', claimNumbers: ['SYNC12'] }, { claimId: 'd', patientPseudonym: 'p', claimNumbers: ['4455667'] }],
  names: ['Cole', 'Marie Cole', 'ANA MARIE COLE', 'Cole, Ana', 'A. Cole', 'A. M. Cole', 'Marie', 'Ana Cole', 'Cole, A.', 'COLE'],
  ids: ['SYN042', 'SYN 042', 'SYN-042', '7654321', '765-4321', '765 4321', 'SYNC12', 'SYNC-12', 'SYNC 12', '4455667', '445-5667', '4455 667', 'Member ID 7654321', 'Claim 4455667', 'ID# 7654321'],
  dobs: dobForms(1975, 5, 2), own: ['MARIE', 'COLE', 'SYN042', 'SYNC12'] };
const LABELS = ['SSN', 'Social Security', 'Soc. Sec.', 'SS#', 'SS No', 'Phone', 'Tel', 'Tel.', 'Fax', 'Call', 'Contact', 'TTY', 'Cell', 'Mobile', 'Medicare', 'HICN', 'HIC', 'Telephone', 'Ph', 'Phones', 'Toll-free', 'S.S.N.', 'Social Security Number', 'Medicare ID', 'Phone number', 'PatientSSN', 'PatientSS#', 'PatientHIC', 'PaidSSN', 'PatientPhone', 'Claim', 'Ref', 'ID', 'Member', 'Case No.', 'NPI', 'Paid', 'TIN', 'Policy No.', 'Account'];
const TAIL = ['', '', '', ':', ' No.', ' #', ' number', ' -', ' no', ' (home)', ' 1:', ' (2):'];
const GLUED_LABELS = ['PatientSSN', 'PATIENTSSN', 'PatientSS#', 'PatientSS No', 'PatientHIC', 'PaidSSN', 'PatientPhone', 'PatientSocialSecurityNumber', 'memberSS#', 'xSS#b', 'aHICé', 'aSS Noé', 'theHICN', 'classSS#A', 'FaxSSN', 'smartphone', 'Fairfax'];
const KEEP = ['Claim', 'Claim #', 'Ref', 'Ref. No.', 'NPI', 'TIN', 'EIN', 'Tax ID', 'Case No.', 'ICN', 'DCN', 'Check', 'Group', 'Auth', 'ZIP', 'CPT', 'Code', 'ICD-10', 'Account', 'Policy No.', 'Member', 'Tracking', 'Invoice', 'Paid', 'ID', 'Patient', 'Units', 'Line 1', 'Acct#', 'Patient #'];
const MID = [' ', ' ', ': ', ' for ', ' at ', ', ', ' - ', ' (', ') ', '\n', '', '-', '/', '\t', ' is ', ':', ' #', '. ', '; '];
const NUMS = ['555-0123', '555 0123', '555.0123', '555-\n0123', '900-12-3456', '90012-3456', '9001-23456', '900 12 3456', '900.12 3456', '900123456', '900-123456', '90012 3456', '202-555-0123', '2025550123', '(202) 555-0123', '202 555 0123', '20255 50123', '202-5550123', 'XXXXX3456', 'XXX-XX-3456', '***-**-3456', '1234567893', '5550123', '0123', '900-12-3456150.00', '150.00900-12-3456', '$150.00900-12-3456', '900123456150.00', 'PaidXXX-XX-3456', '(202) 555-0123x45', '1-202-555-0123', '+1 202 555 0123',
  '20 25 55 01 23', '9 0 0 1 2 3 4 5 6', '900 12 34 56', '90 01 23 45 6', '202.555.0123', '202/555-0123', '900-12-\n3456', '900–12–3456', '900 - 12 - 3456', '555-01 23', 'XXX-XX-\n3456', 'XXX XX 3456', '###-##-3456', '●●●-●●-3456', 'XXX-XX-34 56', '(202)555-0123', '202 5550123', '800-555-0118', '8005550118', '1 800 555 0118', '900123456A', '900-12-3456A', '900-12-345678', '202-555-01234567', '123-45-678901', '0123456789', '12345678901234.01', '555-0123 x45', '202-555-0123 ext 1234', '555-0123/0124'];
const EXTRA = ['900-12', '3456', '12-3456', '555', '9001', '150.00', '$150.00', '2020', '01/01/2020', '1', '45', '555-0124', '202', '900', '0124', '9', '90012', '2025550124', '900-12-3457', '$1,234.56', '97110', '12', '1,234.56',
  '12345.67', '01/01/2020-150.00', '$10-900.12', '01/01/2020-01/31/2020', '2020-01-02', '97110 2 150.00', '97110GP', 'M54.50', 'G0283', '$1,250.00', '1,250.00', '10/1/2025-12/31', '12:30', '8am', '4th', '2nd', '(2)', '90%', '3 units', '80.00', '0.00', '711', '1-800', '60601', 'IL 60601-1234', 'Suite 200', '555 01', '01 23', '34 56'];
const GLUE = [' ', '-', '/', ', ', ' or ', ' and ', '\n', ' x', ' ext ', '.', '', 'Paid', ' Paid ', '(', ')', ') ', ' (', ':', ': ', ';', ' #', '#', '*', ' | ', '|', '~', '·', '•', '\t', ' / ', ',', '; ', ' – ', '–', '"', "'", '\n\n', ' \n', '\r\n', '\f', '  ', '=', '+', ' + ', ' ', ' ', '　', ' xSS#b ', ' aHICé ', ' desk ', ' (home) ', ' (home): ', ', home: ', ' weekdays ', ' our office at '];
const WORDS = ['a', 'of', 'at', 'the', 'desk', 'line', 'home', 'office', 'please', 'between', 'regarding', 'department', 'weekdays', 'questions', 'xSS#b', 'aHICé', 'aSS Noé', 'classSS#A', 'theHICN', 'graphHICs', 'PatientSS#', 'PatientHIC', 'memberSS No'];
const SCRIPTS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0e50, 0xff10, 0x1d7ce, 0x0a66, 0x0ce6];
const CROSS: Record<string, string[]> = { O: ['0'], I: ['1'], L: ['1'], S: ['5'], B: ['8'], E: ['3'], '0': ['O', 'o'], '1': ['l', 'I'], '5': ['S'], '8': ['B'], '3': ['E'] };
const INVIS = ['​', '­', '⁠', '‍', '﻿', '͏', '‎'];
const JOIN = [' ', '-', '_', '|', '\\', '.', '/', ':', '#', '(', '·', '•', '∙', '⋅', '‧', '・', '~', '*', "'", '’', ',', ';', '=', '+', '‑', '−', '˗', '➖', '\t', '\n', '-\n', ' - ', '–', '—', '⁃', ' ', ' ', '"', '`', '´', 'ʼ'];
export function makeGen(seed0: number) {
  let seed = seed0;
  const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;
  const chance = (p: number) => rnd() < p;
  const D = () => String(Math.floor(rnd() * 10));
  const randomNumber = () => { const groups = Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, D).join('')); return groups.map((g, i) => (i === 0 ? g : pick(['-', ' ', '.', '\n', '', '/', ')', '-\n', ', ', '(', ' - ']) + g)).join(''); };
  const od = (all: boolean) => (s: string) => { const z = pick(SCRIPTS); return s.replace(/[0-9]/g, (d) => (all || chance(0.5) ? String.fromCodePoint(z + Number(d)) : d)); };
  const alike = (all: boolean) => (s: string) => [...s].map((c) => { const o = INV[c.toUpperCase()]; return o && (all || chance(0.3)) ? pick(o) : c; }).join('');
  const crossed = (s: string) => { const a = [...s]; const idx = a.map((c, i) => (CROSS[c.toUpperCase()] ? i : -1)).filter((i) => i >= 0); if (idx.length === 0) return s; const k = 1 + Math.floor(rnd() * Math.min(2, idx.length)); for (let j = 0; j < k; j += 1) { const i = pick(idx); a[i] = pick(CROSS[a[i]!.toUpperCase()] ?? [a[i]!]); } return a.join(''); };
  const invis = (s: string) => { const a = [...s]; a.splice(Math.floor(rnd() * (a.length + 1)), 0, pick(INVIS)); return a.join(''); };
  const joiner = (s: string) => { const a = [...s]; const seps = a.map((c, i) => (/[ \-.,/]/.test(c) ? i : -1)).filter((i) => i >= 0); if (seps.length > 0 && chance(0.6)) a[pick(seps)] = pick(JOIN); else a.splice(1 + Math.floor(rnd() * Math.max(1, a.length - 1)), 0, pick(JOIN)); return a.join(''); };
  const recase = (s: string) => pick([s.toUpperCase(), s.toLowerCase(), s]);
  const MUT = [alike(false), alike(true), od(false), od(true), crossed, crossed, invis, joiner, joiner, recase];
  const mutate = (s: string, p: number) => { let out = s; if (chance(p)) { out = pick(MUT)(out); if (chance(0.3)) out = pick(MUT)(out); } return out; };
  const fill = () => { const k = Math.floor(rnd() * 6); let s = ''; for (let i = 0; i < k; i += 1) s += ` ${pick(WORDS)}`; return s + pick([' ', ': ', ' ', ') ', ', ', '\n', ' - ']); };
  type X = typeof XA;
  const ownOf = (x: X, p: number, wn = 0.5, wi = 0.3) => { const r = rnd(); return mutate(pick(r < wn ? x.names : r < wn + wi ? x.ids : x.dobs), p); };
  const seg1 = (x: X) => {
    const lab = pick(LABELS) + pick(TAIL); const k = rnd(); let through = '';
    if (k < 0.35) through = pick(MID) + ownOf(x, 0.45); else if (k < 0.5) through = ` ${1 + Math.floor(rnd() * 12)}${pick([':', ')', '', 'st:', ' :', '.', ' (home):', ' (cell) :', 'nd)'])}`; else if (k < 0.6) through = pick(MID) + ownOf(x, 0.45) + pick(MID) + ownOf(x, 0.45); else if (k < 0.68) through = pick(MID) + ownOf(x, 0.45) + ` ${1 + Math.floor(rnd() * 9)}:`; else if (k < 0.82) through = fill();
    const number = chance(0.8) ? mutate(pick(NUMS), 0.12) : randomNumber();
    let body = `${lab}${through}${pick(MID)}${number}`; const e = rnd();
    if (e < 0.4) body = `${body}${pick(GLUE)}${chance(0.8) ? pick(EXTRA) : randomNumber()}`;
    else if (e < 0.55) body = `${lab}${through}${pick(MID)}${pick(EXTRA)}${pick(GLUE)}${number}`;
    else if (e < 0.65) body = `${pick(EXTRA)}${pick(GLUE)}${body}`;
    else if (e < 0.75) body = `${body}${pick(GLUE)}${pick(LABELS)}${pick(MID)}${pick(NUMS)}`;
    return body;
  };
  const seg2 = (x: X) => {
    const own = ownOf(x, 0.7, 0.4, 0.4);
    const left = pick([pick(NUMS), pick(EXTRA), randomNumber(), pick(LABELS), pick(KEEP), '']); const right = pick([pick(NUMS), pick(EXTRA), randomNumber(), '']);
    return `${chance(0.3) ? `${pick(LABELS)}${pick(TAIL)} ` : ''}${left}${pick(GLUE)}${own}${pick(GLUE)}${right}`;
  };
  const seg3 = (x: X) => {
    const k = 3 + Math.floor(rnd() * 6); let s = '';
    for (let i = 0; i < k; i += 1) { const c = rnd(); const atom = c < 0.2 ? pick(LABELS) + pick(TAIL) : c < 0.3 ? pick(GLUED_LABELS) : c < 0.42 ? pick(KEEP) : c < 0.6 ? mutate(pick(NUMS), 0.1) : c < 0.75 ? pick(EXTRA) : c < 0.9 ? ownOf(x, 0.4) : randomNumber(); s += (i === 0 ? '' : pick(GLUE)) + atom; }
    return s;
  };
  const letter = () => {
    const x = chance(0.7) ? XA : XB; const n = 1 + Math.floor(rnd() * 3); const segs: string[] = [];
    for (let i = 0; i < n; i += 1) { const c = rnd(); segs.push(c < 0.45 ? seg1(x) : c < 0.75 ? seg2(x) : seg3(x)); }
    const prefix = pick(['', '', '', 'Paid $10.00. ', 'Seen 01/01/2020-150.00Paid in full. ', 'DOS 01/01/2020-01/31/2020 ', 'Service period 01/01/2020 - 01/31/2020.\n', `Dear ${x.names[1]},\n`, '150.00 ', '2020-01-02 ', `Claim ${x.ids[2]} `, `Call ${x.names[0]} at 555-0199.\n`]);
    const suffix = pick(['', '', '', '.', ' Paid $1.00', '150.00', x.names[0]!, ` ${x.dobs[0]}`, 'th', 'x12', ' ext 12', '-1', ' (home)', '\n150.00', ' 2020', 'A', ` ${x.ids[2]}`, `/${x.ids[0]}`]);
    return { t: `${prefix}${segs.join(pick(['\n', '. ', ' ', '.\n', '; ', '\n\n']))}${suffix}`, P: x.P, C: x.C, who: x.who, own: x.own };
  };
  return { letter, rnd, pick };
}
