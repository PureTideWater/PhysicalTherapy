// Differential, head (working tree) against base (58fb29e5). Synthetic data only.
const H = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const Bm = await import('/home/user/tree-base/packages/redact/src/redact.ts');
let seed = Number(process.argv[2] ?? 7); const COUNT = Number(process.argv[3] ?? 3000);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)] as T;
const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA', 'MARIA-ELENA DE LA VANTREE-OKONKWO QUILLFEATHER', 'BRX-DWQ-FTZ GHV-JKL-MNP QRS-TVW-XZB CDF-GHJ-KLM NPQ-RST-VWX ZBC-DFG-HJK LMN-PQR-STV WXZ-BCD-FGH JKL-MNP-QRS TVW-XZB-CDF GHJ-KLM-NPQ RST-VWX-ZBC'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const claimSets = [1, 30, 300].map((k) => k === 30
  ? [{ claimId: 'c0', patientPseudonym: 'p1', claimNumbers: Array.from({ length: 30 }, (_, i) => `SYN${556000 + i}`) }]
  : Array.from({ length: k }, (_, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [`SYN${556000 + i}`] }))) as any[];
const frags = [
  'The claim was reviewed and paid in full by the plan. ', 'Dear provider, ', 'timely filing limit ', '\n', ' ', ', ', '; ', ': ', '.', '-',
  'JANE Q ZEPHYRA', 'Jane Zephyra', 'Zephyra', 'ZEPHYRA, JANE', 'Z e p h y r a', 'Zeph∙yra', 'Zeph­yra', 'Zephyr4', 'Z3phyra', 'Zephυra', 'Ζephyra', 'J.Q.Z.', 'J. Zephyra', 'Jane', 'Q', 'zephyraX', 'XZephyra',
  'ZZ1234567', 'ZZ 123 4567', 'ZZ-1234567', 'ZZl234567', 'ZZ12345O7', 'zz1234567', '1234567', 'Member ID: ', 'ID ', 'ZZ1234５６７',
  'SYN556000', 'SYN556007', 'SYN 556 029', 'SYN-556299', 'SYN5562', 'SYN55600O', 'syn556123', 'Claim ', 'Claim number: ', 'SYN556000SYN556001', '556001',
  '03/03/1961', 'March 3, 1961', '1961-03-03', '3 Mar 1961', '03031961', 'DOB ', 'born ', '04/05/2026', '2026-11-01',
  '900-12-3456', '900123456', 'SSN ', '(555) 555-0123', '555-0123', 'Phone: ', 'call 555 555 0199 ',
  'ﷺ', '㏾,', '㏾;', 'ＡＢ', '5\n', 'a;', '45.00', '$1,234.56', '12345678901234', '[CLAIM_1]', '[PATIENT_NAME]', '[MEMBER_ID]', '[SSN]', '[', ']', '\u0001', '\u0002', '‍', '́', 'x'.repeat(40),
];
const calm = ['The claim was reviewed and paid in full by the plan. ', 'Dear provider, ', 'timely filing limit ', '\n', ' ', ', ', '; ', ': ', '.', ' - ', 'The appeal is denied. ', 'Payment of $1,234.56 was issued on 04/05/2026. ', 'See section 4 of the agreement. ', '45.00 ', 'a; ', '5\n', '\uFDFA ', '\u33FE, ', '\uFF21\uFF22 ', 'CPT 97110 ', 'units 2 '];
const own = [' Vantree-Okonkwo ', ' Quillfeather ', ' Maria Elena ', ' DE LA ', ' GHV-JKL-MNP ', ' Brx Dwq Ftz ', ' RST VWX ZBC ', ' QUILLFEATHER, MARIA-ELENA ', ' Quillfeath3r ', ' TVWXZBCDF ', ' JANE Q ZEPHYRA ', ' Jane Zephyra ', ' Zephyra ', ' ZEPHYRA, JANE ', ' ZZ1234567 ', ' ZZ-1234567 ', ' Member ID: ZZ1234567 ', ' SYN556000 ', ' SYN556007 ', ' SYN556029 ', ' SYN556299 ', ' Claim SYN556000 ', ' 03/03/1961 ', ' March 3, 1961 ', ' DOB 1961-03-03 ', ' J. Zephyra ', ' Zeph\u2219yra ', ' ZZ 123 4567 ', ' SYN 556 029 ', ' 900-12-3456 ', ' (555) 555-0123 '];
function letter(i: number): string {
  if (i % 5 !== 4) { // mostly letters that can be sent: calm prose with the call's own identifiers in forms redaction replaces
    const n = i % 97 === 0 ? 2000 + Math.floor(rnd() * 8000) : 2 + Math.floor(rnd() * 60); let s = ''; const p = i % 5 === 0 ? 0 : i % 5 === 1 ? 0.03 : 0.15;
    for (let j = 0; j < n; j++) s += rnd() < p ? pick(own.slice(0, i % 5 === 3 ? own.length : 16)) : pick(calm);
    return s;
  }
  const n = i % 97 === 0 ? 4000 + Math.floor(rnd() * 20000) : 3 + Math.floor(rnd() * (i % 5 === 0 ? 200 : 40));
  let s = ''; const bias = i % 11 === 0 ? pick(frags) : null;
  for (let j = 0; j < n; j++) s += bias !== null && rnd() < 0.5 ? bias : pick(frags);
  return s;
}
// a few letters long enough to be refused by the head's budget, interleaved (state after a throw)
const long = ['The claim was reviewed and paid in full by the plan. '.repeat(1200), '5\n'.repeat(40000), ('Zeph∙yra Zephyra ' + 'a;'.repeat(20000)), '㏾;'.repeat(30000), 'Zephυra ' + 'SYN556007 paid. '.repeat(6000)];
const same = (a: any, b: any) => a.text === b.text && a.replaced === b.replaced && JSON.stringify(a.candidates) === JSON.stringify(b.candidates) && JSON.stringify([...a.claims]) === JSON.stringify([...b.claims]);
const stat: any = {}; let bad = 0;
const note = (k: string) => { stat[k] = (stat[k] ?? 0) + 1; };
for (let i = 0; i < COUNT; i++) {
  const text = i % 200 === 199 ? long[(Math.floor(i / 200) + Number(process.argv[2] ?? 7)) % long.length]! : letter(i);
  for (const [ci, claims] of claimSets.entries()) {
    const k = [1, 30, 300][ci];
    let h: any, hErr: any = null, b: any, bErr: any = null;
    try { const r = H.redactLetterForScreen(text, who, claims); const spent = H.checkWorkOf(r); h = { r, spent, held: H.holdsIdentifier(r.text, who, claims, spent) }; } catch (e) { hErr = String(e); }
    try { const r = Bm.redactLetterForScreen(text, who, claims); b = { r, held: Bm.holdsIdentifier(r.text, who, claims) }; } catch (e) { bErr = String(e); }
    if (hErr !== null || bErr !== null) { note(`k${k} threw`); if (hErr !== bErr) { bad++; console.log('THROW DIFF', i, k, hErr, bErr); } continue; }
    const over = h.spent > H.CHECK_WORK_BUDGET;
    if (!h.held) { note(`k${k} head sent`); if (b.held || !same(h.r, b.r)) { bad++; console.log('BAD sent', i, k, JSON.stringify(text.slice(0, 200))); } }
    else if (!b.held) { note(`k${k} head refused, base sent`); if (!over) { // refusal came from the check's part of the budget: the redaction must still be the base's
        if (!same(h.r, b.r)) { bad++; console.log('BAD redaction differs under budget', i, k); } } }
    else note(`k${k} both refused`);
    if (!over && !same(h.r, b.r)) { bad++; console.log('BAD under-budget redaction differs', i, k, JSON.stringify(text.slice(0, 200))); }
    if (over) note(`k${k} redaction past budget`);
    // the uncounted entries: exact equality with base (short letters only, for time)
    if (text.length < 3000 && i % 3 === 0) {
      const ids = { names: who.names, numbers: [...who.memberIds, ...claims.flatMap((c: any) => c.claimNumbers)] };
      const pairs = [[H.redactLetter(text, who, claims), Bm.redactLetter(text, who, claims)], [H.redactionSpans(text, who, claims), Bm.redactionSpans(text, who, claims)], [H.holdsNameOrNumber(text, ids), Bm.holdsNameOrNumber(text, ids)], [H.nameOrNumberMatches(text.normalize('NFKC'), ids), Bm.nameOrNumberMatches(text.normalize('NFKC'), ids)]];
      for (const [x, y] of pairs) { const sx = JSON.stringify(x, (_k, v) => v instanceof Map ? [...v] : v); const sy = JSON.stringify(y, (_k, v) => v instanceof Map ? [...v] : v); note('uncounted compared'); if (sx !== sy) { bad++; console.log('BAD uncounted differs', i, k); } }
    }
  }
}
console.log(JSON.stringify({ seed: process.argv[2] ?? 7, letters: COUNT, bad, stat }, null, 1));
