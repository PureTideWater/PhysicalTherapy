import { describe, expect, it } from 'vitest';

import type { Runtime } from './canary/verdict';
import { checkRuntime } from './runtime';
import { TEST_PINS } from './test-support';

/**
 * The changes job's own runtime check (tools/stryker/runtime.ts; docs/adr/0066, Part 7; test matrix CI-29): before it
 * decides anything, the job fails unless its Node, Unicode, ICU and pnpm are the pinned ones, so a `node` bin a
 * dependency links, or another pnpm, fails the pull request's own mutation check. Each case gives the runtime and the
 * pins, never this process's: CI's unit job runs a floating Node 24.
 */

describe('the changes job’s runtime check', () => {
  it('names each of a Node, Unicode, ICU and pnpm that differs from the pins, passes the pinned runtime with Node’s v either way, and exits 1 on any difference', () => {
    const pinned: Runtime = { node: `v${TEST_PINS.node}`, unicode: TEST_PINS.unicode, icu: TEST_PINS.icu, pnpm: TEST_PINS.pnpm };
    const described = 'runtime: Node v24.22.0 (Unicode 17.0, ICU 78.3) and pnpm 10.34.8';
    const passed = "runtime: the pinned one (Node, Unicode and ICU as tools/stryker/unicode.json's checkedOn, pnpm as the root package.json's packageManager)";
    expect(checkRuntime(pinned, TEST_PINS)).toEqual({ lines: [described, passed], status: 0 });
    expect(checkRuntime({ ...pinned, node: TEST_PINS.node }, TEST_PINS)).toEqual({ lines: [described, passed], status: 0 });
    expect(checkRuntime(pinned, { ...TEST_PINS, node: `v${TEST_PINS.node}` }).status).toBe(0);

    const node = "::error::The runtime is not the pinned one: Node v24.21.0, not the pinned v24.22.0 (tools/stryker/unicode.json's checkedOn.node)";
    const unicode = "::error::The runtime is not the pinned one: Unicode 16.0, not the pinned 17.0 (tools/stryker/unicode.json's checkedOn.unicode)";
    const icu = "::error::The runtime is not the pinned one: ICU 77.1, not the pinned 78.3 (tools/stryker/unicode.json's checkedOn.icu)";
    const pnpm = "::error::The runtime is not the pinned one: pnpm 10.34.9, not the pinned 10.34.8 (the root package.json's packageManager)";
    for (const [overrides, line] of [
      [{ node: 'v24.21.0' }, node],
      [{ unicode: '16.0' }, unicode],
      [{ icu: '77.1' }, icu],
      [{ pnpm: '10.34.9' }, pnpm],
    ] as const) {
      const runtime = { ...pinned, ...overrides };
      expect(checkRuntime(runtime, TEST_PINS), line).toEqual({ lines: [`runtime: Node ${runtime.node} (Unicode ${runtime.unicode}, ICU ${runtime.icu}) and pnpm ${runtime.pnpm}`, line], status: 1 });
    }
    // Every leg at once, each named; a pnpm the user agent does not name (a step not run by pnpm) is no pnpm.
    expect(checkRuntime({ node: 'v24.21.0', unicode: '16.0', icu: '77.1', pnpm: '10.34.9' }, TEST_PINS).lines.slice(1)).toEqual([node, unicode, icu, pnpm]);
    expect(checkRuntime({ ...pinned, pnpm: '' }, TEST_PINS)).toEqual({
      lines: ['runtime: Node v24.22.0 (Unicode 17.0, ICU 78.3) and pnpm (none)', "::error::The runtime is not the pinned one: pnpm (none), not the pinned 10.34.8 (the root package.json's packageManager)"],
      status: 1,
    });
  });

  // The review of #96 (N2): the user agent is one pnpm leg, and a setting can write it; `pnpm --version` is the other.
  it('holds the pnpm --version the step gives to the pin as a second leg, naming it, and an empty one is no pnpm', () => {
    const pinned: Runtime = { node: `v${TEST_PINS.node}`, unicode: TEST_PINS.unicode, icu: TEST_PINS.icu, pnpm: TEST_PINS.pnpm };
    const described = 'runtime: Node v24.22.0 (Unicode 17.0, ICU 78.3) and pnpm 10.34.8';
    expect(checkRuntime(pinned, TEST_PINS, { pnpmVersion: '10.34.8\n' })).toEqual({
      lines: [described, 'runtime: pnpm --version prints 10.34.8', "runtime: the pinned one (Node, Unicode and ICU as tools/stryker/unicode.json's checkedOn, pnpm as the root package.json's packageManager, by its user agent and by pnpm --version)"],
      status: 0,
    });
    // A user agent a setting wrote to the pin does not pass for a pnpm that prints another version.
    expect(checkRuntime(pinned, TEST_PINS, { pnpmVersion: '10.35.0' })).toEqual({
      lines: [described, 'runtime: pnpm --version prints 10.35.0', "::error::The runtime is not the pinned one: pnpm --version prints 10.35.0, not the pinned 10.34.8 (the root package.json's packageManager)"],
      status: 1,
    });
    expect(checkRuntime(pinned, TEST_PINS, { pnpmVersion: '' }).lines.at(-1)).toBe("::error::The runtime is not the pinned one: pnpm --version prints (none), not the pinned 10.34.8 (the root package.json's packageManager)");
    // Both legs differing are both named.
    expect(checkRuntime({ ...pinned, pnpm: '10.34.9' }, TEST_PINS, { pnpmVersion: '10.35.0' }).lines.filter((line) => line.startsWith('::error::'))).toHaveLength(2);
  });

  // The review of #96 (N3): the gate job checks its own runtime and its checkout, as the changes job does.
  it('holds the commit checked out to the commit tested, naming both, and fails a tested commit that is not 40 hex', () => {
    const pinned: Runtime = { node: `v${TEST_PINS.node}`, unicode: TEST_PINS.unicode, icu: TEST_PINS.icu, pnpm: TEST_PINS.pnpm };
    const tested = 'a'.repeat(40);
    const other = 'b'.repeat(40);
    expect(checkRuntime(pinned, TEST_PINS, { pnpmVersion: '10.34.8', commit: { tested, checkedOut: tested } })).toEqual({
      lines: [
        'runtime: Node v24.22.0 (Unicode 17.0, ICU 78.3) and pnpm 10.34.8',
        'runtime: pnpm --version prints 10.34.8',
        `checkout: commit ${tested}`,
        "runtime: the pinned one (Node, Unicode and ICU as tools/stryker/unicode.json's checkedOn, pnpm as the root package.json's packageManager, by its user agent and by pnpm --version), at the commit tested",
      ],
      status: 0,
    });
    for (const [why, commit, line] of [
      ['another commit', { tested, checkedOut: other }, `::error::The checkout is not the commit tested: the checkout is commit ${other}, not ${tested}, the commit tested (GITHUB_SHA)`],
      ['no commit read', { tested, checkedOut: '' }, `::error::The checkout is not the commit tested: the checkout is commit (none), not ${tested}, the commit tested (GITHUB_SHA)`],
      ['an empty GITHUB_SHA', { tested: '', checkedOut: '' }, '::error::The checkout is not the commit tested: the commit tested, "", is not a full commit (GITHUB_SHA)'],
      ['a short GITHUB_SHA', { tested: tested.slice(0, 12), checkedOut: tested.slice(0, 12) }, `::error::The checkout is not the commit tested: the commit tested, "${tested.slice(0, 12)}", is not a full commit (GITHUB_SHA)`],
    ] as const) {
      const result = checkRuntime(pinned, TEST_PINS, { commit });
      expect(result.status, why).toBe(1);
      expect(result.lines.at(-1), why).toBe(line);
    }
  });
});
