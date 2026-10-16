import { RemovalPolicy, aws_ecr as ecr, type aws_kms as kms } from 'aws-cdk-lib';
import { Construct } from 'constructs';

import type { EnvironmentName } from '../environments';

/** The two images CI builds and tags on a release (PRD 18, continuous integration: the third workflow). */
export const IMAGES = ['web', 'worker'] as const;
export type ImageName = (typeof IMAGES)[number];

/** The repository each image is pushed to in an environment's account. */
export function repositoryName(environment: EnvironmentName, image: ImageName): string {
  return `tp-${environment}-${image}`;
}

/**
 * The image repositories (PRD 15, Stack: compute; PRD 16, dependency and image hygiene: container
 * scanning; PRD 18, releases: tagged images, rollback by redeploying the previous image).
 *
 * - Tags are immutable: a release tag names one image forever, so the tag a deploy names (the
 *   ImageTag parameter) is the image that runs, and redeploying the previous tag is a rollback.
 *   The worker image also runs the migration task, so one tag pins the code and its migrations.
 * - Every push is scanned (basic scanning on push); the release workflow reads the findings.
 * - Images are encrypted under the environment key and kept when the stack is deleted. No lifecycle
 *   rule expires a tagged image: every previous release stays available to roll back to.
 */
export class Images extends Construct {
  readonly repositories: Readonly<Record<ImageName, ecr.Repository>>;

  constructor(scope: Construct, id: string, props: { readonly environmentName: EnvironmentName; readonly key: kms.IKey }) {
    super(scope, id);
    const repository = (image: ImageName, construct: string) =>
      new ecr.Repository(this, construct, {
        repositoryName: repositoryName(props.environmentName, image),
        imageScanOnPush: true,
        imageTagMutability: ecr.TagMutability.IMMUTABLE,
        encryption: ecr.RepositoryEncryption.KMS,
        encryptionKey: props.key,
        removalPolicy: RemovalPolicy.RETAIN,
      });
    this.repositories = { web: repository('web', 'Web'), worker: repository('worker', 'Worker') };
  }
}
