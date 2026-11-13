// census.mts: how many of the gate's 975,489 synthetic letters hold what each candidate rule of Queues item 40 reads.
// Counts only; no reader is run. Run: node census.mts (reads the gate's corpus shards).
import fs from 'node:fs';
import zlib from 'node:zlib';
const CORPUS = '/home/user/ops/designs/lane-b-redact-ssn-phone/gate/corpus';
const TESTS: [string, RegExp][] = [
  ['R1-3: holds a number character that is no decimal digit (as written)', /[\p{Nl}\p{No}]/u],
  ['R1-3: one right beside an ASCII digit run of 5 or more, after NFKC', /[\p{Nl}\p{No}][0-9]{5}|[0-9]{5}[\p{Nl}\p{No}]/u],
  ['R1-3: one right beside any decimal digit, after NFKC', /[\p{Nl}\p{No}]\p{Nd}|\p{Nd}[\p{Nl}\p{No}]/u],
  ['R1-4: holds an unseen character (\\p{C}, not default-ignorable, not white space, not U+0001-3)', /[\p{C}--[\p{Default_Ignorable_Code_Point}\s\u0001-\u0003]]/v],
  ['R1-4: holds U+0085', /\u0085/u],
  ['R1-4: an unseen character with a letter or digit on each side', /[\p{L}\p{N}][\p{C}--[\p{Default_Ignorable_Code_Point}\s\u0001-\u0003]]+[\p{L}\p{N}]/v],
  ['R1-4: an unseen character with a digit on each side', /\p{Nd}[\p{C}--[\p{Default_Ignorable_Code_Point}\s\u0001-\u0003]]+\p{Nd}/v],
  ['R1-4: an unseen character right beside a digit', /\p{Nd}[\p{C}--[\p{Default_Ignorable_Code_Point}\s\u0001-\u0003]]|[\p{C}--[\p{Default_Ignorable_Code_Point}\s\u0001-\u0003]]\p{Nd}/v],
  ['(A): a letter standing alone, a period, a letter standing alone', /(?<![\p{L}\p{N}])\p{L}\.\p{L}(?![\p{L}\p{N}])/u],
];
const counts = TESTS.map(() => 0);
const bySource = TESTS.map(() => new Map<string, number>());
let letters = 0;
for (const name of fs.readdirSync(CORPUS).filter((file) => file.startsWith('shard-'))) {
  for (const line of zlib.gunzipSync(fs.readFileSync(`${CORPUS}/${name}`)).toString('utf8').split('\n')) {
    if (line === '') continue;
    const { s, t } = JSON.parse(line) as { s: string; t: string };
    letters += 1;
    const normal = t.normalize('NFKC');
    TESTS.forEach(([label, test], k) => {
      if (test.test(label.includes('as written') ? t : normal)) {
        counts[k] = (counts[k] ?? 0) + 1;
        const source = s.split('/')[0] ?? s;
        bySource[k]?.set(source, (bySource[k]?.get(source) ?? 0) + 1);
      }
    });
  }
}
console.log(`letters ${letters}`);
TESTS.forEach(([label], k) => console.log(`${counts[k]} | ${label} | by source: ${[...(bySource[k] ?? [])].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, n]) => `${s} ${n}`).join(', ')}`));
