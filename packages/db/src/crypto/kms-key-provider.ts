import { DecryptCommand, GenerateDataKeyCommand, KMSClient } from '@aws-sdk/client-kms';

import { DATA_KEY_BYTES, type DataKey, DataKeyError, type KeyProvider, requirePractice, unwrapRef, wrappedRef } from './key-provider';

/**
 * The production key provider: KMS GenerateDataKey and Decrypt under the environment's
 * customer-managed key, with { practice_id } as the encryption context, so KMS itself refuses to
 * unwrap one practice's key for another and CloudTrail records each use against the practice.
 */
export interface KmsKeyProviderOptions {
  readonly client: Pick<KMSClient, 'send'>;
  /** The customer-managed key's ID, ARN or alias. */
  readonly keyId: string;
}

export class KmsKeyProvider implements KeyProvider {
  constructor(private readonly options: KmsKeyProviderOptions) {}

  async generateDataKey(practiceId: string): Promise<DataKey> {
    const practice = requirePractice(practiceId);
    const output = await this.options.client.send(
      new GenerateDataKeyCommand({ KeyId: this.options.keyId, KeySpec: 'AES_256', EncryptionContext: { practice_id: practice } }),
    );
    if (output.Plaintext?.length !== DATA_KEY_BYTES || output.CiphertextBlob === undefined || output.CiphertextBlob.length === 0) {
      throw new DataKeyError('KMS returned no usable data key');
    }
    return { plaintext: Buffer.from(output.Plaintext), wrapped: wrappedRef('kms', output.CiphertextBlob) };
  }

  async decryptDataKey(practiceId: string, wrapped: string): Promise<Buffer> {
    const practice = requirePractice(practiceId);
    const output = await this.options.client.send(
      new DecryptCommand({ KeyId: this.options.keyId, CiphertextBlob: unwrapRef('kms', wrapped), EncryptionContext: { practice_id: practice } }),
    );
    if (output.Plaintext?.length !== DATA_KEY_BYTES) {
      throw new DataKeyError('KMS returned no usable data key');
    }
    return Buffer.from(output.Plaintext);
  }
}

/** The provider with the SDK's own client (region and credentials from the environment), for the web and worker processes. */
export function createKmsKeyProvider(keyId: string): KmsKeyProvider {
  return new KmsKeyProvider({ client: new KMSClient({}), keyId });
}
