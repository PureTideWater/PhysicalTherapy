import { describe, expect, it } from 'vitest';

import { builderOf, checkBuilder } from './buildkit';
import { recordedTransport, sha } from './fixtures';

/**
 * The BuildKit builder's pin (the security review's S4): one builder on every setup-buildx step, its tag read from Docker
 * Hub, and a warning when a newer release is three days old, since Dependabot cannot update a driver-opts string. All
 * data synthetic: made-up digests and dates.
 */

const DIGEST = `sha256:${'1'.repeat(64)}`;
const OTHER = `sha256:${'2'.repeat(64)}`;
const NOW = new Date('2030-01-10T00:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const DAY = 24 * 60 * 60 * 1000;
/** The release age at its minimum, three days (pnpm-workspace.yaml's minimumReleaseAge, MINIMUM_RELEASE_AGE_MINUTES). */
const FLOOR_MS = 3 * DAY;

const steps = (...opts: (string | undefined)[]) =>
  `name: w\non: push\njobs:\n  build:\n    runs-on: ubuntu-24.04\n    steps:\n${opts
    .map((opt) => `      - uses: docker/setup-buildx-action@${sha('b')} # v4.4.1\n${opt === undefined ? '' : `        with:\n          driver-opts: ${opt}\n`}`)
    .join('')}`;

const TAG = 'https://hub.docker.com/v2/repositories/moby/buildkit/tags/v0.34.1';
const LIST = 'https://hub.docker.com/v2/repositories/moby/buildkit/tags?page_size=100&ordering=last_updated';
const hub = (tags: { name: string; pushed: string; digest?: string }[], tagStatus?: number) =>
  recordedTransport({
    urls: {
      [TAG]: tagStatus ?? JSON.stringify({ name: 'v0.34.1', digest: DIGEST }),
      [LIST]: JSON.stringify({ results: tags.map((tag) => ({ name: tag.name, digest: tag.digest ?? OTHER, tag_last_pushed: tag.pushed })) }),
    },
  });

describe('the builder the workflows name', () => {
  it('is one image=moby/buildkit:vX.Y.Z@sha256 string across every setup-buildx step', () => {
    const one = `image=moby/buildkit:v0.34.1@${DIGEST}`;
    expect(builderOf([{ file: 'a.yml', text: steps(one, one) }, { file: 'b.yml', text: steps(one) }])).toEqual({ builder: { version: 'v0.34.1', digest: DIGEST, numbers: [0, 34, 1] }, problems: [] });
    expect(builderOf([{ file: 'a.yml', text: 'name: w\non: push\njobs: {}\n' }])).toEqual({ problems: [] });
    expect(builderOf([{ file: 'a.yml', text: steps(one, `image=moby/buildkit:v0.34.0@${OTHER}`) }]).problems).toEqual([`the setup-buildx steps name 2 builders, not one: ${one}, image=moby/buildkit:v0.34.0@${OTHER}`]);
    expect(builderOf([{ file: 'a.yml', text: steps(undefined) }]).problems).toEqual(["a.yml build step 1: setup-buildx's driver-opts is not image=moby/buildkit:vX.Y.Z@sha256:<digest> (it is undefined)"]);
    expect(builderOf([{ file: 'a.yml', text: steps('image=moby/buildkit:buildx-stable-1') }]).problems).toHaveLength(1);
  });
});

describe('the builder on Docker Hub', () => {
  const builder = { version: 'v0.34.1', digest: DIGEST, numbers: [0, 34, 1] as const };

  it('warns when a newer release is three days old, naming it, and not while it is younger', async () => {
    const old = hub([
      { name: 'v0.35.0', pushed: ago(1 * DAY) },
      { name: 'v0.34.2', pushed: ago(FLOOR_MS + 60_000) },
      { name: 'v0.34.2-rootless', pushed: ago(5 * DAY) },
      { name: 'v0.34.1', pushed: ago(20 * DAY), digest: DIGEST },
      { name: 'latest', pushed: ago(1 * DAY) },
    ]);
    const result = await checkBuilder(old, builder, { isNew: false, now: NOW });
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([
      `the builder moby/buildkit:v0.34.1: moby/buildkit v0.34.2 was pushed ${ago(FLOOR_MS + 60_000)}, three days ago or more; Dependabot cannot update setup-buildx's driver-opts, so move every step to it by hand (docs/runbooks/dependency-upgrades.md)`,
    ]);
    const young = hub([{ name: 'v0.35.0', pushed: ago(2 * DAY) }]);
    expect(await checkBuilder(young, builder, { isNew: false, now: NOW })).toMatchObject({ errors: [], warnings: [], notes: [`the builder moby/buildkit:v0.34.1: its tag is the index ${DIGEST}`, 'the builder moby/buildkit:v0.34.1: no newer release is three days old'] });
  });

  it('holds the newer-release warning to minimumReleaseAge, the floor every age rule reads, never under three days', async () => {
    const releases = (days: number) => hub([{ name: 'v0.34.2', pushed: ago(days * DAY) }]);
    // Five days (7200 minutes): a release four days old is not yet one to move to, and one six days old is.
    expect(await checkBuilder(releases(4), builder, { isNew: false, now: NOW, floor: 7200 })).toMatchObject({ warnings: [], notes: expect.arrayContaining(['the builder moby/buildkit:v0.34.1: no newer release is 7200 minutes (5.00 days) old']) as unknown });
    expect((await checkBuilder(releases(6), builder, { isNew: false, now: NOW, floor: 7200 })).warnings).toEqual([
      `the builder moby/buildkit:v0.34.1: moby/buildkit v0.34.2 was pushed ${ago(6 * DAY)}, 7200 minutes (5.00 days) ago or more; Dependabot cannot update setup-buildx's driver-opts, so move every step to it by hand (docs/runbooks/dependency-upgrades.md)`,
    ]);
    // A floor under the minimum reads as three days.
    expect((await checkBuilder(releases(2), builder, { isNew: false, now: NOW, floor: 60 })).warnings).toEqual([]);
    // A floor that is not a number reads as three days, as releaseAgeMinutes reads it: a release four days old is one to move to.
    expect((await checkBuilder(releases(4), builder, { isNew: false, now: NOW, floor: Number.NaN })).warnings).toEqual([
      `the builder moby/buildkit:v0.34.1: moby/buildkit v0.34.2 was pushed ${ago(4 * DAY)}, three days ago or more; Dependabot cannot update setup-buildx's driver-opts, so move every step to it by hand (docs/runbooks/dependency-upgrades.md)`,
    ]);
  });

  it('fails a new builder whose tag is another digest, or that cannot be read, and only warns about an unchanged one', async () => {
    const moved = recordedTransport({ urls: { [TAG]: JSON.stringify({ digest: OTHER }), [LIST]: '{"results":[]}' } });
    const message = `the builder moby/buildkit:v0.34.1: its tag is the index ${OTHER}, not ${DIGEST}`;
    expect((await checkBuilder(moved, builder, { isNew: true, now: NOW })).errors).toEqual([message]);
    expect(await checkBuilder(moved, builder, { isNew: false, now: NOW })).toMatchObject({ errors: [], warnings: [message] });

    const limited = hub([], 429);
    const failed = await checkBuilder(limited, builder, { isNew: true, now: NOW });
    expect(failed.errors).toEqual([expect.stringMatching(/^the builder moby\/buildkit:v0\.34\.1: hub\.docker\.com: GET .* failed 3 times \(last: HTTP 429\); the check fails closed$/)]);
    expect(limited.pauses).toEqual([2_000, 5_000]);
    expect(await checkBuilder(hub([], 429), builder, { isNew: false, now: NOW })).toMatchObject({ errors: [], warnings: [expect.stringContaining('failed 3 times')] });
    expect((await checkBuilder(hub([], 404), builder, { isNew: true, now: NOW })).errors).toEqual(['the builder moby/buildkit:v0.34.1: Docker Hub has no such tag']);
  });
});
