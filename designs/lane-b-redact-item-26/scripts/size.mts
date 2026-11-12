const head = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const F = (u: string, n: number) => u.repeat(Math.floor(n / u.length));
const claim = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const rows: Record<string, (n: number) => string> = {
  T1: (n) => F('1/1/11 ', n - 8) + 'Vant ree', T2: (n) => F('1 1 11 ', n - 9) + 'Vant. ree', T4: (n) => 'Vant ree' + ' J'.repeat((n - 8) / 2),
  T6: (n) => F('1 1 11 ', n) + '\r\n', T8: (n) => F('1 1 11 ', n - 10) + '\r\nVant ree', T9: (n) => F('5\r\n', n - 8) + 'Vant ree', K2: (n) => F('5\n', n - 2) + '\r\n', K1: (n) => F('5\n', n - 9) + ' Vant ree',
};
for (const [k, make] of Object.entries(rows)) {
  const out: string[] = [];
  for (const n of [20000, 25000, 30000, 40000, 50000, 60000, 75000]) { const t = make(n); const r = head.redactLetterForScreen(t, who, claim); const h = head.holdsIdentifier(r.text, who, claim, head.checkWorkOf(r)); out.push(`${n / 1000}k:${h ? 'R' : 's'}${(head.checkWorkOf(r) / 1e6).toFixed(0)}`); }
  console.log(k, out.join(' '));
}
