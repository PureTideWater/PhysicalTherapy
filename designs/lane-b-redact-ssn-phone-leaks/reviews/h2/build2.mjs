// node build2.mjs: v3 = head with its naming patterns exported; v4 = head with "_", "~" and "+" added to what NAMED_BEFORE reads between a noun and its number (a probe, not a proposed fix).
import fs from 'node:fs';
const DIR = '/home/user/fix/packages/model-gateway/src';
const OUT = '/home/user/review-h2/v';
const conf = [`${DIR}/confusables.ts`, `${DIR}/confusables/index.ts`].find((p) => fs.existsSync(p));
const must = (s, a, b) => { if (!s.includes(a)) throw new Error(`needle not found: ${a.slice(0, 70)}`); return s.replace(a, () => b); };
const src = must(fs.readFileSync(`${DIR}/redact.ts`, 'utf8'), "from './confusables'", `from '${conf}'`);
fs.writeFileSync(`${OUT}/v3.mts`, `${src}\nexport const __rx = { NAMED_BEFORE, RULE_LINE, LABEL_TAIL, NUMBER_LABEL_END, SSN_LABEL_THEN };\n`);
const CLASS = String.raw`(?:\\(S\\)|[\\s:#.*=()`;
const at = src.indexOf(CLASS, src.indexOf('const NAMED_BEFORE'));
if (at < 0 || at > src.indexOf('const NAMED_REACH')) throw new Error('filler class not found in NAMED_BEFORE');
fs.writeFileSync(`${OUT}/v4.mts`, src.slice(0, at) + String.raw`(?:\\(S\\)|[_~+\\s:#.*=()` + src.slice(at + CLASS.length));
console.log('v3, v4 built');
