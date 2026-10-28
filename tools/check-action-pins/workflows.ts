import { parse } from 'yaml';

/**
 * The workflows' action references, read two ways: each `uses:` line with its comment, which carries the version a pin
 * stands for, and each step or job that names an action, with its inputs. The offline rules of the pin policy
 * (docs/adr/0066, Part 2; test matrix CI-11) are made from them: (a) every reference is `owner/repo[/path]@<40 hex> #
 * vX.Y.Z`, and (b) every action's repository is pinned to one commit and one version across every workflow.
 */

/** A `uses:` line: the reference and the comment after it, if any. */
const USES_LINE = /^\s*(?:-\s+)?uses:\s*(\S+)(?:\s+#\s*(.*?))?\s*$/;

/** A pinned reference: the repository, an optional path inside it, and a full commit SHA. */
export const PIN = /^([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.-]+)*)@([0-9a-f]{40})$/;

/** The version comment: a full release version, nothing else. */
export const VERSION = /^v\d+\.\d+\.\d+$/;

export interface UsesLine {
  readonly file: string;
  readonly line: number;
  /** The reference exactly as written after `uses:`. */
  readonly ref: string;
  /** The comment after it, trimmed, or undefined. */
  readonly comment: string | undefined;
}

export interface Pin {
  /** owner/repo. */
  readonly repo: string;
  /** The path inside the repository, without slashes at either end, or '' for the repository's root action. */
  readonly path: string;
  readonly sha: string;
  /** owner/repo[/path], the part before the @. */
  readonly action: string;
}

/** The pin a reference names, or undefined when it is not of the pinned form. */
export function parsePin(ref: string): Pin | undefined {
  const match = PIN.exec(ref);
  if (match === null) return undefined;
  const [, repo = '', sub = '', sha = ''] = match;
  return { repo, path: sub.replace(/^\//, ''), sha, action: `${repo}${sub}` };
}

/** Every `uses:` line of a workflow's text. */
export function usesLines(file: string, text: string): UsesLine[] {
  return text.split('\n').flatMap((line, index) => {
    const match = USES_LINE.exec(line);
    if (match === null) return [];
    return [{ file, line: index + 1, ref: match[1] ?? '', comment: match[2] === undefined || match[2] === '' ? undefined : match[2] }];
  });
}

/** A step or job that names an action or a reusable workflow, with the inputs it gives. */
export interface ActionUse {
  readonly file: string;
  readonly job: string;
  /** The step's index in its job, or -1 for a job that calls a reusable workflow. */
  readonly step: number;
  readonly uses: string;
  readonly with: Readonly<Record<string, unknown>>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Every action a workflow's jobs and steps name, read from its YAML. */
export function actionUses(file: string, text: string): ActionUse[] {
  const parsed: unknown = parse(text);
  const jobs = isRecord(parsed) && isRecord(parsed.jobs) ? parsed.jobs : {};
  return Object.entries(jobs).flatMap(([job, body]): ActionUse[] => {
    if (!isRecord(body)) return [];
    const own: ActionUse[] = typeof body.uses === 'string' ? [{ file, job, step: -1, uses: body.uses, with: isRecord(body.with) ? body.with : {} }] : [];
    const steps = Array.isArray(body.steps) ? (body.steps as unknown[]) : [];
    return [
      ...own,
      ...steps.flatMap((step, index): ActionUse[] =>
        isRecord(step) && typeof step.uses === 'string' ? [{ file, job, step: index, uses: step.uses, with: isRecord(step.with) ? step.with : {} }] : [],
      ),
    ];
  });
}

/** A workflow file's name and text. */
export interface WorkflowText {
  readonly file: string;
  readonly text: string;
}

/**
 * Rule (a), over every workflow: every reference is pinned, `owner/repo[/path]@<40 hex>`, with its release version as
 * the line's only comment; and every action the YAML names stands on a `uses:` line of its own, where the rule reads
 * it (a flow mapping such as `- { uses: … }` hides its comment).
 */
export function formProblems(workflows: readonly WorkflowText[]): string[] {
  return workflows.flatMap(({ file, text }) => {
    const lines = usesLines(file, text);
    const problems = lines.flatMap(({ line, ref, comment }) => {
      const where = `${file}:${String(line)}`;
      if (ref.startsWith('./')) return [`${where}: ${ref} is a local action or workflow; the pin policy names every action by repository and commit`];
      if (ref.startsWith('docker://')) return [`${where}: ${ref} runs an image directly; the pin policy names every action by repository and commit`];
      if (parsePin(ref) === undefined) return [`${where}: ${ref} is not pinned to a full commit SHA (owner/repo@<40 hex> # vX.Y.Z)`];
      if (comment === undefined || !VERSION.test(comment)) return [`${where}: ${ref} carries ${comment === undefined ? 'no comment' : `the comment "${comment}"`}, not its release version (# vX.Y.Z)`];
      return [];
    });
    const parsed = actionUses(file, text).map((use) => use.uses);
    const read = lines.map((line) => line.ref);
    const unread = parsed.filter((uses) => !read.includes(uses));
    return [...problems, ...unread.map((uses) => `${file}: ${uses} is not on a \`uses:\` line of its own, so its version comment cannot be read`)];
  });
}

/**
 * Rule (a), for a job: no job calls a reusable workflow of another repository (`jobs.<id>.uses`), since the pins and
 * images it runs are its own and nothing here reads them; its steps belong in a workflow of this repository (docs/adr/0066,
 * Part 5; design S7). A reusable workflow of this repository (`./…`) is refused by the form rule as a local reference.
 */
export function reusableWorkflowProblems(workflows: readonly WorkflowText[]): string[] {
  return workflows.flatMap(({ file, text }) =>
    actionUses(file, text)
      .filter((use) => use.step === -1 && !use.uses.startsWith('./'))
      .map((use) => `${file}: the job ${use.job} calls the reusable workflow ${use.uses}, whose own pins and images this check does not read; move its steps into a workflow here`),
  );
}

/**
 * Rule (b): one commit and one version per action repository across every workflow (actions/cache/restore and
 * actions/cache/save are one repository, one release), so a pin cannot drift between files and every comment names the
 * release its SHA is. Only well-formed pins are compared; rule (a) reports the rest.
 */
export function consistencyProblems(workflows: readonly WorkflowText[]): string[] {
  const seen = new Map<string, { sha: string; version: string; where: string }>();
  const problems: string[] = [];
  for (const { file, text } of workflows) {
    for (const { line, ref, comment } of usesLines(file, text)) {
      const pin = parsePin(ref);
      if (pin === undefined || comment === undefined || !VERSION.test(comment)) continue;
      const where = `${file}:${String(line)}`;
      const first = seen.get(pin.repo);
      if (first === undefined) {
        seen.set(pin.repo, { sha: pin.sha, version: comment, where });
        continue;
      }
      if (first.sha !== pin.sha) problems.push(`${where}: ${pin.repo} is pinned to ${pin.sha}, but to ${first.sha} at ${first.where}; one commit per action`);
      else if (first.version !== comment) problems.push(`${where}: ${pin.repo}@${pin.sha} is labelled ${comment}, but ${first.version} at ${first.where}; one version per commit`);
    }
  }
  return problems;
}

/** The version a pin's comments give it (rule (b) makes it one), by its full reference. */
export function versionsByRef(workflows: readonly WorkflowText[]): Map<string, string> {
  const versions = new Map<string, string>();
  for (const { file, text } of workflows) {
    for (const { ref, comment } of usesLines(file, text)) {
      if (comment !== undefined && VERSION.test(comment) && !versions.has(ref)) versions.set(ref, comment);
    }
  }
  return versions;
}
