// A: six-digit birth compacts after a held range, per 100,000 generated lines. B: the pieces rule against names (name joiners). C: windows a digits-only ID could collide with (number joiners).
import { B, A, H, pat, cl, out, HELD } from './lib3.mts';
import { makeGen } from './d2p6/gen.mts';
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
const N = Number(process.argv[2] ?? 100000); const SEED = Number(process.argv[3] ?? 20261111); const CAP = Number(process.argv[4] ?? 6000);
const LOG = '/home/user/review-c2/rate.out'; writeFileSync(LOG, '');
const say = (s: string) => appendFileSync(LOG, s + '\n');
const g: any = makeGen(SEED);
const lines: { tag: string; text: string }[] = [];
for (let i = 0; i < N; i += 1) { const L: any = g.line(); lines.push({ tag: String(L.tag), text: String(L.text) }); }
say(`lines ${lines.length} seed ${SEED}; sample: ${JSON.stringify(lines.slice(0, 3))}`);
const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (m: number, y: number) => [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]!;
let U = 0; for (let y = 1940; y <= 2015; y += 1) for (let m = 1; m <= 12; m += 1) U += daysIn(m, y);
try {
  const decode = (s: string): string[] => {
    const res = new Set<string>();
    const t = (yy: number, mm: number, dd: number) => { const y = yy >= 40 ? 1900 + yy : yy <= 15 ? 2000 + yy : -1; if (y < 0 || mm < 1 || mm > 12 || dd < 1 || dd > daysIn(mm, y)) return; res.add(`${y}-${pad(mm)}-${pad(dd)}`); };
    const n = (i: number) => Number(s.slice(i, i + 2));
    t(n(0), n(2), n(4)); t(n(4), n(0), n(2)); t(n(4), n(2), n(0));
    return [...res];
  };
  const pairs: { li: number; dob: string }[] = []; let withRun = 0;
  lines.forEach((L, li) => {
    const runs = L.text.match(/[0-9]{6,}/g) ?? []; if (runs.length > 0) withRun += 1;
    const seen = new Set<string>();
    for (const run of runs) for (const six of [run.slice(0, 6), run.slice(-6)]) for (const dob of decode(six)) seen.add(dob);
    for (const dob of seen) pairs.push({ li, dob });
  });
  const stride = Math.max(1, Math.ceil(pairs.length / CAP));
  say(`A: birth dates in the universe (1940-2015) ${U}; lines with a run of six digits or more ${withRun}; candidate (line, birth date) pairs ${pairs.length}; stride ${stride}`);
  const neutral = new Map<number, string>(); const t0 = Date.now();
  let done = 0, newRef = 0, attributable = 0, fixRound = 0; const byTag = new Map<string, number>(); const ex: string[] = [];
  for (let k = 0; k < pairs.length; k += stride) {
    if (Date.now() - t0 > 300000) break;
    const { li, dob } = pairs[k]!; const L = lines[li]!; const letter = HELD + L.text; const p = pat(undefined, dob);
    done += 1;
    const h = out(H, letter, p);
    if (h !== 'REFUSED') continue;
    const b = out(B, letter, p);
    if (b === 'REFUSED') continue;
    newRef += 1;
    let hn = neutral.get(li); if (hn === undefined) { hn = out(H, letter, pat(undefined, '1931-07-23')); neutral.set(li, hn); }
    if (hn === 'REFUSED') continue;
    attributable += 1;
    if (out(A, letter, p) !== 'REFUSED') { fixRound += 1; byTag.set(L.tag, (byTag.get(L.tag) ?? 0) + 1); if (ex.length < 12) ex.push(`${dob} ${L.tag} ${JSON.stringify(L.text)}`); }
  }
  const scale = (pairs.length / stride) / Math.max(1, done) * stride; const per = (c: number) => ((c * scale) / U * (100000 / N)).toFixed(3);
  say(`A: pairs run ${done} in ${Math.round((Date.now() - t0) / 1000)}s; head refuses and base sends ${newRef}; of them sent by head for a birth date that is not in the line ${attributable}; of them sent by aea2852d too (the fix round's six-digit rule) ${fixRound}`);
  say(`A: expected lines refused per 100,000 lines after a held range, patient's birth date uniform over ${U}: new against base ${per(attributable)}; new in the fix round ${per(fixRound)}`);
  say(`A: by class ${JSON.stringify([...byTag].sort((x, y) => y[1] - x[1]).slice(0, 12))}`); for (const e of ex) say(`   ${e}`);
} catch (e: any) { say(`A failed: ${String(e && e.stack).slice(0, 400)}`); }
const mb: Record<string, string> = { O: 'O0', o: 'O0', '0': '0O', l: 'L1', I: 'I1', '1': '1IL', S: 'S5', s: 'S5', '5': '5S', B: 'B8', '8': '8B', E: 'E3', '3': '3E' };
const mayBe = (w: string) => mb[w] ?? w.toUpperCase();
const isDigit = (u: string) => u >= '0' && u <= '9';
const crossed = (token: string, name: string): boolean => { if (token.length !== name.length) return false; let own = 0, letters = 0, x = false; for (let i = 0; i < name.length; i += 1) { const w = token[i]!, want = name[i]!; if (!mayBe(w).includes(want)) return false; if (w.toUpperCase() === want) own += 1; if (!isDigit(w)) letters += 1; if (isDigit(w) !== isDigit(want)) x = true; } return x && own * 2 >= name.length && letters > 0; };
const MONTHDAY = /^(?:[0-9]{1,2})?(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUNE?|JULY?|AUG(?:UST)?|SEPT?(?:EMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)(?:[0-9]{1,6})?$/i;
try {
  const src = readFileSync('/home/user/work/b2fix/a3-names.mts', 'utf8');
  const names = [...new Set([...(/const FIRST = '([^']+)'/.exec(src)?.[1] ?? '').split(' '), ...(/const LAST = '([^']+)'/.exec(src)?.[1] ?? '').split(' ')])].filter((n) => n.length >= 5 && n.length <= 8);
  const NAMEGAP = /^[\p{Pd}−⁃'‘’ʼ`´_­·‧∙⋅•]{1,2}$/u;
  const cands: { text: string; name: string; piece: string; src: string }[] = [];
  const scan = (text: string, srcTag: string) => {
    const toks = [...text.matchAll(/[A-Za-z0-9]+/g)];
    for (let i = 0; i < toks.length; i += 1) {
      let merged = toks[i]![0];
      for (let j = i + 1; j < toks.length && j <= i + 3; j += 1) {
        const gap = text.slice(toks[j - 1]!.index! + toks[j - 1]![0].length, toks[j]!.index!);
        if (!NAMEGAP.test(gap)) break;
        merged += toks[j]![0];
        if (merged.length < 5 || merged.length > 8 || !/[0-9]/.test(merged) || !/[A-Za-z]/.test(merged) || MONTHDAY.test(merged)) continue;
        for (const name of names) if (crossed(merged, name)) cands.push({ text, name, piece: text.slice(toks[i]!.index!, toks[j]!.index! + toks[j]![0].length), src: srcTag });
      }
    }
  };
  let joined = 0; for (const L of lines) { if (/[A-Za-z0-9][-'_’][A-Za-z0-9]/.test(L.text)) joined += 1; scan(L.text, `gen:${L.tag}`); }
  const fromLines = cands.length;
  const T = new Set<string>();
  const words = ['Week', 'Day', 'Visit', 'Session', 'Tier', 'Level', 'Step', 'Phase', 'Stage', 'Line', 'Page', 'Box', 'Item', 'Code', 'Part', 'Plan', 'Form', 'Type', 'Class', 'Group', 'Unit', 'Zone', 'Rule', 'Note', 'Row', 'Field', 'Block', 'Section', 'Table', 'Exhibit', 'Schedule', 'Option', 'Loop', 'Segment', 'Rev', 'POS', 'TOB', 'DRG', 'ICD', 'CPT', 'COVID', 'Park', 'Wood', 'Well', 'Mill', 'Bank', 'Brook', 'Point', 'Round', 'Grade', 'Test', 'Year', 'Month', 'Qtr', 'Lot', 'Mod', 'Bill', 'Ward', 'Wing', 'Room', 'Bed', 'Floor', 'Suite', 'Apt', 'Bldg', 'Gate', 'Lane', 'Route', 'Hwy', 'Exit', 'Area', 'Site', 'Lab', 'Clinic', 'Rx', 'Dx', 'Ref', 'Fig', 'Vol', 'Ch', 'No', 'FY', 'CY', 'Q'];
  for (const w of words) for (let n = 0; n <= 150; n += 1) for (const j of ['-', '_']) { T.add(`${w}${j}${n}`); T.add(`${w.toUpperCase()}${j}${n}`); }
  const units = ['day', 'days', 'week', 'weeks', 'month', 'months', 'year', 'years', 'visit', 'visits', 'hour', 'hours', 'minute', 'minutes', 'unit', 'units', 'time', 'times', 'step', 'level', 'line', 'mile', 'lb', 'inch', 'mg', 'ml', 'rep', 'reps', 'set', 'sets', 'session', 'sessions', 'point', 'percent', 'star', 'way', 'part', 'page', 'item', 'on', 'to', 'in', 'up', 'D', 'K', 'R', 'B', 'A', 'C', 'ES', 'EZ', 'NR', 'G', 'T'];
  for (const u of units) for (let n = 0; n <= 150; n += 1) { T.add(`${n}-${u}`); T.add(`${n}-${u.toUpperCase()}`); }
  for (const g2 of ['CO', 'PR', 'OA', 'PI', 'CR', 'MA', 'N', 'M', 'W', 'I', 'L', 'S', 'C', 'T', 'E', 'B', 'UB', 'CMS', 'HCFA', 'ICD', 'CPT', 'PL', 'HB', 'SB']) for (let n = 0; n <= 310; n += 1) { T.add(`${g2}-${n}`); T.add(`${g2}-${String(n).padStart(2, '0')}`); }
  for (const a of ['C', 'T', 'L', 'S']) for (let n = 1; n <= 12; n += 1) for (const b of ['C', 'T', 'L', 'S']) for (let m = 1; m <= 12; m += 1) T.add(`${a}${n}-${b}${m}`);
  for (const t of ['1-on-1', '1-ON-1', 'ICD-10-CM', 'ICD-10-PCS', 'CMS-1500', 'UB-04', '1099-R', '1095-B', '1095-C', 'W-2', 'W-9', 'I-9', '401-K', 'B-12', 'COVID-19', '5010-A1', '837-P', '835-ERA', 'X-12', '24-7', '1-800-MEDICARE', 'A-1', 'E-1', 'O-1', '3-D', '2-STEP', 'ONE-0N-ONE', '10-K', '8-K', 'K-1', 'S-1', 'Co-1', 'PART-B', 'Part-8', "O'5", '1st-level', '2nd-level', '3rd-party', '1-time', '5-star', '8-week', '3-month', '1-year', '5-year', '10-day', '15-min']) T.add(t);
  let pairs = 0;
  for (const tok of T) { pairs += names.length; scan(`See ${tok} below.`, 'token'); }
  say(`B: names of 5 to 8 letters ${names.length}; generated lines with a joined token ${joined}/${lines.length}, candidates in them ${fromLines}; ordinary joined tokens ${T.size}, name-token pairs ${pairs}, candidates ${cands.length - fromLines}`);
  let conf = 0, refused = 0, plural = 0, sinceAea = 0; const shown: string[] = []; const hitNames = new Set<string>(); const t1 = Date.now();
  for (const c of cands.slice(0, 1500)) {
    if (Date.now() - t1 > 150000) { say('B: time cap'); break; }
    const p = pat([`${c.name} VANTREE`]); const h = out(H, c.text, p); const b = out(B, c.text, p);
    if (h === b) continue;
    conf += 1; hitNames.add(c.name); if (h === 'REFUSED') refused += 1;
    const pl = /^([A-Za-z]+)[-_]5$/.exec(c.piece); const isPlural = pl !== null && `${pl[1]!.toUpperCase()}S` === c.name; if (isPlural) plural += 1;
    const a = out(A, c.text, p); if (a === b) sinceAea += 1;
    if (!isPlural && shown.length < 40) shown.push(`${c.name} <- ${JSON.stringify(c.piece)} (${c.src}) base ${b.slice(0, 40)} | aea ${a.slice(0, 40)} | head ${h.slice(0, 60)}`);
  }
  say(`B: confirmed on the head (differs from base) ${conf} of ${Math.min(cands.length, 1500)} candidates, names ${hitNames.size}; refused ${refused}; the recorded plural-and-5 class ${plural}; new since aea2852d ${sinceAea}`);
  for (const s of shown) say(`   ${s}`);
} catch (e: any) { say(`B failed: ${String(e && e.stack).slice(0, 400)}`); }
try {
  const NUMGAP = /^[\s\p{Pd}−_|\\'`~;"]{1,2}$/u; const conv: Record<string, string> = { O: '0', o: '0', l: '1', I: '1', S: '5', s: '5', B: '8', E: '3' };
  let windows = 0; const ids = new Map<string, string>(); const byLen = new Map<number, number>();
  for (const L of lines) {
    const toks = [...L.text.matchAll(/[A-Za-z0-9]+/g)];
    for (let i = 0; i < toks.length; i += 1) {
      let merged = toks[i]![0];
      for (let j = i + 1; j < toks.length && j <= i + 3; j += 1) {
        const gap = L.text.slice(toks[j - 1]!.index! + toks[j - 1]![0].length, toks[j]!.index!);
        if (!NUMGAP.test(gap)) break;
        merged += toks[j]![0];
        if (merged.length < 6 || merged.length > 12) continue;
        const letters = merged.replace(/[0-9]/g, '');
        if (letters.length === 0 || letters.length * 2 > merged.length || ![...letters].every((x) => x in conv)) continue;
        const id = [...merged].map((x) => conv[x] ?? x).join('');
        windows += 1; byLen.set(id.length, (byLen.get(id.length) ?? 0) + 1);
        if (!ids.has(id)) ids.set(id, L.text.slice(toks[i]!.index!, toks[j]!.index! + toks[j]![0].length) + ' || ' + L.text);
      }
    }
  }
  say(`C: windows of two to four neighbouring tokens (number joiners, a space among them) that read as a digits-only ID of 6 to 12 with a letter for a digit: ${windows} in ${lines.length} lines, distinct IDs ${ids.size}, by length ${JSON.stringify([...byLen].sort((x, y) => x[0] - y[0]))}`);
  let k = 0; for (const [id, where] of ids) { if (k >= 8) break; k += 1; const [piece, text] = where.split(' || '); const p = pat(undefined, '1980-03-14', [id]); say(`   member ID ${id} <- ${JSON.stringify(piece)} in ${JSON.stringify(text)}: base ${out(B, text!, p).slice(0, 50)} | aea ${out(A, text!, p).slice(0, 50)} | head ${out(H, text!, p).slice(0, 90)}`); }
} catch (e: any) { say(`C failed: ${String(e && e.stack).slice(0, 400)}`); }
say('DONE');
