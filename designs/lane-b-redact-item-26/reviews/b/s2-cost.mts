// Review B, script 2: what the wider reading costs ordinary prose (new redactions), natural sentences that lose an
// amount, a date, a deadline or the whole letter, the design's own stored numbers, and CR LF letters against their LF writing.
//   node s2-cost.mts      Synthetic text only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pathToFileURL } from 'node:url';
const B = await import(pathToFileURL('/home/user/rev/base/redact.ts').href);
const H = await import(pathToFileURL('/home/user/rev/head/redact.ts').href);
const ROOT = '/home/user/PhysicalTherapy';
const t0 = performance.now();
const lap = (what: string) => console.log(`-- ${what}: ${((performance.now() - t0) / 1000).toFixed(0)} s`);

// Set A: the design's own 500 texts (cost-names.mts's loader, unchanged).
const setA: string[] = [];
const walk = (dir: string) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.(txt|md)$/.test(e.name) && fs.statSync(p).size < 400_000) setA.push(fs.readFileSync(p, 'utf8')); } };
walk(`${ROOT}/fixtures/synthetic`);
for (const f of ['packages/synth/src/eval/narrative-set.ts', 'packages/model-gateway/src/functions/denial-letter.test.ts', 'packages/model-gateway/src/functions/narrative.test.ts', 'packages/model-gateway/src/redact.test.ts']) {
  for (const m of fs.readFileSync(`${ROOT}/${f}`, 'utf8').matchAll(/'((?:[^'\\\n]|\\.){40,})'|`((?:[^`\\]|\\.){40,})`/g)) setA.push((m[1] ?? m[2] ?? '').replace(/\\n/g, '\n').replace(/\\'/g, "'"));
}
// Set B: the gate corpus's letters of ordinary prose (sources T3/clean and data/reviewer-files), every 9th, at least 60 characters with 8 words.
const setB: string[] = [];
for (let shard = 0; shard < 8; shard += 1) {
  let k = 0;
  for (const line of zlib.gunzipSync(fs.readFileSync(`/home/user/gate/corpus/shard-${shard}.jsonl.gz`)).toString('utf8').split('\n')) {
    if (!line.includes('"T3/clean"') && !line.includes('"data/reviewer-files"')) continue;
    k += 1; if (k % 9 !== 0) continue;
    const t = (JSON.parse(line) as { t: string }).t;
    if (t.length >= 60 && t.length <= 6000 && (t.match(/[A-Za-z]{2,}/g) ?? []).length >= 8) setB.push(t);
  }
}
const chars = (set: string[]) => set.reduce((n, t) => n + t.length, 0);
console.log(`set A (the design's): ${setA.length} texts, ${chars(setA)} characters; set B (corpus prose sample): ${setB.length} texts, ${chars(setB)} characters`);

// 1. Every run of two to four written words, joined only by what the wider name gap takes (white space, period, dash, apostrophe,
//    underscore), whose letters together are 3 to 9: a patient whose name's part is those letters loses the run. Counted on both sets.
const GAPS = "[\\s.\\-'’_]+";
const WORD = /[A-Za-z]+/g;
const joined = new Map<string, number>();
for (const text of [...setA, ...setB]) {
  const words = [...text.matchAll(WORD)].map((m) => ({ w: m[0], s: m.index!, e: m.index! + m[0].length }));
  for (let i = 0; i < words.length; i += 1) {
    const before = text[words[i]!.s - 1] ?? ' ';
    if (/[0-9]/.test(before)) continue;
    let cat = words[i]!.w;
    for (let j = i + 1; j < words.length && j < i + 4; j += 1) {
      if (!new RegExp(`^${GAPS}$`).test(text.slice(words[j - 1]!.e, words[j]!.s))) break;
      cat += words[j]!.w;
      if (cat.length > 9) break;
      if (cat.length >= 3 && !/[0-9]/.test(text[words[j]!.e] ?? ' ')) joined.set(cat.toUpperCase(), (joined.get(cat.toUpperCase()) ?? 0) + 1);
    }
  }
}
const NAMES = ('ADA ALA ANA ASA AVA BEA EVA IDA INA ISA IVA MIA MYA NOA ONA ORA UNA ZOE AMY ANN ABE ALI ARI ELI IAN IRA LEO ANDI ANDY ALAN ALMA ALTA ANNA ARLO ASIF ATIF BEAU CARA CORA DANA DARA DEAN DINA DORA EDNA ELSA EMMA ERIN ETTA EZRA INES INEZ INGA INGE IONA IRIS IRMA ISLA IVAN JANA JANE JEAN JOAN JOEL JUNE LANA LENA LEON LINA LISA LOLA LORA LUIS MARA MARC MARY MAYA MAYE MINA MONA MYRA NEAL NEIL NELL NINA NOAH NOEL NORA OLGA OMAR ORIN ORAN OTIS OTTO OWEN RENA RHEA RITA ROSA SARA SEAN SETH TARA TESS THEA THEO TINA TOBY TODD TONI TONY VERA TOAN THAN HASAN HASSAN ISAAC ISAAK ISABEL ANDRE ANDRA ANDREA ANITA ANISA ALISON ALLISON ALLAN ALLEN ANTON ASHER ASHTON AIDAN AMARA BEATA ELENA ELISA ELIAS ETHAN FIONA ISAIAH JANET JANIS JASON MARIS MARIN MARION MARTA MAYRA NOLAN NORMA ONEAL OSCAR TOBIAS TOMAS WILLA AUGUSTA ' +
  'ABLE ASHE ATWOOD BEAN COE DOAN DOE DOSS DOTY FORAN FORD FORDE FORTE FORMAN FOREMAN HEIN HAAS INMAN ISOM ITO NOTO NOBLE NORMAN NEWMAN ONO ORR ORTA OTT SOTO SOSA THEIN THEIS TOOR TOTH UNDERWOOD WEBB WEIS WITHERS MAYO MAYER MAYES MAYS MARCHAND JANAS JUNEAU NOVA NOVAK DAYAN DAYTON SOLIS SOMERS TOLAND TOLER ALLARD ALLMAN ALLRED ALSOP ALTMAN AMOS ANDO ANDES ASHBY ASHMAN ATKINS ATWELL BEAL BEAM BEATTY BEHAN BYARS BYERS DOBY DOLAN DORAN HEARD HEATH INGRAM INNES IRBY ISLER ISLEY ITOH NOON NOTT ORMAN ORMOND ORTON OSMAN PERA PERES THEDE TOBE TOBIN TOMA TOME TONE TOPE TORO UPTON USHER WEEMS WITHAM WITHROW ISHAM ASBELL ASBURY ASAY ASARO ISAACS WASSON WASHAM HASTY HASKIN ARENA AREND ARENS CANADA CANO WILLARD MAYNARD MUSTO ALLIS ANYA ATON INOUE INIGO INAN ASAN ORBE NOLA ISAI ANIS ANAS ONEY ORE ORAL ORTH ISON IFE OFER ATOR ANDER ANDERS ANDAL ANDIS ASIS ASIA ISIS ASIM ASIT ORIS ORIT BYUN BYAM INAM INES INAS ANAN ADAN ALAS ALIS ANTO ANTE ISAK ASAD ASAF ATAL ATIA ATIS OFA TOA TOIA TOFA TOALA NOAL NOYA NOAS PO MD NA EG IE AM PM DC PT OT US').split(/\s+/);
const nameSet = new Set(NAMES);
const top = [...joined].sort((a, b) => b[1] - a[1]);
console.log('\n## 1. the runs of words most often written, by their letters (any name with a part of these letters loses each run):');
console.log(top.slice(0, 60).map(([c, n]) => `${c}x${n}`).join(' '));
const namesHit = top.filter(([c]) => nameSet.has(c));
console.log('\nof these, in my list of ordinary given names and surnames:');
console.log(namesHit.map(([c, n]) => `${c}x${n}`).join(' '));
lap('runs counted');

// 2. The design's measure (redactionSpans, the name alone as the patient, spans the base's do not cover) for those names and the design's seven, on set A and set B.
const DESIGN = ['INA', 'ASA', 'ISA', 'TOBE', 'THEO', 'BEA', 'IDA'];
const measured = [...new Set([...DESIGN, ...namesHit.slice(0, 45).map(([c]) => c)])];
const loose = (w: string) => new RegExp(`(?<![\\p{L}\\p{N}])${[...w].join("[\\s.\\-'’_‐-―]*")}(?![\\p{L}\\p{N}])`, 'iu');
const measure = (name: string, set: string[]) => {
  const P = { pseudonym: 'p', names: [name], datesOfBirth: [], memberIds: [] };
  const phrases = new Map<string, number>(); let changed = 0; let spans = 0; const re = loose(name);
  for (const text of set) {
    if (!re.test(text)) continue;
    const b = B.redactionSpans(text, P, []); const h = H.redactionSpans(text, P, []);
    let any = false;
    for (const span of h.spans) {
      if (b.spans.some((s: { start: number; end: number }) => s.start <= span.start && span.end <= s.end)) continue;
      any = true; spans += 1;
      const phrase = h.text.slice(span.start, span.end).replace(/\s+/g, ' ').toLowerCase();
      phrases.set(phrase, (phrases.get(phrase) ?? 0) + 1);
    }
    if (any) changed += 1;
  }
  return { changed, spans, top: [...phrases].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${JSON.stringify(p)}x${n}`).join(' ') };
};
console.log('\n## 2. measured with both trees (new spans = replaced by the head, not covered by a span of the base):');
console.log('name       | set A: texts changed / new spans | set B: texts changed / new spans | phrases (set A; set B)');
const table: string[] = [];
for (const name of measured) {
  const a = measure(name, setA); const b = measure(name, setB);
  const row = `${name.padEnd(10)} | ${String(a.changed).padStart(4)} / ${String(a.spans).padStart(4)} | ${String(b.changed).padStart(5)} / ${String(b.spans).padStart(5)} | ${a.top} ; ${b.top}`;
  table.push(row); console.log(row);
}
lap('names measured');

// 3. Natural sentences: the whole path (redactLetterForScreen, then holdsIdentifier), base and head.
const mk = (names: string[], memberIds = ['SYNMEMBER0042'], claimNumbers = ['SYNCLAIM0001']) => ({ P: { pseudonym: 'synthetic-patient-1', names, datesOfBirth: ['1980-03-14'], memberIds }, C: [{ claimId: 'synthetic-claim-1', patientPseudonym: 'synthetic-patient-1', claimNumbers }] });
const run = (M: typeof B, text: string, pt: ReturnType<typeof mk>) => { const s = M.redactLetterForScreen(text, pt.P, pt.C); return { text: s.text as string, refused: M.holdsIdentifier(s.text, pt.P, pt.C) as boolean, candidates: s.candidates as string[] }; };
const CASES: [string[], string, string[]?, string[]?][] = [
  [['INA VANTREE'], 'If you have questions, call in a timely manner: 555-0123.'],
  [['INA VANTREE'], 'Questions? Call in a timely manner. 555-0123'],
  [['INA VANTREE'], 'Please respond in a timely manner. Phone 555-0123.'],
  [['INA VANTREE'], 'Payment will be issued in a lump sum of $150.00.'],
  [['INA VANTREE'], 'The appeal must be filed in a timely manner, within 180 days of this notice.'],
  [['INA VANTREE'], 'You may appeal in a letter received by 03/14/2026. Call 555-0123 with questions.'],
  [['INA VANTREE'], 'Call 555-0123 in a case of urgent need.'],
  [['INA VANTREE'], 'Remit in a single payment to 555-0123 lockbox.'],
  [['INA G VANTREE'], 'The service was reported in a G code, G0283, and denied.'],
  [['INA G VANTREE'], 'The service was reported in a G-code and denied CO-45.'],
  [['ANDRE VANTREE'], 'Please correct the claim and re-submit it within 90 days.'],
  [['ANDRE VANTREE'], 'Correct the claim and re-submit. Questions: 555-0123.'],
  [['ANDRE VANTREE'], 'Correct and re-submit by fax to 555-0123 within 90 days.'],
  [['ORA VANTREE'], 'Submit a corrected claim or a written appeal within 180 days.'],
  [['ORA VANTREE'], 'Send a fax or a letter. 555-0123'],
  [['ORA VANTREE'], 'Call or a letter: 555-0123.'],
  [['ASA VANTREE'], 'The service is covered as a Part B benefit and paid at $150.00.'],
  [['ISA VANTREE'], 'This is a final determination. Call 555-0123.'],
  [['ISA VANTREE'], 'Our number is a toll-free line: 555-0123.'],
  [['TOBE VANTREE'], 'The amount to be paid is $150.00. The number to be called is 555-0123.'],
  [['BEAN VANTREE'], 'The provider must be an in-network provider. Call 555-0123.'],
  [['FORAN VANTREE'], 'A request for an appeal must be received within 180 days. Call 555-0123.'],
  [['FORAN VANTREE'], 'Call for an update: 555-0123.'],
  [['TOAN VANTREE'], 'You have the right to an appeal within 60 days of 03/14/2026.'],
  [['HASAN VANTREE'], 'The member has an outstanding balance of $150.00. Call 555-0123.'],
  [['INAN VANTREE'], 'Services were rendered in an outpatient setting on 03/14/2026.'],
  [['ORIN VANTREE'], 'Appeal by mail or in person by 03/14/2026. Phone or in person: 555-0123.'],
  [['THEIN VANTREE'], 'The in-network rate is $150.00. Call the in-network line 555-0123.'],
  [['MAYA VANTREE'], 'In May a corrected claim was received and denied.'],
  [['MAYA VANTREE'], 'The appeal is due by 15 May a year after the date of service.'],
  [['MARCHAND VANTREE'], 'Services in March and April 2026 were denied.'],
  [['MARCHAND VANTREE'], 'Visits between 3 March and 14 June 2026 exceed the limit.'],
  [['MARCHAND VANTREE'], 'The appeal deadline is 31 March and no extension applies.'],
  [['JANIS VANTREE'], 'The deadline of 31 Jan is final.'],
  [['MARIN VANTREE'], 'Claims received 14 Mar in error were returned.'],
  [['ANDI VANTREE'], 'My therapist and I disagree with CO-45. Call 555-0123.'],
  [['ATA VANTREE'], 'Paid at a rate of $1.50 per unit. Call at a later time: 555-0123'],
  [['ONA VANTREE'], 'Paid on a per-visit basis. Call on a weekday: 555-0123'],
  [['PO VANTREE'], 'Mail to P.O. Box 1234, Springfield.'],
  [['MD RAHMAN VANTREE'], 'Reviewed by Jane Roe, M.D., on 03/14/2026.'],
  [['NA VANTREE'], 'Remark code: N.A. Group code: CO.'],
  // The design's own stored numbers.
  [['JANE Q ZEPHYRA'], 'Billed 1234.56  Allowed 987.65  Paid $1,234.56', ['SYNMEMBER0042'], ['1234.56']],
  [['JANE Q ZEPHYRA'], 'Paid $1234.56 on 03/14/2026.', ['SYNMEMBER0042'], ['1234.56']],
  [['JANE Q ZEPHYRA'], 'Paid $ 1234.56 and 1234.5 6', ['SYNMEMBER0042'], ['1234.56']],
  [['JANE Q ZEPHYRA'], 'Line 1  97110  2026.00  123.45', ['SYNMEMBER0042'], ['2026.00123']],
  [['JANE Q ZEPHYRA'], 'Total billed: 2026.00\n123 visits remain.', ['SYNMEMBER0042'], ['2026.00123']],
  [['JANE Q ZEPHYRA'], 'Total billed: $2026.00\n123 visits remain.', ['SYNMEMBER0042'], ['2026.00123']],
  [['JANE Q ZEPHYRA'], 'Benefit year 2026. 00123 is the group.', ['SYNMEMBER0042'], ['2026.00123']],
  [['JANE Q ZEPHYRA'], 'Seen 1234/56 times; check 1234 / 56; ratio 1234/ 56/2026', ['SYNMEMBER0042'], ['1234/56']],
  [['JANE Q ZEPHYRA'], 'Group ZZ12345. 01 unit paid.', ['ZZ12345.01'], ['SYNCLAIM0001']],
  [['JANE Q ZEPHYRA'], 'Group ZZ12345, 01 unit paid.', ['ZZ12345,01'], ['SYNCLAIM0001']],
  [['JANE Q ZEPHYRA'], 'Plan ZZ12345/01/15/2026 effective.', ['ZZ12345/01'], ['SYNCLAIM0001']],
  [['JANE Q ZEPHYRA'], 'Units 2026.00 123.45 555-0123', ['SYNMEMBER0042'], ['2026.00123']],
];
console.log('\n## 3. natural sentences (the whole path):');
for (const [names, text, m, c] of CASES) {
  const pt = mk(names, m, c); const b = run(B, text, pt); const h = run(H, text, pt);
  const mark = !b.refused && h.refused ? 'NEW-REFUSAL' : b.refused && !h.refused ? 'BLOCKING?' : b.text !== h.text ? 'new-redaction' : 'same';
  console.log(`${mark.padEnd(13)} names=${JSON.stringify(names)}${m ? ` ids=${JSON.stringify(m)} claims=${JSON.stringify(c)}` : ''}\n   letter ${JSON.stringify(text)}\n   base ${b.refused ? 'REFUSED' : 'sent   '} ${JSON.stringify(b.text)}\n   head ${h.refused ? 'REFUSED' : 'sent   '} ${JSON.stringify(h.text)}`);
}
lap('sentences');

// 4. CR LF letters against their LF writing, on the head: set B's letters that hold a line break, and set A's.
let crlf = 0; const tab = new Map<string, number>(); const odd: string[] = [];
const PZ = mk(['JANE Q ZEPHYRA']);
for (const text of [...setA.filter((t) => t.length < 6000), ...setB]) {
  if (!text.includes('\n') || crlf >= 2500) continue;
  crlf += 1;
  const lfText = text.replace(/\r\n/g, '\n'); const crText = lfText.replace(/\n/g, '\r\n');
  const hc = run(H, crText, PZ); const hl = run(H, lfText, PZ); const bc = run(B, crText, PZ);
  const key = `base(CRLF) ${bc.refused ? 'refused' : 'sent'} | head(CRLF) ${hc.refused ? 'refused' : 'sent'} | head(LF) ${hl.refused ? 'refused' : 'sent'}`;
  tab.set(key, (tab.get(key) ?? 0) + 1);
  if (hc.refused !== hl.refused && odd.length < 4) odd.push(JSON.stringify(crText).slice(0, 500));
}
console.log(`\n## 4. CR LF letters (${crlf}), patient JANE Q ZEPHYRA:`);
for (const [key, n] of [...tab].sort()) console.log(String(n).padStart(6), key);
for (const o of odd) console.log('   differs:', o);
lap('crlf');
