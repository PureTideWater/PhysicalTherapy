// P-1: spent=null runs the check with no counter (the letter the count refuses is read to its end, as the base reads it).
import * as B from '/home/user/tree-base/packages/redact/src/redact.ts';
import * as H from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
const P = { pseudonym: 'synthetic-patient-7', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN7700123'] };
const C = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const t0 = (f: () => unknown) => { const s = performance.now(); let v: unknown; try { v = f(); } catch (e) { v = `THROWS ${(e as Error).constructor.name}`; } return `${JSON.stringify(v)} (${Math.round(performance.now() - s)} ms)`; };
for (const [name, t] of [['5\\n to 60,000', '5\n'.repeat(30_000)], ['Zephyra + 49,990 initials', `Zephyra${' J'.repeat(49_990)}`]] as const) {
  const r = H.redactLetterForScreen(t, P, C); const spent = H.checkWorkOf(r);
  console.log(name, '| base:', t0(() => B.holdsIdentifier(B.redactLetterForScreen(t, P, C).text, P, C)), '| head, count handed on:', t0(() => H.holdsIdentifier(r.text, P, C, spent)), '| head, spent=null:', t0(() => H.holdsIdentifier(r.text, P, C, null as never)), '| head, spent=0n:', t0(() => H.holdsIdentifier(r.text, P, C, 0n as never)));
}
