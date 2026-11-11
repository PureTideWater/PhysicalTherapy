// node build.mjs: three copies of head's redact.ts under ./v (v0 counts the second reading, v1 has none, v2 keeps long runs no amount in the loose reading)
import fs from 'node:fs';
const DIR = '/home/user/fix/packages/model-gateway/src';
const OUT = '/home/user/review-h2/v';
fs.mkdirSync(OUT, { recursive: true });
const conf = [`${DIR}/confusables.ts`, `${DIR}/confusables/index.ts`].find((p) => fs.existsSync(p));
if (!conf) throw new Error('confusables not found');
const must = (s, a, b) => { if (!s.includes(a)) throw new Error(`needle not found: ${a.slice(0, 70)}`); return s.replace(a, () => b); };
const src = must(fs.readFileSync(`${DIR}/redact.ts`, 'utf8'), "from './confusables'", `from '${conf}'`);
const SECOND = "  const base = survivorRead(text, false, departs);\n  return base === 'survivor' || read === null ? base : read;";
const GATE = String.raw`!(strict && /^[0-9]{9,}\./u.test(match[0]))`;
fs.writeFileSync(`${OUT}/v0.mts`, must(src, SECOND, "  const base = survivorRead(text, false, departs);\n  if (globalThis.__h2) { globalThis.__h2.second += 1; if (base !== read) globalThis.__h2.diff.push(String(read) + '>' + String(base)); }\n  return base === 'survivor' || read === null ? base : read;"));
fs.writeFileSync(`${OUT}/v1.mts`, must(src, SECOND, '  return read;'));
fs.writeFileSync(`${OUT}/v2.mts`, must(src, GATE, String.raw`!/^[0-9]{9,}\./u.test(match[0])`));
console.log('variants built');
