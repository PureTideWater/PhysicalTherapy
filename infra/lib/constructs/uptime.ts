import {
  Duration,
  Stack,
  aws_cloudwatch as cloudwatch,
  type aws_cloudwatch_actions as cloudwatchActions,
  aws_iam as iam,
  type aws_kms as kms,
  aws_synthetics as synthetics,
  type aws_s3 as s3,
} from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { EnvironmentName } from '../environments';
import { UPTIME_SCRIPT } from '../uptime-script';
import { WEB_HEALTH_CHECK } from './edge';
import { privateBucket } from './storage';

/**
 * The checks the canaries make from outside (PRD 19, Monitoring and alerts: "uptime checks on the web
 * app and the API"): the sign-in page (the web app), and the sign-in API refusing an empty request
 * (the API: TLS, the web ACL, the load balancer and a route handler answering its own 400, which starts
 * no sign-in). Neither is signed in or touches a practice.
 */
export const UPTIME_CHECKS = {
  web: { method: 'GET', path: WEB_HEALTH_CHECK.path, status: 200 },
  api: { method: 'POST', path: '/api/sign-in/hardware-key/options', body: {}, status: 400 },
} as const;

/** How often the uptime checks run, and how many failed runs in a row raise the alarm. */
export const UPTIME_INTERVAL = Duration.minutes(5);
export const UPTIME_FAILURES_TO_ALARM = 2;

/**
 * Certificates are checked hourly (Synthetics schedules run at most an hour apart) and alarm 30 days
 * before they expire: ACM renews its own 60 days ahead, so a certificate this close to its end has
 * not renewed (PRD 19: certificate expiry). Two failed runs in a row raise it.
 */
export const CERTIFICATE_CHECK_INTERVAL = Duration.hours(1);
export const CERTIFICATE_MIN_DAYS = 30;

/** The Synthetics runtime (Node.js 22); the script uses Node's own modules only. */
export const CANARY_RUNTIME = synthetics.Runtime.SYNTHETICS_NODEJS_PUPPETEER_13_0;

/** Canary run artifacts are kept as long as the backups. */
export const CANARY_ARTIFACT_DAYS = 35;

export interface UptimeProps {
  readonly environmentName: EnvironmentName;
  readonly key: kms.IKey;
  readonly appDomainName: string;
  readonly staticDomainName: string;
  readonly notify: cloudwatchActions.SnsAction;
}

/**
 * Uptime and certificate checks (docs/adr/0049): CloudWatch Synthetics canaries in the stack's own
 * region, so their metrics and alarms sit beside the operator topic whatever region the stack is in
 * (Route 53 health-check metrics exist only in us-east-1). Three canaries share one script
 * (infra/lib/uptime-script.ts): the web app and the API every five minutes, and the served
 * certificates of the application and static hosts hourly, each alarming after two failed runs in a
 * row (a certificate within CERTIFICATE_MIN_DAYS of its end fails its run) and again when it passes. A canary that
 * stops reporting counts as failing. The canaries run outside the VPC, as a browser would. Their
 * artifacts go to a private bucket under the environment key that keeps them 35 days. They share one
 * role that writes those artifacts and the Synthetics metrics and logs only, and uses the key only
 * through S3 for that bucket (the Canary construct's own grant, the key for any use, is withheld).
 */
export class Uptime extends Construct {
  readonly artifacts: s3.Bucket;
  readonly role: iam.Role;
  readonly web: synthetics.Canary;
  readonly api: synthetics.Canary;
  readonly certificates: synthetics.Canary;
  readonly webAlarm: cloudwatch.Alarm;
  readonly apiAlarm: cloudwatch.Alarm;
  readonly certificateAlarm: cloudwatch.Alarm;

  constructor(scope: Construct, id: string, props: UptimeProps) {
    super(scope, id);
    this.artifacts = privateBucket(this, 'Artifacts', props.key, {
      lifecycleRules: [
        {
          id: 'canary-artifacts-expire',
          expiration: Duration.days(CANARY_ARTIFACT_DAYS),
          noncurrentVersionExpiration: Duration.days(1),
          abortIncompleteMultipartUploadAfter: Duration.days(1),
        },
      ],
    });
    this.role = this.canaryRole(props.key);
    const canary = (construct: string, name: string, schedule: Duration, environmentVariables: Record<string, string>) =>
      new synthetics.Canary(this, construct, {
        canaryName: `tp-${props.environmentName}-${name}`,
        runtime: CANARY_RUNTIME,
        test: synthetics.Test.custom({ handler: 'index.handler', code: synthetics.Code.fromInline(UPTIME_SCRIPT) }),
        schedule: synthetics.Schedule.rate(schedule),
        environmentVariables,
        timeout: Duration.seconds(60),
        artifactsBucketLocation: { bucket: this.artifacts, prefix: name },
        role: this.role.withoutPolicyUpdates(),
        artifactS3EncryptionMode: synthetics.ArtifactsEncryptionMode.KMS,
        artifactS3KmsKey: props.key,
        provisionedResourceCleanup: true,
        startAfterCreation: true,
      });
    this.web = canary('Web', 'web', UPTIME_INTERVAL, { TP_HOST: props.appDomainName, TP_CHECK: JSON.stringify(UPTIME_CHECKS.web) });
    this.api = canary('Api', 'api', UPTIME_INTERVAL, { TP_HOST: props.appDomainName, TP_CHECK: JSON.stringify(UPTIME_CHECKS.api) });
    this.certificates = canary('Certificates', 'certificates', CERTIFICATE_CHECK_INTERVAL, {
      TP_CERTIFICATE_HOSTS: `${props.appDomainName},${props.staticDomainName}`,
      TP_CERTIFICATE_MIN_DAYS: String(CERTIFICATE_MIN_DAYS),
    });

    const alarm = (construct: string, target: synthetics.Canary, description: string, period: Duration) => {
      const created = new cloudwatch.Alarm(this, construct, {
        alarmDescription: description,
        metric: target.metricSuccessPercent({ period, statistic: cloudwatch.Stats.AVERAGE }),
        comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        threshold: 100,
        evaluationPeriods: UPTIME_FAILURES_TO_ALARM,
        datapointsToAlarm: UPTIME_FAILURES_TO_ALARM,
        treatMissingData: cloudwatch.TreatMissingData.BREACHING,
      });
      created.addAlarmAction(props.notify);
      created.addOkAction(props.notify);
      return created;
    };
    this.webAlarm = alarm('WebDown', this.web, `The ${props.environmentName} web app failed its uptime check twice in a row.`, UPTIME_INTERVAL);
    this.apiAlarm = alarm('ApiDown', this.api, `The ${props.environmentName} API failed its uptime check twice in a row.`, UPTIME_INTERVAL);
    this.certificateAlarm = alarm(
      'CertificateExpiring',
      this.certificates,
      `A ${props.environmentName} certificate expires within ${String(CERTIFICATE_MIN_DAYS)} days or could not be checked, twice in a row.`,
      CERTIFICATE_CHECK_INTERVAL,
    );
  }

  /** What Synthetics needs to run a canary and keep its results, and nothing of the stack's data. */
  private canaryRole(key: kms.IKey): iam.Role {
    const stack = Stack.of(this);
    const role = new iam.Role(this, 'CanaryRole', {
      description: 'Uptime and certificate canaries: their artifacts, metrics and logs only',
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com', { conditions: { StringEquals: { 'aws:SourceAccount': stack.account } } }),
    });
    const statements = [
      new iam.PolicyStatement({ sid: 'FindTheArtifactsBucket', actions: ['s3:ListAllMyBuckets'], resources: ['*'] }),
      new iam.PolicyStatement({ sid: 'ArtifactsBucketLocation', actions: ['s3:GetBucketLocation'], resources: [this.artifacts.bucketArn] }),
      new iam.PolicyStatement({ sid: 'WriteArtifacts', actions: ['s3:PutObject'], resources: [this.artifacts.arnForObjects('*')] }),
      new iam.PolicyStatement({
        sid: 'ArtifactsEncryptionThroughS3',
        actions: ['kms:GenerateDataKey', 'kms:Decrypt'],
        resources: [key.keyArn],
        conditions: {
          StringEquals: { 'kms:ViaService': `s3.${stack.region}.amazonaws.com` },
          ArnLike: { 'kms:EncryptionContext:aws:s3:arn': [this.artifacts.bucketArn, this.artifacts.arnForObjects('*')] },
        },
      }),
      new iam.PolicyStatement({
        sid: 'SyntheticsMetrics',
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: { StringEquals: { 'cloudwatch:namespace': 'CloudWatchSynthetics' } },
      }),
      new iam.PolicyStatement({
        sid: 'CanaryLogs',
        actions: ['logs:CreateLogGroup', 'logs:CreateLogStream', 'logs:PutLogEvents'],
        resources: [`arn:${stack.partition}:logs:${stack.region}:${stack.account}:log-group:/aws/lambda/cwsyn-*`],
      }),
    ];
    for (const statement of statements) {
      role.addToPolicy(statement);
    }
    return role;
  }
}
