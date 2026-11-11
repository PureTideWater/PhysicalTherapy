// node build.mjs: copies of head's redact.ts under ./v (v1: no second reading; vL: byLong sets no second reading; vX: exports the patterns)
import fs from 'node:fs';
const DIR = '/home/user/fix/packages/model-gateway/src';
const OUT = '/home/user/review-i2/v';
fs.mkdirSync(OUT, { recursive: true });
const conf = [`${DIR}/confusables.ts`, `${DIR}/confusables/index.ts`].find((p) => fs.existsSync(p));
if (!conf) throw new Error('confusables not found');
const must = (s, a, b) => { if (!s.includes(a)) throw new Error(`needle not found: ${a.slice(0, 70)}`); return s.replace(a, () => b); };
const src = must(fs.readFileSync(`${DIR}/redact.ts`, 'utf8'), "from './confusables'", `from '${conf}'`);
const SECOND = "  const base = survivorRead(text, false, departs);\n  return base === 'survivor' || read === null ? base : read;";
const BYLONG = 'if ((label !== null && skipped.any) || decided.byLong) departs.left = true;';
fs.writeFileSync(`${OUT}/v1.mts`, must(src, SECOND, '  return read;'));
fs.writeFileSync(`${OUT}/vL.mts`, must(src, BYLONG, 'if (label !== null && skipped.any) departs.left = true;'));
fs.writeFileSync(`${OUT}/vX.mts`, src + '\nexport const __rx = { NAMED_BEFORE, RULE_LINE, LABEL_TAIL, DATE_GLUED_AFTER, BARE_DATE_AFTER, LABELED_DATE_AFTER, GLUED_LONG_LABEL, NUMBER_LABEL_END };\n');
console.log('variants built');
