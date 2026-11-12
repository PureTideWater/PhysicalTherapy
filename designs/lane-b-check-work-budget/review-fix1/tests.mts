// The two new tests' assertions (not their timings), against the head, the code before the delta, and the head less each change.
const N = 100_000; const fill = (u: string) => u.repeat(Math.floor(N / u.length));
const who = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const claim = (n: string) => [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-7', claimNumbers: [n] }] as any;
const many = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-7', claimNumbers: Array.from({ length: 1000 }, (_, i) => `SYN${556000 + i}`) }] as any;
for (const v of [process.argv[2]!]) {
  const M = await import(v === 'head' ? '/home/user/PhysicalTherapy/packages/redact/src/redact.ts' : `/home/user/review-fix1/x/redact-${v}.ts`);
  const check = (text: string, claims: any) => { const r = M.redactLetterForScreen(text, who, claims); return { text: r.text, spent: M.checkWorkOf(r), held: M.holdsIdentifier(r.text, who, claims, M.checkWorkOf(r)) }; };
  const prose = fill('The claim was reviewed and paid in full by the plan. '); const short = prose.slice(0, N / 5);
  const a = check(prose, claim('SYN555001')); const b = check(prose, many); const c = check(short, many); const d = check(short, claim('SYN555001'));
  const t1 = { 'one sent as written': a.text === prose && a.held === false, '1000 refused': b.held === true, 'fifth sent': c.text === short && c.held === false, 'spent > 5x': c.spent > 5 * d.spent, ratio: (c.spent / d.spent).toFixed(2) };
  const lig = M.checkWorkOf(M.redactLetterForScreen('ﷺ'.repeat(1000), who, claim('SYN555001'))); const let_ = M.checkWorkOf(M.redactLetterForScreen('a'.repeat(1000), who, claim('SYN555001')));
  const guards: any = {}; for (const s of [null, '0', '5', 0n, {}, [], true]) { let r: any; try { r = M.holdsIdentifier('The claim was denied for timely filing.', who, claim('SYN555001'), s as any); } catch (e) { r = 'threw ' + String(e).slice(0, 50); } guards[typeof s === 'bigint' ? '0n' : JSON.stringify(s)] = r; }
  const t2 = { 'ligatures > 10x letters': lig > 10 * let_, ratio: (lig / let_).toFixed(2), guards };
  console.log(v.padEnd(5), 'TEST1', Object.values(t1).slice(0, 4).every((x) => x === true) ? 'pass' : 'FAIL', JSON.stringify(t1), '\n      TEST2', t2['ligatures > 10x letters'] && Object.values(guards).every((x) => x === true) ? 'pass' : 'FAIL', JSON.stringify(t2));
}
