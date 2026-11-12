// Differential fuzz: base vs head (real budget) vs scratch head with a random low budget. Synthetic data only.
import * as B from '/home/user/tree-base/packages/redact/src/redact.ts';
import * as H from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
import * as X from '/home/user/review-phi/x/redact.ts';
import { isDeepStrictEqual } from 'node:util';
let seed = Number(process.env.SEED ?? 1) >>> 0;
const rnd = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const P = { pseudonym: 'synthetic-patient-7', names: ['JANE Q ZEPHYRA', 'ZEPHYRA, JANE'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN7700123'] };
const C = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001', '4471'] }, { claimId: 'c2', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYNCLM-55502'] }];
const V = ['Jane', 'JANE', 'Zephyra', 'ZEPHYRA', 'Zeph∙yra', 'Zеphyra', 'Zephyrа', 'J', 'Q', 'J.', ' J', 'Zep hyra', 'Z e p h y r a', 'Zephyra〇', 'Jane Q. Zephyra', 'Zephyra, Jane',
  '900-12-3456', '900 12 3456', '900123456', '9\n0\n0\n1\n2\n3\n4\n5\n6', 'SSN', 'SS#', 'Soc Sec', 'HICN', 'Medicare', '(202) 555-0123', '202-555-0145', '202.555.0101', '5550123', 'Phone', 'call', 'Fax', 'TTY',
  'SYN7700123', 'syn7700123', 'SYN 7700 123', 'S-Y-N-7-7-0-0-1-2-3', 'SYN555001', 'SYNCLM-55502', 'synclm55502', '4471', 'Member ID', 'Claim', 'claim no.', 'ICN', 'Ref', 'NPI', 'ZIP', 'CPT', 'Group',
  '03/03/1961', '3/3/61', 'March 3, 1961', '1961-03-03', '03031961', 'DOB', 'born', 'Date of Birth', '11/01/2026', '10/01/2026-10/15/2026', '2026-11-01', '$150.00', '150.00', '1,234.56', '150.00-120.00',
  '5', '1', '0', '5\n', '1\r\n', '5-\n', '٥', '٥ ', '٥\u0085', 'х', '­', '​', '∙', ' ', ' ', ' ', '\n', '\t', '.', ',', ':', '#', '(', ')', '-', '/', 'x', 'a', 'Paid', 'Service', 'denied', 'the', 'was seen', 'St.', 'and',
  '[SSN]', '[PHONE]', '[PATIENT_NAME]', '[CLAIM_1]', '[MEMBER_ID]', '[DATE_OF_BIRTH]', '\u0002', 'Dear', 'Re:', 'Total', 'ha', 'Jan', 'Aug'];
const CLEANV = ['Jane Q Zephyra', 'Zephyra, Jane', 'JANE ZEPHYRA', 'Zephyra', 'Z\u0435phyra', 'Zeph\u2219yra', 'SSN 900-12-3456', '(202) 555-0123', 'Phone 202-555-0145', 'member SYN7700123', 'claim SYN555001', 'SYNCLM-55502', 'DOB 03/03/1961', 'born March 3, 1961', '11/01/2026', '$150.00', 'Paid', 'Service', 'denied', 'the', 'was seen', 'and', 'Dear', 'Re:', 'Total', 'appeal', 'received', '.', ',', '\n', 'CPT 97110', 'x', '\u0445', 'J.', '5\n', 'units 4', 'page 2 of 3'];
if (process.env.VOC === 'clean') { V.length = 0; V.push(...CLEANV, ' ', ' '); }
const LO = Number(process.env.LO ?? 0.05), SPAN = Number(process.env.SPAN ?? 2.2);
const letter = (): string => {
  const mode = rnd();
  const n = mode < 0.6 ? 1 + Math.floor(rnd() * 25) : mode < 0.9 ? 20 + Math.floor(rnd() * 120) : 100 + Math.floor(rnd() * 600);
  let s = '';
  if (rnd() < 0.25) { const u = pick(V) + pick(V); s = u.repeat(1 + Math.floor(rnd() * (mode < 0.9 ? 40 : 400))); }
  for (let i = 0; i < n; i += 1) s += pick(V) + (rnd() < 0.5 ? ' ' : '');
  if (rnd() < 0.2) { const u = pick(V) + pick(V); s += u.repeat(1 + Math.floor(rnd() * 200)); }
  return s;
};
const same = (a: any, b: any) => a.text === b.text && a.replaced === b.replaced && isDeepStrictEqual([...a.candidates], [...b.candidates]) && isDeepStrictEqual([...a.claims], [...b.claims]);
const N = Number(process.env.N ?? 2000);
const stats = { n: 0, baseSent: 0, baseRefused: 0, xPastInRedaction: 0, xPastInCheck: 0, xSent: 0, xRefusedSameAsBase: 0, fails: 0, state: 0 };
const fail = (what: string, t: string, extra: unknown = '') => { stats.fails += 1; if (stats.fails <= 10) console.log('FAIL', what, JSON.stringify(t).slice(0, 400), extra); };
const end = Date.now() + Number(process.env.MS ?? 200000);
for (let i = 0; i < N && Date.now() < end; i += 1) {
  const t = letter();
  stats.n += 1;
  const rb = B.redactLetterForScreen(t, P, C); const hb = B.holdsIdentifier(rb.text, P, C);
  hb ? (stats.baseRefused += 1) : (stats.baseSent += 1);
  // real head, full budget
  const rh = H.redactLetterForScreen(t, P, C); const sh = H.checkWorkOf(rh); const hh = H.holdsIdentifier(rh.text, P, C, sh);
  if (sh <= H.CHECK_WORK_BUDGET) { if (!same(rh, rb)) fail('head redaction differs from base within budget', t); } else if (rh.text !== '\u0001') fail('head past budget text not BARRIER', t);
  if (!hh && (hb || rh.text !== rb.text)) fail('HEAD SENT what base refuses or other text', t);
  if (hh && !hb && sh <= H.CHECK_WORK_BUDGET && sh > 0 && t.length < 2000) fail('head refused a small letter base sends (budget?)', t, sh);
  // scratch head: learn the full cost, then a random budget around it
  X.__setBudget(420_000_000);
  const r0 = X.redactLetterForScreen(t, P, C); const s0 = X.checkWorkOf(r0);
  const c0 = X.__counted(s0, () => 0); void c0;
  const budget = Math.max(1, Math.floor(s0 * (LO + rnd() * SPAN)));
  X.__setBudget(budget);
  const rx = X.redactLetterForScreen(t, P, C); const sx = X.checkWorkOf(rx);
  let st = X.__state(); if (st.checkWorkSpent !== null || st.ownFold !== 'plain' || st.viewsOfCheck !== null || st.datesOfCheck !== null) { stats.state += 1; fail('state left after redaction', t, st); }
  if (sx > budget) { stats.xPastInRedaction += 1; if (rx.text !== '\u0001' || rx.replaced !== 0 || rx.candidates.length !== 0 || sx !== budget + 1) fail('past budget in redaction: not the bare mark', t); }
  else { if (!same(rx, rb)) fail('scratch redaction within budget differs from base', t); if (sx !== s0) fail('count differs run to run', t, [sx, s0]); }
  const hx = X.holdsIdentifier(rx.text, P, C, sx);
  st = X.__state(); if (st.checkWorkSpent !== null || st.ownFold !== 'plain' || st.viewsOfCheck !== null || st.datesOfCheck !== null) { stats.state += 1; fail('state left after check', t, st); }
  if (!hx) { stats.xSent += 1; if (hb || rx.text !== rb.text) fail('SCRATCH SENT what base refuses or other text', t, { budget, sx }); }
  else if (hb && sx <= budget) stats.xRefusedSameAsBase += 1; else if (sx <= budget) stats.xPastInCheck += 1;
  // right after a throw: the same letter and the base agree again at full budget (no state poisoned)
  X.__setBudget(420_000_000);
  const ry = X.redactLetterForScreen(t, P, C); const hy = X.holdsIdentifier(ry.text, P, C, X.checkWorkOf(ry));
  if (!same(ry, rb) || hy !== hb) fail('after a refused run, full-budget run differs from base', t);
}
if (X.holdsIdentifier('\u0001', P, C) !== true || X.holdsIdentifier('\u0001', P, C, 0) !== true) fail('the bare mark is not refused', '');
console.log(JSON.stringify({ voc: process.env.VOC ?? 'all', seed: process.env.SEED ?? 1, ...stats }));
