// For the time review: processor time against counted work, by letter family, on the head (uncounted run timed; counted run for the units).
import * as X from '/home/user/review-phi/x/redact.ts';
const P = { pseudonym: 'synthetic-patient-7', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN7700123'] };
const C = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const U = ['Zephyra ', 'Zephyra J ', ' J', 'Zeph∙yra ', 'Zеphyra ', 'J. ', 'Jane ', '900-12-3456 ', '9\n', '5\n', '5-\n', '1\r\n', '٥ ', 'SSN ', 'SSN 5 ', 'Phone 5\n', '(202) 555-0123 ', '5550123 ', 'SYN7700123 ', 'S-Y-N-', 'SYN555001 ', 'Claim 5 ', 'Claims 900123456 and ', ' and 900123457', 'DOB ', '03/03/1961 ', '3/3/61', 'March 3, 1961 ', 'born 3 ', '11/01/2026 ', '10/01/2026-10/15/2026 ', '$150.00 ', '150.00-120.00 ', '$150.00 2026-11-01 ', '1,234.56 ', 'х ', '­', '​5', '∙', 'x­5 ', '[SSN]', '[SSN]5 ', 'a[PHONE]1', '[PATIENT_NAME] ', '[PATIENT_NAME]J ', '[CLAIM_1] ', '[DATE_OF_BIRTH] 3 ', 'Service 01/01/2020-01/02/2020Paid ', 'Service 01/01/2020-01/02/2020St. ', 'a', '5', '5 ', '5.', '5/', '5:', '5#', '5(', 'a5', 'a5 ', '5a ', 'Ref 5 5 ', 'ZIP 5\n', 'CPT 97110 ', 'Mar ', 'Mar 3 ', 'Aug 5\n', '- ', '. ', '\n', ' ', '\t5', 'Zephyra〇 ', 'JANE Q ZEPHYRA\n', 'Q ', 'J Q ', 'Z e p h y r a ', 'Zep hyra '];
const pre = process.env.PRE ?? ''; const rows: { unit: string; n: number; ms: number; units: number; past: boolean }[] = [];
const part = Number(process.env.PART ?? 0); const end = Date.now() + Number(process.env.MS ?? 220000);
for (const [i, u] of U.entries()) {
  if (i % 2 !== part) continue;
  for (const n of [12_500, 50_000]) {
    if (Date.now() > end) break;
    const t = pre + u.repeat(Math.floor(n / u.length));
    X.__setBudget(1e15); const r = X.redactLetterForScreen(t, P, C); const s1 = X.checkWorkOf(r); const c = X.__counted(s1, () => X.holdsIdentifier(r.text, P, C, null as never));
    const units = c.spent ?? 0;
    const s = process.cpuUsage(); const r2 = X.redactLetterForScreen(t, P, C); X.holdsIdentifier(r2.text, P, C, X.checkWorkOf(r2)); const ms = process.cpuUsage(s).user / 1000;
    rows.push({ unit: JSON.stringify(u), n, ms, units, past: units > 420_000_000 });
    if (ms > 20000) break;
  }
}
// what a letter of this family costs in time when its count reaches the budget (linear projection from the larger size), and the growth of time and of count from 12,500 to 50,000
const by = new Map<string, typeof rows>(); for (const r of rows) by.set(r.unit, [...(by.get(r.unit) ?? []), r]);
const lines = [...by].filter(([, v]) => v.length === 2).map(([unit, [a, b]]) => ({ unit, ms50k: Math.round(b!.ms), units50k: b!.units, nsPerUnit: +(b!.ms * 1e6 / b!.units).toFixed(2), timeGrowth: +(b!.ms / a!.ms).toFixed(1), countGrowth: +(b!.units / a!.units).toFixed(1), msAtBudgetOr100k: Math.round(b!.units * (b!.units / a!.units > 5 ? 4 : 2) > 420e6 ? b!.ms * 420e6 / b!.units : b!.ms * (b!.ms / a!.ms > 5 ? 4 : 2)) }));
lines.sort((x, y) => y.msAtBudgetOr100k - x.msAtBudgetOr100k);
for (const l of lines) console.log(JSON.stringify(l));
