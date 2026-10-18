import { describe, expect, it } from 'vitest';

import { IMAGES, repositoryName } from '../lib/constructs/images';
import { ENVIRONMENTS } from '../lib/environments';
import { getAtt, keyId, logicalIdOf, propertiesOf, resourcesOf, synthesized } from './synth';

/**
 * PRD 16, Dependency and image hygiene ("container scanning"); PRD 18, Releases ("tagged images",
 * "rollback by redeploying the previous image"). Evidence: these CDK assertions.
 */
describe.each(ENVIRONMENTS)('%s: image repositories', (environment) => {
  const { stack, template } = synthesized(environment);
  const repositories = resourcesOf(template, 'AWS::ECR::Repository');

  it('has a web and a worker repository, named for the environment, and no other', () => {
    expect(repositories.map(([, repository]) => propertiesOf(repository).RepositoryName).sort()).toEqual(IMAGES.map((image) => repositoryName(environment, image)).sort());
    expect(repositoryName(environment, 'web')).toBe(`tp-${environment}-web`);
    expect(repositories.map(([id]) => id).sort()).toEqual([logicalIdOf(stack, stack.images.repositories.web), logicalIdOf(stack, stack.images.repositories.worker)].sort());
  });

  it('scans every image on push and never lets a tag move', () => {
    for (const [id, repository] of repositories) {
      expect(propertiesOf(repository).ImageScanningConfiguration, id).toEqual({ ScanOnPush: true });
      expect(propertiesOf(repository).ImageTagMutability, id).toBe('IMMUTABLE');
    }
  });

  it('encrypts images under the environment key and keeps every release to roll back to', () => {
    for (const [id, repository] of repositories) {
      expect(propertiesOf(repository).EncryptionConfiguration, id).toEqual({ EncryptionType: 'KMS', KmsKey: getAtt(keyId(template), 'Arn') });
      expect(propertiesOf(repository).LifecyclePolicy, id).toBeUndefined();
      expect(propertiesOf(repository).EmptyOnDelete, id).toBeUndefined();
      expect(repository.DeletionPolicy, id).toBe('Retain');
      expect(propertiesOf(repository).RepositoryPolicyText, id).toBeUndefined();
    }
  });
});
