import { App } from 'aws-cdk-lib';

import type { OperatorEndpoints } from './constructs/monitoring';
import { ENVIRONMENTS, stackName } from './environments';
import { PlatformStack } from './platform-stack';

/** Deploy-time context keys for the operator's alert subscriptions (`cdk deploy -c tp:operatorEmail=...`). */
export const OPERATOR_EMAIL_CONTEXT = 'tp:operatorEmail';
export const OPERATOR_SMS_CONTEXT = 'tp:operatorSms';

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

/** Builds the CDK app: one PlatformStack per environment. Account and region come from CDK's defaults. */
export function buildApp(app: App = new App()): App {
  const email = stringContext(app, OPERATOR_EMAIL_CONTEXT);
  const sms = stringContext(app, OPERATOR_SMS_CONTEXT);
  const operator: OperatorEndpoints = { ...(email === undefined ? {} : { email }), ...(sms === undefined ? {} : { sms }) };
  for (const environmentName of ENVIRONMENTS) {
    new PlatformStack(app, stackName(environmentName), {
      environmentName,
      operator,
      stackName: stackName(environmentName),
      description: `Therapy contract-payment platform (${environmentName})`,
    });
  }
  return app;
}
