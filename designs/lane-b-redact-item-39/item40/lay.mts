// Lays out item 40's head and its windowed variant as gate trees. Usage: node lay.mts <root> <head redact.ts> <confusables.ts>
import fs from 'node:fs';
import { patchedHead } from './variants.mts';
const [root, headFile, conf] = process.argv.slice(2) as [string, string, string];
for (const v of ['head', 'headwin']) {
  fs.mkdirSync(`${root}/${v}`, { recursive: true });
  fs.copyFileSync(conf, `${root}/${v}/confusables.ts`);
  fs.writeFileSync(`${root}/${v}/redact.ts`, patchedHead(fs.readFileSync(headFile, 'utf8'), v));
}
