// drafter.mts <src dir>: Queues item 40, stage 3 (W74): the narrative drafter's check of its facts (holdsNameOrNumber)
// with R1-3 and R1-4. Counts held / not held of: every number character that is no decimal digit (Nl, No) right before
// and right after each identifier; every unseen character (as every-unseen.mts) at three places inside each; and, for
// what the check must NOT newly hold, the same characters in texts with no identifier, and beside or inside values
// that are not the call's. Synthetic values only.
const H = await import(`${process.argv[2]}/redact.ts`);
const I = { names: ['JANE Q ZEPHYRA'], numbers: ['76543210', 'ZZ7654321', 'SYN99887', 'ZZ12345 01'] };
const numeric: string[] = [], unseen: string[] = ['', '͸', '\uD800', '\uDC00'];
for (let cp = 0; cp <= 0x1ffff; cp += 1) { if (cp >= 0xd800 && cp <= 0xdfff) continue; const c = String.fromCodePoint(cp); if (/[\p{Nl}\p{No}]/u.test(c)) numeric.push(c); else if (/[\p{Cc}\p{Cf}]/u.test(c) && !/[\p{Default_Ignorable_Code_Point}\s]/u.test(c) && (cp < 1 || cp > 3)) unseen.push(c); }
const FRAMES: [string, string][] = [['Claim No. ', ' paid'], ['', ''], ['The plan paid ', ' short.'], ['Ref: ', '\nPaid'], ['(', ')']];
const OWN = ['76543210', 'ZZ7654321', 'SYN99887', 'ZZ12345 01', 'Zephyra', 'Jane Q. Zephyra', 'JANE'];
const OTHER = ['97110', '2026-03-05', '$1234.50', '12 units', 'Medicare', 'the plan', 'ZZ99', '7654', 'Zephyr'];
const count = (values: string[], write: (v: string, c: string) => string[], cs: string[]) => { let held = 0, not = 0; for (const v of values) for (const c of cs) for (const w of write(v, c)) for (const [b, a] of FRAMES) { if (H.holdsNameOrNumber(`${b}${w}${a}`, I)) held += 1; else not += 1; } return `held ${held}, not held ${not}`; };
const beside = (v: string, c: string) => [`${c}${v}`, `${v}${c}`];
const inside = (v: string, c: string) => [...new Set([1, Math.floor(v.length / 2), v.length - 1])].map((cut) => `${v.slice(0, cut)}${c}${v.slice(cut)}`);
console.log(`number characters ${numeric.length}, unseen characters ${unseen.length}, frames ${FRAMES.length}`);
console.log(`R1-3, a number character beside one of the call's identifiers (${OWN.length} writings): ${count(OWN, beside, numeric)}`);
console.log(`R1-4, an unseen character inside one of the call's identifiers: ${count(OWN, inside, unseen)}`);
console.log(`an unseen character beside one of the call's identifiers: ${count(OWN, beside, unseen)}`);
console.log(`a number character beside a value that is not the call's (${OTHER.length} writings): ${count(OTHER, beside, numeric)}`);
console.log(`an unseen character inside a value that is not the call's: ${count(OTHER, inside, unseen)}`);
console.log(`an unseen character beside a value that is not the call's: ${count(OTHER, beside, unseen)}`);
