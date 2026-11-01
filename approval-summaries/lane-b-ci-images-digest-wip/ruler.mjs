// The PR #86 length-test ruler (design §6.3): a two-line table header and 1,000 rows of exactly 100 characters,
// newline included; each row names its number and the ruler's length at its end. Synthetic; no data of any kind.
// Usage: node ruler.mjs > ruler.md   (expect 100,061 characters, SHA-256 5bb5e558463de9bf85c0b6dc560387edbd87a6b45f444d2f6ffe05191a55675f)
const header = '| Row | Characters so far | What it is |\n| --- | --- | --- |\n';
let out = header;
for (let i = 1; i <= 1000; i++) {
  const total = String(header.length + i * 100).padStart(7, '0');
  const head = `| ${String(i).padStart(4, '0')} | ${total}`;
  const tail = ' | synthetic length-test row, no data |\n';
  out += head + ' '.repeat(100 - head.length - tail.length) + tail;
}
process.stdout.write(out);
