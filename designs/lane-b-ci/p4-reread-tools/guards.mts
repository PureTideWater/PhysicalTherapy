// Read-only: which files in the union of the global and package closures spawn a process or name the three files.
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = process.argv[2]!;
const mod = await import(`${root}/tools/stryker/affected.ts`);
const files = mod.trackedFiles(root);
const closures = mod.repositoryClosures(root, files);
const global = mod.globalFiles(root, files);
const union = new Set<string>([...global.files, ...closures.flatMap((c: { files: string[] }) => c.files)]);
console.log(`union: ${union.size} files`);
for (const file of [...union].sort()) {
  const text = readFileSync(path.join(root, file), 'utf8');
  const hits: string[] = [];
  if (/['"](node:)?child_process['"]/.test(text)) hits.push('child_process');
  for (const lit of ['package.json', 'pnpm-workspace.yaml', 'mutation.yml', 'npm_lifecycle', 'npm_package', 'npm_config', 'PNPM_']) if (text.includes(lit)) hits.push(lit);
  if (hits.length > 0) console.log(`${file}: ${hits.join(', ')}`);
}
