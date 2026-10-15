import { setTimeout as sleep } from 'node:timers/promises';

import { GetObjectTaggingCommand, type S3Client } from '@aws-sdk/client-s3';

import { requireOpaqueKey } from '../storage/object-store';
import { HEAD_BYTES, signatureOf } from './sniff';

/**
 * Malware scanning before anything parses an upload (PRD 6, Intake and documents: "malware scan on
 * arrival"; PRD 10, Pipeline step 2: "Malware scan result must be clean"; PRD 16, Upload safety).
 *
 * The ScanService gives the verdict on an upload's bytes as they arrived. In staging and production
 * that is GuardDuty Malware Protection for S3 (infra/lib/constructs/account-security.ts), which scans
 * every new object in the documents bucket, the upload's intake key included, and tags it with its
 * result; GuardDutyScanService reads the tag. In development and tests, LocalScanService flags the
 * EICAR test file, executables and scripts by their first bytes. Until a verdict exists it is pending,
 * and the intake job waits for it (waitForVerdict); nothing is read past the first bytes, expanded or
 * parsed before it is clean.
 */

export type ScanFinding = 'malware' | 'eicar_test_file' | 'executable' | 'script';

export type ScanVerdict =
  | { readonly status: 'pending' }
  | { readonly status: 'clean' }
  | { readonly status: 'flagged'; readonly finding: ScanFinding }
  /** The scanner could not look inside (an encrypted archive, a file beyond its limits): never parsed. */
  | { readonly status: 'unscannable' }
  /** The scan itself failed; the job retries and, on its last attempt, alerts the operator. */
  | { readonly status: 'failed' };

/** What the scanner examines: the upload where it landed, and a way to read its first bytes. */
export interface ScanSubject {
  /** The object key the upload landed under (its intake key in S3). */
  readonly landingKey: string;
  /** The first `bytes` plaintext bytes of the upload. */
  head(bytes: number): Promise<Buffer>;
}

export interface ScanService {
  verdict(subject: ScanSubject): Promise<ScanVerdict>;
}

/** Development and tests: the EICAR test file, executables and scripts, by their first bytes. */
export class LocalScanService implements ScanService {
  async verdict(subject: ScanSubject): Promise<ScanVerdict> {
    const signature = signatureOf(await subject.head(HEAD_BYTES));
    return signature === undefined ? { status: 'clean' } : { status: 'flagged', finding: signature };
  }
}

/** The tag GuardDuty Malware Protection for S3 writes on every object it scans. */
export const GUARDDUTY_SCAN_TAG = 'GuardDutyMalwareScanStatus';

/** Staging and production: the GuardDuty Malware Protection result on the upload's object. */
export class GuardDutyScanService implements ScanService {
  constructor(private readonly options: { readonly client: Pick<S3Client, 'send'>; readonly bucket: string }) {}

  async verdict(subject: ScanSubject): Promise<ScanVerdict> {
    const tagging = await this.options.client.send(new GetObjectTaggingCommand({ Bucket: this.options.bucket, Key: requireOpaqueKey(subject.landingKey) }));
    const result = tagging.TagSet?.find((tag) => tag.Key === GUARDDUTY_SCAN_TAG)?.Value;
    switch (result) {
      case undefined:
        return { status: 'pending' };
      case 'NO_THREATS_FOUND':
        return { status: 'clean' };
      case 'THREATS_FOUND':
        return { status: 'flagged', finding: 'malware' };
      case 'UNSUPPORTED':
        return { status: 'unscannable' };
      default:
        // ACCESS_DENIED, FAILED, or a value this code does not know.
        return { status: 'failed' };
    }
  }
}

/** The scan gave no verdict in time; the job fails this attempt and is retried. */
export class ScanPendingError extends Error {
  override readonly name = 'ScanPendingError';
}

export interface ScanWait {
  /** How often to ask again while the verdict is pending. */
  readonly pollMs: number;
  /** How long to wait for a verdict before this attempt gives up. */
  readonly timeoutMs: number;
}

/** GuardDuty usually answers within seconds; a 2 GiB archive can take minutes. */
export const DEFAULT_SCAN_WAIT: ScanWait = { pollMs: 5_000, timeoutMs: 10 * 60_000 };

/** Asks for the verdict until it is no longer pending, or throws ScanPendingError after the timeout. */
export async function waitForVerdict(scan: ScanService, subject: ScanSubject, wait: ScanWait = DEFAULT_SCAN_WAIT): Promise<Exclude<ScanVerdict, { status: 'pending' }>> {
  const deadline = Date.now() + wait.timeoutMs;
  for (;;) {
    const verdict = await scan.verdict(subject);
    if (verdict.status !== 'pending') {
      return verdict;
    }
    if (Date.now() + wait.pollMs > deadline) {
      throw new ScanPendingError('the malware scan has not given a verdict yet');
    }
    await sleep(wait.pollMs);
  }
}
