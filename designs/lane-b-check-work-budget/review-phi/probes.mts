// Targeted probes, real head (budget 420,000,000) against the base. Synthetic data only.
import * as B from '/home/user/tree-base/packages/redact/src/redact.ts';
import * as H from '/home/user/PhysicalTherapy/packages/redact/src/redact.ts';
import * as X from '/home/user/review-phi/x/redact.ts';
import { isDeepStrictEqual } from 'node:util';
const P = { pseudonym: 'synthetic-patient-7', names: ['JANE Q ZEPHYRA'], datesOfBirth: ['1961-03-03'], memberIds: ['SYN7700123'] };
const C = [{ claimId: 'c1', patientPseudonym: 'synthetic-patient-7', claimNumbers: ['SYN555001'] }];
const out = (k: string, v: unknown) => console.log(k.padEnd(62), typeof v === 'string' ? v : JSON.stringify(v));
const t0 = (f: () => unknown) => { const s = performance.now(); let v: unknown; try { v = f(); } catch (e) { v = `THROWS ${(e as Error).constructor.name}: ${(e as Error).message}`; } return `${JSON.stringify(v)} (${Math.round(performance.now() - s)} ms)`; };
const N = 100_000; const fill = (u: string) => u.repeat(Math.floor(N / u.length));
const PHI = 'Re: Jane Q Zephyra, DOB 03/03/1961, member SYN7700123, SSN 900-12-3456, call (202) 555-0123 about claim SYN555001. Zeph∙yra J. was seen 11/01/2026; paid $150.00.';
const LEFT = 'Seen 150.00Zephyra today'; // the base refuses this one after redaction
const CLEAN = 'Your appeal was received on 11/01/2026 and $150.00 was paid.';
const full = (M: typeof H | typeof B, t: string) => { const r = M.redactLetterForScreen(t, P, C); const spent = 'checkWorkOf' in M ? (M as typeof H).checkWorkOf(r) : undefined; const held = spent === undefined ? M.holdsIdentifier(r.text, P, C) : (M as typeof H).holdsIdentifier(r.text, P, C, spent); return { text: r.text, replaced: r.replaced, candidates: [...r.candidates], claims: [...r.claims], held }; };

console.log('== A. fresh-process answers of the base for the three small letters');
const fresh = { PHI: full(B, PHI), LEFT: full(B, LEFT), CLEAN: full(B, CLEAN) };
out('base PHI', { held: fresh.PHI.held, text: fresh.PHI.text }); out('base LEFT held', fresh.LEFT.held); out('base CLEAN held', fresh.CLEAN.held);

console.log('== B. refused past the budget, then normal letters: same as the base (which never threw)');
for (const [name, big] of [['past in redaction', `Zephyra${' J'.repeat(49_990)} х`], ['past in redaction, joiner', `Zeph∙yra Zephyra${' J'.repeat(49_980)} х`], ['past in check', fill('5\n')], ['past in check, other digit', fill('٥ ')]] as const) {
  const r = H.redactLetterForScreen(big, P, C); const spent = H.checkWorkOf(r); const held = H.holdsIdentifier(r.text, P, C, spent);
  out(`${name}: text is U+0001 / spent>budget / held`, [r.text === '\u0001', spent > H.CHECK_WORK_BUDGET, held]);
  for (const [k, t] of [['PHI', PHI], ['LEFT', LEFT], ['CLEAN', CLEAN]] as const) out(`  then ${k}: head equals fresh base`, isDeepStrictEqual(full(H, t), fresh[k]));
}

console.log('== C. the spent argument (holdsIdentifier(text, P, C, spent)); LEFT must be true for every value');
const clean = H.redactLetterForScreen(CLEAN, P, C).text; const left = H.redactLetterForScreen(LEFT, P, C).text;
for (const [k, v] of [['undefined', undefined], ['0', 0], ['-0', -0], ['NaN', NaN], ['-1', -1], ['Infinity', Infinity], ['-Infinity', -Infinity], ['budget', 420_000_000], ['budget+1', 420_000_001], ['1e300', 1e300], ['"5"', '5'], ['""', ''], ['"abc"', 'abc'], ['null', null], ['true', true], ['[]', []], ['[7]', [7]], ['{}', {}], ['0n', 0n], ['{valueOf:()=>0}', { valueOf: () => 0 }]] as const) {
  out(`spent=${k}: LEFT -> / CLEAN ->`, `${t0(() => H.holdsIdentifier(left, P, C, v as never))} / ${t0(() => H.holdsIdentifier(clean, P, C, v as never))}`);
}
console.log('== C2. the count dropped or lost on a letter the check takes past the budget (base sends it; time only)');
const sixty = fill('5\n').slice(0, 60_000); const r60 = H.redactLetterForScreen(sixty, P, C);
out('base check of that letter', t0(() => B.holdsIdentifier(B.redactLetterForScreen(sixty, P, C).text, P, C)));
out('head, count handed on (as prepare does)', t0(() => H.holdsIdentifier(r60.text, P, C, H.checkWorkOf(r60))));
out('head, count of a spread copy {...redacted} (0)', t0(() => H.holdsIdentifier(r60.text, P, C, H.checkWorkOf({ ...r60 }))));
out('head, count of a frozen redacted', t0(() => H.holdsIdentifier(r60.text, P, C, H.checkWorkOf(Object.freeze(r60)))));
out('head, spent dropped (3 arguments)', t0(() => H.holdsIdentifier(r60.text, P, C)));
out('head, spent=null (runs NO counter)', t0(() => H.holdsIdentifier(fill('5\n'), P, C, null as never)));
out('head, 100,000 chars of 5\\n, spent=0', t0(() => H.holdsIdentifier(fill('5\n'), P, C, 0)));

console.log('== D. nesting: an entry run inside another (through a getter on the patient), and an uncounted public function inside a counted entry');
const big = `Zephyra${' J'.repeat(49_990)} х`;
let seen: string[] = [];
const nestedP = (inner: () => unknown) => { let done = false; return { ...P, get names() { if (!done) { done = true; try { seen.push(`inner -> ${JSON.stringify(inner())}`.slice(0, 120)); } catch (e) { seen.push(`inner THROWS ${(e as Error).constructor.name}`); throw e; } } return P.names; } }; };
let r = H.redactLetterForScreen(PHI, nestedP(() => { const q = H.redactLetterForScreen(big, P, C); return [q.text === '\u0001', H.checkWorkOf(q) > H.CHECK_WORK_BUDGET]; }), C);
out('outer redaction with a past-budget redaction nested: equals base', [r.text === fresh.PHI.text, isDeepStrictEqual([...r.candidates], fresh.PHI.candidates), H.checkWorkOf(r) === H.checkWorkOf(H.redactLetterForScreen(PHI, P, C)), seen]); seen = [];
out('outer check with a past-budget check nested: answer', [H.holdsIdentifier(fresh.PHI.text, nestedP(() => H.holdsIdentifier(fill('5\n'), P, C, 0)), C, 0), 'base', fresh.PHI.held, seen]); seen = [];
out('outer check (LEFT) with a past-budget check nested: answer', [H.holdsIdentifier(left, nestedP(() => H.holdsIdentifier(fill('5\n'), P, C, 0)), C, 0), seen]); seen = [];
r = H.redactLetterForScreen(PHI, nestedP(() => H.redactLetter(big, P, C).text.length), C);
out('redactLetter (no counter of its own) inside a counted redaction', { outerText: JSON.stringify(r.text), outerSpentPastBudget: H.checkWorkOf(r) > H.CHECK_WORK_BUDGET, held: H.holdsIdentifier(r.text, P, C, H.checkWorkOf(r)), seen }); seen = [];
out('redactLetter outside any entry on the same letter', t0(() => H.redactLetter(big, P, C).text === B.redactLetter(big, P, C).text));
out('then PHI again equals fresh base', isDeepStrictEqual(full(H, PHI), fresh.PHI));

console.log('== E. fold outside the entries: every BMP code point and the astral letters, head = base, and no throw');
let diff = 0; for (let cp = 0; cp < 0x20000; cp += 1) { if (cp >= 0xd800 && cp < 0xe000) continue; const s = String.fromCodePoint(cp); if (H.fold(s) !== B.fold(s)) diff += 1; }
out('fold differences over U+0000..U+1FFFF', diff);
let calls = 0; for (let i = 0; i < 3_000_000; i += 1) { H.fold('х'); calls += 1; } out('3,000,000 fold calls outside an entry (450,000,000 units if counted)', `no throw after ${calls}`);

console.log('== F. someOf against Array.prototype.some');
const so = X.__someOf as <T>(l: readonly T[], t: (i: T) => boolean) => boolean;
let bad = 0; let s = 7; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = 0; i < 20000; i += 1) { const a = Array.from({ length: Math.floor(rnd() * 8) }, () => Math.floor(rnd() * 4)); const k = Math.floor(rnd() * 5); const c1: number[] = []; const c2: number[] = []; const x = a.some((v) => { c1.push(v); return v === k; }); const y = so(a, (v) => { c2.push(v); return v === k; }); if (x !== y || !isDeepStrictEqual(c1, c2)) bad += 1; }
out('dense arrays: differing answers or call sequences in 20,000', bad);
const sparse = [, 1] as unknown as (number | undefined)[]; out('sparse [ ,1], test v===undefined: some / someOf', [sparse.some((v) => v === undefined), so(sparse, (v) => v === undefined)]);
const grow = [1, 2]; out('list grown by the test: some / someOf', [[1, 2].some(function (this: void, v, _i, arr) { if (arr.length < 4) arr.push(9); return v === 9; }), so(grow, (v) => { if (grow.length < 4) grow.push(9); return v === 9; })]);
const c = X.__counted(0, () => so([1, 2, 3, 4], (v) => v === 3)); out('units for a hit at index 2 of 4 (expect 3) and a miss (expect 4)', [c.spent, X.__counted(0, () => so([1, 2, 3, 4], (v) => v === 9)).spent]);
X.__setBudget(2); const th = X.__counted(0, () => so([1, 2, 3, 4], (v) => v === 3)); out('a hit past the budget throws rather than answers', (th.threw as Error)?.constructor.name ?? `value ${String(th.value)}`); X.__setBudget(420_000_000);
