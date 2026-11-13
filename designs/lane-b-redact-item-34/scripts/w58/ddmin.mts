import path from 'node:path'; import { pathToFileURL } from 'node:url';
const HA = await import(pathToFileURL(path.join(process.argv[2]!, 'redact.ts')).href); const HB = await import(pathToFileURL(path.join(process.argv[3]!, 'redact.ts')).href);
const P = { pseudonym: 'synthetic-patient-r3', names: ['AAAAAAAA'], datesOfBirth: ['1961-03-03'], memberIds: ['7,7,7,7,7'] };
const C = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-r3', claimNumbers: ['11111111', 'ZZ12345 01'] }];
const run = (H: any, t: string) => { const r = H.redactLetterForScreen(t, P, C); return { ref: H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)) as boolean, text: r.text as string }; };
const bad = (t: string) => run(HA, t).ref && !run(HB, t).ref;
let t = '1 Fax XAAAA\r7,7,7,7,7:a1 1-1/1/1/1/17,7,7,7,7.,7\u00041+';
for (let changed = true; changed; ) { changed = false; for (let i = 0; i < t.length; i++) { const u = t.slice(0, i) + t.slice(i + 1); if (bad(u)) { t = u; changed = true; i--; } } }
console.log(JSON.stringify(t), '| base', JSON.stringify(run(HA, t)), '| head', JSON.stringify(run(HB, t)));
for (const v of [['7,7,7,7,7'], ['7-6-5-4-3']]) { (P as any).memberIds = v; const tt = v[0] === '7,7,7,7,7' ? t : t.replaceAll('7,7,7,7,7', '7-6-5-4-3'); console.log(v[0], JSON.stringify(tt), run(HA, tt).ref, JSON.stringify(run(HB, tt))); }
