// charge.mts <src dir>: Queues item 40, stage 3 (W74): what a letter that holds an unseen character is charged, in the
// budget's units (redaction + check, read off the product's own entries as item 34's units.mts reads them), for three
// letters: small, middling, and the row nearest the budget. Each is measured as written (a line feed where the
// character will stand), with U+200B there (the character the further reading writes: read once), and with U+0085
// there (read twice, and the check twice). Synthetic text only.
const H = await import(`${process.argv[2]}/redact.ts`);
const BUDGET: number = H.CHECK_WORK_BUDGET;
const P = { pseudonym: 'synthetic-patient-7', names: ['JANE Q VANTREE'], datesOfBirth: ['1961-03-03'], memberIds: ['ZZ1234567'] };
const C = [{ claimId: '00000000-0000-4000-8000-000000000001', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const para = 'Your claim was processed on 01/02/2026 and paid $150.00 under the plan. Codes 97110 and 97112 were allowed at the contracted rate.';
const ROWS: [string, (c: string) => string][] = [
  ['small (one paragraph, 131 characters and the character)', (c) => `${para}${c}`],
  ['middling (200 paragraphs, about 26,000 characters)', (c) => `${Array.from({ length: 200 }, () => para).join('\n')}${c}`],
  ['U+33FE; to 14,000 with a CR LF (about a quarter of the budget)', (c) => `${'㏾;'.repeat(7_000)}\r\n${c}`],
  ['U+33FE; to 28,000 with a CR LF (about half of the budget)', (c) => `${'㏾;'.repeat(14_000)}\r\n${c}`],
  ['the row nearest the budget: U+33FE; to 57,972 with a CR LF (414,023,090 units)', (c) => `${'㏾;'.repeat(28_985)}\r\n${c}`],
];
const units = (text: string) => {
  const r = H.redactLetterForScreen(text, P, C); const spent = H.checkWorkOf(r);
  if (H.holdsIdentifier(r.text, P, C, spent)) return `REFUSED (the redaction's count ${spent}${spent > BUDGET ? ', past the budget' : ''}; text of ${r.text.length} character${r.text.length === 1 ? '' : 's'})`;
  let lo = 0, hi = BUDGET - spent;
  while (lo < hi) { const mid = Math.ceil((lo + hi) / 2); if (H.holdsIdentifier(r.text, P, C, spent + mid)) hi = mid - 1; else lo = mid; }
  return `sent, units ${BUDGET - lo} (the redaction's count ${spent})`;
};
console.log(`budget ${BUDGET}`);
for (const [name, write] of ROWS) {
  console.log(`${name}`);
  for (const [what, c] of [['with nothing there', ''], ['with U+200B there', '​'], ['with U+0085 there', '\u0085']] as const) console.log(`  ${what}: ${units(write(c))}`);
}
