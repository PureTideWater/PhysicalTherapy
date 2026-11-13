// Lays out two gate trees: <root>/base (redact.ts and confusables.ts of the base) and <root>/<variant> (the variant's
// patched redact.ts beside the same confusables.ts). Usage: node lay.mts <root> <variant>
import fs from 'node:fs';
import { patched } from './variants.mts';
const [root, variant = 'aclazy'] = process.argv.slice(2);
const REPO = process.env.REPO ?? '/home/user/PhysicalTherapy';
for (const [dir, v] of [['base', 'base'], [variant, variant]] as const) {
  fs.mkdirSync(`${root}/${dir}`, { recursive: true });
  fs.copyFileSync(`${REPO}/packages/redact/src/confusables.ts`, `${root}/${dir}/confusables.ts`);
  fs.writeFileSync(`${root}/${dir}/redact.ts`, patched(fs.readFileSync(`${REPO}/packages/redact/src/redact.ts`, 'utf8'), v!));
}
