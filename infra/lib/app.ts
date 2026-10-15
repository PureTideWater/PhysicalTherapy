import { App } from 'aws-cdk-lib';

import { ENVIRONMENTS, stackName } from './environments';
import { PlatformStack } from './platform-stack';

/** Builds the CDK app: one PlatformStack per environment. Account and region come from CDK's defaults. */
export function buildApp(app: App = new App()): App {
  for (const environmentName of ENVIRONMENTS) {
    new PlatformStack(app, stackName(environmentName), {
      environmentName,
      stackName: stackName(environmentName),
      description: `Therapy contract-payment platform (${environmentName})`,
    });
  }
  return app;
}
