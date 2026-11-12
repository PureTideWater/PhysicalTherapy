// How fast a call past the identifier ceiling is refused, each entry alone. Real module, real budget. Synthetic data only.
import fs from 'node:fs';
const H = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const { calibrationMs } = await import('/home/user/PhysicalTherapy/packages/model-gateway/src/test-support/time-budget.ts');
const cpu = () => { const u = process.cpuUsage(); return (u.user + u.system) / 1000; };
const fill = '0918273645QWRTYPSDFGHJKLZXCVBNM';
const mk = (count: number, len: number) => Array.from({ length: count }, (_, i) => len >= 9 ? `SYN${String(556000 + i)}${fill.slice(0, len - 9)}` : i.toString(36).toUpperCase().padStart(len, '0'));
const who = { pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'] } as any;
const one = (n: string[]) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const across = (n: string[]) => n.map((x, i) => ({ claimId: `c${i}`, patientPseudonym: 'p1', claimNumbers: [x] })) as any;
const tiny = 'The claim was paid.'; const long = 'The claim was reviewed and paid in full by the plan. '.repeat(1900);
const t = (f: () => any) => { const a = cpu(); const v = f(); const first = cpu() - a; let best = Infinity; for (let i = 0; i < 3; i++) { const s = cpu(); f(); best = Math.min(best, cpu() - s); } return { v, first, best }; };
const rows: [string, any, string][] = [
  ['5000x40 one (200,000 chars), tiny', one(mk(5000, 40)), tiny], ['5000x40 across, tiny', across(mk(5000, 40)), tiny], ['5000x40 one, 100,700-char letter', one(mk(5000, 40)), long],
  ['13400x9 one (120,600), tiny', one(mk(13400, 9)), tiny], ['30100x4 one (120,400), tiny', one(mk(30100, 4)), tiny], ['30100x4 across, tiny', across(mk(30100, 4)), tiny], ['60100x2 across (120,200), tiny', across(mk(60100, 2)), tiny],
  // between the two ceilings: over 60,000 characters (the call is refused, by the check) but under 120,000 (the redaction is not)
  ['6700x9 one (60,300), tiny', one(mk(6700, 9)), tiny], ['15100x4 one (60,400), tiny', one(mk(15100, 4)), tiny], ['13300x9 one (119,700), tiny', one(mk(13300, 9)), tiny], ['29900x4 one (119,600), tiny', one(mk(29900, 4)), tiny], ['29900x4 across (119,600), tiny', across(mk(29900, 4)), tiny],
];
const only = process.argv[2];
for (const [name, c, text] of rows) {
  if (only !== undefined && !name.startsWith(only)) continue;
  const cal = calibrationMs();
  const a = t(() => H.redactLetterForScreen(text, who, c)); const spent = H.checkWorkOf(a.v);
  const b = t(() => H.holdsIdentifier(tiny, who, c, 0));
  const s = `${name.padEnd(36)} redact: first ${a.first.toFixed(1)} ms, then ${a.best.toFixed(1)} ms, ${spent > H.CHECK_WORK_BUDGET ? 'REFUSED' : `read (${spent} units)`} | check(spent 0): first ${b.first.toFixed(1)} ms, then ${b.best.toFixed(1)} ms, held ${b.v} | check(redaction's count): held ${H.holdsIdentifier(a.v.text, who, c, spent)}  [cal ${cal.toFixed(0)}; x${(144 / cal).toFixed(2)} for reference]`;
  console.log(s); fs.appendFileSync('/home/user/review-fix2/out/refuse.txt', s + '\n');
}
