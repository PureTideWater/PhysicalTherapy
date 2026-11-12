// Edge cases, head against base. Synthetic data only.
const H = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const Bm = await import('/home/user/tree-base/packages/redact/src/redact.ts');
const J = (v: any) => JSON.stringify(v, (_k, x) => x instanceof Map ? [...x] : x instanceof Set ? ['<Set>', ...x] : x);
const who = (o: any = {}) => ({ pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'], ...o }) as any;
const cl = (n: any) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const T = 'Dear provider, the claim SYN556000 of Jane Zephyra (ZZ1234567, born 03/03/1961) was paid in full. Call the plan. ';
const run = (M: any, text: string, p: any, c: any, head: boolean) => { try { const r = M.redactLetterForScreen(text, p, c); const spent = head ? M.checkWorkOf(r) : undefined; const held = head ? M.holdsIdentifier(r.text, p, c, spent) : M.holdsIdentifier(r.text, p, c); return { text: r.text.slice(0, 60), len: r.text.length, replaced: r.replaced, cand: r.candidates.length, spent, held }; } catch (e) { return { threw: String(e).slice(0, 90) }; } };
console.log('== 1. empty and odd subjects (head | base)');
const cases: [string, any, any][] = [
  ['no names/ids/claims', who({ names: [], memberIds: [], datesOfBirth: [] }), []],
  ['claims hold empty lists', who(), [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: [] }, { claimId: 'c2', patientPseudonym: 'p1', claimNumbers: [] }]],
  ['all empty + empty lists', who({ names: [], memberIds: [] }), cl([])],
  ['claimNumbers a Set', who(), cl(new Set(['SYN556000']))],
  ['names a Set', who({ names: new Set(['JANE Q ZEPHYRA']) }), cl(['SYN556000'])],
  ['memberIds a Set', who({ memberIds: new Set(['ZZ1234567']) }), cl(['SYN556000'])],
  ['claimNumbers undefined', who(), cl(undefined)],
  ['claimNumbers a string', who(), cl('SYN556000')],
  ['names undefined', who({ names: undefined }), cl(['SYN556000'])],
  ['memberIds undefined', who({ memberIds: undefined }), cl(['SYN556000'])],
  ['claims sparse/length-only', who(), cl({ length: 1, 0: 'SYN556000', [Symbol.iterator]: Array.prototype[Symbol.iterator] })],
  ['claimNumbers array-like with length "x"', who(), cl(Object.assign(['SYN556000'].values(), { }))],
];
for (const [name, p, c] of cases) { const h = run(H, T, p, c, true); const b = run(Bm, T, p, c, false); console.log(name.padEnd(40), J(h), '|', J(b)); }
console.log('== 2. spent guard: holdsIdentifier(clean, .., spent) ; base answer', Bm.holdsIdentifier('The claim was denied for timely filing.', who(), cl(['SYN556000'])));
for (const s of [undefined, 0, 1, 420_000_000, 420_000_001, -1, -0, NaN, Infinity, null, '0', '5', 0n, {}, [], true, new Number(5), { valueOf: () => 5 }]) { let a: any; try { a = H.holdsIdentifier('The claim was denied for timely filing.', who(), cl(['SYN556000']), s as any); } catch (e) { a = 'THREW ' + String(e); } console.log(`  spent=${typeof s === 'bigint' ? '0n' : typeof s === 'object' && s !== null ? Object.prototype.toString.call(s) : String(s)} (${typeof s}) -> ${a}`); }
console.log('== 3. uncounted entries past what the budget would be: no throw, equal to base');
const K = 3000; const many = Array.from({ length: K }, (_, i) => `SYN${556000 + i}`); const big = T.repeat(700); // 2*3002*len > budget
console.log('  charge one ownMatchesIn call would make:', 2 * (K + 2) * big.length, '> 420000000');
const ids = { names: ['JANE Q ZEPHYRA'], numbers: ['ZZ1234567', ...many] };
for (const [name, f] of [['redactLetter', (M: any) => M.redactLetter(big, who(), cl(many))], ['redactionSpans', (M: any) => M.redactionSpans(big, who(), cl(many))], ['holdsNameOrNumber', (M: any) => M.holdsNameOrNumber(big, ids)], ['nameOrNumberMatches', (M: any) => M.nameOrNumberMatches(big, ids)]] as [string, (M: any) => any][]) {
  let h: string, b: string; try { h = J(f(H)); } catch (e) { h = 'THREW ' + String(e); } try { b = J(f(Bm)); } catch (e) { b = 'THREW ' + String(e); }
  console.log(`  ${name.padEnd(20)} equal=${h === b} len=${h.length} ${h.startsWith('THREW') ? h : ''}`);
}
console.log('== 4. the counted entry refuses the same, and state is whole after the throw');
const r = H.redactLetterForScreen(big, who(), cl(many)); console.log('  forScreen: spent', H.checkWorkOf(r), 'text', J(r.text), 'held', H.holdsIdentifier(r.text, who(), cl(many), H.checkWorkOf(r)));
// throw inside holdsIdentifier's frames (alike fold, views/dates of the check): spent just under the budget, then a fresh letter
const alike = 'Zephυra and Ζephyra wrote about SYN55600O. ' + T;
for (const near of [419_999_999, 419_990_000, 419_900_000, 419_000_000, 415_000_000, 400_000_000]) { const held = H.holdsIdentifier(alike.repeat(3), who(), cl(many.slice(0, 300)), near); const after = run(H, T, who(), cl(['SYN556000']), true); const base = run(Bm, T, who(), cl(['SYN556000']), false); console.log(`  spent ${near}: held ${held}; next letter equal to base: ${after.text === base.text && after.held === base.held && after.replaced === base.replaced}`); }
// throw inside redaction at every depth: letters sized across the budget, then a plain letter and an uncounted entry
let okAfter = 0, n = 0, refused = 0; for (let m = 20; m <= 700; m += 40) { const t = (alike + T).repeat(m); const rr = H.redactLetterForScreen(t, who(), cl(many.slice(0, 300))); if (H.checkWorkOf(rr) > H.CHECK_WORK_BUDGET) refused++; n++; const a = run(H, alike + T, who(), cl(['SYN556000']), true); const b = run(Bm, alike + T, who(), cl(['SYN556000']), false); const u = J(H.redactLetter(alike + T, who(), cl(many))) === J(Bm.redactLetter(alike + T, who(), cl(many))); if (J({ ...a, spent: 0 }) === J({ ...b, spent: 0 }) && u) okAfter++; }
console.log(`  ${n} letters across the budget (${refused} refused in redaction): next letter and next uncounted call equal to base after ${okAfter}/${n}`);
