import { readFileSync } from 'node:fs';
import path from 'node:path';

import type { Template } from 'aws-cdk-lib/assertions';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type AttestationReading, registryImageId, reportSha256, verifyReportAttestation } from '../../tools/screening-capacity/launch-check';
import { type Measurements, report } from '../../tools/screening-capacity/report';
import { attestationOutput, releaseSigner } from '../../tools/screening-capacity/test-support/attestation';
import { ADVISORY, ENFORCED, SYNTHETIC_COMMIT, SYNTHETIC_TAG, measured, onOwnCpus, scenario, upload, withS1 } from '../../tools/screening-capacity/test-support/measurements';
import { MAIL_IDENTITIES_VERIFIED_CONDITION, NO_IMAGE, PARAMETER_NAMES, SCREENING_CLOSED, SCREENING_CONSUMER_STATES, SCREENING_LAUNCH_PATTERN, SCREENING_LAUNCH_RULE } from '../lib/deploy-parameters';
import { ENVIRONMENTS, type EnvironmentName } from '../lib/environments';
import { DEPLOY_LAUNCH_READERS, LAUNCH_ATTESTATION_CONTEXT, LAUNCH_REPORT_CONTEXT, LAUNCH_TAG_CONTEXT, type LaunchReaders, type LaunchTarget, ecrImageReference } from '../lib/screening-launch';
import { SYNTH_TIMEOUT_MS, resourcesOf, synthesizeAll, templateFor } from './synth';

interface CfnParameter {
  readonly Type: string;
  readonly Default?: string;
  readonly AllowedPattern?: string;
  readonly MaxLength?: number;
}

interface TemplateJson {
  readonly Parameters: Record<string, CfnParameter>;
  readonly Conditions: Record<string, unknown>;
  readonly Outputs: Record<string, { readonly Value: unknown }>;
  readonly Rules?: Record<string, unknown>;
}

function json(template: Template): TemplateJson {
  return template.toJSON() as TemplateJson;
}

function parameters(environment: EnvironmentName): Record<string, CfnParameter> {
  return json(templateFor(environment)).Parameters;
}

/** The web container's SCREENING_LAUNCH, as the template sets it. */
function webLaunchValue(template: Template, environment: EnvironmentName): unknown {
  const [, task] = resourcesOf(template, 'AWS::ECS::TaskDefinition').find(([, resource]) => resource.Properties?.Family === `tp-${environment}-web`) ?? [];
  const [container] = (task?.Properties?.ContainerDefinitions ?? []) as { Environment: { Name: string; Value: unknown }[] }[];
  return container?.Environment.find((entry) => entry.Name === 'SCREENING_LAUNCH')?.Value;
}

/**
 * The condition that runs production's screening consumer: with no launch value, once released and ScreeningConsumer is
 * running; with one, once released, whatever ScreeningConsumer says (Released's own expression).
 */
function consumerRunning(launch: string): unknown {
  return launch === SCREENING_CLOSED
    ? { 'Fn::And': [{ Condition: 'Released' }, { 'Fn::Equals': [{ Ref: PARAMETER_NAMES.screeningConsumer }, 'running'] }] }
    : { 'Fn::Not': [{ 'Fn::Equals': [{ Ref: PARAMETER_NAMES.imageTag }, NO_IMAGE] }] };
}

/** What differs per deployment comes in as CloudFormation parameters, never from the repository (docs/adr/0049). */
describe.each(ENVIRONMENTS)('%s: deploy-time parameters', (environment) => {
  const declared = parameters(environment);
  const matches = (name: string, value: string) => new RegExp(declared[name]?.AllowedPattern ?? '(?!)').test(value);

  it('takes the host names, certificates, sender, image tag and the consumer’s state, and no other parameter of its own', () => {
    const own = Object.keys(declared).filter((name) => name !== 'BootstrapVersion');
    expect(own.sort()).toEqual(Object.values(PARAMETER_NAMES).sort());
    for (const name of own) {
      expect(declared[name]?.Type, name).toBe('String');
    }
    // The screening's launch value is computed at synthesis, never taken as a parameter (the founder's ruling of
    // 2026-10-22): with none declared, CloudFormation refuses a `--parameters ScreeningLaunch=…`.
    expect(own).not.toContain('ScreeningLaunch');
  });

  it('has no default for anything but the image tag, which starts at none (no task runs), the consumer, which starts held, and the mail phase, which starts at 1', () => {
    const defaulted: readonly string[] = [PARAMETER_NAMES.imageTag, PARAMETER_NAMES.screeningConsumer, PARAMETER_NAMES.mailIdentitiesVerified];
    for (const name of Object.values(PARAMETER_NAMES).filter((candidate) => !defaulted.includes(candidate))) {
      expect(declared[name]?.Default, name).toBeUndefined();
    }
    expect(declared[PARAMETER_NAMES.imageTag]?.Default).toBe(NO_IMAGE);
    expect(declared[PARAMETER_NAMES.screeningConsumer]?.Default).toBe('held');
    expect(declared[PARAMETER_NAMES.mailIdentitiesVerified]?.Default).toBe('false');
    expect(json(templateFor(environment)).Conditions.Released).toEqual({ 'Fn::Not': [{ 'Fn::Equals': [{ Ref: PARAMETER_NAMES.imageTag }, NO_IMAGE] }] });
  });

  it('takes the mail phase as false (phase 1: the identities wait for their DNS records) or true (phase 2), and nothing else (docs/adr/0065, D2)', () => {
    expect(declared[PARAMETER_NAMES.mailIdentitiesVerified]).toMatchObject({ Type: 'String', Default: 'false', AllowedValues: ['false', 'true'] });
    expect(json(templateFor(environment)).Conditions[MAIL_IDENTITIES_VERIFIED_CONDITION]).toEqual({ 'Fn::Equals': [{ Ref: PARAMETER_NAMES.mailIdentitiesVerified }, 'true'] });
  });

  it('derives the screening\'s sender from MailFromAddress as results@screening.<its domain>, so the two identities can never be one (Q12)', () => {
    const outputs = json(templateFor(environment)).Outputs;
    const domain = { 'Fn::Select': [1, { 'Fn::Split': ['@', { Ref: PARAMETER_NAMES.mailFromAddress }] }] };
    expect(outputs.ScreeningMailFromAddress?.Value).toEqual({ 'Fn::Join': ['', ['results@screening.', domain]] });
    expect(outputs.ScreeningMailIdentityDomain?.Value).toEqual({ 'Fn::Join': ['', ['screening.', domain]] });
    expect(outputs.MailIdentityDomain?.Value).toEqual(domain);
  });

  it('accepts host names of at most 63 characters for the application (the passkey relying-party ID)', () => {
    expect(declared[PARAMETER_NAMES.appDomainName]?.MaxLength).toBe(63);
    expect(matches(PARAMETER_NAMES.appDomainName, 'app.example.test')).toBe(true);
    for (const bad of ['App.Example.test', 'localhost', 'https://app.example.test', 'app.example.test/', '-app.example.test']) {
      expect(matches(PARAMETER_NAMES.appDomainName, bad), bad).toBe(false);
    }
  });

  it('accepts only an ACM certificate in us-east-1 for CloudFront, and any region\'s for the load balancer', () => {
    const arn = (region: string) => `arn:aws:acm:${region}:123456789012:certificate/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b`;
    expect(matches(PARAMETER_NAMES.staticCertificateArn, arn('us-east-1'))).toBe(true);
    expect(matches(PARAMETER_NAMES.staticCertificateArn, arn('us-west-2'))).toBe(false);
    expect(matches(PARAMETER_NAMES.certificateArn, arn('us-west-2'))).toBe(true);
    expect(matches(PARAMETER_NAMES.certificateArn, 'arn:aws:iam::123456789012:server-certificate/x')).toBe(false);
  });

  it('accepts a sender address on a lowercase domain and image tags only', () => {
    expect(matches(PARAMETER_NAMES.mailFromAddress, 'notices@example.test')).toBe(true);
    expect(matches(PARAMETER_NAMES.mailFromAddress, 'Notices <notices@example.test>')).toBe(false);
    expect(matches(PARAMETER_NAMES.imageTag, 'v2027.1.0')).toBe(true);
    expect(matches(PARAMETER_NAMES.imageTag, NO_IMAGE)).toBe(true);
    expect(matches(PARAMETER_NAMES.imageTag, 'latest:sha256')).toBe(false);
  });

  it('takes the consumer’s state as held or running', () => {
    expect((declared[PARAMETER_NAMES.screeningConsumer] as CfnParameter & { AllowedValues?: string[] }).AllowedValues).toEqual([...SCREENING_CONSUMER_STATES]);
    expect(SCREENING_CONSUMER_STATES).toEqual(['held', 'running']);
  });

  it('keeps the screening closed with no launch report: the web’s value is closed, the output says so, and no launch rule binds ImageTag', () => {
    const template = templateFor(environment);
    expect(webLaunchValue(template, environment)).toBe(SCREENING_CLOSED);
    expect(json(template).Outputs.ScreeningLaunch?.Value).toBe(SCREENING_CLOSED);
    expect(json(template).Rules?.[SCREENING_LAUNCH_RULE]).toBeUndefined();
  });

  it('runs the screening consumer at launch only where its settings say so: production waits for ScreeningConsumer=running or a launch value', () => {
    const conditions = json(templateFor(environment)).Conditions;
    if (environment === 'production') {
      // Whenever the screening can open (a launch value), the consumer runs, whatever ScreeningConsumer says: a deploy
      // that opens it and keeps or defaults ScreeningConsumer to held never opens a screening no task prices (the review
      // of 2026-10-22). With no launch report the value is closed, so ScreeningConsumer alone decides.
      expect(conditions.ScreeningConsumerRunning).toEqual(consumerRunning(SCREENING_CLOSED));
    } else {
      expect(conditions.ScreeningConsumerRunning).toBeUndefined();
    }
  });
});

describe('the screening launch value’s form', () => {
  it('is closed or a release tag and a 64-hex report SHA-256 (decision 13), the pattern the web reads too', () => {
    const pattern = new RegExp(SCREENING_LAUNCH_PATTERN);
    const sha = 'a'.repeat(64);
    for (const good of [SCREENING_CLOSED, `v2027.1.0:${sha}`, `v1.0.0-rc.1:${'0123456789abcdef'.repeat(4)}`]) {
      expect(pattern.test(good), good).toBe(true);
    }
    for (const bad of ['', 'open', `v2027.1.0:${sha.slice(1)}`, `v2027.1.0:${'A'.repeat(64)}`, `2027.1.0:${sha}`, `v2027.1.0:${sha}x`, `v2027.1.0 ${sha}`, `closed:${sha}`]) {
      expect(pattern.test(bad), bad).toBe(false);
    }
    const web = readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src/lib/server/config.ts'), 'utf8');
    expect(web).toContain(`SCREENING_LAUNCH: z.string().regex(/${SCREENING_LAUNCH_PATTERN}/`);
  });
});

/**
 * Production's launch value is computed at synthesis from the release's capacity report (decision 13; test matrix SCR-20;
 * the founder's ruling of 2026-10-22): the CDK app runs the launch check on the ECR images the stack deploys and sets the
 * value itself. Synthetic reports only, built in memory; the readers stand in for the file, git, Docker and the account.
 */
describe('the screening launch value, computed at synthesis', () => {
  const TAG = SYNTHETIC_TAG;
  const COMMIT = SYNTHETIC_COMMIT;
  const WEB_ID = `sha256:${'a'.repeat(64)}`;
  const WORKER_ID = `sha256:${'b'.repeat(64)}`;
  const TARGET: LaunchTarget = { account: '123456789012', region: 'us-east-1' };
  const WEB_REFERENCE = `123456789012.dkr.ecr.us-east-1.amazonaws.com/tp-production-web:${TAG}`;
  const WORKER_REFERENCE = `123456789012.dkr.ecr.us-east-1.amazonaws.com/tp-production-worker:${TAG}`;
  const REPORT_FILE = '/synthetic/screening-capacity.json';
  const BUNDLE_FILE = '/synthetic/screening-capacity.sigstore.json';
  const LAUNCH = { [LAUNCH_REPORT_CONTEXT]: REPORT_FILE, [LAUNCH_ATTESTATION_CONTEXT]: BUNDLE_FILE, [LAUNCH_TAG_CONTEXT]: TAG };

  /** A report's bytes as the harness writes them: by default a full passing run of the measured images. */
  const kept = (measurements: Measurements = measured(), rule = ENFORCED) => `${JSON.stringify(report(measurements, rule), null, 2)}\n`;

  interface Fake {
    readonly text?: string;
    readonly commit?: string;
    readonly ids?: Readonly<Record<string, string>>;
    readonly target?: LaunchTarget | null;
    /** What gh gives for the report and the bundle; by default release.yml's attestation of the report's bytes. */
    readonly attestation?: AttestationReading;
  }

  /**
   * Readers over the synthetic report, its attestation as gh verifies it, the tag's commit, the images' config digests in
   * ECR and the deploy's account; records each image read and each verification asked for.
   */
  function readersFor(fake: Fake = {}): LaunchReaders & { readonly read: string[]; readonly verified: string[][] } {
    const read: string[] = [];
    const verified: string[][] = [];
    const ids = fake.ids ?? { [WEB_REFERENCE]: WEB_ID, [WORKER_REFERENCE]: WORKER_ID };
    return {
      read,
      verified,
      verifyAttestation: (file, bundle, tag, commit) => {
        verified.push([file, bundle, tag, commit]);
        if (file !== REPORT_FILE || bundle !== BUNDLE_FILE) {
          return { kind: 'refused', reason: 'gh: open: no such file or directory' };
        }
        return fake.attestation ?? { kind: 'verified', output: attestationOutput(fake.text ?? kept()) };
      },
      readReport: (file) => {
        if (file !== REPORT_FILE) {
          throw new Error('no such file');
        }
        return fake.text ?? kept();
      },
      tagCommit: (tag) => (tag === TAG ? (fake.commit ?? COMMIT) : `no tag ${tag} in this checkout (git fetch --tags)`),
      imageId: (reference) => {
        read.push(reference);
        return ids[reference] ?? `not found: ${reference}`;
      },
      target: () => (fake.target === undefined ? TARGET : fake.target),
    };
  }

  it('opens production for a passing report of exactly the ECR images the stack deploys, binding ImageTag to its tag', { timeout: SYNTH_TIMEOUT_MS }, () => {
    const readers = readersFor();
    const stacks = synthesizeAll(LAUNCH, readers);
    const value = `${TAG}:${reportSha256(kept())}`;
    // The images read are the ECR copies of the tag the stack runs (WebRepositoryUri and WorkerRepositoryUri), by their manifests.
    expect(readers.read).toEqual([WEB_REFERENCE, WORKER_REFERENCE]);
    // The report's attestation, verified against the bundle the release kept, for the tag and the commit it names here.
    expect(readers.verified).toEqual([[REPORT_FILE, BUNDLE_FILE, TAG, COMMIT]]);
    const production = stacks.production.template;
    expect(webLaunchValue(production, 'production')).toBe(value);
    expect(json(production).Outputs.ScreeningLaunch?.Value).toBe(value);
    // CloudFormation refuses the deploy before any change unless ImageTag is the tag the report measured.
    expect(json(production).Rules?.[SCREENING_LAUNCH_RULE]).toEqual({
      Assertions: [{ Assert: { 'Fn::Equals': [{ Ref: PARAMETER_NAMES.imageTag }, TAG] }, AssertDescription: expect.stringContaining(`deploy ImageTag=${TAG}`) }],
    });
    // The consumer runs whenever a launch value is set, whatever ScreeningConsumer says.
    expect(json(production).Conditions.ScreeningConsumerRunning).toEqual(consumerRunning(value));
    // Staging and development are not gated, and take no launch value.
    for (const environment of ['dev', 'staging'] as const) {
      expect(webLaunchValue(stacks[environment].template, environment)).toBe(SCREENING_CLOSED);
      expect(json(stacks[environment].template).Rules?.[SCREENING_LAUNCH_RULE]).toBeUndefined();
    }
  });

  it('refuses a failing report, naming decision 13 and each reason, so the deploy cannot open the screening', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) });
    expect(() => synthesizeAll(LAUNCH, readersFor({ text: kept(slow) }))).toThrow(/^decision 13 \(docs\/adr\/0062\): the launch check refused v1\.4\.0's capacity report[\s\S]*- verdict: fail with time enforced/);
  });

  it('refuses an advisory report, a pull request’s, whatever its verdict, so its pass never opens production (the founder’s ruling of 2026-10-23, time advisory)', () => {
    const slow = measured({ scenarios: withS1(scenario({}, [upload({ emailedMs: 1_000 + 48_100 })])) });
    for (const measurements of [measured(), slow]) {
      const readers = readersFor({ text: kept(measurements, ADVISORY) });
      expect(() => synthesizeAll(LAUNCH, readers)).toThrow(/^decision 13 \(docs\/adr\/0062\): the launch check refused v1\.4\.0's capacity report[\s\S]*- time mode: advisory, not binding/);
    }
  });

  it('refuses a stale report: another commit than the tag’s, an older format, a web measured at the size before 2026-10-22', () => {
    expect(() => synthesizeAll(LAUNCH, readersFor({ commit: 'e'.repeat(40) }))).toThrow(new RegExp(`- commit: the report measured ${COMMIT}, and ${TAG} is ${'e'.repeat(40)}`));
    // The formats before S4 ran three times, before the time mode was recorded (the founder's rulings of 2026-10-23) and
    // before the run that measured was recorded (the verification of PR 6b-3's capacity changes).
    for (const format of ['tp-screening-capacity/4', 'tp-screening-capacity/5', 'tp-screening-capacity/6', 'tp-screening-capacity/7']) {
      const older = { ...(JSON.parse(kept()) as Record<string, unknown>), format };
      expect(() => synthesizeAll(LAUNCH, readersFor({ text: JSON.stringify(older) }))).toThrow(new RegExp(`- report: format ${format}, not tp-screening-capacity/8`));
    }
    const base = measured();
    const quarterWeb = measured({
      expected: { ...base.expected, web: { cpus: 0.25, memoryMiB: 512 } },
      applied: { ...base.applied, containers: base.applied.containers.map((item) => (item.name === 'web' ? { ...item, nanoCpus: 250_000_000, memoryBytes: 512 * 1024 * 1024, memorySwapBytes: 512 * 1024 * 1024 } : item)) },
    });
    expect(() => synthesizeAll(LAUNCH, readersFor({ text: kept(quarterWeb) }))).toThrow(/- web: the report measured 0\.25 vCPU and 512 MiB, and production declares 0\.5 vCPU and 1024 MiB/);
  });

  it('refuses a report of other images than the ECR copies the stack deploys, or an image ECR does not hold', () => {
    const other = `sha256:${'c'.repeat(64)}`;
    expect(() => synthesizeAll(LAUNCH, readersFor({ ids: { [WEB_REFERENCE]: WEB_ID, [WORKER_REFERENCE]: other } }))).toThrow(new RegExp(`- worker image: the report measured ${WORKER_ID}, and the image being deployed is ${other}`));
    expect(() => synthesizeAll(LAUNCH, readersFor({ ids: { [WORKER_REFERENCE]: WORKER_ID } }))).toThrow(/- web image: no config digest for the image being deployed: not found: 123456789012\.dkr\.ecr\.us-east-1\.amazonaws\.com\/tp-production-web:v1\.4\.0/);
  });

  it('refuses a launch value typed by hand, as context of any spelling, with or without a report', () => {
    const typed = `${TAG}:${'a'.repeat(64)}`;
    for (const key of ['ScreeningLaunch', 'tp:screeningLaunch', 'tp-production:ScreeningLaunch', 'screening_launch']) {
      const readers = readersFor();
      expect(() => synthesizeAll({ [key]: typed }, readers), key).toThrow(new RegExp(`^decision 13 \\(docs/adr/0062\\): ScreeningLaunch is computed by the CDK app from the release's capacity report and is never passed by hand; remove -c ${key}`));
      expect(() => synthesizeAll({ ...LAUNCH, [key]: typed }, readers), key).toThrow(/is never passed by hand/);
      expect(readers.read).toEqual([]);
    }
  });

  it('refuses a binding report without its attestation, or one gh does not verify, naming why (the verification of PR 6b-3’s capacity changes)', () => {
    // No bundle named: the report alone opens nothing.
    const unnamed = readersFor();
    expect(() => synthesizeAll({ [LAUNCH_REPORT_CONTEXT]: REPORT_FILE, [LAUNCH_TAG_CONTEXT]: TAG }, unnamed)).toThrow(
      /-c tp:launchReport=<screening-capacity\.json>, -c tp:launchAttestation=<screening-capacity\.sigstore\.json> and -c tp:launchTag=<tag> go together/,
    );
    expect(unnamed.verified).toEqual([]);
    expect(unnamed.read).toEqual([]);
    expect(() => synthesizeAll(LAUNCH, readersFor({ attestation: { kind: 'refused', reason: 'gh: ✗ Verification failed' } }))).toThrow(
      /^decision 13 \(docs\/adr\/0062\): the launch check refused v1\.4\.0's capacity report[\s\S]*- attestation: not verified: gh: ✗ Verification failed/,
    );
    expect(() => synthesizeAll({ ...LAUNCH, [LAUNCH_ATTESTATION_CONTEXT]: '/synthetic/other.sigstore.json' }, readersFor())).toThrow(/- attestation: not verified: gh: open: no such file or directory/);
  });

  it('refuses a report attested by another workflow, ref or repository, and accepts only release.yml’s on the tag', () => {
    const capacity = 'https://github.com/PureTideWater/PhysicalTherapy/.github/workflows/screening-capacity.yml@refs/pull/39/merge';
    const pullRequest = readersFor({ attestation: { kind: 'verified', output: attestationOutput(kept(), { certificate: { subjectAlternativeName: capacity, buildSignerURI: capacity, sourceRepositoryRef: 'refs/pull/39/merge' } }) } });
    expect(() => synthesizeAll(LAUNCH, pullRequest)).toThrow(new RegExp(`- attestation: signed by ${capacity.replaceAll('.', '\\.')}, not ${releaseSigner().replaceAll('.', '\\.')}`));
    const fork = 'https://github.com/someone/PhysicalTherapy';
    expect(() => synthesizeAll(LAUNCH, readersFor({ attestation: { kind: 'verified', output: attestationOutput(kept(), { certificate: { sourceRepositoryURI: fork } }) } }))).toThrow(
      /- attestation: source repository https:\/\/github\.com\/someone\/PhysicalTherapy, not https:\/\/github\.com\/PureTideWater\/PhysicalTherapy/,
    );
    // An 8-CPU runner's report, however attested: the release measures on the free runner's shared layout alone.
    expect(() => synthesizeAll(LAUNCH, readersFor({ text: kept(onOwnCpus()) }))).toThrow(/- layout: the report measured CPUs of their own/);
  });

  it('refuses a report without its tag, a tag without its report, a tag that is not a release’s, and a deploy with no account to name the images in', () => {
    expect(() => synthesizeAll({ [LAUNCH_REPORT_CONTEXT]: REPORT_FILE }, readersFor())).toThrow(/go together/);
    expect(() => synthesizeAll({ [LAUNCH_TAG_CONTEXT]: TAG }, readersFor())).toThrow(/go together/);
    expect(() => synthesizeAll({ [LAUNCH_ATTESTATION_CONTEXT]: BUNDLE_FILE }, readersFor())).toThrow(/go together/);
    const latest = readersFor();
    expect(() => synthesizeAll({ ...LAUNCH, [LAUNCH_TAG_CONTEXT]: 'latest' }, latest)).toThrow(/-c tp:launchTag=latest is not a release tag/);
    expect(latest.read).toEqual([]);
    expect(() => synthesizeAll(LAUNCH, readersFor({ target: null }))).toThrow(/CDK_DEFAULT_ACCOUNT and CDK_DEFAULT_REGION/);
    expect(() => synthesizeAll({ ...LAUNCH, [LAUNCH_REPORT_CONTEXT]: '/synthetic/missing.json' }, readersFor())).toThrow(/the capacity report \/synthetic\/missing\.json could not be read/);
  });

  describe('the deploy’s readers', () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('name the images in the account and region the CDK CLI gives from the deploy’s credentials, as the stack’s repository URIs do', () => {
      vi.stubEnv('CDK_DEFAULT_ACCOUNT', TARGET.account);
      vi.stubEnv('CDK_DEFAULT_REGION', TARGET.region);
      expect(DEPLOY_LAUNCH_READERS.target()).toEqual(TARGET);
      expect(ecrImageReference(TARGET, 'production', 'web', TAG)).toBe(WEB_REFERENCE);
      expect(ecrImageReference({ account: TARGET.account, region: 'cn-north-1' }, 'production', 'worker', TAG)).toBe(`123456789012.dkr.ecr.cn-north-1.amazonaws.com.cn/tp-production-worker:${TAG}`);
      vi.stubEnv('CDK_DEFAULT_ACCOUNT', '');
      expect(DEPLOY_LAUNCH_READERS.target()).toBeNull();
    });

    it('read each image’s config digest from its registry’s manifest, never the deployer’s local image store (the verification of PR 6b-3)', () => {
      expect(DEPLOY_LAUNCH_READERS.imageId).toBe(registryImageId);
    });

    it('verify the report against the bundle the release kept with gh attestation verify (the verification of PR 6b-3’s capacity changes)', () => {
      expect(DEPLOY_LAUNCH_READERS.verifyAttestation).toBe(verifyReportAttestation);
    });
  });
});

describe('the repository holds no deploy-time value', () => {
  it('keeps cdk.json free of context', () => {
    const cdk = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../cdk.json'), 'utf8')) as { context: Record<string, unknown> };
    expect(cdk.context).toEqual({});
  });
});
