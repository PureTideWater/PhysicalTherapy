import { describe, expect, it } from 'vitest';

import { MailPhiError, mailBody } from '../mail/mail';
import { digestLink, digestMessage } from './job';
import type { DigestFigures } from './view';

const PRACTICE = '7d0c3d0e-8a64-4c1b-9d6f-0b8f4f0f6a01';
const DIGEST = '1e4b8f8a-2c1d-4f7e-8b3a-5d6c7e8f9a02';

const figures: DigestFigures = {
  counts: { validated_lines: 0, validated_payers: 0, validated_lines_by_payer: {}, cases_nearing_deadline: 0, recoveries_posted: 0, coverage_lines: 0, coverage_priced_lines: 0, contracts_expiring: 0 },
  totals: { validated_variance: '0', validated_variance_by_payer: {}, cases_nearing_deadline_actionable: '0', recovered: '0', coverage_billed: '0', coverage_priced_billed: '0' },
};

describe('the digest email', () => {
  it('goes to one person, says the month, and links to the digest by opaque IDs only', () => {
    const link = digestLink('https://app.synthetic.test/anything', PRACTICE, DIGEST);
    expect(link).toBe(`https://app.synthetic.test/p/${PRACTICE}/digests/${DIGEST}`);
    const message = digestMessage('admin@synthetic.test', '2026-10', figures, link);
    expect(message).toMatchObject({ to: ['admin@synthetic.test'], subject: 'Monitoring digest for October 2026', links: [link] });
    expect(message.lines.at(-1)).toBe('Open the digest in the application for the detail:');
    expect(mailBody(message).split('\n').at(-1)).toBe(link);
  });

  it('is never sent with a link the PHI guard flags', () => {
    expect(() => mailBody(digestMessage('admin@synthetic.test', '2026-10', figures, 'https://app.synthetic.test/p/SYNTHLAST-SYNTHFIRST/digests/123456789'))).toThrow(MailPhiError);
  });
});
