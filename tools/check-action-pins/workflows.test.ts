import { describe, expect, it } from 'vitest';

import { sha } from './fixtures';
import { actionUses, consistencyProblems, formProblems, parsePin, reusableWorkflowProblems, usesLines, versionsByRef } from './workflows';

/** The offline rules of the pin policy, (a) the form and (b) one commit and version per action (CI-11). */

const A = sha('a');
const B = sha('b');
const flow = (lines: string) => `name: fixture\non: push\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n${lines}`;

describe('the pin form, rule (a)', () => {
  it('accepts owner/repo[/path]@<40 hex> # vX.Y.Z, at a step and at a job', () => {
    const text = `${flow(`      - uses: octo/checkout@${A} # v7.0.1\n        with: { fetch-depth: 0 }\n      - uses: octo/cache/restore@${B} # v6.1.0\n`)}  call:\n    uses: octo/flows/.github/workflows/build.yml@${A} # v7.0.1\n`;
    expect(formProblems([{ file: 'ci.yml', text }])).toEqual([]);
    expect(parsePin(`octo/cache/restore@${B}`)).toEqual({ repo: 'octo/cache', path: 'restore', sha: B, action: 'octo/cache/restore' });
    expect(actionUses('ci.yml', text).map((use) => [use.job, use.step, use.uses, use.with])).toEqual([
      ['build', 0, `octo/checkout@${A}`, { 'fetch-depth': 0 }],
      ['build', 1, `octo/cache/restore@${B}`, {}],
      ['call', -1, `octo/flows/.github/workflows/build.yml@${A}`, {}],
    ]);
  });

  it('refuses a tag, a branch, a short SHA, a missing or partial version, a local action and an image', () => {
    const cases: [string, RegExp][] = [
      ['octo/checkout@v4', /octo\/checkout@v4 is not pinned to a full commit SHA/],
      ['octo/checkout@main', /is not pinned/],
      [`octo/checkout@${A.slice(0, 12)} # v7.0.1`, /is not pinned/],
      [`octo/checkout@${A.toUpperCase()} # v7.0.1`, /is not pinned/],
      [`octo/checkout@${A}`, /carries no comment, not its release version/],
      [`octo/checkout@${A} # v7`, /carries the comment "v7", not its release version/],
      [`octo/checkout@${A} # v7.0.1 pinned`, /carries the comment "v7.0.1 pinned"/],
      ['./.github/actions/setup', /is a local action or workflow/],
      ['docker://alpine:3.22', /runs an image directly/],
    ];
    for (const [ref, problem] of cases) {
      const problems = formProblems([{ file: 'ci.yml', text: flow(`      - uses: ${ref}\n`) }]);
      expect(problems, ref).toHaveLength(1);
      expect(problems[0], ref).toMatch(new RegExp(`^ci\\.yml:7: .*${problem.source}`));
    }
  });

  it('refuses a job that calls a reusable workflow of another repository, whose own pins and images nothing here reads (S7)', () => {
    const text = `${flow(`      - uses: octo/checkout@${A} # v7.0.1\n`)}  call:\n    uses: octo/flows/.github/workflows/build.yml@${A} # v7.0.1\n`;
    expect(reusableWorkflowProblems([{ file: 'ci.yml', text }])).toEqual([
      `ci.yml: the job call calls the reusable workflow octo/flows/.github/workflows/build.yml@${A}, whose own pins and images this check does not read; move its steps into a workflow here`,
    ]);
    // Steps that use actions are not reusable workflows; one of this repository is the form rule's, as a local reference.
    expect(reusableWorkflowProblems([{ file: 'ci.yml', text: flow(`      - uses: octo/checkout@${A} # v7.0.1\n`) }])).toEqual([]);
    const local = `${flow(`      - uses: octo/checkout@${A} # v7.0.1\n`)}  call:\n    uses: ./.github/workflows/build.yml\n`;
    expect(reusableWorkflowProblems([{ file: 'ci.yml', text: local }])).toEqual([]);
    expect(formProblems([{ file: 'ci.yml', text: local }])).toEqual(['ci.yml:9: ./.github/workflows/build.yml is a local action or workflow; the pin policy names every action by repository and commit']);
  });

  it('refuses an action the YAML names off its own uses: line, whose comment it cannot read', () => {
    const text = flow(`      - { uses: octo/checkout@${A}, with: { fetch-depth: 0 } } # v7.0.1\n`);
    expect(usesLines('ci.yml', text)).toEqual([]);
    expect(formProblems([{ file: 'ci.yml', text }])).toEqual([`ci.yml: octo/checkout@${A} is not on a \`uses:\` line of its own, so its version comment cannot be read`]);
  });
});

describe('one commit and one version per action, rule (b)', () => {
  it('holds every file’s pins of one repository, its sub-actions included, to one commit and one version', () => {
    const one = { file: 'a.yml', text: flow(`      - uses: octo/cache/restore@${A} # v6.1.0\n      - uses: octo/checkout@${B} # v7.0.1\n`) };
    expect(consistencyProblems([one, { file: 'b.yml', text: flow(`      - uses: octo/cache/save@${A} # v6.1.0\n`) }])).toEqual([]);
    expect(consistencyProblems([one, { file: 'b.yml', text: flow(`      - uses: octo/cache/save@${B} # v6.1.0\n`) }])).toEqual([`b.yml:7: octo/cache is pinned to ${B}, but to ${A} at a.yml:7; one commit per action`]);
    expect(consistencyProblems([one, { file: 'b.yml', text: flow(`      - uses: octo/checkout@${B} # v7.0.2\n`) }])).toEqual([`b.yml:7: octo/checkout@${B} is labelled v7.0.2, but v7.0.1 at a.yml:8; one version per commit`]);
    expect(versionsByRef([one])).toEqual(
      new Map([
        [`octo/cache/restore@${A}`, 'v6.1.0'],
        [`octo/checkout@${B}`, 'v7.0.1'],
      ]),
    );
  });
});
