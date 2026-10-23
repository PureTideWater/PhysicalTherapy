import { App, CfnElement } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import type { IConstruct } from 'constructs';

import { buildApp } from '../lib/app';
import { ENVIRONMENTS, type EnvironmentName, stackName } from '../lib/environments';
import type { PlatformStack } from '../lib/platform-stack';
import type { LaunchReaders } from '../lib/screening-launch';

/** One CloudFormation resource, as the synthesized template holds it. */
export interface CfnResource {
  readonly Type: string;
  readonly Properties?: Record<string, unknown>;
  readonly DeletionPolicy?: string;
  readonly UpdateReplacePolicy?: string;
}

/** A policy statement as it appears in a synthesized template. */
export interface CfnStatement {
  readonly Sid?: string;
  readonly Effect: 'Allow' | 'Deny';
  readonly Action: string | string[];
  readonly Resource?: unknown;
  readonly Principal?: unknown;
  readonly Condition?: Record<string, Record<string, unknown>>;
}

export interface Synthesized {
  readonly app: App;
  readonly stack: PlatformStack;
  readonly template: Template;
}

/**
 * Synthesizing the app takes seconds; tests that synthesize inside the test body (rather than in a
 * describe block, which has no timeout) allow this long.
 */
export const SYNTH_TIMEOUT_MS = 60_000;

/** Builds the app with the given context (and, for the launch value, the given readers) and synthesizes every stack. */
export function synthesizeAll(context: Record<string, unknown> = {}, readers?: LaunchReaders): Record<EnvironmentName, Synthesized> {
  const app = buildApp(new App({ context }), readers);
  const result: Partial<Record<EnvironmentName, Synthesized>> = {};
  for (const environment of ENVIRONMENTS) {
    const stack = app.node.findChild(stackName(environment)) as PlatformStack;
    result[environment] = { app, stack, template: Template.fromStack(stack) };
  }
  return result as Record<EnvironmentName, Synthesized>;
}

let cached: Record<EnvironmentName, Synthesized> | undefined;

/** The stacks as `cdk synth` builds them (no deploy-time context), synthesized once per test file. */
export function synthesized(environment: EnvironmentName): Synthesized {
  cached ??= synthesizeAll();
  return cached[environment];
}

export function templateFor(environment: EnvironmentName): Template {
  return synthesized(environment).template;
}

/** Every resource in the template, by logical ID. */
export function allResources(template: Template): [string, CfnResource][] {
  return Object.entries((template.toJSON() as { Resources: Record<string, CfnResource> }).Resources);
}

/** The template's macros (`Transform`), as a list. */
export function transformsOf(template: Template): string[] {
  const transform = (template.toJSON() as { Transform?: string | string[] }).Transform;
  if (transform === undefined) {
    return [];
  }
  return Array.isArray(transform) ? transform : [transform];
}

/** Every resource of one type, by logical ID. */
export function resourcesOf(template: Template, type: string): [string, CfnResource][] {
  return Object.entries(template.findResources(type) as Record<string, CfnResource>);
}

/** The single resource of one type; fails when there is not exactly one. */
export function onlyResource(template: Template, type: string): [string, CfnResource] {
  const found = resourcesOf(template, type);
  if (found.length !== 1) {
    throw new Error(`expected one ${type}, found ${String(found.length)}`);
  }
  return found[0] as [string, CfnResource];
}

/** The resource of one type with the given logical ID; fails when there is none. */
export function resourceById(template: Template, type: string, logicalId: string): CfnResource {
  const found = resourcesOf(template, type).find(([id]) => id === logicalId);
  if (found === undefined) {
    throw new Error(`no ${type} ${logicalId}`);
  }
  return found[1];
}

/** A resource's properties, typed loosely for inspection. */
export function propertiesOf(resource: CfnResource): Record<string, unknown> {
  return resource.Properties ?? {};
}

/** `{ Ref: id }` */
export function ref(logicalId: string): { Ref: string } {
  return { Ref: logicalId };
}

/** `{ 'Fn::GetAtt': [id, attribute] }` */
export function getAtt(logicalId: string, attribute: string): { 'Fn::GetAtt': [string, string] } {
  return { 'Fn::GetAtt': [logicalId, attribute] };
}

/** The logical ID of the environment key. */
export function keyId(template: Template): string {
  return onlyResource(template, 'AWS::KMS::Key')[0];
}

/** Statements of every IAM policy (inline `AWS::IAM::Policy`) attached to the given role. */
export function roleStatements(template: Template, roleLogicalId: string): CfnStatement[] {
  return resourcesOf(template, 'AWS::IAM::Policy')
    .filter(([, policy]) => JSON.stringify(propertiesOf(policy).Roles) === JSON.stringify([ref(roleLogicalId)]))
    .flatMap(([, policy]) => (propertiesOf(policy).PolicyDocument as { Statement: CfnStatement[] }).Statement);
}

/** Actions of a statement as a list. */
export function actionsOf(statement: CfnStatement): string[] {
  return Array.isArray(statement.Action) ? statement.Action : [statement.Action];
}

/** The logical ID of the construct's default CloudFormation resource. */
export function logicalIdOf(stack: PlatformStack, construct: IConstruct): string {
  const child = construct.node.defaultChild;
  if (!(child instanceof CfnElement)) {
    throw new Error(`${construct.node.path} has no CloudFormation resource`);
  }
  return stack.getLogicalId(child);
}
