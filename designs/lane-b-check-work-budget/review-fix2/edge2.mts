// Odd inputs, head against base: where the new charge throws, refuses or is steered. Synthetic data only.
const H = await import('/home/user/PhysicalTherapy/packages/redact/src/redact.ts');
const Bm = await import('/home/user/tree-base/packages/redact/src/redact.ts');
const who = (o: any = {}) => ({ pseudonym: 'p1', names: ['JANE Q ZEPHYRA'], memberIds: ['ZZ1234567'], datesOfBirth: ['1961-03-03'], ...o }) as any;
const cl = (n: any) => [{ claimId: 'c1', patientPseudonym: 'p1', claimNumbers: n }] as any;
const T = 'Dear provider, the claim SYN556000 of Jane Zephyra (ZZ1234567, born 03/03/1961) was paid in full. Call the plan. ';
const run = (M: any, text: any, p: any, c: any, head: boolean) => { let s = ''; try { const r = M.redactLetterForScreen(text, p, c); const spent = head ? M.checkWorkOf(r) : undefined; s = `redact{len ${r.text.length}, replaced ${r.replaced}${head ? `, spent ${spent}` : ''}}`; try { const held = head ? M.holdsIdentifier(r.text, p, c, spent) : M.holdsIdentifier(r.text, p, c); s += ` check:${held ? 'REFUSED' : 'SENT'}`; } catch (e) { s += ` check THREW ${String(e).slice(0, 70)}`; } } catch (e) { s = `redact THREW ${String(e).slice(0, 70)}`; } let alone = ''; try { alone = String(head ? M.holdsIdentifier('The claim was paid.', p, c, 0) : M.holdsIdentifier('The claim was paid.', p, c)); } catch (e) { alone = 'THREW ' + String(e).slice(0, 50); } return `${s} ; check alone on a clean text: ${alone}`; };
const fake = (length: number, s: string) => ({ length, normalize: () => s, trim: () => s, toString: () => s });
const cases: [string, any, any, any?][] = [
  ['plain', who(), cl(['SYN556000'])],
  ['claim without claimNumbers', who(), [{ claimId: 'c1', patientPseudonym: 'p1' }]],
  ['claimNumbers null', who(), cl(null)],
  ['claimNumbers a Set', who(), cl(new Set(['SYN556000']))],
  ['claimNumbers a string', who(), cl('SYN556000')],
  ['claimNumbers array-like object', who(), cl({ length: 1, 0: 'SYN556000' })],
  ['claimNumbers an iterator', who(), cl(['SYN556000'].values())],
  ['claimNumbers [] (empty)', who(), cl([])],
  ['claimNumbers sparse [ , SYN]', who(), cl([, 'SYN556000'])],
  ['claimNumbers [number]', who(), cl([556000])],
  ['claimNumbers [null]', who(), cl([null])],
  ['claimNumbers [undefined]', who(), cl([undefined])],
  ['claimNumbers [[string]]', who(), cl([['SYN556000']])],
  ['claimNumbers [String object]', who(), cl([new String('SYN556000')])],
  ['claimNumbers [""]', who(), cl([''])],
  ['names undefined', who({ names: undefined }), cl(['SYN556000'])],
  ['names a string', who({ names: 'JANE Q ZEPHYRA' }), cl(['SYN556000'])],
  ['names a Set', who({ names: new Set(['JANE Q ZEPHYRA']) }), cl(['SYN556000'])],
  ['names [number]', who({ names: [5] }), cl(['SYN556000'])],
  ['memberIds undefined', who({ memberIds: undefined }), cl(['SYN556000'])],
  ['memberIds a Set', who({ memberIds: new Set(['ZZ1234567']) }), cl(['SYN556000'])],
  ['memberIds [number]', who({ memberIds: [1234567] }), cl(['SYN556000'])],
  ['claims a Set', who(), new Set(cl(['SYN556000']))],
  ['claims [undefined]', who(), [undefined]],
  ['claims undefined', who(), undefined],
  ['claims []', who(), []],
  ['patient undefined', undefined, cl(['SYN556000'])],
  ['text a number', who(), cl(['SYN556000']), 5],
  ['text undefined', who(), cl(['SYN556000']), undefined],
  ['text a String object', who(), cl(['SYN556000']), new String(T)],
  ['identifier object, length -1e9', who(), cl([fake(-1e9, 'SYN556000')])],
  ['identifier object, length NaN', who(), cl([fake(NaN, 'SYN556000')])],
  ['identifier object, length 9', who(), cl([fake(9, 'SYN556000')])],
  ['identifier object, length -Infinity', who(), cl([fake(-Infinity, 'SYN556000')])],
];
for (const [name, p, c, ...text] of cases) { const t = text.length > 0 ? text[0] : T; console.log(`${name.padEnd(36)} HEAD ${run(H, t, p, c, true)}\n${''.padEnd(36)} BASE ${run(Bm, t, p, c, false)}`); }
// A negative length that lands the count inside the budget: is the budget steered, and is anything sent the base does not send?
const big = T.repeat(900); const many = Array.from({ length: 300 }, (_, i) => `SYN${556000 + i}`);
const honest = H.redactLetterForScreen(big, who(), cl(many)); console.log('honest: spent', H.checkWorkOf(honest), 'refused', H.checkWorkOf(honest) > H.CHECK_WORK_BUDGET);
for (const neg of [-200000, -400000, -1000000]) { const c = cl([...many, fake(neg, 'SYN556999')]); const r = H.redactLetterForScreen(big, who(), c); const spent = H.checkWorkOf(r); const held = H.holdsIdentifier(r.text, who(), c, spent); const b = Bm.redactLetterForScreen(big, who(), c); const bh = Bm.holdsIdentifier(b.text, who(), c); console.log(`fake length ${neg}: head spent ${spent}, read ${r.text.length > 1}, check ${held ? 'REFUSED' : 'SENT'} | base ${bh ? 'REFUSED' : 'SENT'}, same text ${r.text === b.text}`); }
