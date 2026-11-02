// Read-only: prints the closures' manifests and imports and the global inputs' imports for the repository at argv[2].
const root = process.argv[2]!;
const mod = await import(`${root}/tools/stryker/affected.ts`);
const files = mod.trackedFiles(root);
const closures = mod.repositoryClosures(root, files);
const global = mod.globalFiles(root, files);
for (const c of closures) {
  console.log(`== ${c.pkg}: ${c.files.length} files; manifests: ${c.manifests.join(', ')}`);
  for (const [dir, names] of c.imports) console.log(`   imports[${dir}]: ${[...names].sort().join(', ')}`);
}
console.log(`== global: ${global.files.size} files: ${[...global.files].sort().join(', ')}`);
for (const [dir, names] of global.imports) console.log(`   global imports[${dir}]: ${[...names].sort().join(', ')}`);
