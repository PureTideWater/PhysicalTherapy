// Processor time of the path prepare runs on the crafted letters with a CR LF and a name written apart added: the wider reading's worst cost.
const [B, H] = await Promise.all([import(process.argv[2]!), import(process.argv[3]!)]);
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
const who = { pseudonym: 'synthetic-patient-1', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN123456'] };
const claims = [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers: ['SYN555001'] }];
const N = 100_000; const fill = (u: string, n = N) => u.repeat(Math.floor(n / u.length));
const shapes: [string, string][] = [['dates with slashes', '1/1/11 '], ['dates with spaces', '1 1 11 '], ['digit and break', '5\n'], ['date ranges', '10/01/2026-10/15/2026 '], ['amount before a date', '$150.00 2026-11-01 '], ['phones back to back', '(202) 555-0123 '], ['range glued to word', 'Service 01/01/2020-01/02/2020Paid '], ['prose', 'Dear member, your visit of 03/14/2026 was denied; $150.00 is owed.\n']];
const time = (R: typeof H, text: string) => { const t: number[] = []; let held = false; for (let i = 0; i < 3; i += 1) { const s = cpu(); held = R.holdsIdentifier(R.redactLetterForScreen(text, who, claims).text, who, claims); t.push(cpu() - s); } return [Math.min(...t), held] as const; };
for (const [label, unit] of shapes) {
  const out: string[] = [];
  for (const [variant, text] of [['plain', fill(unit)], ['+name apart', `${fill(unit)} Vant ree`], ['CR LF', fill(unit).replaceAll('\n', '\r\n') + '\r\n'], ['CR LF +name apart', `${fill(unit).replaceAll('\n', '\r\n')}\r\nVant ree`]] as const) {
    const [b] = time(B, text); const [h, held] = time(H, text);
    out.push(`${variant}: ${b.toFixed(0)} / ${h.toFixed(0)} ms${held ? ' R' : ''}`);
  }
  console.log(label.padEnd(22), out.join(' | '));
}
