// For the time review: the families whose time grew faster than their count in timing.mts, run alone at three sizes on the real head as prepare calls it.
import * as H from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
const P = { pseudonym: 'synthetic-patient-7', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN7700123'] };
const C = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
for (const u of ['[SSN]', 'a5', 'J Q ', '5.', '٥ ', '5/']) {
  const row: string[] = [];
  for (const n of [25_000, 50_000, 100_000]) {
    const t = u.repeat(Math.floor(n / u.length));
    let best = Infinity; let res = '';
    for (let k = 0; k < 2; k += 1) { const s = process.cpuUsage(); const r = H.redactLetterForScreen(t, P, C); const spent = H.checkWorkOf(r); const held = H.holdsIdentifier(r.text, P, C, spent); best = Math.min(best, process.cpuUsage(s).user / 1000); res = `${held ? 'refused' : 'sent'}${r.text === '\u0001' ? ' (past in redaction)' : ''} redaction units ${spent}`; }
    row.push(`${n}: ${Math.round(best)} ms, ${res}`);
  }
  console.log(JSON.stringify(u).padEnd(10), row.join(' | '));
}
