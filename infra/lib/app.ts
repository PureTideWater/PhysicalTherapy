import { Annotations, App } from 'aws-cdk-lib';

import type { OperatorEndpoints } from './constructs/monitoring';
import { ENVIRONMENTS, stackName } from './environments';
import { PlatformStack } from './platform-stack';
import { DEPLOY_LAUNCH_READERS, LAUNCH_ENVIRONMENT, LAUNCH_REPORT_CONTEXT, LAUNCH_TAG_CONTEXT, type LaunchReaders, refuseHandTypedLaunch, screeningLaunchValue } from './screening-launch';

/** Deploy-time context keys for the operator's alert subscriptions (`cdk deploy -c tp:operatorEmail=...`). */
export const OPERATOR_EMAIL_CONTEXT = 'tp:operatorEmail';
export const OPERATOR_SMS_CONTEXT = 'tp:operatorSms';

/**
 * Deploy-time context for a rollback by redeploying the previous image (PRD 18): `cdk deploy -c
 * tp:skipMigrations=true --parameters ImageTag=<previous tag>` starts no migration task. Context is
 * read for one invocation only, so the next deploy migrates again.
 */
export const SKIP_MIGRATIONS_CONTEXT = 'tp:skipMigrations';

function stringContext(app: App, key: string): string | undefined {
  const value: unknown = app.node.tryGetContext(key);
  if (value === undefined || value === '') {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`context ${key} must be a string`);
  }
  return value;
}

function booleanContext(app: App, key: string): boolean {
  const value = stringContext(app, key) ?? 'false';
  if (value !== 'true' && value !== 'false') {
    throw new Error(`context ${key} must be true or false`);
  }
  return value === 'true';
}

/**
 * Builds the CDK app: one PlatformStack per environment. Account and region come from CDK's defaults. Production's
 * screening launch value is computed here, once, from `-c tp:launchReport` and `-c tp:launchTag` (screening-launch.ts;
 * decision 13 and the founder's ruling of 2026-10-22); `readers` are what it reads outside the code (the tests' own).
 */
export function buildApp(app: App = new App(), readers: LaunchReaders = DEPLOY_LAUNCH_READERS): App {
  const email = stringContext(app, OPERATOR_EMAIL_CONTEXT);
  const sms = stringContext(app, OPERATOR_SMS_CONTEXT);
  const runMigrations = !booleanContext(app, SKIP_MIGRATIONS_CONTEXT);
  const operator: OperatorEndpoints = { ...(email === undefined ? {} : { email }), ...(sms === undefined ? {} : { sms }) };
  refuseHandTypedLaunch(Object.keys(app.node.getAllContext() as Record<string, unknown>));
  const report = stringContext(app, LAUNCH_REPORT_CONTEXT);
  const tag = stringContext(app, LAUNCH_TAG_CONTEXT);
  const launch = screeningLaunchValue({ ...(report === undefined ? {} : { report }), ...(tag === undefined ? {} : { tag }) }, readers);
  for (const environmentName of ENVIRONMENTS) {
    const opens = environmentName === LAUNCH_ENVIRONMENT;
    const stack = new PlatformStack(app, stackName(environmentName), {
      environmentName,
      operator,
      runMigrations,
      ...(opens ? { screeningLaunch: launch.value } : {}),
      stackName: stackName(environmentName),
      description: `Therapy contract-payment platform (${environmentName})`,
    });
    if (opens) {
      for (const note of launch.notes) {
        Annotations.of(stack).addInfo(note);
      }
    }
  }
  return app;
}
