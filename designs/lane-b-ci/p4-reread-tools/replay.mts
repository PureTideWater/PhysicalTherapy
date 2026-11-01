// Read-only replay: for each merge commit given, the current rule (bce57f16's affected.ts, today's sets and shards)
// and a prototype of P4's field rule (design §2), on <merge>^1..<merge> in the scratch clone. Writes nothing tracked.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire('/home/user/ci-mutation-trigger/tools/package.json');
const { parse, parseDocument, visit, isAlias, isScalar } = require('yaml');
const tool = '/home/user/ci-mutation-trigger/tools/stryker/affected.ts';
const m = await import(tool);
const { MUTATION_PACKAGES } = await import('/home/user/ci-mutation-trigger/stryker/base.mjs');
const repo = process.argv[2]!;
const prs = process.argv.slice(3); // "<pr>:<merge sha>"
const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
const show = (rev: string, file: string): string | undefined => { try { return git('show', `${rev}:${file}`); } catch { return undefined; } };
const LIFECYCLE = new Set(['pnpm:devPreinstall', 'preinstall', 'install', 'postinstall', 'prepublish', 'preprepare', 'prepare', 'postprepare']);
const STRYKER_SCRIPTS = new Set(['stryker', 'prestryker', 'poststryker']);
const DEP_FIELDS = new Set(['dependencies', 'devDependencies', 'optionalDependencies']);
const WS_INERT = new Set(['minimumReleaseAge', 'minimumReleaseAgeExclude', 'trustPolicy', 'trustPolicyExclude', 'trustPolicyIgnoreAfter']);
const TRANSPORT = new Set(['actions/upload-artifact', 'actions/download-artifact']);
const PIN = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.-]+)*)@([0-9a-f]{40})$/;
const tooling = (name: string) => m.TEST_TOOLING.some((p: string) => (p.endsWith('/*') ? name.startsWith(p.slice(0, -1)) : name === p));
type Verdict = { global: string[]; pkgs: Map<string, string[]>; inert: string[] };
const add = (v: Verdict, pkg: string, why: string) => { const l = v.pkgs.get(pkg) ?? []; l.push(why); v.pkgs.set(pkg, l); };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function mirror(v: Verdict, file: string, field: string, name: string, closures: any[], globalImports: Map<string, Set<string>>, dir: string | undefined) {
  const where = `${file} ${field}.${name}`;
  if (tooling(name) || [...globalImports.values()].some((s) => s.has(name))) { v.global.push(`${where} (test tooling or global import)`); return; }
  const hit = closures.filter((c) => (dir === undefined ? [...c.imports.values()] : [c.imports.get(dir) ?? new Set()]).some((s: Set<string>) => s.has(name)));
  if (hit.length > 0) for (const c of hit) add(v, c.pkg, `${where} (imported)`);
  else v.inert.push(`${where} (inert)`);
}
function perEntry(before: Record<string, unknown> | undefined, after: Record<string, unknown> | undefined) {
  const b = before ?? {}, a = after ?? {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => !same(b[k], a[k]));
}
function classifyPackageJson(file: string, before: string | undefined, after: string | undefined, kind: 'root' | 'closure' | 'other', owners: string[], closures: any[], gi: Map<string, Set<string>>, dir: string): Verdict {
  const v: Verdict = { global: [], pkgs: new Map(), inert: [] };
  const fail = (why: string) => { if (kind === 'closure') for (const o of owners) add(v, o, `${file} ${why}`); else if (kind === 'root') v.global.push(`${file} ${why}`); else v.inert.push(`${file} ${why} (other manifest, not lifecycle)`); };
  let b: any, a: any;
  try { b = before === undefined ? undefined : JSON.parse(before); a = after === undefined ? undefined : JSON.parse(after); } catch { fail('(unparseable)'); return v; }
  if (b === undefined || a === undefined) { if (kind === 'other') { const s = (a ?? b)?.scripts ?? {}; if (Object.keys(s).some((k) => LIFECYCLE.has(k))) v.global.push(`${file} lifecycle (added/removed manifest)`); else v.inert.push(`${file} (added/removed other manifest)`); } else fail('(no text on one side)'); return v; }
  for (const key of [...new Set([...Object.keys(b), ...Object.keys(a)])]) {
    if (same(b[key], a[key])) continue;
    if (key === 'scripts') {
      for (const s of perEntry(b.scripts, a.scripts)) {
        if (LIFECYCLE.has(s)) v.global.push(`${file} scripts.${s} (lifecycle)`);
        else if (kind === 'root' && STRYKER_SCRIPTS.has(s)) v.inert.push(`${file} scripts.${s} (inert after §3.2)`);
        else v.inert.push(`${file} scripts.${s} (inert)`);
      }
    } else if (kind === 'other') {
      v.inert.push(`${file} ${key} (other manifest)`);
    } else if (DEP_FIELDS.has(key)) {
      for (const name of perEntry(b[key], a[key])) {
        const spec = [b[key]?.[name], a[key]?.[name]].map(String);
        if (kind === 'closure' && spec.some((s) => s.startsWith('workspace:'))) { for (const o of owners) add(v, o, `${file} ${key}.${name} (workspace:)`); continue; }
        mirror(v, file, key, name, closures, gi, kind === 'closure' ? dir : undefined);
      }
    } else fail(`${key}`);
  }
  return v;
}
function hasAnchors(text: string): boolean {
  const doc = parseDocument(text, { merge: false });
  let found = false;
  visit(doc, { Node(_k: unknown, node: any) { if (isAlias(node) || node.anchor !== undefined) found = true; }, Pair(_k: unknown, pair: any) { if (isScalar(pair.key) && pair.key.value === '<<') found = true; } });
  return found;
}
function classifyWorkspace(before: string | undefined, after: string | undefined, closures: any[], gi: Map<string, Set<string>>): Verdict {
  const v: Verdict = { global: [], pkgs: new Map(), inert: [] };
  const file = 'pnpm-workspace.yaml';
  if (before === undefined || after === undefined) { v.global.push(`${file} (no text)`); return v; }
  let b: any, a: any;
  try { if (hasAnchors(before) || hasAnchors(after)) { v.global.push(`${file} (anchor/alias/merge key)`); return v; } b = parse(before) ?? {}; a = parse(after) ?? {}; } catch { v.global.push(`${file} (unparseable)`); return v; }
  for (const key of [...new Set([...Object.keys(b), ...Object.keys(a)])]) {
    if (same(b[key], a[key])) continue;
    if (key === 'catalog') for (const name of perEntry(b.catalog, a.catalog)) mirror(v, file, 'catalog', name, closures, gi, undefined);
    else if (key === 'catalogs') for (const cat of perEntry(b.catalogs, a.catalogs)) for (const name of perEntry(b.catalogs?.[cat], a.catalogs?.[cat])) mirror(v, file, `catalogs.${cat}`, name, closures, gi, undefined);
    else if (WS_INERT.has(key)) v.inert.push(`${file} ${key} (inert)`);
    else v.global.push(`${file} ${key}`);
  }
  return v;
}
function classifyWorkflow(before: string | undefined, after: string | undefined): Verdict {
  const v: Verdict = { global: [], pkgs: new Map(), inert: [] };
  const file = '.github/workflows/mutation.yml';
  if (before === undefined || after === undefined) { v.global.push(`${file} (no text)`); return v; }
  let b: any, a: any;
  try { if (hasAnchors(before) || hasAnchors(after)) { v.global.push(`${file} (anchor)`); return v; } b = parse(before); a = parse(after); } catch { v.global.push(`${file} (unparseable)`); return v; }
  if (same(b, a)) { v.inert.push(`${file} (comments only)`); return v; }
  const pins: string[] = [];
  for (const [id, job] of Object.entries<any>(a.jobs ?? {})) {
    const bj = b.jobs?.[id];
    (job.steps ?? []).forEach((step: any, i: number) => {
      const bs = bj?.steps?.[i];
      if (typeof step?.uses !== 'string' || typeof bs?.uses !== 'string' || step.uses === bs.uses) return;
      const x = PIN.exec(bs.uses), y = PIN.exec(step.uses);
      if (!x || !y || x[1] !== y[1] || x[2] !== y[2] || TRANSPORT.has(x[1]!)) return;
      bs.uses = `${x[1]}${x[2]}@SHA`; step.uses = `${y[1]}${y[2]}@SHA`; pins.push(`${id}.steps[${i}] ${y[1]}${y[2]}`);
    });
  }
  if (same(b, a)) { for (const p of ['money', 'ledger']) add(v, p, `${file} pins only (${pins.length} step refs): runner proved on money-ledger`); return v; }
  const diffs: string[] = [];
  const walk = (x: any, y: any, at: string) => { if (same(x, y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${at}.${k}`); } else diffs.push(at); };
  walk(b, a, '');
  v.global.push(`${file} (${diffs.slice(0, 4).join(', ')}${diffs.length > 4 ? ` +${diffs.length - 4}` : ''})`);
  return v;
}
const out: string[] = [];
for (const spec of prs) {
  const [pr, baseSpec, headSpec] = spec.split(':') as [string, string, string];
  const head = git('rev-parse', headSpec).trim();
  const base = git('merge-base', baseSpec, head).trim();
  const files = git('diff', '--name-only', '--no-renames', '-z', base, head).split('\0').filter((f) => f !== '');
  const at = (rev: string) => m.treeAt(rev, (root: string, fs: readonly string[]) => ({ closures: m.repositoryClosures(root, fs), global: m.globalFiles(root, fs) }), repo);
  const H = at(head), B = at(base);
  const closures = m.unionClosures(H.closures, B.closures);
  const global = m.unionGlobal(H.global, B.global);
  const lockfile = files.includes('pnpm-lock.yaml') ? { before: show(base, 'pnpm-lock.yaml'), after: show(head, 'pnpm-lock.yaml') } : undefined;
  const current = m.affected({ files, lockfile }, closures, global);
  // P4: classify the manifests and the workflow.
  const wsDirs = new Set<string>();
  for (const rev of [base, head]) { const t = show(rev, 'pnpm-workspace.yaml') ?? ''; for (const f of git('ls-tree', '-r', '--name-only', rev).split('\n')) if (/(^|\/)package\.json$/.test(f) && !f.includes('node_modules')) { const d = f === 'package.json' ? '.' : f.slice(0, -'/package.json'.length); if (d !== '.' && /^(apps|packages)\/[^/]+$|^infra$|^tools$|^tools\/stryker\/canary\/lib$/.test(d)) wsDirs.add(d); } void t; }
  const verdicts: Verdict[] = [];
  const classified = new Set<string>();
  for (const f of files) {
    if (f === 'package.json') { classified.add(f); verdicts.push(classifyPackageJson(f, show(base, f), show(head, f), 'root', [], closures, global.imports, '.')); }
    else if (f === 'pnpm-workspace.yaml') { classified.add(f); verdicts.push(classifyWorkspace(show(base, f), show(head, f), closures, global.imports)); }
    else if (f === '.github/workflows/mutation.yml') { classified.add(f); verdicts.push(classifyWorkflow(show(base, f), show(head, f))); }
    else if (f.endsWith('/package.json') && wsDirs.has(f.slice(0, -'/package.json'.length))) {
      classified.add(f);
      const owners = closures.filter((c: any) => c.manifests.includes(f)).map((c: any) => c.pkg);
      const dir = f.slice(0, -'/package.json'.length);
      verdicts.push(classifyPackageJson(f, show(base, f), show(head, f), owners.length > 0 ? 'closure' : 'other', owners, closures, global.imports, dir));
    }
  }
  const rest = m.affected({ files: files.filter((f) => !classified.has(f)), lockfile }, closures, global);
  const narrowed = new Map<string, string[]>();
  for (const p of rest.packages) narrowed.set(p, [...(rest.reasons[p] ?? [])]);
  const anyGlobal = verdicts.flatMap((v) => v.global);
  for (const p of MUTATION_PACKAGES) {
    if (anyGlobal.length > 0) narrowed.set(p, [...(narrowed.get(p) ?? []), ...anyGlobal.slice(0, 2)]);
    for (const v of verdicts) if (v.pkgs.has(p)) narrowed.set(p, [...(narrowed.get(p) ?? []), ...(v.pkgs.get(p) ?? [])]);
  }
  const np = MUTATION_PACKAGES.filter((p: string) => narrowed.has(p));
  out.push(`#${pr} ${head.slice(0, 10)} (${files.length} files)\n  current: [${current.packages.join(', ')}] shards ${m.shardsFor(current.packages).length}\n${current.packages.map((p: string) => `    ${p}: ${(current.reasons[p] ?? []).join(' | ')}`).join('\n')}\n  narrowed: [${np.join(', ')}] shards ${m.shardsFor(np).length}\n${np.map((p: string) => `    ${p}: ${(narrowed.get(p) ?? []).slice(0, 5).join(' | ')}`).join('\n')}\n  inert: ${verdicts.flatMap((v) => v.inert).join(' | ')}\n  global: ${anyGlobal.join(' | ')}`);
  console.log(out.at(-1));
}
