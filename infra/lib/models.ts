import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * The model gateway's contract with the infrastructure (PRD 14, Provider and data path and Operational
 * limits; test matrix MOD-05; docs/adr/0048 and 0054).
 *
 * - The daily budget's alert: the gateway logs MODEL_BUDGET_EXCEEDED (error, a call refused) and
 *   MODEL_BUDGET_REACHED (warning, the call that crossed it) as the `error_code` of a JSON line with the
 *   practice's ID only (packages/model-gateway/src/gateway.ts). The web app and the worker's practice
 *   jobs both call the gateway, so a metric filter on each log group counts them and one alarm tells the
 *   operator.
 * - Bedrock: the web and worker tasks may invoke the models the current prompt versions pin, and no
 *   other. The identifiers are read from the prompts' own configuration
 *   (packages/model-gateway/prompts/<name>/v<n>/prompt.json, each purpose's highest version), so a new
 *   prompt version that pins another model changes the grant with it.
 */

export const MODEL_BUDGET_ERROR_CODES = ['MODEL_BUDGET_EXCEEDED', 'MODEL_BUDGET_REACHED'] as const;

export const MODEL_BUDGET_METRIC = { namespace: 'TherapyPlatform/Models', metricName: 'ModelBudgetEvents' } as const;

/** One evaluation period: the operator hears within five minutes. */
export const MODEL_BUDGET_PERIOD_SECONDS = 300;

/** Where the gateway's prompt versions live. */
export const PROMPTS_DIR = path.resolve(import.meta.dirname, '../../packages/model-gateway/prompts');

interface PromptFile {
  readonly models: { readonly bedrock: Readonly<Record<string, string>> };
}

/** The Bedrock model identifiers each purpose's current (highest) prompt version pins, every variant, sorted. */
export function pinnedBedrockModels(dir: string = PROMPTS_DIR): string[] {
  const models = new Set<string>();
  for (const name of readdirSync(dir, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    const versions = readdirSync(path.join(dir, name.name))
      .map((entry) => /^v([1-9][0-9]*)$/.exec(entry)?.[1])
      .filter((version): version is string => version !== undefined)
      .map((version) => Number.parseInt(version, 10))
      .sort((a, b) => a - b);
    const current = versions.at(-1);
    if (current === undefined) {
      continue;
    }
    const prompt = JSON.parse(readFileSync(path.join(dir, name.name, `v${String(current)}`, 'prompt.json'), 'utf8')) as PromptFile;
    for (const id of Object.values(prompt.models.bedrock)) {
      models.add(id);
    }
  }
  return [...models].sort();
}

/** A cross-region inference profile's identifier starts with its geography (us., eu., apac., global. ...). */
const INFERENCE_PROFILE = /^([a-z]{2,6})\.(.+\..+)$/;

/**
 * The resources InvokeModel names for a pinned identifier: the foundation model in the stack's region, or,
 * for an inference profile, the profile in this account and the foundation model it routes to in any region.
 */
export function bedrockModelArns(modelId: string, partition: string, region: string, account: string): string[] {
  const profile = INFERENCE_PROFILE.exec(modelId);
  if (profile === null) {
    return [`arn:${partition}:bedrock:${region}::foundation-model/${modelId}`];
  }
  return [`arn:${partition}:bedrock:${region}:${account}:inference-profile/${modelId}`, `arn:${partition}:bedrock:*::foundation-model/${profile[2] ?? ''}`];
}
