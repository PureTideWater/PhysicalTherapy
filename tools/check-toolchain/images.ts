import { parse } from 'yaml';

import type { CheckEvent, Finding, Level, Tree } from './check';
import { ageWords, excludeWindowProblems, expiredExclude, type ExcludeWindow, type KnownTime } from './exclude-window';
import { MINUTE_MS, type ImageAgeException } from './policy';
import { type HubTag, NetworkReadError, type Registry } from './registry';

/**
 * The image rule (docs/adr/0066, Part 5; test matrix CI-22): every image the tree names is held to the founder's F2 (b)
 * release age, as npm versions are, measured from the push time Docker Hub recorded. Every image means each Dockerfile's
 * `FROM` and `# syntax=` lines, docker-compose.yml's services, and every workflow's job container, service container,
 * `docker://` step and setup-buildx builder (`driver-opts` `image=`). Offline (`imageFormRule`), each is
 * `name:tag@sha256:<64 hex>`, and every image reference the rule does not read is refused, so "every image" holds on its
 * own (S6). Networked (`imageRule`), only a digest the base names nowhere is read (no bootstrapping, E2): Docker Hub's tag
 * for it, or else the repository's most recently updated tags, four reads at a time under one deadline (E3). A young
 * digest fails unless a live security-fix entry in image-age-exceptions.json names it; a digest Hub shows on no tag fails
 * under every entry (B1); a registry other than Docker Hub is "age unprovable" unless a live age-unprovable entry names
 * the image. On a push every age finding is a warning; the pull request is the gate.
 */

/** The compose file the image rule reads, the one `pnpm dev` and CI's database jobs run. */
export const COMPOSE_FILE = 'docker-compose.yml';
/** The image exceptions, beside the checker. */
export const IMAGE_AGE_EXCEPTIONS_FILE = 'tools/check-toolchain/image-age-exceptions.json';
/** One deadline for all of a run's Docker Hub reads (E3). */
export const IMAGE_DEADLINE_MS = 180_000;
/** Docker Hub reads at once. */
export const IMAGE_READS_AT_ONCE = 4;
/** Pages of a repository's tags, most recently updated first, searched for a digest its own tag no longer names. */
export const HUB_SEARCH_PAGES = 5;

const RULE = 'images';
const HUB_HOST = 'hub.docker.com';
const FORM = 'name:tag@sha256:<64 hex>';
const RUNBOOK = 'docs/runbooks/dependency-upgrades.md, "Base images and PostgreSQL"';
const REMEDY = `wait until then, or, for a security fix, add a security-fix entry for it to ${IMAGE_AGE_EXCEPTIONS_FILE} with its advisory, the package and version it fixes, the date added and an expiry (${RUNBOOK})`;

/** An image the tree names, exactly as written, and where. */
export interface ImageUse {
  readonly image: string;
  readonly where: string;
}

/** An image reference, read: its registry (null for Docker Hub), its repository there, its tag and its digest. */
export interface ImageName {
  readonly registry: string | null;
  /** Docker Hub's `namespace/name` (`library/<name>` for an official image), or the path on another registry. */
  readonly repository: string;
  readonly tag: string;
  readonly digest: string;
}

const COMPONENT = /^[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*$/;
const DOMAIN = /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::\d+)?$/;
const TAG = /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
/** The names Docker Hub answers to as a registry. */
const HUB_REGISTRIES = new Set(['docker.io', 'index.docker.io', 'registry-1.docker.io']);

/** An image reference read as `[registry/]path:tag@sha256:<64 hex>`, or why it is not one. */
export function parseImage(image: string): ImageName | { readonly problem: string } {
  const at = image.indexOf('@');
  if (at === -1) {
    return { problem: `names no digest, so what runs can change under the same name; pin it as ${FORM}` };
  }
  const pinned = image.slice(at + 1);
  if (!DIGEST.test(pinned)) {
    return { problem: `is not pinned by a sha256 digest; write it as ${FORM}` };
  }
  const named = image.slice(0, at);
  const colon = named.lastIndexOf(':');
  if (colon <= named.lastIndexOf('/')) {
    return { problem: `names no tag, so Docker Hub cannot be asked when its digest was pushed; write it as ${FORM}` };
  }
  const tag = named.slice(colon + 1);
  const parts = named.slice(0, colon).split('/');
  const first = parts[0] ?? '';
  // A first component with a dot or a port, or localhost, is a registry, as Docker reads a reference.
  const registry = parts.length > 1 && (first.includes('.') || first.includes(':') || first === 'localhost') ? first : null;
  const segments = registry === null ? parts : parts.slice(1);
  if (!TAG.test(tag) || segments.length === 0 || !segments.every((part) => COMPONENT.test(part)) || (registry !== null && !DOMAIN.test(registry))) {
    return { problem: `is not an image reference of the form ${FORM}` };
  }
  const hub = registry === null || HUB_REGISTRIES.has(registry.toLowerCase());
  if (hub && segments.length > 2) {
    return { problem: 'names a Docker Hub repository by more than namespace/name, which Docker Hub does not hold' };
  }
  return { registry: hub ? null : registry, repository: hub && segments.length === 1 ? `library/${segments[0] ?? ''}` : segments.join('/'), tag, digest: pinned };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const blankOrComment = (line: string) => /^\s*(?:#|$)/.test(line);

/**
 * A Dockerfile's instructions, each with its first line's number: continuation lines joined (under the file's `escape`
 * directive), comment and blank lines left out, and the bodies of RUN, COPY and ADD heredocs skipped, since they are a
 * command's input, never instructions.
 */
function instructions(text: string): { readonly line: number; readonly text: string }[] {
  const lines = text.split(/\r?\n/);
  let escape = '\\';
  for (const line of lines) {
    const directive = /^#\s*([A-Za-z]+)\s*=\s*(\S+)\s*$/.exec(line);
    if (directive === null) {
      break;
    }
    if (directive[1]?.toLowerCase() === 'escape' && (directive[2] === '`' || directive[2] === '\\')) {
      escape = directive[2];
    }
  }
  const result: { line: number; text: string }[] = [];
  let index = 0;
  while (index < lines.length) {
    const start = index;
    let current = lines[index] ?? '';
    index += 1;
    if (blankOrComment(current)) {
      continue;
    }
    while (current.trimEnd().endsWith(escape) && index < lines.length) {
      current = current.trimEnd().slice(0, -1);
      while (index < lines.length && blankOrComment(lines[index] ?? '')) {
        index += 1;
      }
      current += ` ${lines[index] ?? ''}`;
      index += 1;
    }
    if (/^\s*(?:RUN|COPY|ADD)\s/i.test(current)) {
      for (const match of current.matchAll(/<<(-?)(["']?)([A-Za-z_][A-Za-z0-9_]*)\2/g)) {
        const strip = match[1] === '-';
        while (index < lines.length && (strip ? (lines[index] ?? '').replace(/^\t+/, '') : lines[index]) !== match[3]) {
          index += 1;
        }
        index += 1;
      }
    }
    result.push({ line: start + 1, text: current.trim() });
  }
  return result;
}

/** An instruction's leading `--name=value` flags, value unquoted. */
function flags(words: readonly string[]): { readonly name: string; readonly value: string }[] {
  const result: { name: string; value: string }[] = [];
  for (const word of words) {
    const flag = /^--([A-Za-z-]+)(?:=(.*))?$/.exec(word);
    if (flag === null) {
      break;
    }
    result.push({ name: flag[1]?.toLowerCase() ?? '', value: (flag[2] ?? '').replace(/^(["'])(.*)\1$/, '$2') });
  }
  return result;
}

function dockerfileImages(file: string, text: string, uses: ImageUse[], unread: string[]): void {
  // Every `# syntax=` line names the frontend image BuildKit pulls before it reads the file (CI-13 reads them all, as here).
  text.split(/\r?\n/).forEach((line, index) => {
    const syntax = /^#\s*syntax\s*=\s*(\S+)/i.exec(line)?.[1];
    if (syntax !== undefined) {
      uses.push({ image: syntax, where: `${file}:${String(index + 1)}` });
    }
  });
  // The stages so far, by name (lower case, as BuildKit compares them) or null; the last is the current one.
  const stages: (string | null)[] = [];
  const earlierStage = (from: string) => (/^\d+$/.test(from) ? Number(from) < stages.length - 1 : stages.slice(0, -1).includes(from.toLowerCase()));
  for (const { line, text: instruction } of instructions(text)) {
    const where = `${file}:${String(line)}`;
    const [keyword = '', ...words] = instruction.split(/\s+/);
    const command = keyword.toUpperCase();
    if (command === 'FROM') {
      const args = words.filter((word) => !word.startsWith('--'));
      const image = args[0] ?? '';
      if (image !== '' && image.toLowerCase() !== 'scratch' && !stages.includes(image.toLowerCase())) {
        uses.push({ image, where });
      }
      stages.push(args[1]?.toLowerCase() === 'as' ? (args[2]?.toLowerCase() ?? null) : null);
    } else if (command === 'COPY') {
      for (const { value } of flags(words).filter((flag) => flag.name === 'from')) {
        if (!earlierStage(value)) {
          unread.push(`${where}: COPY --from=${value} names an image, not an earlier stage; the image rule reads only FROM and # syntax= lines, so copy from a stage built FROM a pinned image (${RUNBOOK})`);
        }
      }
    } else if (command === 'RUN') {
      for (const { value } of flags(words).filter((flag) => flag.name === 'mount')) {
        const from = value
          .split(',')
          .map((option) => /^from=(.*)$/i.exec(option.trim())?.[1])
          .find((option) => option !== undefined);
        if (from !== undefined && !earlierStage(from)) {
          unread.push(`${where}: RUN --mount=…,from=${from} names an image, not an earlier stage; the image rule reads only FROM and # syntax= lines, so mount from a stage built FROM a pinned image (${RUNBOOK})`);
        }
      }
    }
  }
}

function workflowImages(file: string, text: string, uses: ImageUse[], unread: string[]): void {
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    unread.push(`${file}: not YAML (${error instanceof Error ? error.message : String(error)}), so the images it names cannot be read`);
    return;
  }
  const jobs = isRecord(parsed) && isRecord(parsed.jobs) ? parsed.jobs : {};
  for (const [id, job] of Object.entries(jobs)) {
    if (!isRecord(job)) {
      continue;
    }
    const at = `${file} ${id}`;
    if (job.container !== undefined) {
      const image = isRecord(job.container) ? job.container.image : job.container;
      if (typeof image === 'string') {
        uses.push({ image, where: `${at} container` });
      } else {
        unread.push(`${at} container: names no image the rule can read; write its image as ${FORM}`);
      }
    }
    if (job.services !== undefined) {
      for (const [name, service] of Object.entries(isRecord(job.services) ? job.services : { '': job.services })) {
        const image = isRecord(service) ? service.image : undefined;
        if (typeof image === 'string') {
          uses.push({ image, where: `${at} services.${name}` });
        } else {
          unread.push(`${at} services${name === '' ? '' : `.${name}`}: names no image the rule can read; write its image as ${FORM}`);
        }
      }
    }
    const steps: unknown[] = Array.isArray(job.steps) ? job.steps : [];
    steps.forEach((step, index) => {
      if (!isRecord(step) || typeof step.uses !== 'string') {
        return;
      }
      const where = `${at} step ${String(index + 1)}`;
      // An action's name is case-insensitive on GitHub.
      const action = step.uses.toLowerCase();
      const inputs = isRecord(step.with) ? step.with : {};
      if (action.startsWith('docker://')) {
        uses.push({ image: step.uses.slice('docker://'.length), where });
      } else if (action.startsWith('docker/setup-buildx-action@')) {
        const options = typeof inputs['driver-opts'] === 'string' ? inputs['driver-opts'].split(/\r?\n/).map((option) => option.trim()) : [];
        const builders = options.filter((option) => option.startsWith('image=')).map((option) => option.slice('image='.length));
        for (const image of builders) {
          uses.push({ image, where });
        }
        // Only the docker driver runs no builder container; the others run moby/buildkit:buildx-stable-1, a mutable tag, unless named.
        if (builders.length === 0 && inputs.driver !== 'docker') {
          unread.push(`${where}: setup-buildx names no builder image (driver-opts image=…), so it runs moby/buildkit:buildx-stable-1 by tag; name it as image=moby/buildkit:vX.Y.Z@sha256:<64 hex>`);
        }
      } else if (action.startsWith('docker/build-push-action@')) {
        const contexts = inputs['build-contexts'];
        if (typeof contexts === 'string' && /docker-image:\/\//i.test(contexts)) {
          unread.push(`${where}: build-contexts names an image (docker-image://), which the image rule does not read; build FROM a pinned image in the Dockerfile instead (${RUNBOOK})`);
        }
      }
    });
  }
}

function composeImages(text: string | undefined, uses: ImageUse[], unread: string[]): void {
  if (text === undefined) {
    return;
  }
  let parsed: unknown;
  try {
    parsed = parse(text);
  } catch (error) {
    unread.push(`${COMPOSE_FILE}: not YAML (${error instanceof Error ? error.message : String(error)}), so the images it names cannot be read`);
    return;
  }
  if (isRecord(parsed) && parsed.include !== undefined) {
    unread.push(`${COMPOSE_FILE}: include: brings in another compose file, whose images the image rule does not read; name every service in ${COMPOSE_FILE}`);
  }
  const services = isRecord(parsed) && isRecord(parsed.services) ? parsed.services : {};
  for (const [name, service] of Object.entries(services)) {
    if (!isRecord(service)) {
      continue;
    }
    const where = `${COMPOSE_FILE} services.${name}`;
    if (service.build !== undefined) {
      unread.push(`${where}: build: builds an image the image rule does not read; run an image by digest (image: ${FORM})`);
    }
    if (isRecord(service.extends) && service.extends.file !== undefined) {
      unread.push(`${where}: extends: names another compose file, whose images the image rule does not read; name the service's image in ${COMPOSE_FILE}`);
    }
    if (typeof service.image === 'string') {
      uses.push({ image: service.image, where });
    }
  }
}

/**
 * Every image the tree names, with where, in the order the files are read (Dockerfiles, the compose file, workflows),
 * and every image reference it holds that the rule does not read (S6, E17).
 */
export function imagesOf(tree: Tree): { readonly uses: readonly ImageUse[]; readonly unread: readonly string[] } {
  const uses: ImageUse[] = [];
  const unread: string[] = [];
  for (const [file, text] of Object.entries(tree.dockerfiles ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    dockerfileImages(file, text, uses, unread);
  }
  composeImages(tree.compose, uses, unread);
  for (const [file, text] of Object.entries(tree.workflows ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    workflowImages(file, text, uses, unread);
  }
  for (const file of tree.imageFiles ?? []) {
    unread.push(
      `${file}: an image file outside apps/<name>/Dockerfile and ${COMPOSE_FILE}, the files the image rule reads (release.yml and release-dry-run.yml compute file:, so any Dockerfile can be built, and Compose prefers compose.yaml to ${COMPOSE_FILE}); remove it, or name its images in those files`,
    );
  }
  return { uses, unread };
}

/** The tree's images and the problems of its form: references the rule does not read, and references not `name:tag@sha256:<64 hex>`. */
function formOf(tree: Tree): { readonly uses: readonly ImageUse[]; readonly problems: readonly string[] } {
  const { uses, unread } = imagesOf(tree);
  const malformed = uses.flatMap((use) => {
    const name = parseImage(use.image);
    return 'problem' in name ? [`${use.where}: ${use.image} ${name.problem}`] : [];
  });
  return { uses, problems: [...unread, ...malformed] };
}

/** The exceptions list's problems that need no read: one entry per image, and each kind on the registry it applies to (B1, E15). */
function listProblems(entries: readonly ImageAgeException[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.image)) {
      problems.push(`${IMAGE_AGE_EXCEPTIONS_FILE} lists ${entry.image} more than once; one entry per image`);
    }
    seen.add(entry.image);
    const name = parseImage(entry.image);
    if ('problem' in name) {
      problems.push(`${IMAGE_AGE_EXCEPTIONS_FILE}: ${entry.image} ${name.problem}`);
    } else if (entry.kind === 'age-unprovable' && name.registry === null) {
      problems.push(
        `${entry.image}: an age-unprovable entry applies only to a registry other than Docker Hub, where no push time can be read; a Docker Hub digest is held to the time Hub recorded, and one Hub shows on no tag passes under no entry: pin a tag's current digest (${RUNBOOK})`,
      );
    } else if (entry.kind === 'security-fix' && name.registry !== null) {
      problems.push(`${entry.image}: a security-fix entry waives only the release age, which check-toolchain cannot read on ${name.registry}; an image there takes an age-unprovable entry (${RUNBOOK})`);
    }
  }
  return problems;
}

const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? '' : 's'}`;

/**
 * The offline form rule (E5): every image the tree names is `name:tag@sha256:<64 hex>`, every reference the rule does
 * not read is refused (S6), and the exceptions list holds one entry per image, each of a kind its registry allows.
 */
export function imageFormRule(tree: Tree, entries: readonly ImageAgeException[]): Finding[] {
  const { uses, problems } = formOf(tree);
  const all = [...problems, ...listProblems(entries)];
  return all.length > 0
    ? all.map((message) => ({ level: 'error', rule: RULE, message }))
    : [{ level: 'ok', rule: RULE, message: `${plural(uses.length, 'image reference')}, each ${FORM}, and none the image rule does not read` }];
}

/** How one image's age was read. */
type Verdict =
  | { readonly kind: 'pushed'; readonly at: string; readonly source: string }
  | { readonly kind: 'nowhere'; readonly current: HubTag | null; readonly searched: number }
  | { readonly kind: 'untimed'; readonly on: string }
  | { readonly kind: 'unprovable'; readonly registry: string }
  | { readonly kind: 'failed'; readonly message: string }
  | { readonly kind: 'unread' };

/** Whether a Hub tag carries a digest: as its own (an index's), or as one of its platforms' manifests (N9). */
const carries = (tag: HubTag, digest: string) => tag.digest === digest || tag.images.some((image) => image.digest === digest);

/** The youngest time a Hub tag records for what it carries: its tag_last_pushed, its last_updated and each image's last_pushed. */
function youngest(tag: HubTag): { readonly at: string; readonly field: string } | null {
  const times = [
    { at: tag.tag_last_pushed, field: 'tag_last_pushed' },
    { at: tag.last_updated, field: 'last_updated' },
    ...tag.images.map((image) => ({ at: image.last_pushed, field: 'images[].last_pushed' })),
  ];
  let best: { at: string; field: string } | null = null;
  for (const { at, field } of times) {
    if (at !== null && (best === null || Date.parse(at) > Date.parse(best.at))) {
      best = { at, field };
    }
  }
  return best;
}

/**
 * A Docker Hub digest's push time: the youngest its tag records when the tag carries it; else the youngest of the most
 * recently updated tags that carry it, searched HUB_SEARCH_PAGES pages deep (the first page holding one holds the most
 * recently updated); else nowhere, with the tag's current state.
 */
async function hubAge(name: ImageName, registry: Pick<Registry, 'hubTag' | 'hubTags'>, signal: AbortSignal): Promise<Verdict> {
  const tag = await registry.hubTag(name.repository, name.tag, signal);
  if (tag !== null && carries(tag, name.digest)) {
    const time = youngest(tag);
    return time === null ? { kind: 'untimed', on: tag.name } : { kind: 'pushed', at: time.at, source: `Docker Hub's ${time.field} of the tag ${tag.name}` };
  }
  let searched = 0;
  for (let page = 1; page <= HUB_SEARCH_PAGES; page += 1) {
    const { tags, next } = await registry.hubTags(name.repository, page, signal);
    searched += tags.length;
    const carriers = tags.filter((other) => carries(other, name.digest));
    if (carriers.length > 0) {
      let best: { at: string; field: string; on: string } | null = null;
      for (const other of carriers) {
        const time = youngest(other);
        if (time !== null && (best === null || Date.parse(time.at) > Date.parse(best.at))) {
          best = { ...time, on: other.name };
        }
      }
      if (best === null) {
        return { kind: 'untimed', on: carriers[0]?.name ?? name.tag };
      }
      const moved = tag === null ? `Docker Hub has no tag ${name.tag}` : `the tag ${name.tag} names ${tag.digest ?? 'no digest'} now`;
      return { kind: 'pushed', at: best.at, source: `Docker Hub's ${best.field} of the tag ${best.on}, which carries it; ${moved}` };
    }
    if (!next) {
      break;
    }
  }
  return { kind: 'nowhere', current: tag, searched };
}

/** At most `limit` at once, in order. */
async function eachAtMost<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await run(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** What the networked rule reads: both trees, the event, now, and the deadline (IMAGE_DEADLINE_MS from the first read when absent). */
export interface ImageInput {
  readonly head: Tree;
  readonly base: Tree;
  readonly event: CheckEvent;
  readonly now: Date;
  readonly signal?: AbortSignal;
}

/**
 * The networked image rule: the form rule's problems, then each image new against the base read and judged, then the
 * exceptions list's entries (their windows, through exclude-window.ts, their expiry and their use). Never throws for a
 * network failure: each fails closed as an error finding, a warning on a push.
 */
export async function imageRule(
  input: ImageInput,
  lists: { readonly head: readonly ImageAgeException[]; readonly base: readonly ImageAgeException[] },
  minutes: number,
  registry: Pick<Registry, 'hubTag' | 'hubTags'>,
): Promise<Finding[]> {
  const age: Level = input.event === 'push' ? 'warning' : 'error';
  const now = input.now.getTime();
  const head = formOf(input.head);
  const findings: Finding[] = [...head.problems, ...listProblems(lists.head)].map((message) => ({ level: 'error', rule: RULE, message }));
  const before = new Set(imagesOf(input.base).uses.flatMap((use) => /@(sha256:[0-9a-f]{64})$/.exec(use.image)?.[1] ?? []));
  // Each well-formed image once, with every place it is named, in the order it is first named.
  const named = new Map<string, { readonly name: ImageName; readonly wheres: string[] }>();
  for (const use of head.uses) {
    const name = parseImage(use.image);
    if (!('problem' in name)) {
      const entry = named.get(use.image) ?? { name, wheres: [] };
      entry.wheres.push(use.where);
      named.set(use.image, entry);
    }
  }
  const fresh = [...named.entries()].filter(([, { name }]) => !before.has(name.digest));
  const live = lists.head.filter((entry) => Date.parse(entry.expires) > now);
  const known = new Map<string, KnownTime>();
  if (fresh.length === 0) {
    const digests = new Set([...named.values()].map(({ name }) => name.digest)).size;
    findings.push({ level: 'ok', rule: RULE, message: `no image is new against the base, so nothing is read (${plural(digests, 'digest')} named, each one in the base)` });
  } else {
    const deadline = input.signal ?? AbortSignal.timeout(IMAGE_DEADLINE_MS);
    const verdicts = await eachAtMost(fresh, IMAGE_READS_AT_ONCE, async ([, { name }]): Promise<Verdict> => {
      if (name.registry !== null) {
        return { kind: 'unprovable', registry: name.registry };
      }
      if (deadline.aborted) {
        return { kind: 'unread' };
      }
      try {
        return await hubAge(name, registry, deadline);
      } catch (error) {
        if (deadline.aborted) {
          return { kind: 'unread' };
        }
        if (error instanceof NetworkReadError) {
          return { kind: 'failed', message: error.message };
        }
        throw error;
      }
    });
    const unread: string[] = [];
    fresh.forEach(([image, { name, wheres }], index) => {
      const verdict = verdicts[index] ?? { kind: 'unread' };
      const subject = `${image} (${wheres.join(', ')})`;
      const add = (level: Level, message: string) => findings.push({ level, rule: RULE, message });
      switch (verdict.kind) {
        case 'pushed': {
          known.set(image, { what: 'the digest', at: verdict.at, as: 'pushed' });
          const matureAt = Date.parse(verdict.at) + minutes * MINUTE_MS;
          const fix = live.find((entry) => entry.image === image && entry.kind === 'security-fix');
          if (matureAt <= now) {
            add('ok', `${subject} was pushed ${verdict.at} (${verdict.source}), at least ${ageWords(minutes)} ago`);
          } else if (fix?.kind === 'security-fix') {
            add('ok', `${subject} was pushed ${verdict.at} (${verdict.source}), under ${ageWords(minutes)} ago, and passes under its live security-fix entry (${fix.advisory}, fixed in ${fix.fixes.package} ${fix.fixes.version}) until ${fix.expires}`);
          } else {
            add(age, `${subject} was pushed ${verdict.at} (${verdict.source}), under ${ageWords(minutes)} ago; it is old enough from ${new Date(matureAt).toISOString()}: ${REMEDY}`);
          }
          break;
        }
        case 'nowhere': {
          const time = verdict.current === null ? null : youngest(verdict.current);
          const current =
            verdict.current === null
              ? `Docker Hub has no tag ${name.tag} of ${name.repository}`
              : `Docker Hub's tag ${name.tag} names ${verdict.current.digest ?? 'no digest'} now${time === null ? '' : `, pushed ${time.at} and so old enough from ${new Date(Date.parse(time.at) + minutes * MINUTE_MS).toISOString()}`}`;
          add(
            age,
            `${subject}: ${current}, and none of the ${plural(verdict.searched, 'most recently updated tag')} of ${name.repository} carries ${name.digest}, so when it was pushed cannot be read, and no exclude clears that: pin a tag's current digest (${RUNBOOK})`,
          );
          break;
        }
        case 'untimed':
          add(age, `${subject}: Docker Hub's tag ${verdict.on} carries it but records no push time, so its age cannot be read, and no exclude clears that: pin a digest whose tag records one (${RUNBOOK})`);
          break;
        case 'unprovable': {
          const waiver = live.find((entry) => entry.image === image && entry.kind === 'age-unprovable');
          if (waiver === undefined) {
            add(
              age,
              `${subject}: ${verdict.registry} is not Docker Hub, the one registry whose push times check-toolchain reads, so its age is unprovable; take the image from Docker Hub, or add an age-unprovable entry for it to ${IMAGE_AGE_EXCEPTIONS_FILE} with its reason, the date added and an expiry (${RUNBOOK})`,
            );
          } else {
            add('ok', `${subject} is on ${verdict.registry}, whose push times check-toolchain cannot read, and passes under its live age-unprovable entry until ${waiver.expires}`);
          }
          break;
        }
        case 'failed':
          add(age, `${subject}: ${verdict.message}`);
          break;
        case 'unread':
          unread.push(image);
          break;
      }
    });
    if (unread.length > 0) {
      findings.push({ level: age, rule: RULE, message: `${HUB_HOST}: the image reads stopped at their deadline (${String(IMAGE_DEADLINE_MS / 1000)} s) with ${plural(unread.length, 'image')} unread, ${unread.join(', ')}; re-run` });
    }
  }
  findings.push(...exceptionFindings(input, lists, head.uses, known, minutes));
  return findings;
}

/**
 * The exceptions list's entries: an entry this change adds or rewrites inside its kind's window (exclude-window.ts; a
 * security-fix entry's known time is its digest's push time when this run read it), the expired rule, and an entry for
 * an image the tree no longer names, a warning.
 */
function exceptionFindings(
  input: ImageInput,
  lists: { readonly head: readonly ImageAgeException[]; readonly base: readonly ImageAgeException[] },
  uses: readonly ImageUse[],
  known: ReadonlyMap<string, KnownTime>,
  minutes: number,
): Finding[] {
  const findings: Finding[] = [];
  const baseEntries = new Set(lists.base.map((entry) => JSON.stringify(entry)));
  const edited = JSON.stringify(lists.head.map((entry) => JSON.stringify(entry)).sort()) !== JSON.stringify([...baseEntries].sort());
  const images = new Set(uses.map((use) => use.image));
  for (const entry of lists.head) {
    if (!baseEntries.has(JSON.stringify(entry))) {
      const window: ExcludeWindow = entry.kind === 'security-fix' ? { kind: 'security-fix', known: known.get(entry.image) ?? null, minutes } : { kind: 'reasoned' };
      findings.push(...excludeWindowProblems(entry.image, entry, window, input.now).map((message): Finding => ({ level: 'error', rule: RULE, message })));
    }
    const expired = expiredExclude(entry.image, entry.expires, input.now, { event: input.event, edited, list: IMAGE_AGE_EXCEPTIONS_FILE });
    if (expired !== null) {
      findings.push({ ...expired, rule: RULE });
    } else if (!images.has(entry.image)) {
      findings.push({ level: 'warning', rule: RULE, message: `${entry.image}: no Dockerfile, compose file or workflow names it any longer; remove it from ${IMAGE_AGE_EXCEPTIONS_FILE} (the weekly triage, docs/runbooks/dependency-upgrades.md)` });
    }
  }
  return findings;
}
