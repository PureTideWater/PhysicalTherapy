import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

import { describe, expect, it } from 'vitest';

import {
  CANARY_ARTIFACT_DAYS,
  CANARY_RUNTIME,
  CERTIFICATE_CHECK_INTERVAL,
  CERTIFICATE_MIN_DAYS,
  UPTIME_CHECKS,
  UPTIME_FAILURES_TO_ALARM,
  UPTIME_INTERVAL,
} from '../lib/constructs/uptime';
import { PARAMETER_NAMES } from '../lib/deploy-parameters';
import { ENVIRONMENTS } from '../lib/environments';
import { UPTIME_SCRIPT } from '../lib/uptime-script';
import { type CfnResource, type CfnStatement, actionsOf, getAtt, keyId, logicalIdOf, propertiesOf, ref, resourceById, resourcesOf, roleStatements, synthesized } from './synth';

/** A fake https and tls, recording the requests the script makes. */
interface Behaviour {
  readonly status?: number;
  readonly requestError?: string;
  readonly timeout?: boolean;
  readonly validTo?: string;
  readonly tlsError?: string;
}

function runScript(env: Record<string, string>, behaviour: Behaviour) {
  const requests: { options: Record<string, unknown>; body: string | undefined }[] = [];
  const connections: Record<string, unknown>[] = [];
  const https = {
    request: (options: Record<string, unknown>, onResponse: (response: EventEmitter & { statusCode?: number; resume: () => void }) => void) => {
      const request = new EventEmitter() as EventEmitter & { end: (body?: string) => void; destroy: (error: Error) => void };
      request.destroy = (error) => request.emit('error', error);
      request.end = (body) => {
        requests.push({ options, body });
        queueMicrotask(() => {
          if (behaviour.timeout === true) {
            request.emit('timeout');
          } else if (behaviour.requestError !== undefined) {
            request.emit('error', Object.assign(new Error('synthetic failure'), { code: behaviour.requestError }));
          } else {
            const response = Object.assign(new EventEmitter(), { statusCode: behaviour.status, resume: () => undefined });
            onResponse(response);
            queueMicrotask(() => response.emit('end'));
          }
        });
      };
      return request;
    },
  };
  const tls = {
    connect: (options: Record<string, unknown>, onSecure: () => void) => {
      connections.push(options);
      const socket = Object.assign(new EventEmitter(), {
        getPeerCertificate: () => (behaviour.validTo === undefined ? {} : { valid_to: behaviour.validTo }),
        end: () => undefined,
        destroy: (error: Error) => socket.emit('error', error),
      });
      queueMicrotask(() => {
        if (behaviour.tlsError !== undefined) {
          socket.emit('error', Object.assign(new Error('synthetic failure'), { code: behaviour.tlsError }));
        } else {
          onSecure();
        }
      });
      return socket;
    },
  };
  const exports: { handler?: () => Promise<string> } = {};
  const modules: Record<string, unknown> = { 'node:https': https, 'node:tls': tls };
  vm.runInNewContext(UPTIME_SCRIPT, {
    require: (name: string) => modules[name],
    exports,
    process: { env },
    Buffer,
    Date,
    Number,
    JSON,
    Math,
    Promise,
    Error,
    String,
  });
  if (exports.handler === undefined) {
    throw new Error('the script exports no handler');
  }
  return { result: exports.handler(), requests, connections };
}

const HOST = 'app.example.test';
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000 + 3_600_000).toUTCString();

describe('the uptime script', () => {
  it('passes when the web app answers the sign-in page with 200, asking as the application origin', async () => {
    const run = runScript({ TP_HOST: HOST, TP_CHECK: JSON.stringify(UPTIME_CHECKS.web) }, { status: 200 });
    await expect(run.result).resolves.toBe('passed');
    expect(run.requests).toHaveLength(1);
    expect(run.requests[0]?.options).toMatchObject({ host: HOST, servername: HOST, port: 443, method: 'GET', path: '/sign-in', headers: { origin: `https://${HOST}` } });
    expect(run.requests[0]?.body).toBeUndefined();
  });

  it('posts an empty JSON body to the sign-in API and passes on its 400 refusal', async () => {
    const run = runScript({ TP_HOST: HOST, TP_CHECK: JSON.stringify(UPTIME_CHECKS.api) }, { status: 400 });
    await expect(run.result).resolves.toBe('passed');
    expect(run.requests[0]?.options).toMatchObject({ method: 'POST', path: '/api/sign-in/hardware-key/options', headers: { 'content-type': 'application/json', 'content-length': '2' } });
    expect(run.requests[0]?.body).toBe('{}');
  });

  it('fails on any other status, naming the host, path and status only', async () => {
    await expect(runScript({ TP_HOST: HOST, TP_CHECK: JSON.stringify(UPTIME_CHECKS.web) }, { status: 502 }).result).rejects.toThrow(
      `GET https://${HOST}/sign-in answered 502, expected 200`,
    );
    await expect(runScript({ TP_HOST: HOST, TP_CHECK: JSON.stringify(UPTIME_CHECKS.api) }, { status: 200 }).result).rejects.toThrow(/answered 200, expected 400/);
  });

  it('fails when the request errors or times out', async () => {
    await expect(runScript({ TP_HOST: HOST, TP_CHECK: JSON.stringify(UPTIME_CHECKS.web) }, { requestError: 'ECONNREFUSED' }).result).rejects.toThrow(
      `GET https://${HOST}/sign-in failed: ECONNREFUSED`,
    );
    await expect(runScript({ TP_HOST: HOST, TP_CHECK: JSON.stringify(UPTIME_CHECKS.web) }, { timeout: true }).result).rejects.toThrow(/failed: timeout/);
  });

  it('passes while every certificate has at least the minimum days left, and checks each host by name', async () => {
    const run = runScript({ TP_CERTIFICATE_HOSTS: `${HOST},static.example.test`, TP_CERTIFICATE_MIN_DAYS: '30' }, { validTo: inDays(45) });
    await expect(run.result).resolves.toBe('passed');
    expect(run.connections.map((connection) => connection.servername)).toEqual([HOST, 'static.example.test']);
    expect(run.requests).toEqual([]);
  });

  it('fails when a certificate is within the minimum, missing or untrusted', async () => {
    await expect(runScript({ TP_CERTIFICATE_HOSTS: HOST, TP_CERTIFICATE_MIN_DAYS: '30' }, { validTo: inDays(12) }).result).rejects.toThrow(
      `the certificate of ${HOST} expires in 12 days, under 30`,
    );
    await expect(runScript({ TP_CERTIFICATE_HOSTS: HOST, TP_CERTIFICATE_MIN_DAYS: '30' }, {}).result).rejects.toThrow(`${HOST} presented no certificate`);
    await expect(runScript({ TP_CERTIFICATE_HOSTS: HOST, TP_CERTIFICATE_MIN_DAYS: '30' }, { tlsError: 'CERT_HAS_EXPIRED' }).result).rejects.toThrow(
      `TLS to ${HOST} failed: CERT_HAS_EXPIRED`,
    );
  });

  it('never reads a response body into a message', () => {
    expect(UPTIME_SCRIPT).toContain('response.resume()');
    expect(UPTIME_SCRIPT).not.toMatch(/on\('data'/);
    expect(UPTIME_SCRIPT).not.toContain('${');
  });
});

describe('the uptime contract with the web app', () => {
  const source = (file: string) => readFileSync(path.resolve(import.meta.dirname, '../../apps/web/src', file), 'utf8');

  it('checks the public sign-in page and a sign-in API route that answers an empty body with 400', () => {
    expect(source('app/sign-in/page.tsx')).toContain('loadPublicPage(signInPage');
    expect(source('app/api/sign-in/hardware-key/options/route.ts')).toContain('export const POST = routeHandler(hardwareKeyOptions');
    expect(source('lib/routes/sign-in.ts')).toMatch(/path: '\/api\/sign-in\/hardware-key\/options',[\s\S]{0,160}input: z\.object\(\{ email: emailAddress \}\)/);
    expect(source('lib/http/handler.ts')).toContain('invalid: 400,');
    expect(UPTIME_CHECKS.api).toMatchObject({ method: 'POST', body: {}, status: 400 });
  });
});

/** PRD 19, Monitoring and alerts: uptime checks on the web app and the API, certificate expiry. */
describe.each(ENVIRONMENTS)('%s: uptime and certificate checks', (environment) => {
  const { stack, template } = synthesized(environment);
  const canaries = resourcesOf(template, 'AWS::Synthetics::Canary');
  const canary = (construct: Parameters<typeof logicalIdOf>[1]) => resourceById(template, 'AWS::Synthetics::Canary', logicalIdOf(stack, construct));
  const topic = ref(logicalIdOf(stack, stack.monitoring.operatorTopic));

  it('runs a web, an API and a certificate canary, outside the VPC, on the same script and runtime', () => {
    expect(canaries.map(([, found]) => propertiesOf(found).Name).sort()).toEqual([`tp-${environment}-api`, `tp-${environment}-certs`, `tp-${environment}-web`]);
    for (const [id, found] of canaries) {
      expect(propertiesOf(found), id).toMatchObject({
        RuntimeVersion: CANARY_RUNTIME.name,
        Code: { Handler: 'index.handler', Script: UPTIME_SCRIPT },
        StartCanaryAfterCreation: true,
        ProvisionedResourceCleanup: 'AUTOMATIC',
      });
      expect(String(propertiesOf(found).Name).length, id).toBeLessThanOrEqual(21);
      expect(propertiesOf(found).VPCConfig, id).toBeUndefined();
    }
  });

  it('checks the web app and the API every five minutes against the application host', () => {
    for (const [construct, check] of [
      [stack.uptime.web, UPTIME_CHECKS.web],
      [stack.uptime.api, UPTIME_CHECKS.api],
    ] as const) {
      expect(propertiesOf(canary(construct))).toMatchObject({
        Schedule: { Expression: `rate(${String(UPTIME_INTERVAL.toMinutes())} minutes)` },
        RunConfig: { EnvironmentVariables: { TP_HOST: ref(PARAMETER_NAMES.appDomainName), TP_CHECK: JSON.stringify(check) } },
      });
    }
  });

  it('checks the application and static certificates hourly against the minimum days', () => {
    expect(propertiesOf(canary(stack.uptime.certificates))).toMatchObject({
      Schedule: { Expression: `rate(${String(CERTIFICATE_CHECK_INTERVAL.toMinutes())} minutes)` },
      RunConfig: {
        EnvironmentVariables: {
          TP_CERTIFICATE_HOSTS: { 'Fn::Join': ['', [ref(PARAMETER_NAMES.appDomainName), ',', ref(PARAMETER_NAMES.staticDomainName)]] },
          TP_CERTIFICATE_MIN_DAYS: String(CERTIFICATE_MIN_DAYS),
        },
      },
    });
    expect(CERTIFICATE_MIN_DAYS).toBe(30);
  });

  it('keeps run artifacts encrypted under the environment key in its own bucket', () => {
    for (const [id, found] of canaries) {
      expect(propertiesOf(found).ArtifactConfig, id).toEqual({ S3Encryption: { EncryptionMode: 'SSE_KMS', KmsKeyArn: getAtt(keyId(template), 'Arn') } });
      expect(JSON.stringify(propertiesOf(found).ArtifactS3Location), id).toContain(logicalIdOf(stack, stack.uptime.artifacts));
    }
    expect(CANARY_ARTIFACT_DAYS).toBe(35);
  });

  it('runs every canary under one role that writes artifacts, metrics and logs, and uses the key only through S3 for that bucket', () => {
    const roleId = logicalIdOf(stack, stack.uptime.role);
    for (const [id, found] of canaries) {
      expect(propertiesOf(found).ExecutionRoleArn, id).toEqual(getAtt(roleId, 'Arn'));
    }
    const statements = roleStatements(template, roleId);
    expect(statements.map((statement) => statement.Sid).sort()).toEqual(
      ['ArtifactsBucketLocation', 'ArtifactsEncryptionThroughS3', 'CanaryLogs', 'FindTheArtifactsBucket', 'SyntheticsMetrics', 'WriteArtifacts'].sort(),
    );
    const kms = statements.filter((statement) => actionsOf(statement).some((action) => action.startsWith('kms:')));
    expect(kms).toHaveLength(1);
    expect(JSON.stringify(kms[0]?.Condition)).toContain('kms:ViaService');
    expect(JSON.stringify(kms[0]?.Condition)).toContain(logicalIdOf(stack, stack.uptime.artifacts));
    const writes = statements.find((statement) => statement.Sid === 'WriteArtifacts') as CfnStatement;
    expect(JSON.stringify(writes.Resource)).toContain(logicalIdOf(stack, stack.uptime.artifacts));
    expect(propertiesOf(resourceById(template, 'AWS::IAM::Role', roleId)).Policies ?? []).toEqual([]);
  });

  it('alarms after two failed runs in a row, missing runs counting as failed, and tells the operator on recovery too', () => {
    for (const [alarmConstruct, canaryConstruct, period] of [
      [stack.uptime.webAlarm, stack.uptime.web, UPTIME_INTERVAL],
      [stack.uptime.apiAlarm, stack.uptime.api, UPTIME_INTERVAL],
      [stack.uptime.certificateAlarm, stack.uptime.certificates, CERTIFICATE_CHECK_INTERVAL],
    ] as const) {
      const alarm: CfnResource = resourceById(template, 'AWS::CloudWatch::Alarm', logicalIdOf(stack, alarmConstruct));
      expect(propertiesOf(alarm)).toMatchObject({
        Namespace: 'CloudWatchSynthetics',
        MetricName: 'SuccessPercent',
        Dimensions: [{ Name: 'CanaryName', Value: ref(logicalIdOf(stack, canaryConstruct)) }],
        Period: period.toSeconds(),
        EvaluationPeriods: UPTIME_FAILURES_TO_ALARM,
        DatapointsToAlarm: UPTIME_FAILURES_TO_ALARM,
        Threshold: 100,
        ComparisonOperator: 'LessThanThreshold',
        TreatMissingData: 'breaching',
        AlarmActions: [topic],
        OKActions: [topic],
      });
    }
  });
});
