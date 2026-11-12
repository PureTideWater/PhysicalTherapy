// holdsIdentifier with spent = null: does the counter run at all? On the module as shipped.
import { CHECK_WORK_BUDGET, checkWorkOf, holdsIdentifier, redactLetterForScreen } from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
const P = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const C = [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: ['SYN555001'] }] as any;
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const text = 'The plan paid in full. '.repeat(40_000); // 920,000 characters: the entry charge alone is 322 M, the check's views take it past the budget
holdsIdentifier(text.slice(0, 50_000), P, C, 0);
for (const spent of [0, null as any, false as any, 0]) { const a = cpu(); const held = holdsIdentifier(text, P, C, spent); console.log(`holdsIdentifier(${text.length} ch, spent = ${String(spent)}) -> ${held ? 'REFUSED' : 'READ, holds nothing'} in ${(cpu() - a).toFixed(0)} ms cpu`); }
const r = redactLetterForScreen('a '.repeat(100_000), P, C); const copy = { ...r };
console.log(`budget ${CHECK_WORK_BUDGET}; checkWorkOf(result) ${checkWorkOf(r)}; checkWorkOf(copy of the result) ${checkWorkOf(copy as any)}; checkWorkOf(structuredClone) ${checkWorkOf(structuredClone({ text: r.text, replaced: r.replaced }) as any)}`);
