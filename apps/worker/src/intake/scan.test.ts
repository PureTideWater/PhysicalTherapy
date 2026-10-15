import { GetObjectTaggingCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';

import { DEFAULT_SCAN_WAIT, GUARDDUTY_SCAN_TAG, GuardDutyScanService, LocalScanService, ScanPendingError, type ScanService, type ScanSubject, waitForVerdict } from './scan';
import { EICAR } from './sniff';

const KEY = 'intake/7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01/0b6e2a7c-3f4d-4e5a-8b9c-1d2e3f4a5b03';

function subject(head: Buffer): ScanSubject {
  return { landingKey: KEY, head: (bytes) => Promise.resolve(head.subarray(0, bytes)) };
}

describe('LocalScanService', () => {
  it('flags the EICAR test file, executables and scripts, and passes everything else', async () => {
    const scan = new LocalScanService();
    expect(await scan.verdict(subject(Buffer.from(EICAR)))).toEqual({ status: 'flagged', finding: 'eicar_test_file' });
    expect(await scan.verdict(subject(Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1])))).toEqual({ status: 'flagged', finding: 'executable' });
    expect(await scan.verdict(subject(Buffer.from('#!/bin/sh\n')))).toEqual({ status: 'flagged', finding: 'script' });
    expect(await scan.verdict(subject(Buffer.from('ISA*00*')))).toEqual({ status: 'clean' });
  });
});

describe('GuardDutyScanService (mocked client)', () => {
  function client(tags: { Key: string; Value: string }[] | undefined) {
    const sent: unknown[] = [];
    return {
      sent,
      client: {
        send: (command: unknown) => {
          sent.push(command);
          return Promise.resolve({ TagSet: tags });
        },
      } as never,
    };
  }

  it.each([
    [undefined, { status: 'pending' }],
    [[{ Key: 'other', Value: 'x' }], { status: 'pending' }],
    [[{ Key: GUARDDUTY_SCAN_TAG, Value: 'NO_THREATS_FOUND' }], { status: 'clean' }],
    [[{ Key: GUARDDUTY_SCAN_TAG, Value: 'THREATS_FOUND' }], { status: 'flagged', finding: 'malware' }],
    [[{ Key: GUARDDUTY_SCAN_TAG, Value: 'UNSUPPORTED' }], { status: 'unscannable' }],
    [[{ Key: GUARDDUTY_SCAN_TAG, Value: 'ACCESS_DENIED' }], { status: 'failed' }],
    [[{ Key: GUARDDUTY_SCAN_TAG, Value: 'FAILED' }], { status: 'failed' }],
  ] as const)('reads the malware-protection tag %j as %j', async (tags, verdict) => {
    const s3 = client(tags === undefined ? undefined : [...tags]);
    expect(await new GuardDutyScanService({ client: s3.client, bucket: 'tp-documents' }).verdict(subject(Buffer.alloc(0)))).toEqual(verdict);
    expect(s3.sent[0]).toBeInstanceOf(GetObjectTaggingCommand);
    expect((s3.sent[0] as GetObjectTaggingCommand).input).toEqual({ Bucket: 'tp-documents', Key: KEY });
  });
});

describe('waitForVerdict', () => {
  function answering(...verdicts: Awaited<ReturnType<ScanService['verdict']>>[]): ScanService & { asked: number } {
    const service = {
      asked: 0,
      verdict: () => {
        const verdict = verdicts[Math.min(service.asked, verdicts.length - 1)];
        service.asked += 1;
        return Promise.resolve(verdict ?? { status: 'pending' as const });
      },
    };
    return service;
  }

  it('asks again while the verdict is pending, then returns it', async () => {
    const scan = answering({ status: 'pending' }, { status: 'pending' }, { status: 'clean' });
    expect(await waitForVerdict(scan, subject(Buffer.alloc(0)), { pollMs: 1, timeoutMs: 1000 })).toEqual({ status: 'clean' });
    expect(scan.asked).toBe(3);
  });

  it('gives up on this attempt once the wait is over, so the job retries', async () => {
    const scan = answering({ status: 'pending' });
    await expect(waitForVerdict(scan, subject(Buffer.alloc(0)), { pollMs: 5, timeoutMs: 12 })).rejects.toThrow(ScanPendingError);
    expect(scan.asked).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_SCAN_WAIT).toEqual({ pollMs: 5000, timeoutMs: 600_000 });
  });
});
