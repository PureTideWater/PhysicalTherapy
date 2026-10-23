import { createHash } from 'node:crypto';

import { SYNTHETIC_COMMIT, SYNTHETIC_RUN, SYNTHETIC_TAG } from './measurements';

/**
 * What `gh attestation verify --format json` prints for a synthetic capacity report and the bundle release.yml's report
 * job kept with it (actions/attest-build-provenance): one verified attestation, its in-toto statement naming the
 * report's SHA-256 under SLSA provenance v1, and the Fulcio certificate's fields as sigstore-go summarizes them, which
 * GitHub's OIDC token sets and the workflow cannot (gh 2.89.0 on sigstore-go 1.1.4). Everything in it is synthetic: no
 * bundle is signed and nothing is verified here; the launch check's tests read it as the deploy reads gh's output.
 */

/** The certificate's fields the launch check reads, as sigstore-go's certificate.Summary names them in JSON. */
export interface SyntheticCertificate {
  readonly subjectAlternativeName: string;
  readonly issuer: string;
  readonly buildSignerURI: string;
  readonly buildSignerDigest: string;
  readonly runnerEnvironment: string;
  readonly sourceRepositoryURI: string;
  readonly sourceRepositoryDigest: string;
  readonly sourceRepositoryRef: string;
  readonly sourceRepositoryOwnerURI: string;
  readonly buildConfigURI: string;
  readonly buildTrigger: string;
  readonly runInvocationURI: string;
}

/** The release workflow's signer for a tag, as the certificate's SAN and build signer URI give it. */
export function releaseSigner(tag: string = SYNTHETIC_TAG): string {
  return `https://github.com/PureTideWater/PhysicalTherapy/.github/workflows/release.yml@refs/tags/${tag}`;
}

/** The certificate release.yml's report job gets for the synthetic tag, in the run that measured the report. */
export function releaseCertificate(overrides: Partial<SyntheticCertificate> = {}): SyntheticCertificate {
  return {
    subjectAlternativeName: releaseSigner(),
    issuer: 'https://token.actions.githubusercontent.com',
    buildSignerURI: releaseSigner(),
    buildSignerDigest: SYNTHETIC_COMMIT,
    runnerEnvironment: 'github-hosted',
    sourceRepositoryURI: 'https://github.com/PureTideWater/PhysicalTherapy',
    sourceRepositoryDigest: SYNTHETIC_COMMIT,
    sourceRepositoryRef: `refs/tags/${SYNTHETIC_TAG}`,
    sourceRepositoryOwnerURI: 'https://github.com/PureTideWater',
    buildConfigURI: releaseSigner(),
    buildTrigger: 'push',
    runInvocationURI: `https://github.com/PureTideWater/PhysicalTherapy/actions/runs/${SYNTHETIC_RUN.runId}/attempts/${SYNTHETIC_RUN.runAttempt}`,
    ...overrides,
  };
}

/** gh's JSON for a report's bytes: by default release.yml's attestation of exactly those bytes. */
export function attestationOutput(reportText: string, overrides: { readonly certificate?: Partial<SyntheticCertificate>; readonly subjectSha256?: string; readonly predicateType?: string } = {}): string {
  const certificate = releaseCertificate(overrides.certificate);
  return JSON.stringify([
    {
      attestation: { bundle: { mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json' } },
      verificationResult: {
        mediaType: 'application/vnd.dev.sigstore.verificationresult+json;version=0.1',
        statement: {
          _type: 'https://in-toto.io/Statement/v1',
          subject: [{ name: 'screening-capacity.json', digest: { sha256: overrides.subjectSha256 ?? createHash('sha256').update(reportText).digest('hex') } }],
          predicateType: overrides.predicateType ?? 'https://slsa.dev/provenance/v1',
          predicate: { buildDefinition: { buildType: 'https://actions.github.io/buildtypes/workflow/v1' } },
        },
        signature: { certificate: { certificateIssuer: 'CN=sigstore-intermediate,O=sigstore.dev', ...certificate } },
        verifiedTimestamps: [{ type: 'Tlog', uri: 'https://rekor.sigstore.dev', timestamp: '2026-10-23T12:00:00Z' }],
      },
    },
  ]);
}
