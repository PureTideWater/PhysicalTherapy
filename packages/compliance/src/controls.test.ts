import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { CONTROLS, PROGRAM_EVIDENCE } from './controls';
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
    const missing: string[] = [];
    for (const control of CONTROLS) {
      for (const source of control.evidence) {
        if (source.kind === 'database_test' || source.kind === 'unit_test' || source.kind === 'e2e_test' || source.kind === 'cdk_assertion') {
          if (!existsSync(path.join(ROOT, source.file))) {
            missing.push(`${control.id}: ${source.file}`);
          } else if (!hasTestTitled(read(source.file), source.test)) {
            missing.push(`${control.id}: ${source.file} :: ${source.test}`);
          }
          const suffix = { database_test: '.db.test.ts', unit_test: '.test.ts', e2e_test: '.spec.ts', cdk_assertion: '.test.ts' }[source.kind];
          expect(source.file.endsWith(suffix), source.file).toBe(true);
          if (source.kind === 'unit_test') {
            expect(source.file.endsWith('.db.test.ts'), source.file).toBe(false);
          }
          if (source.kind === 'cdk_assertion') {
            expect(source.file.startsWith('infra/test/'), source.file).toBe(true);
          }
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('names only CI steps that are in their workflows, runbooks that exist and policies that are written', () => {
    for (const control of CONTROLS) {
      for (const source of control.evidence) {
        if (source.kind === 'ci_job') {
          expect(read(source.workflow), `${control.id}: ${source.step}`).toContain(source.step);
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
