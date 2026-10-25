import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTROLS, type EvidenceSource, PROGRAM_EVIDENCE } from './controls';
import { POLICIES, policyById } from './policies';

/**
 * The checklist's repository evidence is proved here on every build, so the console can show it without reading
 * the repository: each control of PRD 16's table is mapped, word for word; every test named exists with that
 * title; every CI step is in its workflow; every runbook and policy is in the repository with its version.
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8');

function prdControlRows(): { name: string; implementation: string; evidence: string }[] {
  const prd = read('docs/product/PRD.md');
  const section = prd.slice(prd.indexOf('### Controls and their tests'), prd.indexOf('### Development data boundary'));
  return section
    .split('\n')
    .filter((line) => line.startsWith('| ') && !line.startsWith('| Control |') && !line.startsWith('| ---'))
    .map((line) => {
      const [name = '', implementation = '', evidence = ''] = line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim().replaceAll('`', ''));
      return { name, implementation, evidence };
    });
}

/** Whether a test (it, test, describe or a cdk/e2e test) with this title, or containing it, is in the file. */
function hasTestTitled(content: string, title: string): boolean {
  let at = content.indexOf(title);
  while (at !== -1) {
    const before = content.slice(Math.max(0, content.lastIndexOf('\n', Math.max(0, content.lastIndexOf('\n', at - 1) - 1))), at);
    if (/\b(it|test|describe)(\.each\(|\.skipIf\(|\(|\.\w+\()/.test(before)) {
      return true;
    }
    at = content.indexOf(title, at + 1);
  }
  return false;
}

interface Files {
  readonly exists: (file: string) => boolean;
  readonly read: (file: string) => string;
}

const onDisk: Files = { exists: (file) => existsSync(path.join(ROOT, file)), read };

const SUFFIX = { database_test: '.db.test.ts', unit_test: '.test.ts', e2e_test: '.spec.ts', cdk_assertion: '.test.ts' } as const;

/** The repository paths a file's relative imports and re-exports resolve to, each as written or with a TypeScript ending. */
function relativeImports(file: string, content: string, files: Files): string[] {
  const specifiers = [...content.matchAll(/^\s*(?:import|export)\b[^'";]*?\bfrom\s+['"](\.{1,2}\/[^'"]+)['"]|^\s*import\s+['"](\.{1,2}\/[^'"]+)['"]/gm)].map((match) => match[1] ?? match[2] ?? '');
  return specifiers.flatMap((specifier) => {
    const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const found = [target, `${target}.ts`, `${target}.tsx`, `${target}/index.ts`].find((candidate) => files.exists(candidate));
    return found === undefined ? [] : [found];
  });
}

/**
 * Why a test source is not evidence: its file is missing, is not of its kind's file type or lacks the test's title.
 * A test defined in a shared module (definedIn, the route tests' define.ts) keeps every rule on its file, which must
 * also import that module, and the title must be in the module; without definedIn the title must be in the file.
 */
function evidenceProblems(source: EvidenceSource, files: Files): string[] {
  if (source.kind !== 'database_test' && source.kind !== 'unit_test' && source.kind !== 'e2e_test' && source.kind !== 'cdk_assertion') return [];
  if (!files.exists(source.file)) return [source.file];
  const problems: string[] = [];
  if (!source.file.endsWith(SUFFIX[source.kind])) problems.push(`${source.file} is not a ${SUFFIX[source.kind]} file`);
  if (source.kind === 'unit_test' && source.file.endsWith('.db.test.ts')) problems.push(`${source.file} is a database test`);
  if (source.kind === 'cdk_assertion' && !source.file.startsWith('infra/test/')) problems.push(`${source.file} is outside infra/test`);
  if (source.definedIn === undefined) {
    if (!hasTestTitled(files.read(source.file), source.test)) problems.push(`${source.file} :: ${source.test}`);
    return problems;
  }
  if (!files.exists(source.definedIn)) return [...problems, source.definedIn];
  if (!relativeImports(source.file, files.read(source.file), files).includes(source.definedIn)) problems.push(`${source.file} does not import ${source.definedIn}`);
  if (!hasTestTitled(files.read(source.definedIn), source.test)) problems.push(`${source.definedIn} :: ${source.test}`);
  return problems;
}

/** Whether the text holds the step as a whole: no word character before it, and none, nor a colon, after it. */
function namesWhole(text: string, step: string): boolean {
  for (let at = text.indexOf(step); at !== -1; at = text.indexOf(step, at + 1)) {
    if (!/[\w]/.test(text[at - 1] ?? '') && !/[\w:]/.test(text[at + step.length] ?? '')) return true;
  }
  return false;
}

describe('the SOC 2 Type I evidence checklist', () => {
  it('maps every control of PRD 16’s table, in its order and in its words', () => {
    const rows = prdControlRows();
    expect(rows.length).toBe(17);
    expect(CONTROLS.map((control) => control.name)).toEqual(rows.map((row) => row.name));
    for (const [index, control] of CONTROLS.entries()) {
      expect(control.implementation).toBe(rows[index]?.implementation);
      expect(control.planEvidence).toBe(rows[index]?.evidence);
    }
    expect(new Set(CONTROLS.map((control) => control.id)).size).toBe(CONTROLS.length);
  });

  it('gives every control a criterion, a safeguard and evidence', () => {
    for (const control of CONTROLS) {
      expect(control.soc2.length, control.id).toBeGreaterThan(0);
      expect(control.hipaa.length, control.id).toBeGreaterThan(0);
      for (const criterion of control.soc2) {
        expect(criterion).toMatch(/^(CC[1-9]|A1|C1|PI1|P[1-8])\.\d+$/);
      }
      for (const section of control.hipaa) {
        expect(section).toMatch(/^164\.3(08|10|12|14|16)\([a-z]\)(\([0-9]+\))?(\((i|ii|iii|iv)\))?(\([A-Z]\))?$/);
      }
      expect(control.evidence.length, control.id).toBeGreaterThan(0);
    }
  });

  it('names only tests that exist, with those titles', () => {
    const missing = CONTROLS.flatMap((control) => control.evidence.flatMap((source) => evidenceProblems(source, onDisk).map((problem) => `${control.id}: ${problem}`)));
    expect(missing).toEqual([]);
  });

  it('holds a test defined in a shared module to the file that imports it, and every rule on the file still to the file (definedIn)', () => {
    const files: Record<string, string> = {
      'apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts': "import { defineRouteTests } from './define';\n\ndefineRouteTests(0);\n",
      'apps/web/src/lib/routes/route-tests/route-tests.1.db.test.ts': "import { defineRouteTests } from './other';\n\ndefineRouteTests(1);\n",
      'apps/web/src/lib/routes/route-tests/define.ts': "export function defineRouteTests(file: number) {\n  describe('a route', () => {\n    it('refuses a user without MFA', () => {});\n  });\n}\n",
      'apps/web/src/lib/routes/route-tests/other.ts': 'export function defineRouteTests(file: number) {}\n',
      'apps/web/src/lib/routes/route-tests/define-elsewhere.ts': "export function defineRouteTests(file: number) {\n  it('refuses a user without MFA', () => {});\n}\n",
    };
    const memory = { exists: (file: string) => file in files, read: (file: string) => files[file] ?? '' };
    const source = (file: string, definedIn: string | undefined, test = 'refuses a user without MFA'): EvidenceSource =>
      definedIn === undefined ? { kind: 'database_test', file, test } : { kind: 'database_test', file, definedIn, test };
    // Imported, and the title is in the module that defines it.
    expect(evidenceProblems(source('apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts', 'apps/web/src/lib/routes/route-tests/define.ts'), memory)).toEqual([]);
    // A module the file does not import, though it holds the title.
    expect(evidenceProblems(source('apps/web/src/lib/routes/route-tests/route-tests.1.db.test.ts', 'apps/web/src/lib/routes/route-tests/define-elsewhere.ts'), memory)).toEqual([
      'apps/web/src/lib/routes/route-tests/route-tests.1.db.test.ts does not import apps/web/src/lib/routes/route-tests/define-elsewhere.ts',
    ]);
    // Imported, but the title is not there.
    expect(evidenceProblems(source('apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts', 'apps/web/src/lib/routes/route-tests/define.ts', 'refuses a session idle for more than 30 minutes'), memory)).toEqual([
      'apps/web/src/lib/routes/route-tests/define.ts :: refuses a session idle for more than 30 minutes',
    ]);
    // A module that does not exist.
    expect(evidenceProblems(source('apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts', 'apps/web/src/lib/routes/route-tests/missing.ts'), memory)).toEqual(['apps/web/src/lib/routes/route-tests/missing.ts']);
    // Without definedIn, the title must be in the file itself, as before: an imported module's does not count.
    expect(evidenceProblems(source('apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts', undefined), memory)).toEqual([
      'apps/web/src/lib/routes/route-tests/route-tests.0.db.test.ts :: refuses a user without MFA',
    ]);
    // The file's own rules hold with definedIn too: it exists and is a database test file.
    expect(evidenceProblems(source('apps/web/src/lib/routes/route-tests/define.ts', 'apps/web/src/lib/routes/route-tests/define.ts'), memory)).toEqual([
      'apps/web/src/lib/routes/route-tests/define.ts is not a .db.test.ts file',
      'apps/web/src/lib/routes/route-tests/define.ts does not import apps/web/src/lib/routes/route-tests/define.ts',
    ]);
    expect(evidenceProblems(source('apps/web/src/lib/routes/route-tests/route-tests.2.db.test.ts', 'apps/web/src/lib/routes/route-tests/define.ts'), memory)).toEqual(['apps/web/src/lib/routes/route-tests/route-tests.2.db.test.ts']);
  });

  it('finds a CI step only as a whole command, so a shorter command inside a longer one is not evidence', () => {
    expect(namesWhole('      - run: pnpm lint:logs\n', 'pnpm lint')).toBe(false);
    expect(namesWhole('      - run: pnpm lint:logs\n      - run: pnpm lint\n', 'pnpm lint')).toBe(true);
    expect(namesWhole('run: pnpm db:migrate && pnpm test:db --shard=1/4', 'pnpm db:migrate && pnpm test:db')).toBe(true);
    expect(namesWhole('uses: aquasecurity/trivy-action@ed142fd', 'aquasecurity/trivy-action')).toBe(true);
    expect(namesWhole('run: xpnpm audit --prod', 'pnpm audit --prod')).toBe(false);
  });

  it('names only CI steps that are in their workflows, runbooks that exist and policies that are written', () => {
    for (const control of CONTROLS) {
      for (const source of control.evidence) {
        if (source.kind === 'ci_job') {
          expect(read(source.workflow), `${control.id}: ${source.step}`).toContain(source.step);
          // As a whole command, name or action: "pnpm lint" is not found inside "pnpm lint:logs".
          expect(namesWhole(read(source.workflow), source.step), `${control.id}: ${source.step}`).toBe(true);
        }
        if (source.kind === 'runbook') {
          expect(existsSync(path.join(ROOT, source.file)), source.file).toBe(true);
        }
        if (source.kind === 'policy') {
          expect(existsSync(path.join(ROOT, policyById(source.policy).file)), source.policy).toBe(true);
        }
      }
    }
  });

  it('keeps every policy as a versioned draft for the security official, with the version the checklist approves', () => {
    for (const policy of POLICIES) {
      const text = read(policy.file);
      const front = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1] ?? '';
      expect(front, policy.id).toContain(`policy: ${policy.id}`);
      expect(front, policy.id).toContain(`version: ${policy.version}`);
      expect(front, policy.id).toMatch(/status: draft/);
      expect(text, policy.id).toMatch(/security official/i);
      expect(text, policy.id).toContain(`# ${policy.title} policy`);
    }
    // Every policy a control names is one the program keeps, and every policy kept evidences a control.
    const named = new Set(CONTROLS.flatMap((control) => control.evidence.flatMap((source) => (source.kind === 'policy' ? [source.policy] : []))));
    expect([...named].sort()).toEqual(POLICIES.map((policy) => policy.id).sort());
  });

  it('says plainly which evidence a later milestone builds', () => {
    const later = CONTROLS.flatMap((control) => control.evidence.flatMap((source) => (source.kind === 'not_built' ? [`${control.id}: ${String(source.milestone)}`] : [])));
    expect(later).toEqual(['encryption: 12', 'audit_log: 12']);
    expect(PROGRAM_EVIDENCE.map((source) => source.record)).toEqual(['risk_analysis', 'security_official']);
  });
});
