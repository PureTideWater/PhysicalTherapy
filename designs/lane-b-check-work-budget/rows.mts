import { redactLetterForScreen, holdsIdentifier } from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
export const who = (names: string[]) => ({ pseudonym: 'p1', names, memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] }) as any;
export const claims = (...n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const N = 100_000;
const fill = (u: string) => u.repeat(Math.floor(N / u.length));
export const rows: [string, string[], string][] = [
  ['ct2 initials + lookalike', ['JANE Q VANTREE'], 'Vantree' + ' J'.repeat(49990) + ' х'],
  ['ct2 + joiner', ['JANE Q VANTREE'], 'Van∙tree Vantree' + ' J'.repeat(49980) + ' х'],
  ['ct2 no lookalike', ['JANE Q VANTREE'], 'Vantree' + ' J'.repeat(49990)],
  ['digit LF', ['JANE Q VANTREE'], fill('5\n')],
  ['digit CRLF', ['JANE Q VANTREE'], fill('1\r\n')],
  ['arabic digit LS', ['JANE Q VANTREE'], fill('٥ ')],
  ['digit dash LF', ['JANE Q VANTREE'], fill('5-\n')],
  ['calib prose', ['JANE Q VANTREE'], fill('Claim 2026-11-01 was paid $150.00 for 97110, 2 units; member was seen on 11/01/2026 by Dr. Other.\n')],
];
const cpu = () => { const u = process.threadCpuUsage(); return (u.user + u.system) / 1000; };
if (process.argv[2] !== 'lib') for (const [name, names, text] of rows) {
  if (process.argv[2] && !name.includes(process.argv[2])) continue;
  const ts: string[] = []; let out = '';
  for (let i = 0; i < 3; i++) {
    const a = cpu(); const r = redactLetterForScreen(text, who(names), claims('SYN555001')); const b = cpu();
    const h = holdsIdentifier(r.text, who(names), claims('SYN555001')); const c = cpu();
    ts.push(`${((b - a) / 1000).toFixed(2)}+${((c - b) / 1000).toFixed(2)}=${((c - a) / 1000).toFixed(2)}`); out = `held=${h} replaced=${r.replaced}`;
  }
  console.log(name.padEnd(28), text.length, out, ts.join('  '));
}
