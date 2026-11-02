import { describe, expect, it } from 'vitest';

import { createLogger } from '@tp/observability';

import type { JobContext } from '../jobs/handlers';
import { MailPhiError, type MailSender, mailBody } from '../mail/mail';
import { digestHandler, digestLink, digestMessage } from './job';
import type { DigestFigures } from './view';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DIGEST = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';
const ADMIN = { userId: '5c1f0e2d-3b4a-4c5d-8e6f-7a8b9c0d1e03', email: 'admin@synthetic.test' };

const figures: DigestFigures = {
  counts: { validated_lines: 0, validated_payers: 0, validated_lines_by_payer: {}, cases_nearing_deadline: 0, recoveries_posted: 0, coverage_lines: 0, coverage_priced_lines: 0, contracts_expiring: 0 },
  totals: { validated_variance: '0', validated_variance_by_payer: {}, cases_nearing_deadline_actionable: '0', recovered: '0', coverage_billed: '0', coverage_priced_billed: '0' },
};

describe('the digest email', () => {
  it('goes to one person, says the month, and links to the digest by opaque IDs only', () => {
    const link = digestLink('https://app.synthetic.test/anything', PRACTICE, DIGEST);
    expect(link).toBe(`https://app.synthetic.test/p/${PRACTICE}/digests/${DIGEST}`);
    const message = digestMessage(ADMIN, DIGEST, '2026-10', figures, link);
    expect(message).toMatchObject({ to: ['admin@synthetic.test'], subject: 'Monitoring digest for October 2026', links: [link] });
    // On the transactional stream, tagged with the digest and the person, never an address (docs/adr/0039 and 0065).
    expect(message.identity).toEqual({ stream: 'transactional', kind: 'digest', subjectId: DIGEST, recipientUserId: ADMIN.userId });
    expect(message.lines.at(-1)).toBe('Open the digest in the application for the detail:');
    expect(mailBody(message).split('\n').at(-1)).toBe(link);
  });

  it('is never sent with a link the PHI guard flags', () => {
    expect(() => mailBody(digestMessage(ADMIN, DIGEST, '2026-10', figures, 'https://app.synthetic.test/p/SYNTHLAST-SYNTHFIRST/digests/123456789'))).toThrow(MailPhiError);
  });

  it('carries a send the mail service refused out of the job by its error’s name alone, never its message, which pg-boss would keep (S6)', async () => {
    const refused = Object.assign(new Error('Email address is not verified. The following identities failed the check: admin@synthetic.test'), { name: 'MessageRejected' });
    const mail = { send: () => Promise.reject(refused) } as unknown as MailSender;
    // The month's digest recorded; the email to its one person refused.
    const prepared = { digestId: DIGEST, sent: false, figures, emails: [ADMIN] };
    const context = {
      jobId: 'job',
      logger: createLogger({ sink: () => undefined }),
      transaction: () => Promise.resolve(prepared),
      enqueue: () => Promise.resolve(null),
    } as unknown as JobContext;
    const failure = await digestHandler({ mail, appOrigin: 'https://app.synthetic.test', now: () => new Date('2026-11-02T12:00:00Z') })({ practice_id: PRACTICE, period: '2026-10' }, context).then(
      () => null,
      (error: unknown) => error as Error,
    );
    expect(failure?.name).toBe('DigestSendFailed');
    expect(failure?.message).toBe('the mail service refused a digest email (MessageRejected)');
    // Nothing of the refused error rides along: not its message, nor the error itself as a property or a cause.
    expect(JSON.stringify({ ...failure, message: failure?.message, stack: failure?.stack })).not.toContain('synthetic.test');
    expect((failure as { cause?: unknown } | null)?.cause).toBeUndefined();
  });
});
