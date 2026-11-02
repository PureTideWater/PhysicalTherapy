import { MAIL_KINDS, MAIL_STREAMS, MAIL_STREAM_KINDS } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { MAIL_LOG_CODES, MAIL_PROBE_RECIPIENTS, MAIL_STREAM_PREFIX_PATTERN, MAIL_TAGS, MailTagError, configurationSetName, mailTags, sendErrorName } from './streams';

describe('the mail streams', () => {
  it('names each stream’s configuration set by the environment’s prefix', () => {
    expect(MAIL_STREAMS.map((stream) => configurationSetName('tp-production', stream))).toEqual(['tp-production-transactional', 'tp-production-notices', 'tp-production-screening']);
    expect(MAIL_STREAM_PREFIX_PATTERN.test('tp-production')).toBe(true);
    expect(MAIL_STREAM_PREFIX_PATTERN.test('tp-dev')).toBe(true);
    for (const prefix of ['production', 'tp-', 'tp-Prod', 'tp-prod-', 'tp-prod/x']) {
      expect(MAIL_STREAM_PREFIX_PATTERN.test(prefix), prefix).toBe(false);
    }
  });

  it('tags a message with its kind, subject, practice and recipient, every one an opaque ID or a code', () => {
    const notice = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e01';
    expect(mailTags({ stream: 'transactional', kind: 'probe' })).toEqual([{ Name: MAIL_TAGS.kind, Value: 'probe' }]);
    expect(mailTags({ stream: 'notices', kind: 'dunning', subjectId: notice, recipientUserId: notice })).toEqual([
      { Name: 'tp_kind', Value: 'dunning' },
      { Name: 'tp_subject', Value: notice },
      { Name: 'tp_recipient', Value: notice },
    ]);
    // Every kind the record holds is one a stream carries; a stream refuses another's kind.
    expect([...new Set(Object.values(MAIL_STREAM_KINDS).flat())].sort()).toEqual([...MAIL_KINDS].sort());
    expect(() => mailTags({ stream: 'screening', kind: 'digest', subjectId: notice })).toThrow(MailTagError);
    expect(() => mailTags({ stream: 'notices', kind: 'dunning', subjectId: 'a b' })).toThrow(new MailTagError('a mail tag holds an opaque ID or a code only; nothing was sent'));
  });

  it('probes only SES’s simulator, and logs the codes the infrastructure’s alarms read', () => {
    expect(Object.values(MAIL_PROBE_RECIPIENTS)).toEqual(['success@simulator.amazonses.com', 'bounce@simulator.amazonses.com']);
    expect(MAIL_LOG_CODES).toEqual({
      streamPaused: 'MAIL_STREAM_PAUSED',
      noticeUndelivered: 'NOTICE_UNDELIVERED',
      noticeUndeliverable: 'NOTICE_UNDELIVERABLE',
      invitationUndelivered: 'INVITATION_UNDELIVERED',
      probeMissed: 'MAIL_PROBE_MISSED',
      eventUnreadable: 'MAIL_EVENT_UNREADABLE',
    });
  });

  it('names an SES error by its name alone, never its message', () => {
    expect(sendErrorName(Object.assign(new Error('to someone@synthetic.test'), { name: 'MessageRejected' }))).toBe('MessageRejected');
    expect(sendErrorName(new Error('x'))).toBe('Error');
    expect(sendErrorName(Object.assign(new Error('x'), { name: 'Not A Name' }))).toBe('Unrecognized');
    expect(sendErrorName('a string')).toBe('Unrecognized');
  });
});
