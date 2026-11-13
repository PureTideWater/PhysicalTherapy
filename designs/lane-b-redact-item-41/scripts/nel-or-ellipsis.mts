// nel-or-ellipsis.mts <root>: U+0085 is NEXT LINE to mainframe text and "…" (byte 0x85) to Windows-1252 text read as
// Latin-1. Mending makes it a line break (the item's rule). This asks item 40's reader (head) what each choice would
// send, inside and beside a stored member ID, in four frames. Synthetic values only; prints outcomes.
const P = { pseudonym: 's', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1980-03-14'], memberIds: ['30072299', 'ZZ7654321'] };
const C = [{ claimId: 'c', patientPseudonym: 's', claimNumbers: ['SYNCLAIM0001'] }];
const H = await import(`${process.argv[2]}/head/packages/model-gateway/src/redact.ts`);
const frames = (x: string) => [`Member ID ${x} paid.`, `${x}`, `Paid in full${x}`, `see ${x}.`];
const values = (s: string) => [`3007${s}2299`, `30072299${s}`, `${s}30072299`, `ZZ76${s}54321`, `ZEPHYRA${s}JANE`];
const out: Record<string, Record<string, number>> = {};
for (const [name, s] of [['line break', '\n'], ['ellipsis', '…'], ['left as U+0085', '\u0085']] as const) {
  const n = (out[name] = { hidden: 0, clear: 0, refused: 0 });
  for (const v of values(s)) for (const t of frames(v)) {
    const r = H.redactLetterForScreen(t, P, C);
    if (H.holdsIdentifier(r.text, P, C)) n.refused += 1; else if (/30072299|3007|2299|7654321|ZEPHYRA/.test(r.text)) { n.clear += 1; console.log(name, JSON.stringify(t), '->', JSON.stringify(r.text)); } else n.hidden += 1;
  }
}
console.log(JSON.stringify(out));
