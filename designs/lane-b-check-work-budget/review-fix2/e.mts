// Would the new assertions fail on 7a5a26bb? The same expressions on the head and on that commit's reader. Synthetic data only.
const H = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const O = await import('/home/user/review-fix2/old/packages/redact/src/redact.ts');
const who = (names: string[]) => ({ pseudonym: 'p1', names, memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] }) as any;
const claim = (n: string) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: [n] }] as any;
const short = 'The claim was reviewed and paid in full by the plan. '.repeat(2000).slice(0, 20_000);
const parts = 'BCDFGHJKLMNPQRSTVWXZ';
const longName = Array.from({ length: 12 }, (_w, word) => [0, 1, 2].map((part) => `${parts[word] ?? ''}${parts[part + 3] ?? ''}${parts[(word + part) % 20] ?? ''}X`).join('-')).join(' ');
const numbers = (count: number, length: number) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: Array.from({ length: count }, (_u, index) => `SYN${String(556_000 + index)}${'0918273645QWRTYPSDFGHJKLZXCVBNM'.slice(0, length - 9)}`) }] as any;
const tiny = 'The claim was paid.';
for (const [name, M] of [['head 0289304f', H], ['7a5a26bb', O]] as [string, any][]) {
  if (process.argv[2] === 'slow') {
    if (M === H) continue;
    const a = process.cpuUsage(); const r = M.redactLetterForScreen(tiny, who(['JANE Q VANTREE']), numbers(5_000, 40)); const u = process.cpuUsage(a);
    console.log(`${name}: 5,000 x 40, tiny letter: text is the barrier ${r.text !== tiny} (the assertion wants true), spent ${M.checkWorkOf(r)} (wants ${M.CHECK_WORK_BUDGET + 1}), cpu ${((u.user + u.system) / 1000).toFixed(0)} ms (wants < 100)`);
    continue;
  }
  const spentFor = (names: string[]) => M.checkWorkOf(M.redactLetterForScreen(short, who(names), claim('SYN555001')));
  const l = spentFor([longName]); const s = spentFor(['JANE Q VANTREE']);
  console.log(`${name}: forms: spentFor(long) ${l} > spentFor(short name) ${s} + ${2 * 40 * short.length} = ${s + 2 * 40 * short.length}: ${l > s + 2 * 40 * short.length}`);
  const few = M.redactLetterForScreen(tiny, who(['JANE Q VANTREE']), numbers(300, 15));
  console.log(`${name}: 300 x 15: text kept ${few.text === tiny}; spent ${M.checkWorkOf(few)} > ${300 * 15 * 3_000}: ${M.checkWorkOf(few) > 300 * 15 * 3_000}; check sends ${M.holdsIdentifier(few.text, who(['JANE Q VANTREE']), numbers(300, 15), M.checkWorkOf(few)) === false}`);
  const lig = M.checkWorkOf(M.redactLetterForScreen('ﷺ'.repeat(1_000), who(['JANE Q VANTREE']), claim('SYN555001'))); const nf = M.checkWorkOf(M.redactLetterForScreen('ﷺ'.repeat(1_000).normalize('NFKC'), who(['JANE Q VANTREE']), claim('SYN555001')));
  console.log(`${name}: NFKC: ${lig} toBe ${nf}: ${lig === nf}`);
}
