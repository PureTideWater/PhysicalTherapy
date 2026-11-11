const [B, H] = await Promise.all([import(process.argv[2]!), import(process.argv[3]!)]);
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const who = { pseudonym: 'synthetic-patient-1', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN123456'] };
const claims = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers: ['SYN555001'] }];
const best = (f: () => unknown) => { let m = Infinity; for (let i = 0; i < 3; i += 1) { const s = cpu(); f(); m = Math.min(m, cpu() - s); } return m.toFixed(0).padStart(5); };
for (const [label, text] of [['digit LF', '5\n'.repeat(50_000)], ['digit CRLF', '5\r\n'.repeat(33_333)], ['digit CRLF +name', `${'5\r\n'.repeat(33_333)}Vant ree`], ['dates CRLF +name', `${'1 1 11 '.repeat(14_285)}\r\nVant ree`], ['dates LF +name', `${'1 1 11 '.repeat(14_285)}\nVant ree`]] as const) {
  for (const [name, R] of [['base', B], ['head', H]] as const) {
    const sent = R.redactLetterForScreen(text, who, claims).text;
    console.log(label.padEnd(18), name, 'redact', best(() => R.redactLetterForScreen(text, who, claims)), 'check', best(() => R.holdsIdentifier(sent, who, claims)), 'ms');
  }
}
