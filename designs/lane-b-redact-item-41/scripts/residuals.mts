// residuals.mts <src dir> <corpus dir>...: Queues item 41, the cost of closing item 40's three recorded residuals by a
// fail-safe refusal at the check (no reader rule changed), counted on synthetic corpora through the letter's real path
// (redactLetterForScreen, then holdsIdentifier). For each SENT letter it asks of the sent text:
//  phone:    a phone-shaped run of digits (7 or 10) with a number character that is no decimal digit (\p{Nl}\p{No})
//            right beside it (item 40's residual, 11,285 sweep rows);
//  dotted:   "[PATIENT_NAME]." then a capital with no space, i.e. "Maria.M.L." sending its initials, split by whether
//            the capital is one of the patient's own initials;
//  undotted: "[PATIENT_NAME]" then optional initials, then a lone capital before a lower-case word, split by whether
//            it is one of the patient's initials and by A or I (the article and the pronoun) against any other.
// Also the C1 census for (a): letters holding a C1 character (U+0080 to U+009F), by code point. Counts only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
const [src, ...corpora] = process.argv.slice(2).map((p) => path.resolve(p));
const R = await import(`${src}/redact.ts`);
const PHONE = /(?:\(?\d{3}\)?[ .-]?)?\d{3}[ .-]?\d{4}/gu;
const NUMCH = /[\p{Nl}\p{No}]/u;
const DOTTED = /\[PATIENT_NAME\]\.(\p{Lu})(?!\p{L})/gu;
const UNDOTTED = /\[PATIENT_NAME\][.,]?(?:\s*\p{Lu}\.)*\s+(\p{Lu})\s+\p{Ll}/gu;
for (const corpus of corpora) {
  const manifest = JSON.parse(fs.readFileSync(path.join(corpus, 'manifest.json'), 'utf8'));
  const patients: { P: any; C: any }[] = JSON.parse(fs.readFileSync(path.join(corpus, 'patients.json'), 'utf8'));
  const n: Record<string, number> = { letters: 0, sent: 0, refused: 0, threw: 0, phone: 0, dottedInitial: 0, dottedOther: 0, undottedInitialAI: 0, undottedInitialOther: 0, undottedNotInitialAI: 0, undottedNotInitialOther: 0, c1Letters: 0 };
  const c1: Record<string, number> = {};
  for (let k = 0; k < manifest.shards; k += 1) for (const line of zlib.gunzipSync(fs.readFileSync(path.join(corpus, `shard-${k}.jsonl.gz`))).toString('utf8').split('\n')) {
    if (line === '') continue;
    const rec = JSON.parse(line); const { P, C } = patients[rec.p]!; n.letters += 1;
    const seen = new Set<string>(); for (const m of (rec.t as string).matchAll(/[\u0080-\u009f]/g)) seen.add(`U+${m[0].charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`);
    if (seen.size > 0) { n.c1Letters += 1; for (const s of seen) c1[s] = (c1[s] ?? 0) + 1; }
    let sent: string;
    try { sent = R.redactLetterForScreen(rec.t, P, C).text; if (R.holdsIdentifier(sent, P, C)) { n.refused += 1; continue; } } catch { n.threw += 1; continue; }
    n.sent += 1;
    const initials = new Set((P.names as string[]).flatMap((x) => x.normalize('NFKC').toUpperCase().split(/[^\p{L}]+/u)).filter((x) => x !== '').map((x) => x[0]));
    let phone = false;
    for (const m of sent.matchAll(PHONE)) { const before = sent.slice(0, m.index).slice(-1), after = sent[m.index + m[0].length] ?? ''; if (/\p{Nd}/u.test(before) || /\p{Nd}/u.test(after)) continue; if (NUMCH.test(before) || NUMCH.test(after)) phone = true; }
    if (phone) n.phone += 1;
    let di = false, dO = false; for (const m of sent.matchAll(DOTTED)) { if (initials.has(m[1]!)) di = true; else dO = true; }
    if (di) n.dottedInitial += 1; else if (dO) n.dottedOther += 1;
    const u = new Set<string>(); for (const m of sent.matchAll(UNDOTTED)) u.add(`${initials.has(m[1]!) ? 'undottedInitial' : 'undottedNotInitial'}${m[1] === 'A' || m[1] === 'I' ? 'AI' : 'Other'}`);
    for (const key of u) n[key]! += 1;
  }
  console.log(JSON.stringify({ corpus: path.basename(corpus), letters: manifest.letters, counts: n, c1ByCodePoint: Object.fromEntries(Object.entries(c1).sort()) }));
}
