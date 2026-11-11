// node build2.mjs: v/vF.mts, head with NAMED_BEFORE's run of three or more taken whole (a lookahead after it), to show the time is that group's alone
import fs from 'node:fs';
const DIR = '/home/user/fix/packages/model-gateway/src';
const conf = [`${DIR}/confusables.ts`, `${DIR}/confusables/index.ts`].find((p) => fs.existsSync(p));
const BS = String.fromCharCode(92);
const cls = `[_~${BS}${BS}u2500-${BS}${BS}u257F]`;
let src = fs.readFileSync(`${DIR}/redact.ts`, 'utf8');
if (!src.includes("from './confusables'")) throw new Error('import'); src = src.replace("from './confusables'", () => `from '${conf}'`);
const needle = `${cls}{3,}`;
const count = src.split(needle).length - 1;
if (count !== 1) throw new Error(`needle found ${count} times`);
src = src.replace(needle, () => `${needle}(?!${cls})`);
fs.writeFileSync('/home/user/review-i2/v/vF.mts', src);
console.log('vF built');
