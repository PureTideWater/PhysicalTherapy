import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import * as deployParameters from '../../infra/lib/deploy-parameters';
import {
  type AttestationReading,
  type CommandRunner,
  type LaunchInput,
  commandFailure,
  RELEASE_REPOSITORY,
  RELEASE_RUNNER,
  RELEASE_TAG,
  RELEASE_WORKFLOW,
  launchCheck,
  readManifest,
  registryImageId,
  reportSha256,
  repositoryOf,
  verifyReportAttestation,
} from './launch-check';
import { MIB, type CpuLayout, cpuLayout, cpuNeedsOf, productionLimits } from './limits';
import { type ExpectedLimits, type Measurements, expectedContainers, report, verdict } from './report';
import { type SyntheticCertificate, attestationOutput, releaseSigner } from './test-support/attestation';
import {
  ADVISORY,
  ENFORCED,
  OPEN,
  type S4Times,
  SYNTHETIC_COMMIT,
  SYNTHETIC_RUN,
  SYNTHETIC_TAG,
  applied,
  expected,
  measured,
  onOwnCpus,
  scenario,
  scenarios,
  upload,
  withS1,
  withScenario,
  withoutConsumer,
} from './test-support/measurements';

/**
 * Decision 13's launch check (docs/adr/0062; the design's §5.4; test matrix SCR-20), on synthetic reports: production's
 * screening opens only for the deployed tag's binding report that passes with time enforced, measured by release.yml's
 * run on that tag and attested by it (GitHub's artifact attestation, verified by gh against the bundle the release kept;
 * the verification of PR 6b-3's capacity changes), on both image IDs, every size production declares and the layout of
 * the release's runner (the free 4-CPU runner's shared CPUs); an advisory report (a pull request's, whose time only
 * warns: the founder's third ruling of 2026-10-23, "Free: time advisory") and anything else names its reason and gives
 * no launch value.
 */

const TAG = SYNTHETIC_TAG;
const COMMIT = SYNTHETIC_COMMIT;
const WEB = `sha256:${'a'.repeat(64)}`;
const WORKER = `sha256:${'b'.repeat(64)}`;
const PRODUCTION = productionLimits();
const RELEASE_REF = `PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/tags/${TAG}`;

/** The note every launch value carries: the release's run that measured the report and attested it. */
const PROVENANCE = `provenance: measured and attested by ${RELEASE_REF} in run ${SYNTHETIC_RUN.runId} (measured in attempt 1, attested in attempt 1): https://github.com/PureTideWater/PhysicalTherapy/actions/runs/${SYNTHETIC_RUN.runId}`;

/** A report's bytes as the harness writes them. */
function kept(measurements: Measurements = measured(), rule = ENFORCED): string {
  return `${JSON.stringify(report(measurements, rule), null, 2)}\n`;
}

/** gh's verification of the release's attestation of exactly these bytes. */
function attested(text: string, overrides: Parameters<typeof attestationOutput>[1] = {}): AttestationReading {
  return { kind: 'verified', output: attestationOutput(text, overrides) };
}

/** The check's input: by default the release's passing report, attested by release.yml on the tag, of the images deployed. */
function input(overrides: Partial<LaunchInput> = {}): LaunchInput {
  const reportText = overrides.reportText ?? kept();
  return { reportText, tag: TAG, tagCommit: COMMIT, images: { web: WEB, worker: WORKER }, production: PRODUCTION, attestation: attested(reportText), ...overrides };
}

function reasons(overrides: Partial<LaunchInput>): readonly string[] {
  const result = launchCheck(input(overrides));
  expect(result.ok).toBe(false);
  return result.ok ? [] : result.reasons;
}

describe('the launch check', () => {
  it('passes the tag’s passing report with time enforced, on both image IDs, and prints the tag and the report’s SHA-256', () => {
    const text = kept();
    const result = launchCheck(input({ reportText: text }));
    expect(result).toEqual({ ok: true, value: `${TAG}:${reportSha256(text)}`, notes: [PROVENANCE] });
    // The value the CDK app sets is one the stack and the web accept (infra/lib/deploy-parameters.ts).
    const pattern = (deployParameters as Readonly<Record<string, unknown>>).SCREENING_LAUNCH_PATTERN;
    expect(typeof pattern).toBe('string');
    expect(result.ok && new RegExp(String(pattern)).test(result.value)).toBe(true);
    expect(reportSha256(text)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fails a failing report', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) });
    expect(reasons({ reportText: kept(slow) })).toEqual([
      'verdict: fail with time enforced; launch needs a pass with time enforced',
      'verdict read again: fail with time enforced (time: S1-1 48.1 s, fail (allowance: above 48 s on the runner))',
    ]);
  });

  it('fails a report whose time was open, however fast', () => {
    expect(reasons({ reportText: kept(measured(), OPEN) })).toEqual(['verdict: pass with time open, PR 6b; launch needs a pass with time enforced']);
  });

  it('reads the measurements again rather than trust a recorded pass', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 60_100 })])) });
    const edited = JSON.parse(kept(slow)) as { verdict: unknown };
    edited.verdict = { pass: true, time: 'enforced', reasons: [], timeWarnings: [] };
    expect(reasons({ reportText: JSON.stringify(edited) })).toEqual(['verdict read again: fail with time enforced (time: S1-1 60.1 s, fail (promise broken: above 60 s))']);
  });

  it('fails a report of another commit than the tag’s, whose attestation names that other commit too', () => {
    expect(reasons({ tagCommit: 'e'.repeat(40) })).toEqual([
      `attestation: source commit ${COMMIT}, not ${'e'.repeat(40)} (${TAG}'s commit)`,
      `commit: the report measured ${COMMIT}, and ${TAG} is ${'e'.repeat(40)}`,
    ]);
    expect(reasons({ tagCommit: 'no tag v1.4.0 in this checkout (git fetch --tags)' })).toEqual([
      `attestation: source commit ${COMMIT}, not no tag v1.4.0 in this checkout (git fetch --tags) (${TAG}'s commit)`,
      'commit: the tag’s commit no tag v1.4.0 in this checkout (git fetch --tags) is not a full commit hash',
    ]);
  });

  it('fails a worker image other than the one measured', () => {
    const other = `sha256:${'c'.repeat(64)}`;
    expect(reasons({ images: { web: WEB, worker: other } })).toEqual([`worker image: the report measured ${WORKER}, and the image being deployed is ${other}`]);
  });

  it('fails a web image other than the one measured (a rebuild, or the image built for another origin)', () => {
    const other = `sha256:${'d'.repeat(64)}`;
    expect(reasons({ images: { web: other, worker: WORKER } })).toEqual([`web image: the report measured ${WEB}, and the image being deployed is ${other}`]);
    expect(reasons({ images: { web: 'not found: web-production:v1.4.0', worker: WORKER } })).toEqual(['web image: no config digest for the image being deployed: not found: web-production:v1.4.0']);
  });

  it('fails a consumer measured at another size than production declares', () => {
    const smaller = measured({ consumer: { tasks: 1, cpus: 1, memoryMiB: 2048, concurrency: 2 } });
    const result = reasons({ reportText: kept(smaller) });
    expect(result).toContain('consumer: the report measured 1 × 1 vCPU, 2048 MiB, 2 at once, and production declares 1 × 2 vCPU, 4096 MiB, 3 at once');
    expect(reasons({ production: productionLimits(withoutConsumer()) })).toContain('consumer: environments.ts declares no screening consumer for production');
  });

  it('fails a report that measured the web at another size than production declares (a report from before the founder’s ruling of 2026-10-22)', () => {
    const quarter = applied({
      containers: applied().containers.map((item) => (item.name === 'web' ? { ...item, nanoCpus: 250_000_000, memoryBytes: 512 * MIB, memorySwapBytes: 512 * MIB } : item)),
    });
    const older = measured({ expected: { ...expected, web: { cpus: 0.25, memoryMiB: 512 } }, applied: quarter });
    expect(reasons({ reportText: kept(older) })).toEqual(['web: the report measured 0.25 vCPU and 512 MiB, and production declares 0.5 vCPU and 1024 MiB']);
  });

  it('fails a process-runtime report, whose Postgres was not limited', () => {
    expect(reasons({ reportText: kept(measured({ runtime: 'process', images: { web: null, worker: null } })) })).toEqual([
      'runtime: process, not docker (only the Docker runtime measures under production’s limits)',
      `web image: the report measured null, and the image being deployed is ${WEB}`,
      `worker image: the report measured null, and the image being deployed is ${WORKER}`,
    ]);
  });

  it('fails a malformed tag, an older format, and a file that is not a complete report', () => {
    expect(RELEASE_TAG.test(TAG)).toBe(true);
    expect(reasons({ tag: 'latest' })).toEqual([
      'tag: latest is not a release tag (v followed by letters, digits, dots and hyphens)',
      `workflow: the report was measured by ${RELEASE_REF}; decision 13 opens production only on the report of PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/tags/latest`,
      `attestation: signed by ${releaseSigner()}, not ${releaseSigner('latest')}`,
      `attestation: build signer ${releaseSigner()}, not ${releaseSigner('latest')}`,
      `attestation: source ref refs/tags/${TAG}, not refs/tags/latest`,
    ]);
    for (const format of ['tp-screening-capacity/3', 'tp-screening-capacity/4', 'tp-screening-capacity/5', 'tp-screening-capacity/6', 'tp-screening-capacity/7']) {
      // A report in a format before S4 ran three times, before the time mode was recorded (/5 and /6: the founder's
      // rulings of 2026-10-23), or before the run that measured it was recorded (/7: the verification of PR 6b-3's
      // capacity changes), is refused as any other.
      const older = { ...(JSON.parse(kept()) as Record<string, unknown>), format };
      expect(reasons({ reportText: JSON.stringify(older) })).toEqual([`report: format ${format}, not tp-screening-capacity/8`]);
    }
    expect(reasons({ reportText: 'not json' })).toEqual(['report: not JSON']);
    expect(reasons({ reportText: JSON.stringify({ format: 'tp-screening-capacity/8' }) })).toEqual(['report: not a complete capacity report']);
  });

  const ADVISORY_REASON =
    "time mode: advisory, not binding: decision 13 opens production only on a release's binding capacity run, where time fails the run, never on an advisory one, where time only warns (the founder's ruling of 2026-10-23, time advisory)";
  const SLOW_S1 = 'time: S1-1 48.1 s, fail (allowance: above 48 s on the runner)';

  it('refuses an advisory report that passes, naming the time mode (the founder’s third ruling of 2026-10-23, time advisory)', () => {
    expect(reasons({ reportText: kept(measured(), ADVISORY) })).toEqual([ADVISORY_REASON, 'verdict: pass with time advisory; launch needs a pass with time enforced']);
  });

  it('refuses an advisory report whose job passed on time warnings, reading its time again as binding', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) });
    expect(report(slow, ADVISORY).verdict.pass).toBe(true);
    expect(reasons({ reportText: kept(slow, ADVISORY) })).toEqual([
      ADVISORY_REASON,
      'verdict: pass with time advisory; launch needs a pass with time enforced',
      `verdict read again: fail with time enforced (${SLOW_S1})`,
    ]);
    // Edited to read as binding, its time is still read again as binding from its measurements.
    const edited = JSON.parse(kept(slow, ADVISORY)) as { timeMode: unknown; verdict: unknown };
    edited.timeMode = 'binding';
    edited.verdict = { pass: true, time: 'enforced', reasons: [], timeWarnings: [] };
    expect(reasons({ reportText: JSON.stringify(edited) })).toEqual([`verdict read again: fail with time enforced (${SLOW_S1})`]);
    // A failing advisory report: refused, the mode named whatever the verdict.
    const failing = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100, pendingRows: 2 })])) });
    expect(reasons({ reportText: kept(failing, ADVISORY) })).toEqual([
      ADVISORY_REASON,
      'verdict: fail with time advisory; launch needs a pass with time enforced',
      `verdict read again: fail with time enforced (rows still pending: S1-1 (2); ${SLOW_S1})`,
    ]);
  });

  it('refuses a report that names no time mode, or one it does not know', () => {
    for (const timeMode of [undefined, 'enforced', 'Binding']) {
      const edited = JSON.parse(kept()) as Record<string, unknown>;
      edited.timeMode = timeMode;
      expect(reasons({ reportText: JSON.stringify(edited) })[0]).toBe(
        `time mode: ${String(timeMode)}, not binding: decision 13 opens production only on a release's binding capacity run, where time fails the run, never on an advisory one, where time only warns (the founder's ruling of 2026-10-23, time advisory)`,
      );
    }
  });

  /** The layout release.yml's runner gives production's sizes, as the refusals name it. */
  const SHARED_TEXT =
    'shared CPUs: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 3, the platform on 3 and the harness with Chromium on 0-1 (Postgres and the harness share CPUs 0-1; the screening consumer, the web and the platform share CPU 3)';
  const LAYOUT_REFUSED = (measuredText: string) =>
    `layout: the report measured ${measuredText}, and decision 13 opens production only on the layout release.yml's runner (ubuntu-24.04, 4 CPUs) gives production's sizes: ${SHARED_TEXT}`;
  const OWN_TEXT = 'CPUs of their own: Postgres on CPUs 0-1, the screening consumer on 2-3, the web on 4, the platform on 5 and the harness with Chromium on 6-7';

  it('accepts a binding report that passes on the free 4-CPU runner’s shared layout, the one release.yml’s runner gives, and refuses CPUs of their own until a release measures on 8 CPUs', () => {
    expect(RELEASE_RUNNER).toEqual({ label: 'ubuntu-24.04', cpus: 4 });
    const free = kept();
    expect(JSON.parse(free)).toMatchObject({ timeMode: 'binding', runner: { cpus: 4 }, expected: { layout: { kind: 'shared', postgres: '0-1', consumer: '2-3', web: '3', platform: '3', harness: '0-1' } } });
    expect(launchCheck(input({ reportText: free }))).toEqual({ ok: true, value: `${TAG}:${reportSha256(free)}`, notes: [PROVENANCE] });
    // An 8-CPU runner's report passes its verdict, attested or not: the release does not measure there, so it is refused.
    const own = onOwnCpus();
    expect(report(own, ENFORCED).verdict.pass).toBe(true);
    expect(JSON.parse(kept(own))).toMatchObject({ runner: { cpus: 8 }, expected: { layout: { kind: 'own', web: '4', platform: '5', harness: '6-7' } } });
    expect(reasons({ reportText: kept(own) })).toEqual([LAYOUT_REFUSED(OWN_TEXT)]);
  });

  it('refuses a binding report failing on time, on either layout', () => {
    const slow = { scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) };
    const failing = ['verdict: fail with time enforced; launch needs a pass with time enforced', `verdict read again: fail with time enforced (${SLOW_S1})`];
    expect(reasons({ reportText: kept(measured(slow)) })).toEqual(failing);
    expect(reasons({ reportText: kept(onOwnCpus(slow)) })).toEqual([...failing, LAYOUT_REFUSED(OWN_TEXT)]);
  });

  it('refuses a layout other than the release runner’s', () => {
    // CPUs of their own for a consumer larger than production declares: the verdict passes it on ten CPUs; the launch
    // check does not.
    const moved = { kind: 'own' as const, postgres: '0-1', consumer: '2-5', web: '6', platform: '7', harness: '8-9' };
    const cpusetOf: Readonly<Record<string, string>> = { web: moved.web, platform: moved.platform, 'screening-1': moved.consumer, postgres: moved.postgres };
    const ten = measured({
      runner: { ...measured().runner, cpus: 10, memoryMiB: 40_000 },
      expected: { ...expected, screening: { cpus: 4, memoryMiB: 4096 }, layout: moved },
      applied: applied({ containers: applied().containers.map((item) => ({ ...item, cpuset: cpusetOf[item.name] ?? item.cpuset, ...(item.name === 'screening-1' ? { nanoCpus: 4e9 } : {}) })) }),
      harnessAffinity: moved.harness,
    });
    expect(report(ten, ENFORCED).verdict.pass).toBe(true);
    expect(reasons({ reportText: kept(ten) })).toEqual([
      'screening consumer: the report measured each task at 4 vCPU and 4096 MiB, and production declares 2 vCPU and 4096 MiB',
      LAYOUT_REFUSED('CPUs of their own: Postgres on CPUs 0-1, the screening consumer on 2-5, the web on 6, the platform on 7 and the harness with Chromium on 8-9'),
    ]);
  });

  /** S4's runs on CI, the same code (19aa09c's and 54ec890's), with runs between, near and above the line. */
  const FAST: S4Times = { large: [38_300, 37_600, 35_300], small: 26_000 };
  const SLOW: S4Times = { large: [51_400, 51_400, 45_200], small: 32_300 };
  const BETWEEN: S4Times = { large: [42_000, 41_500, 40_100], small: 29_000 };
  const NEAR: S4Times = { large: [45_200, 44_100, 43_000], small: 30_000 };
  const OVER: S4Times = { large: [48_100, 47_000, 46_500], small: 31_000 };

  it('applies the founder’s median of three to S4 (2026-10-23): only the slowest run above 48 s passes, the middle run above it fails', () => {
    const text = kept(measured({ scenarios: scenarios([FAST, SLOW, BETWEEN]) }));
    expect(launchCheck(input({ reportText: text }))).toEqual({ ok: true, value: `${TAG}:${reportSha256(text)}`, notes: [PROVENANCE] });
    expect(reasons({ reportText: kept(measured({ scenarios: scenarios([SLOW, OVER, FAST]) })) })).toEqual([
      'verdict: fail with time enforced; launch needs a pass with time enforced',
      "verdict read again: fail with time enforced (time: S4#2 S4-1 48.1 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner))",
    ]);
  });

  it('reads the middle run again from the measurements rather than trust the one recorded', () => {
    const edited = JSON.parse(kept(measured({ scenarios: scenarios([FAST, SLOW, NEAR]) }))) as { repeated: { middle: string } };
    edited.repeated.middle = 'S4#1';
    expect(reasons({ reportText: JSON.stringify(edited) })).toEqual(["middle run: the report names S4#1, and its measurements make S4#3 the middle of S4's three runs"]);
    const over = JSON.parse(kept(measured({ scenarios: scenarios([SLOW, OVER, FAST]) }))) as { verdict: unknown };
    over.verdict = { pass: true, time: 'enforced', reasons: [], timeWarnings: [] };
    expect(reasons({ reportText: JSON.stringify(over) })).toEqual(["verdict read again: fail with time enforced (time: S4#2 S4-1 48.1 s (the middle of S4's three runs), fail (allowance: above 48 s on the runner))"]);
  });

  it('notes the sizing question from the middle run’s worst time, read from the measurements', () => {
    const result = launchCheck(input({ reportText: kept(measured({ scenarios: scenarios([FAST, SLOW, NEAR]) })) }));
    expect(result.ok && result.notes).toEqual([PROVENANCE, 'sizing: the worst time, S4#3 S4-1’s 45.2 s (the middle of S4’s three runs), is above 44 s (open item O9: the founder’s sizing question)']);
    // A recorded question is not taken on trust either way: the note follows the measurements.
    const edited = JSON.parse(kept(measured({ scenarios: scenarios([FAST, SLOW, BETWEEN]) }))) as { sizing: unknown };
    edited.sizing = { worstUpload: 'S4#2 S4-1', worstMs: 51_400, question: true };
    const reread = launchCheck(input({ reportText: JSON.stringify(edited) }));
    expect(reread.ok && reread.notes).toEqual([PROVENANCE]);
  });

  it('passes a worst time above 44 s with a note of the founder’s sizing question, which the merge settles, not the launch', () => {
    const near = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 45_200 })])) });
    const result = launchCheck(input({ reportText: kept(near) }));
    expect(result.ok && result.notes).toEqual([PROVENANCE, 'sizing: the worst time, S1-1’s 45.2 s, is above 44 s (open item O9: the founder’s sizing question)']);
  });
});

/** A report forged to agree with itself: the limits applied, the layout and the harness's CPUs all follow its expected limits. */
function consistent(change: Partial<ExpectedLimits>, overrides: Partial<Measurements> = {}): Measurements {
  const sizes = { ...expected, ...change };
  const layout: CpuLayout = cpuLayout(
    cpuNeedsOf({ databaseVcpus: sizes.postgres.cpus, web: sizes.web, platform: sizes.platform, screening: sizes.screening, screeningTasks: sizes.screeningTasks }),
    measured().runner.cpus,
  );
  const forged: ExpectedLimits = { ...sizes, layout, postgres: { ...sizes.postgres, ...('postgres' in change ? {} : { cpuset: layout.postgres }) } };
  return measured({
    expected: forged,
    applied: applied({
      containers: expectedContainers(forged).map((item) => ({ name: item.name, nanoCpus: Math.round(item.cpus * 1e9), memoryBytes: item.memoryMiB * MIB, memorySwapBytes: item.memoryMiB * MIB, cpuset: item.cpuset })),
      ioMax: { riops: forged.storage.iops, wiops: forged.storage.iops, rbps: forged.storage.bytesPerSecond, wbps: forged.storage.bytesPerSecond },
    }),
    harnessAffinity: layout.harness,
    ...overrides,
  });
}

describe('the report’s provenance (the verification of PR 6b-3’s capacity changes): only release.yml’s run on the tag, attested by it, opens production', () => {
  it('names the release’s repository, its workflow and its runner as the check holds them', () => {
    expect(RELEASE_REPOSITORY).toBe('PureTideWater/PhysicalTherapy');
    expect(RELEASE_WORKFLOW).toBe('.github/workflows/release.yml');
  });

  it('accepts the report release.yml measured on the tag and attested, naming the run and the attempts in its note', () => {
    const text = kept();
    expect(JSON.parse(text)).toMatchObject({ workflow: { ref: RELEASE_REF, runId: SYNTHETIC_RUN.runId, runAttempt: '1' } });
    expect(launchCheck(input({ reportText: text, attestation: attested(text) }))).toEqual({ ok: true, value: `${TAG}:${reportSha256(text)}`, notes: [PROVENANCE] });
    // A re-run's report: measured and attested in the run's second attempt, which the note names.
    const rerun = kept(measured({ workflow: { ...SYNTHETIC_RUN, runAttempt: '2' } }));
    const second = launchCheck(input({ reportText: rerun, attestation: attested(rerun, { certificate: { runInvocationURI: `https://github.com/PureTideWater/PhysicalTherapy/actions/runs/${SYNTHETIC_RUN.runId}/attempts/2` } }) }));
    expect(second.ok && second.notes).toEqual([
      `provenance: measured and attested by ${RELEASE_REF} in run ${SYNTHETIC_RUN.runId} (measured in attempt 2, attested in attempt 2): https://github.com/PureTideWater/PhysicalTherapy/actions/runs/${SYNTHETIC_RUN.runId}; a re-run: every attempt's attestation stays in https://github.com/PureTideWater/PhysicalTherapy/attestations`,
    ]);
  });

  it('refuses a binding report without a verified attestation, naming why gh refused it', () => {
    const text = kept();
    expect(reasons({ reportText: text, attestation: { kind: 'refused', reason: 'gh: no attestations found for subject sha256:0000 (exit status 1)' } })).toEqual([
      'attestation: not verified: gh: no attestations found for subject sha256:0000 (exit status 1)',
    ]);
    expect(reasons({ reportText: text, attestation: { kind: 'verified', output: '[]' } })).toEqual(["attestation: gh's output is not a list of verified attestations"]);
    expect(reasons({ reportText: text, attestation: { kind: 'verified', output: 'Verification succeeded' } })).toEqual(["attestation: gh's output is not a list of verified attestations"]);
  });

  it('refuses a report edited after the release attested it, or the bundle of another file: no verified attestation names its SHA-256', () => {
    const original = kept();
    const edited = JSON.parse(original) as { expected: { postgres: { memoryMiB: number } } };
    edited.expected.postgres.memoryMiB = 8192;
    const text = `${JSON.stringify(edited, null, 2)}\n`;
    expect(reasons({ reportText: text, attestation: attested(original) })).toContain(
      `attestation: none of the attestations gh verified names the report's SHA-256 ${reportSha256(text)} (the report changed after it was signed, or the bundle is another file's)`,
    );
    expect(reasons({ reportText: original, attestation: attested(original, { subjectSha256: 'e'.repeat(64) }) })).toEqual([
      `attestation: none of the attestations gh verified names the report's SHA-256 ${reportSha256(original)} (the report changed after it was signed, or the bundle is another file's)`,
    ]);
  });

  it('refuses a report attested by another workflow, ref or repository, a self-hosted runner, another trigger or predicate, or another run', () => {
    const text = kept();
    const other = (certificate: Partial<SyntheticCertificate>, extra: Parameters<typeof attestationOutput>[1] = {}) => reasons({ reportText: text, attestation: attested(text, { certificate, ...extra }) });
    const capacity = 'https://github.com/PureTideWater/PhysicalTherapy/.github/workflows/screening-capacity.yml@refs/pull/39/merge';
    expect(other({ subjectAlternativeName: capacity, buildSignerURI: capacity, sourceRepositoryRef: 'refs/pull/39/merge', buildTrigger: 'pull_request' })).toEqual([
      `attestation: signed by ${capacity}, not ${releaseSigner()}`,
      `attestation: build signer ${capacity}, not ${releaseSigner()}`,
      `attestation: source ref refs/pull/39/merge, not refs/tags/${TAG}`,
      'attestation: trigger pull_request, not push (release.yml runs on a pushed tag alone)',
    ]);
    const branch = 'https://github.com/PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/heads/main';
    expect(other({ subjectAlternativeName: branch, buildSignerURI: branch, sourceRepositoryRef: 'refs/heads/main' })).toEqual([
      `attestation: signed by ${branch}, not ${releaseSigner()}`,
      `attestation: build signer ${branch}, not ${releaseSigner()}`,
      `attestation: source ref refs/heads/main, not refs/tags/${TAG}`,
    ]);
    expect(other({ subjectAlternativeName: releaseSigner('v1.3.9'), buildSignerURI: releaseSigner('v1.3.9'), sourceRepositoryRef: 'refs/tags/v1.3.9' })).toEqual([
      `attestation: signed by ${releaseSigner('v1.3.9')}, not ${releaseSigner()}`,
      `attestation: build signer ${releaseSigner('v1.3.9')}, not ${releaseSigner()}`,
      `attestation: source ref refs/tags/v1.3.9, not refs/tags/${TAG}`,
    ]);
    // A fork's release.yml on the same tag name.
    const fork = `https://github.com/someone/PhysicalTherapy/.github/workflows/release.yml@refs/tags/${TAG}`;
    expect(other({ subjectAlternativeName: fork, buildSignerURI: fork, sourceRepositoryURI: 'https://github.com/someone/PhysicalTherapy', runInvocationURI: `https://github.com/someone/PhysicalTherapy/actions/runs/${SYNTHETIC_RUN.runId}/attempts/1` })).toEqual([
      `attestation: signed by ${fork}, not ${releaseSigner()}`,
      `attestation: build signer ${fork}, not ${releaseSigner()}`,
      'attestation: source repository https://github.com/someone/PhysicalTherapy, not https://github.com/PureTideWater/PhysicalTherapy',
      `attestation: run https://github.com/someone/PhysicalTherapy/actions/runs/${SYNTHETIC_RUN.runId}/attempts/1 is not a run of PureTideWater/PhysicalTherapy`,
    ]);
    expect(other({ runnerEnvironment: 'self-hosted' })).toEqual(['attestation: runner self-hosted, not github-hosted']);
    expect(other({ issuer: 'https://token.actions.example.ghe.com' })).toEqual(['attestation: issuer https://token.actions.example.ghe.com, not https://token.actions.githubusercontent.com']);
    expect(other({ sourceRepositoryDigest: 'e'.repeat(40) })).toEqual([`attestation: source commit ${'e'.repeat(40)}, not ${COMMIT} (${TAG}'s commit)`]);
    expect(other({}, { predicateType: 'https://in-toto.io/attestation/release/v0.1' })).toEqual(['attestation: predicate type https://in-toto.io/attestation/release/v0.1, not https://slsa.dev/provenance/v1']);
    // Attested in another run than the one the report records measuring it.
    expect(other({ runInvocationURI: 'https://github.com/PureTideWater/PhysicalTherapy/actions/runs/18000000002/attempts/1' })).toEqual([
      `attestation: signed in run 18000000002, and the report records run ${SYNTHETIC_RUN.runId}`,
    ]);
  });

  it('refuses a report whose recorded workflow run is missing, another workflow’s, another ref’s or another repository’s', () => {
    const wanted = `decision 13 opens production only on the report of ${RELEASE_REF}`;
    const withWorkflow = (workflow: unknown) => {
      const edited = JSON.parse(kept()) as Record<string, unknown>;
      edited.workflow = workflow;
      return reasons({ reportText: JSON.stringify(edited) });
    };
    expect(withWorkflow(undefined)).toEqual([`workflow: the report records no GitHub Actions run (no GITHUB_WORKFLOW_REF); ${wanted}`]);
    expect(withWorkflow({ ref: null, runId: null, runAttempt: null })).toEqual([`workflow: the report records no GitHub Actions run (no GITHUB_WORKFLOW_REF); ${wanted}`]);
    for (const ref of [
      'PureTideWater/PhysicalTherapy/.github/workflows/screening-capacity.yml@refs/pull/39/merge',
      'PureTideWater/PhysicalTherapy/.github/workflows/screening-capacity.yml@refs/tags/v1.4.0',
      'PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/heads/main',
      'PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/tags/v1.3.9',
      'someone/PhysicalTherapy/.github/workflows/release.yml@refs/tags/v1.4.0',
    ]) {
      expect(withWorkflow({ ...SYNTHETIC_RUN, ref }), ref).toEqual([`workflow: the report was measured by ${ref}; ${wanted}`]);
    }
    expect(withWorkflow({ ...SYNTHETIC_RUN, runId: 'abc' })).toEqual([
      'workflow: run abc, attempt 1 is not a GitHub Actions run’s ID and attempt',
      `attestation: signed in run ${SYNTHETIC_RUN.runId}, and the report records run abc`,
    ]);
  });
});

describe('the sizes the report measured: every one production declares, held to production’s settings (the verification of PR 6b-3’s capacity changes)', () => {
  it('passes the release’s report, whose expected limits are production’s on the release runner’s layout', () => {
    expect(launchCheck(input({ reportText: kept(consistent({})) })).ok).toBe(true);
  });

  it('refuses each expected size that differs from production’s, in a report that agrees with itself and passes its verdict', () => {
    const cases: readonly [string, Measurements, string][] = [
      ['the web', consistent({ web: { cpus: 0.25, memoryMiB: 512 } }), 'web: the report measured 0.25 vCPU and 512 MiB, and production declares 0.5 vCPU and 1024 MiB'],
      ['the platform', consistent({ platform: { cpus: 0.5, memoryMiB: 1024 } }), 'platform: the report measured 0.5 vCPU and 1024 MiB, and production declares 0.25 vCPU and 512 MiB'],
      ['a consumer task’s vCPUs', consistent({ screening: { cpus: 1, memoryMiB: 4096 } }), 'screening consumer: the report measured each task at 1 vCPU and 4096 MiB, and production declares 2 vCPU and 4096 MiB'],
      ['a consumer task’s memory', consistent({ screening: { cpus: 2, memoryMiB: 8192 } }), 'screening consumer: the report measured each task at 2 vCPU and 8192 MiB, and production declares 2 vCPU and 4096 MiB'],
      ['the consumer’s tasks', consistent({ screeningTasks: 2 }), 'screening consumer: the report measured 2 tasks, and production declares 1'],
      [
        'Postgres’s vCPUs',
        consistent({ postgres: { cpus: 1, memoryMiB: 4096, cpuset: '0' } }),
        "postgres: the report measured 1 vCPU and 4096 MiB on CPUs 0, and production's db.t4g.medium has 2 vCPU and 4096 MiB, on CPUs 0-1 in the release runner's layout",
      ],
      [
        'Postgres’s memory',
        consistent({ postgres: { cpus: 2, memoryMiB: 8192, cpuset: '0-1' } }),
        "postgres: the report measured 2 vCPU and 8192 MiB on CPUs 0-1, and production's db.t4g.medium has 2 vCPU and 4096 MiB, on CPUs 0-1 in the release runner's layout",
      ],
      [
        'Postgres’s CPUs',
        consistent({ postgres: { cpus: 2, memoryMiB: 4096, cpuset: '0-3' } }),
        "postgres: the report measured 2 vCPU and 4096 MiB on CPUs 0-3, and production's db.t4g.medium has 2 vCPU and 4096 MiB, on CPUs 0-1 in the release runner's layout",
      ],
      [
        'the storage',
        consistent({ storage: { iops: 16_000, bytesPerSecond: 1000 * MIB } }),
        "storage: the report measured 16000 IOPS and 1048576000 bytes a second, and production's gp3 gives 3000 IOPS and 131072000 bytes a second",
      ],
      [
        'the consumer’s concurrency',
        consistent({}, { consumer: { tasks: 1, cpus: 2, memoryMiB: 4096, concurrency: 4 } }),
        'consumer: the report measured 1 × 2 vCPU, 4096 MiB, 4 at once, and production declares 1 × 2 vCPU, 4096 MiB, 3 at once',
      ],
    ];
    for (const [what, forged, reason] of cases) {
      // The forgery passes its own verdict, read again in binding mode: only the comparison with production refuses it.
      expect(verdict(forged, ENFORCED).reasons, what).toEqual([]);
      expect(reasons({ reportText: kept(forged) }), what).toContain(reason);
    }
  });

  it('refuses a report naming no consumer task size while production declares one', () => {
    const edited = JSON.parse(kept()) as { expected: { screening: unknown; screeningTasks: unknown } };
    edited.expected.screening = null;
    expect(reasons({ reportText: JSON.stringify(edited) })).toContain('screening consumer: the report measured each task at none, and production declares 2 vCPU and 4096 MiB');
  });
});

describe('the time judgment read again (the verification of PR 6b-3’s capacity changes)', () => {
  /** S1's upload at 48.1 s, labelled as an upload of a repeated run is (its scenario's name before its own). */
  const SLOW_S1_LABEL = 'time: S1 S1-1 48.1 s, fail (allowance: above 48 s on the runner)';

  it('judges on time a scenario other than S4’s three runs whatever repetition it carries', () => {
    const slowS1 = (change: object) => measured({ scenarios: withScenario('S1', (item) => ({ ...item, ...change, uploads: [upload({ emailedMs: 1_000 + 48_100 })] })) });
    for (const change of [{ repetition: 1 }, { repetition: 2 }, { scenario: 'S4', repetition: 1 }]) {
      const edited = JSON.parse(kept(slowS1(change))) as { verdict: unknown };
      edited.verdict = { pass: true, time: 'enforced', reasons: [], timeWarnings: [] };
      expect(reasons({ reportText: JSON.stringify(edited) }), JSON.stringify(change)).toContain(`verdict read again: fail with time enforced (${SLOW_S1_LABEL})`);
    }
  });
});

describe('the attestation’s verification on the deployer’s machine (verifyReportAttestation)', () => {
  const REPORT = '/synthetic/screening-capacity.json';
  const BUNDLE = '/synthetic/screening-capacity.sigstore.json';

  it('runs gh attestation verify on the report with the bundle the release kept, pinned to this repository, release.yml, the tag, its commit and GitHub’s hosted runners', () => {
    const calls: string[][] = [];
    const run: CommandRunner = (command, args) => {
      calls.push([command, ...args]);
      return '[{"verificationResult":{}}]';
    };
    expect(verifyReportAttestation(REPORT, BUNDLE, TAG, COMMIT, run)).toEqual({ kind: 'verified', output: '[{"verificationResult":{}}]' });
    expect(calls).toEqual([
      [
        'gh',
        'attestation',
        'verify',
        REPORT,
        '--bundle',
        BUNDLE,
        '--hostname',
        'github.com',
        '--repo',
        'PureTideWater/PhysicalTherapy',
        '--signer-workflow',
        'PureTideWater/PhysicalTherapy/.github/workflows/release.yml',
        '--source-ref',
        `refs/tags/${TAG}`,
        '--source-digest',
        COMMIT,
        '--deny-self-hosted-runners',
        '--predicate-type',
        'https://slsa.dev/provenance/v1',
        '--format',
        'json',
      ],
    ]);
  });

  it('says why a command failed in one line: gh’s error, not its progress or its usage text; or that it is not installed', () => {
    const verificationFailed = [
      'Loaded digest sha256:0000 for file:///synthetic/screening-capacity.json',
      'Loaded 1 attestation from /synthetic/screening-capacity.sigstore.json',
      'The following policy criteria will be enforced:',
      '- Source Repository Ref must match:................. refs/tags/v1.4.0',
      '✗ Verification failed',
      '',
      'Error: verifying with issuer "sigstore.dev": expected SourceRepositoryRef to be refs/tags/v1.4.0, got refs/heads/main',
      '',
    ].join('\n');
    expect(commandFailure('gh', { status: 1, stderr: verificationFailed })).toBe(
      '✗ Verification failed Error: verifying with issuer "sigstore.dev": expected SourceRepositoryRef to be refs/tags/v1.4.0, got refs/heads/main',
    );
    const unknownFlag = ['unknown flag: --source-digest', '', 'Usage:  gh attestation verify [<file-path> | oci://<image-uri>] [--owner | --repo] [flags]', '', 'Flags:', '  -b, --bundle string   Path to bundle on disk'].join('\n');
    expect(commandFailure('gh', { status: 1, stderr: unknownFlag })).toBe('unknown flag: --source-digest');
    expect(commandFailure('gh', { code: 'ENOENT' })).toBe('gh is not installed (not found on PATH)');
    expect(commandFailure('gh', { status: 1, stderr: '' })).toBe('exit status 1');
  });

  it('names why gh refused, and runs nothing for a tag or a commit it cannot name', () => {
    const refusing: CommandRunner = () => {
      throw new Error('✗ Verification failed: expected SourceRepositoryRef to be refs/tags/v1.4.0, got refs/heads/main');
    };
    expect(verifyReportAttestation(REPORT, BUNDLE, TAG, COMMIT, refusing)).toEqual({ kind: 'refused', reason: 'gh: ✗ Verification failed: expected SourceRepositoryRef to be refs/tags/v1.4.0, got refs/heads/main' });
    const calls: string[][] = [];
    const recording: CommandRunner = (command, args) => {
      calls.push([command, ...args]);
      return '[]';
    };
    expect(verifyReportAttestation(REPORT, BUNDLE, 'latest', COMMIT, recording)).toEqual({ kind: 'refused', reason: 'latest is not a release tag' });
    expect(verifyReportAttestation(REPORT, BUNDLE, TAG, 'no tag v1.4.0 in this checkout (git fetch --tags)', recording)).toEqual({
      kind: 'refused',
      reason: `the commit ${TAG} names is not known: no tag v1.4.0 in this checkout (git fetch --tags)`,
    });
    expect(calls).toEqual([]);
  });
});

/*
 * The deploy side's image IDs (the verification of PR 6b-3): the config digest of the image the registry holds, read from
 * its manifest and never from the deployer's local image store, so the check compares what the harness records on the
 * runner's classic store (`docker image inspect -f {{.Id}}`, the image's config digest) with the same thing. Under
 * Docker's containerd image store `{{.Id}}` is the manifest's or the index's digest, which never matches.
 */

const DOCKER_MANIFEST = 'application/vnd.docker.distribution.manifest.v2+json';
const DOCKER_LIST = 'application/vnd.docker.distribution.manifest.list.v2+json';
const OCI_MANIFEST = 'application/vnd.oci.image.manifest.v1+json';
const OCI_INDEX = 'application/vnd.oci.image.index.v1+json';
const DOCKER_CONFIG = 'application/vnd.docker.container.image.v1+json';
const OCI_CONFIG = 'application/vnd.oci.image.config.v1+json';
const LAYER = `sha256:${'e'.repeat(64)}`;
const WEB_REPOSITORY = '123456789012.dkr.ecr.us-east-1.amazonaws.com/tp-production-web';
const WORKER_REPOSITORY = '123456789012.dkr.ecr.us-east-1.amazonaws.com/tp-production-worker';
const WEB_REFERENCE = `${WEB_REPOSITORY}:${TAG}`;
const WORKER_REFERENCE = `${WORKER_REPOSITORY}:${TAG}`;

/** The digest a registry names a manifest by: the SHA-256 of its bytes. */
function digestOf(raw: string): string {
  return `sha256:${createHash('sha256').update(raw).digest('hex')}`;
}

/** An image manifest's bytes as a registry serves them. */
function imageManifest(mediaType: string, config: string, configType = mediaType === DOCKER_MANIFEST ? DOCKER_CONFIG : OCI_CONFIG): string {
  const layerType = mediaType === DOCKER_MANIFEST ? 'application/vnd.docker.image.rootfs.diff.tar.gzip' : 'application/vnd.oci.image.layer.v1.tar+gzip';
  return JSON.stringify({ schemaVersion: 2, mediaType, config: { mediaType: configType, digest: config, size: 7_023 }, layers: [{ mediaType: layerType, digest: LAYER, size: 32_654 }] }, null, 3);
}

interface Entry {
  readonly digest: string;
  readonly os: string;
  readonly architecture: string;
  readonly variant?: string;
  readonly mediaType?: string;
}

/** An index's bytes: one entry per platform, as buildx and docker manifest write them. */
function index(mediaType: string, entries: readonly Entry[]): string {
  const manifestType = mediaType === DOCKER_LIST ? DOCKER_MANIFEST : OCI_MANIFEST;
  return JSON.stringify({
    schemaVersion: 2,
    mediaType,
    manifests: entries.map((entry) => ({
      mediaType: entry.mediaType ?? manifestType,
      digest: entry.digest,
      size: 1_234,
      platform: { architecture: entry.architecture, os: entry.os, ...(entry.variant === undefined ? {} : { variant: entry.variant }) },
    })),
  });
}

/** A build's attestation manifest, which an index lists as unknown/unknown. */
const ATTESTATION: Entry = { digest: `sha256:${'9'.repeat(64)}`, os: 'unknown', architecture: 'unknown' };
const ARM64: Entry = { digest: `sha256:${'8'.repeat(64)}`, os: 'linux', architecture: 'arm64', variant: 'v8' };

/** A registry as `docker buildx imagetools inspect --raw <reference>` reads it, recording every command run. */
function registry(manifests: Readonly<Record<string, string>>): { readonly run: CommandRunner; readonly calls: string[][] } {
  const calls: string[][] = [];
  const run: CommandRunner = (command, args) => {
    calls.push([command, ...args]);
    const reference = args.at(-1) ?? '';
    const raw = manifests[reference];
    if (command !== 'docker' || args.length !== 5 || args.slice(0, 4).join(' ') !== 'buildx imagetools inspect --raw' || raw === undefined) {
      throw new Error('exit status 1');
    }
    return raw;
  };
  return { run, calls };
}

describe('the registry’s manifest (readManifest)', () => {
  it('gives an image manifest’s config digest, in the Docker v2 and the OCI media types', () => {
    expect(readManifest(imageManifest(DOCKER_MANIFEST, WEB))).toEqual({ kind: 'config', digest: WEB });
    expect(readManifest(imageManifest(OCI_MANIFEST, WORKER))).toEqual({ kind: 'config', digest: WORKER });
  });

  it('resolves an index to its linux/amd64 manifest, the platform the release builds and ECS runs, past other platforms and attestations', () => {
    const amd64 = `sha256:${'7'.repeat(64)}`;
    expect(readManifest(index(OCI_INDEX, [ARM64, { digest: amd64, os: 'linux', architecture: 'amd64' }, ATTESTATION]))).toEqual({ kind: 'platform', digest: amd64 });
    expect(readManifest(index(DOCKER_LIST, [{ digest: amd64, os: 'linux', architecture: 'amd64' }, ARM64]))).toEqual({ kind: 'platform', digest: amd64 });
  });

  it('refuses an index without a linux/amd64 manifest, naming what it holds, and one with more than one', () => {
    expect(readManifest(index(OCI_INDEX, [ARM64, ATTESTATION]))).toEqual({ kind: 'refused', reason: 'no linux/amd64 manifest in its index (it holds linux/arm64/v8, unknown/unknown)' });
    expect(readManifest(index(OCI_INDEX, [{ digest: ARM64.digest, os: 'windows', architecture: 'amd64' }]))).toEqual({ kind: 'refused', reason: 'no linux/amd64 manifest in its index (it holds windows/amd64)' });
    expect(readManifest(index(OCI_INDEX, []))).toEqual({ kind: 'refused', reason: 'no linux/amd64 manifest in its index (it holds none)' });
    const two = index(OCI_INDEX, [
      { digest: `sha256:${'7'.repeat(64)}`, os: 'linux', architecture: 'amd64' },
      { digest: `sha256:${'6'.repeat(64)}`, os: 'linux', architecture: 'amd64', variant: 'v3' },
    ]);
    expect(readManifest(two)).toEqual({ kind: 'refused', reason: '2 linux/amd64 manifests in its index, not one' });
  });

  it('refuses an unexpected media type: an old schema 1 manifest, an artifact, a manifest that names none, an index entry that is not an image manifest', () => {
    expect(readManifest(JSON.stringify({ schemaVersion: 1, mediaType: 'application/vnd.docker.distribution.manifest.v1+prettyjws', fsLayers: [] }))).toEqual({
      kind: 'refused',
      reason: 'an unexpected media type application/vnd.docker.distribution.manifest.v1+prettyjws',
    });
    expect(readManifest(JSON.stringify({ schemaVersion: 2, config: { mediaType: OCI_CONFIG, digest: WEB }, layers: [] }))).toEqual({ kind: 'refused', reason: 'an unexpected media type (none)' });
    expect(readManifest(imageManifest(OCI_MANIFEST, WEB, 'application/vnd.cncf.helm.config.v1+json'))).toEqual({
      kind: 'refused',
      reason: 'an unexpected config media type application/vnd.cncf.helm.config.v1+json',
    });
    expect(readManifest(index(OCI_INDEX, [{ digest: WEB, os: 'linux', architecture: 'amd64', mediaType: OCI_INDEX }]))).toEqual({
      kind: 'refused',
      reason: `an unexpected media type ${OCI_INDEX} for its linux/amd64 manifest`,
    });
  });

  it('refuses malformed output: not JSON, not an object, no config, a config or platform digest that is not sha256, an index with no list', () => {
    expect(readManifest('')).toEqual({ kind: 'refused', reason: 'not a manifest (malformed JSON)' });
    expect(readManifest('{"schemaVersion": 2,')).toEqual({ kind: 'refused', reason: 'not a manifest (malformed JSON)' });
    expect(readManifest('[]')).toEqual({ kind: 'refused', reason: 'not a manifest (not a JSON object)' });
    expect(readManifest('null')).toEqual({ kind: 'refused', reason: 'not a manifest (not a JSON object)' });
    expect(readManifest(JSON.stringify({ schemaVersion: 2, mediaType: OCI_MANIFEST, layers: [] }))).toEqual({ kind: 'refused', reason: 'an image manifest with no config' });
    expect(readManifest(imageManifest(DOCKER_MANIFEST, `sha512:${'a'.repeat(128)}`))).toEqual({ kind: 'refused', reason: 'a config digest that is not sha256:<64 hex>' });
    expect(readManifest(imageManifest(DOCKER_MANIFEST, 'sha256:ABC'))).toEqual({ kind: 'refused', reason: 'a config digest that is not sha256:<64 hex>' });
    expect(readManifest(index(OCI_INDEX, [{ digest: 'sha256:short', os: 'linux', architecture: 'amd64' }]))).toEqual({
      kind: 'refused',
      reason: 'a linux/amd64 manifest digest that is not sha256:<64 hex>',
    });
    expect(readManifest(JSON.stringify({ schemaVersion: 2, mediaType: OCI_INDEX }))).toEqual({ kind: 'refused', reason: 'an index with no manifests' });
  });

  it('names a reference’s repository without its tag or digest, a registry’s port kept', () => {
    expect(repositoryOf(WEB_REFERENCE)).toBe(WEB_REPOSITORY);
    expect(repositoryOf(`${WEB_REPOSITORY}@${WEB}`)).toBe(WEB_REPOSITORY);
    expect(repositoryOf(`${WEB_REPOSITORY}:${TAG}@${WEB}`)).toBe(WEB_REPOSITORY);
    expect(repositoryOf('localhost:5000/tp-web')).toBe('localhost:5000/tp-web');
    expect(repositoryOf('localhost:5000/tp-web:v1.4.0')).toBe('localhost:5000/tp-web');
  });
});

describe('the deployed image’s config digest (registryImageId)', () => {
  it('reads a manifest from the registry alone: nothing is pulled and no local image is inspected', () => {
    const { run, calls } = registry({ [WEB_REFERENCE]: imageManifest(DOCKER_MANIFEST, WEB) });
    expect(registryImageId(WEB_REFERENCE, run)).toBe(WEB);
    expect(calls).toEqual([['docker', 'buildx', 'imagetools', 'inspect', '--raw', WEB_REFERENCE]]);
  });

  it('resolves an index to its linux/amd64 manifest, read by digest from the same repository', () => {
    const manifest = imageManifest(OCI_MANIFEST, WEB);
    const amd64 = `${WEB_REPOSITORY}@${digestOf(manifest)}`;
    const { run, calls } = registry({ [WEB_REFERENCE]: index(OCI_INDEX, [ARM64, { digest: digestOf(manifest), os: 'linux', architecture: 'amd64' }, ATTESTATION]), [amd64]: manifest });
    expect(registryImageId(WEB_REFERENCE, run)).toBe(WEB);
    expect(calls.map((call) => call.at(-1))).toEqual([WEB_REFERENCE, amd64]);
  });

  it('names what failed: not read from the registry, the platform manifest not found, no linux/amd64 manifest, an unexpected media type', () => {
    expect(registryImageId(WEB_REFERENCE, registry({}).run)).toBe(`not read from its registry: ${WEB_REFERENCE} (docker login to it first)`);
    const missing = `sha256:${'7'.repeat(64)}`;
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [{ digest: missing, os: 'linux', architecture: 'amd64' }]) }).run)).toBe(
      `not found: ${WEB_REPOSITORY}@${missing} (the linux/amd64 manifest of ${WEB_REFERENCE})`,
    );
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [ARM64]) }).run)).toBe(`${WEB_REFERENCE}: no linux/amd64 manifest in its index (it holds linux/arm64/v8)`);
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: '{"mediaType":"application/vnd.oci.artifact.manifest.v1+json"}' }).run)).toBe(
      `${WEB_REFERENCE}: an unexpected media type application/vnd.oci.artifact.manifest.v1+json`,
    );
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: 'Error: not json' }).run)).toBe(`${WEB_REFERENCE}: not a manifest (malformed JSON)`);
    // An index whose linux/amd64 entry is itself an index once read: refused, never followed further.
    const nested = index(OCI_INDEX, [{ digest: `sha256:${'5'.repeat(64)}`, os: 'linux', architecture: 'amd64' }]);
    const entry = `${WEB_REPOSITORY}@${digestOf(nested)}`;
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [{ digest: digestOf(nested), os: 'linux', architecture: 'amd64' }]), [entry]: nested }).run)).toBe(
      `${entry} (the linux/amd64 manifest of ${WEB_REFERENCE}): an index, not an image manifest`,
    );
    const artifact = imageManifest(OCI_MANIFEST, WEB, 'application/vnd.cncf.helm.config.v1+json');
    const artifactEntry = `${WEB_REPOSITORY}@${digestOf(artifact)}`;
    expect(registryImageId(WEB_REFERENCE, registry({ [WEB_REFERENCE]: index(OCI_INDEX, [{ digest: digestOf(artifact), os: 'linux', architecture: 'amd64' }]), [artifactEntry]: artifact }).run)).toBe(
      `${artifactEntry} (the linux/amd64 manifest of ${WEB_REFERENCE}): an unexpected config media type application/vnd.cncf.helm.config.v1+json`,
    );
  });
});

describe('the launch check compares config digests', () => {
  it('passes the report’s config digests against those ECR’s manifests name, and never a manifest’s or an index’s own digest', () => {
    // The web in ECR as an OCI index (a copy pushed from a containerd image store keeps one), the worker as Docker v2.
    const webManifest = imageManifest(OCI_MANIFEST, WEB);
    const webIndex = index(OCI_INDEX, [{ digest: digestOf(webManifest), os: 'linux', architecture: 'amd64' }, ATTESTATION]);
    const workerManifest = imageManifest(DOCKER_MANIFEST, WORKER);
    const { run, calls } = registry({ [WEB_REFERENCE]: webIndex, [`${WEB_REPOSITORY}@${digestOf(webManifest)}`]: webManifest, [WORKER_REFERENCE]: workerManifest });
    // The report holds the config digests the harness read on the runner (test-support: WEB and WORKER).
    const images = { web: registryImageId(WEB_REFERENCE, run), worker: registryImageId(WORKER_REFERENCE, run) };
    expect(images).toEqual({ web: WEB, worker: WORKER });
    expect(launchCheck(input({ images })).ok).toBe(true);
    expect(calls.every((call) => call.slice(0, 5).join(' ') === 'docker buildx imagetools inspect --raw')).toBe(true);
    // What `docker image inspect -f {{.Id}}` gives after a pull under the containerd image store: the index's and the
    // manifest's own digests. The check refuses them, so the deploy side must read the config digests, as it does.
    const storeIds = { web: digestOf(webIndex), worker: digestOf(workerManifest) };
    expect(reasons({ images: storeIds })).toEqual([
      `web image: the report measured ${WEB}, and the image being deployed is ${storeIds.web}`,
      `worker image: the report measured ${WORKER}, and the image being deployed is ${storeIds.worker}`,
    ]);
  });

  it('refuses an image in ECR whose config is not the one measured', () => {
    const other = `sha256:${'c'.repeat(64)}`;
    const { run } = registry({ [WEB_REFERENCE]: imageManifest(DOCKER_MANIFEST, WEB), [WORKER_REFERENCE]: imageManifest(OCI_MANIFEST, other) });
    expect(reasons({ images: { web: registryImageId(WEB_REFERENCE, run), worker: registryImageId(WORKER_REFERENCE, run) } })).toEqual([
      `worker image: the report measured ${WORKER}, and the image being deployed is ${other}`,
    ]);
  });
});
