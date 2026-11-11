// Reviewer L: exhaustive small families behind L-1 and L-2, the two-run spans of (b), and the name patients. Synthetic twins only.
import { pathToFileURL } from 'node:url';
const S = 'packages/model-gateway/src/redact.ts';
const HEAD = await import(pathToFileURL(`/home/user/fix/${S}`).href);
const INST = await import(pathToFileURL('/home/user/review-d1/d1/inst/redact.ts').href);
const BF = await import(pathToFileURL(`/home/user/work/p17/before/${S}`).href);
const B = await import(pathToFileURL(`/home/user/tree-ef3/${S}`).href);
const T = INST.__t;
const esc = (s: string) => JSON.stringify(s).replace(/[\u007f-￿]/g, (c) => `\\u${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
const mk = (names: string[], memberIds: string[], claims: string[][] = [['SYNCLAIM0001']]) => ({ P: { pseudonym: 'p', names, datesOfBirth: ['1980-03-14'], memberIds }, C: claims.map((claimNumbers, i) => ({ claimId: `c${i}`, patientPseudonym: 'p', claimNumbers })) });
const run = (M: any, t: string, pc: any) => { const s = M.redactLetterForScreen(t, pc.P, pc.C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, pc.P, pc.C) as boolean, cands: (s.candidates ?? []) as string[] }; };
const out = (o: { text: string; refused: boolean }) => (o.refused ? 'REFUSED' : esc(o.text));
const J = ['JANE Q ZEPHYRA'];
// --- L-1: a 7-digit phone number right after a covered run whose last three digits are plain.
{
  const pats = [
    { pc: mk(J, ['ZZ7654321', '7654321']), toks: ['ZZ765٤321', 'ZZ765४321', 'ZZ765৪321'] },
    { pc: mk(J, ['ZZ19800314', '800314']), toks: ['ZZ1980O314', 'ZZ1980٠314', 'ZZ1980०314'] },
    { pc: mk(J, ['7654321', '76543210']), toks: ['7654E210', '7654٣210', '7654३210'] },
    { pc: mk(J, ['SYNMEMBER0042', '0042', 'MEMBER0042'], [['SYNCLAIM0001'], ['SYN4455667', '4455667']]), toks: ['SYN445٥667', 'SYN445S667', 'SYN445५667'] },
  ];
  const counts: Record<string, number> = {}; const ex: string[] = []; let n = 0;
  for (const { pc, toks } of pats) for (const tok of toks) for (const lead of ['', 'ID ', 'Member ID: ', 'Re: Jane Zephyra, ID ']) for (const gap of [' ', '\n', ' \n', '\r\n', ' ', '\t', '-', '.', ', ', '  '])
    for (const num of ['555-0123', '555 0123', '555.0123', '555\n0123', '5550123']) for (const end of ['', '\nPaid in full.', ' Zephyra']) {
      n += 1; const t = `${lead}${tok}${gap}${num}${end}`;
      const h = run(HEAD, t, pc); const bf = run(BF, t, pc); const b = run(B, t, pc);
      const off = (o: { cands: string[] }) => o.cands.includes('5550123');
      const k = `base:${b.refused ? 'REF' : 'sent'}/${off(b) ? 'offered' : 'no'} before:${bf.refused ? 'REF' : 'sent'}/${off(bf) ? 'offered' : 'no'} head:${h.refused ? 'REF' : 'sent'}/${off(h) ? 'offered' : 'no'}`;
      counts[k] = (counts[k] ?? 0) + 1;
      if (!h.refused && !off(h) && off(bf) && ex.length < 4) ex.push(`${esc(t)} ids=${JSON.stringify(pc.P.memberIds)} base=${out(b)} before=${out(bf)} head=${out(h)} headCands=${esc(JSON.stringify(h.cands))}`);
    }
  console.log(`L-1 family: ${n} letters; "5550123" among the candidates:`); for (const k of Object.keys(counts).sort()) console.log(String(counts[k]).padStart(6), k); for (const e of ex) console.log('   ', e);
}
// --- L-2: a pattern that begins left of a covered run and ends inside it, under a label.
{
  const pats = [
    { pc: mk(J, ['ZZ19800314', '800314', '03141980', '141980']), tok: '03l41980', pres: ['345-62', '202-555-01', '900-12-34', '555-01'] },
    { pc: mk(J, ['7654321', '76543210']), tok: '7654E210', pres: ['202-555-', '900-12-', '255-', '555-'] },
    { pc: mk(J, ['7654321', '76543210']), tok: '76५43210', pres: ['345-62', '202-555-01', '900-12-34', '555-01'] },
    { pc: mk(J, ['ZZ7654321', '7654321', '54321']), tok: '765٤321', pres: ['202-555-0', '900-12-3', '555-0', '202 555 0'] },
  ];
  const counts: Record<string, number> = {}; const ex: string[] = []; let n = 0;
  for (const { pc, tok, pres } of pats) for (const pre of pres) for (const lead of ['', 'Tel. ', 'Phone ', 'Fax ', 'Call ', 'SSN ', 'SSN 1: ', 'ID ', 'Member ID: ', 'Line 3. '])
    for (const gap of ['', ' ', '\n', ' \n']) for (const end of ['', ' Paid in full.', ' Zephyra', ' Seen 01/01/2020-150.00Paid', '\n01/02/2020', '\nLine 3. 213-45 6202 Paid', ', 900123456']) {
      n += 1; const t = `${lead}${pre}${gap}${tok}${end}`;
      const h = run(HEAD, t, pc); const bf = run(BF, t, pc);
      if (h.text === bf.text && h.refused === bf.refused) { counts['same as before'] = (counts['same as before'] ?? 0) + 1; continue; }
      const b = run(B, t, pc);
      const k = `differs: base:${b.refused ? 'REF' : 'sent'} before:${bf.refused ? 'REF' : 'sent'} head:${h.refused ? 'REF' : 'sent'}`; counts[k] = (counts[k] ?? 0) + 1;
      if (!b.refused && !bf.refused && h.refused && ex.length < 6) ex.push(`${esc(t)} ids=${JSON.stringify(pc.P.memberIds)} base=${out(b)} before=${out(bf)} head=REFUSED (its text ${esc(h.text)})`);
      if (b.refused && !h.refused) console.log('   BASE REFUSES, HEAD SENDS', esc(t));
    }
  console.log(`\nL-2 family: ${n} letters`); for (const k of Object.keys(counts).sort()) console.log(String(counts[k]).padStart(6), k); for (const e of ex) console.log('   ', e);
}
// --- (b) one pattern over two runs, one covered and one not.
{
  const pc = mk(J, ['ZZ7654321', '7654321', '54321']);
  const A = ['ZZ765٤321', 'ZZ76543ꛯ1', 'ZZ7654٣٢١', 'ZZ7654३21'];
  const Bs = ['7654३21X', '765٤321X', '9ZZ76543ꛯ1', '7654३21', '765٤321', '76S4321', '7654321X', '765٤321Paid'];
  const counts: Record<string, number> = {}; let n = 0; let bad = 0; let withheldSeen = 0; let mixed = 0;
  for (const a of A) for (const b2 of Bs) for (const s1 of ['-', ' ', '\n', '.', '']) for (const mid of ['', '55', '5', '555', '12', '0', '555-0', '12-3', '202-55', '01-02']) for (const s2 of ['-', ' ', '\n', '.', '']) for (const lead of ['ID ', '', 'Call ']) {
    n += 1; const t = `${lead}${a}${s1}${mid}${s2}${b2}`;
    const subject = T.letterSubject(pc.P, pc.C); const all = T.matchesIn(T.unmarked(T.unbracketed(t)), subject);
    const wh = all.some((m: any) => m.withheld === true); const pat = all.some((m: any) => (m.kind === 'ssn' || m.kind === 'phone') && m.withheld !== true && all.some((o: any) => o.kind !== 'ssn' && o.kind !== 'phone' && o.start < m.end && m.start < o.end));
    if (wh) withheldSeen += 1; if (wh && pat) mixed += 1; if (!wh && !pat) continue;
    const h = run(HEAD, t, pc); const bf = run(BF, t, pc); const b = run(B, t, pc);
    const k = `${wh ? 'withheld' : 'applied '} base:${b.refused ? 'REF' : 'sent'} before:${bf.refused ? 'REF' : 'sent'} head:${h.refused ? 'REF' : 'sent'}`; counts[k] = (counts[k] ?? 0) + 1;
    const allText = HEAD.redactLetter(t, pc.P, pc.C).text;
    if ((!h.refused && h.text !== allText) || (b.refused && !h.refused) || (wh && !h.refused)) { bad += 1; if (bad < 6) console.log('   (b) LOOK', esc(t), 'base', out(b), 'before', out(bf), 'head', out(h)); }
  }
  console.log(`\n(b) two runs: ${n} letters; with a withheld match on the head ${withheldSeen}; with a withheld and an applied overlapping match ${mixed}; flagged ${bad}`); for (const k of Object.keys(counts).sort()) console.log(String(counts[k]).padStart(6), k);
}
// --- names, and a few single probes.
{
  const counts: Record<string, number> = {}; let n = 0;
  const pats = [mk(['JANE VANTREE', 'TREE'], ['ZZ7654321']), mk(['JANE Q ZEPHYRA', 'HYRA'], ['ZZ7654321']), mk(['ZOE ZEPHYRA', 'ZEPHYRA-VANTREE', 'TREE'], ['ZZ7654321'])];
  for (const pc of pats) for (const tok of ['VANTR33', 'VANTRE3', 'VANTR3E', 'VAN-TR33', 'Vantr33', '2EPHYRA', 'ZEPHYR4', 'Z3PHYRA', 'ZEPHYRA-VANTR33', '20E', 'Z0E', 'TR33X', 'XVANTR33'])
    for (const gap of ['', ' ', '\n', ' \n', '-', '.']) for (const tail of ['01-02-2020', '1-02-2020', '5-0123', '55-0123', '2-555-0123', '02-555-0123', '0-12-3456', '00-12-3456', '-12-3456', '-555-0123'])
      for (const side of ['after', 'before']) for (const lead of ['Re: ', '', 'SSN ', 'Seen 01/01/2020-150.00Paid in full. ']) {
        n += 1; const t = side === 'after' ? `${lead}${tok}${gap}${tail}` : `${lead}${tail.replace(/^-/, '900-').replace(/-(\d+)$/, '-')}${gap}${tok}`;
        const h = run(HEAD, t, pc); const bf = run(BF, t, pc);
        if (h.text === bf.text && h.refused === bf.refused) { counts['same as before'] = (counts['same as before'] ?? 0) + 1; continue; }
        const b = run(B, t, pc); const k = `differs: base:${b.refused ? 'REF' : 'sent'} before:${bf.refused ? 'REF' : 'sent'} head:${h.refused ? 'REF' : 'sent'}`; counts[k] = (counts[k] ?? 0) + 1;
        if ((counts[k] as number) <= 2) console.log('   names', esc(t), JSON.stringify(pc.P.names), 'base', out(b), 'before', out(bf), 'head', out(h));
        if (b.refused && !h.refused) console.log('   BASE REFUSES, HEAD SENDS', esc(t));
      }
  console.log(`\nnames: ${n} letters`); for (const k of Object.keys(counts).sort()) console.log(String(counts[k]).padStart(6), k);
  const pc = mk(J, ['7654321', '76543210']);
  for (const t of ['Fax X76543210 ext 12', 'Fax 555\n0123 #7654E210/X76543210 ext 12', 'Fax 150.00/X76543210 ext 12']) console.log('probe', esc(t), 'base', out(run(B, t, pc)), '| before', out(run(BF, t, pc)), '| head', out(run(HEAD, t, pc)));
}
