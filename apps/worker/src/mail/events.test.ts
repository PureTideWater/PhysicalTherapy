import { MAIL_BOUNCE_SUBTYPES, MAIL_COMPLAINT_TYPES } from '@tp/db';
import { describe, expect, it } from 'vitest';

import { MAIL_ACCOUNT_ALARM_METRICS, MailEventUnreadable, parseMailQueueMessage, simulatorOutcome, snakeCase } from './events';

/** SES's events as EventBridge delivers them to the mail-events queue (synthetic: addresses on the simulator or synthetic.test). */
const MESSAGE_ID = '0100019a2b3c4d5e-6f7a8b9c-0d1e-2f3a-4b5c-6d7e8f9a0b1c-000000';
const RUN = '4e5f6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a01';
const PRACTICE = '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c01';
const NOTICE = '2c3d4e5f-6a7b-4c8d-9e0f-1a2b3c4d5e01';
const ADMIN = '3d4e5f6a-7b8c-4d9e-8f0a-1b2c3d4e5f01';
const SENT_AT = '2026-10-23T12:00:00.000Z';
const AT = '2026-10-23T12:00:05.000Z';

function sesEvent(eventType: string, detail: Record<string, unknown> = {}, tags: Record<string, string[]> = { 'ses:configuration-set': ['tp-production-screening'], tp_kind: ['screening_result'], tp_subject: [RUN] }): string {
  return JSON.stringify({
    version: '0',
    id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    'detail-type': 'Email Event',
    source: 'aws.ses',
    account: '123456789012',
    time: AT,
    region: 'us-east-1',
    resources: [],
    detail: {
      eventType,
      mail: { timestamp: SENT_AT, messageId: MESSAGE_ID, destination: ['bounce@simulator.amazonses.com'], tags, source: 'results@screening.synthetic.test', headers: [] },
      ...detail,
    },
  });
}

function bounce(bounceType: string, bounceSubType: string): string {
  return sesEvent('Bounce', {
    bounce: {
      bounceType,
      bounceSubType,
      timestamp: AT,
      feedbackId: 'synthetic',
      bouncedRecipients: [{ emailAddress: 'bounce@simulator.amazonses.com', diagnosticCode: 'smtp; 550 5.1.1 user unknown SYNTHETIC-DIAGNOSTIC' }],
    },
  });
}

function alarm(state: string, metric: string): string {
  return JSON.stringify({
    version: '0',
    source: 'aws.cloudwatch',
    'detail-type': 'CloudWatch Alarm State Change',
    time: AT,
    resources: ['arn:aws:cloudwatch:us-east-1:123456789012:alarm:tp-production-account-bounce-rate-warning'],
    detail: {
      alarmName: 'tp-production-account-bounce-rate-warning',
      state: { value: state, reason: 'Threshold Crossed', timestamp: AT },
      configuration: { metrics: [{ id: 'm', metricStat: { metric: { namespace: 'AWS/SES', name: metric, dimensions: {} }, period: 3600, stat: 'Average' }, returnData: true }] },
    },
  });
}

const parse = (body: string) => parseMailQueueMessage(body, 'tp-production');

describe('the mail-events queue’s messages', () => {
  it('reads each SES event of a message: its stream from the set, its identity from the tags, when it was sent and happened', () => {
    expect(parse(sesEvent('Send', { send: {} }))).toEqual({
      type: 'event',
      record: {
        messageId: MESSAGE_ID,
        stream: 'screening',
        event: 'send',
        mailAt: new Date(SENT_AT),
        eventAt: new Date(AT),
        recipient: 'bounce@simulator.amazonses.com',
        kind: 'screening_result',
        subjectId: RUN,
        practiceId: null,
        recipientUserId: null,
        bounceKind: null,
        bounceSubtype: null,
        complaintType: null,
      },
    });
    const events: [string, Record<string, unknown>, string][] = [
      ['Delivery', { delivery: { timestamp: AT, recipients: ['x'], smtpResponse: '250 ok' } }, 'delivery'],
      ['DeliveryDelay', { deliveryDelay: { timestamp: AT, delayType: 'MailboxFull' } }, 'delivery_delay'],
      ['Reject', { reject: { reason: 'Bad content' } }, 'reject'],
      ['Rendering Failure', { failure: { errorMessage: 'x', templateName: 'y' } }, 'rendering_failure'],
      ['Complaint', { complaint: { complaintFeedbackType: 'abuse', timestamp: AT } }, 'complaint'],
    ];
    for (const [type, detail, event] of events) {
      expect(parse(sesEvent(type, detail))).toMatchObject({ type: 'event', record: { event } });
    }
  });

  it('carries a support notice’s practice and recipient, and reads Cognito’s untagged message on the transactional set as its own kind', () => {
    const notice = parse(
      sesEvent('Delivery', { delivery: { timestamp: AT } }, { 'ses:configuration-set': ['tp-production-notices'], tp_kind: ['support_grant_closed'], tp_subject: [NOTICE], tp_practice: [PRACTICE], tp_recipient: [ADMIN] }),
    );
    expect(notice).toMatchObject({ type: 'event', record: { stream: 'notices', kind: 'support_grant_closed', subjectId: NOTICE, practiceId: PRACTICE, recipientUserId: ADMIN } });
    expect(parse(sesEvent('Bounce', { bounce: { bounceType: 'Permanent', bounceSubType: 'General' } }, { 'ses:configuration-set': ['tp-production-transactional'] }))).toMatchObject({
      type: 'event',
      record: { stream: 'transactional', kind: 'cognito', subjectId: null },
    });
  });

  it('snake-cases every bounce subtype SES names, and leaves an unknown one for the database to read as other', () => {
    const subtypes: [string, string][] = [
      ['General', 'general'],
      ['NoEmail', 'no_email'],
      ['Suppressed', 'suppressed'],
      ['OnAccountSuppressionList', 'on_account_suppression_list'],
      ['OnConfigurationSetSuppressionList', 'on_configuration_set_suppression_list'],
      ['MailboxFull', 'mailbox_full'],
      ['MessageTooLarge', 'message_too_large'],
      ['ContentRejected', 'content_rejected'],
      ['AttachmentRejected', 'attachment_rejected'],
    ];
    for (const [ses, ours] of subtypes) {
      expect(parse(bounce('Permanent', ses))).toMatchObject({ type: 'event', record: { event: 'bounce', bounceKind: 'permanent', bounceSubtype: ours } });
      expect(MAIL_BOUNCE_SUBTYPES).toContain(ours);
    }
    // Undetermined, and anything SES adds later: passed on, and recorded as other (operator_record_mail_event).
    expect(parse(bounce('Undetermined', 'Undetermined'))).toMatchObject({ record: { bounceKind: 'undetermined', bounceSubtype: 'undetermined' } });
    expect(parse(bounce('Transient', 'SomethingNew'))).toMatchObject({ record: { bounceKind: 'transient', bounceSubtype: 'something_new' } });
  });

  it('snake-cases every complaint feedback type, and passes none as none', () => {
    for (const [ses, ours] of [
      ['abuse', 'abuse'],
      ['auth-failure', 'auth_failure'],
      ['fraud', 'fraud'],
      ['not-spam', 'not_spam'],
      ['other', 'other'],
      ['virus', 'virus'],
    ] as const) {
      expect(parse(sesEvent('Complaint', { complaint: { complaintFeedbackType: ses, timestamp: AT } }))).toMatchObject({ record: { complaintType: ours } });
      expect(MAIL_COMPLAINT_TYPES).toContain(ours);
    }
    expect(parse(sesEvent('Complaint', { complaint: { timestamp: AT } }))).toMatchObject({ record: { complaintType: null } });
    expect(snakeCase('OnAccountSuppressionList')).toBe('on_account_suppression_list');
  });

  it('reads a complaint SES raised for an address on the account-level suppression list as that suppression: SES never sent the message', () => {
    // SES's Complaint.ComplaintSubType: null, or OnAccountSuppressionList ("SES accepted the message, but didn't attempt to
    // send it"); such an event carries no feedback report. Recorded as the suppressed bounce SES gives such an address,
    // never as a complaint, which counts as delivered.
    const suppressed = parse(sesEvent('Complaint', { complaint: { complaintSubType: 'OnAccountSuppressionList', complainedRecipients: [{ emailAddress: 'x' }], timestamp: AT, feedbackId: 'synthetic' } }));
    expect(suppressed).toMatchObject({
      type: 'event',
      record: { event: 'bounce', bounceKind: 'permanent', bounceSubtype: 'on_account_suppression_list', complaintType: null, eventAt: new Date(AT) },
    });
    expect(MAIL_BOUNCE_SUBTYPES).toContain('on_account_suppression_list');
    // The same on every stream: a support notice's, a dunning notice's and Cognito's.
    for (const tags of [
      { 'ses:configuration-set': ['tp-production-screening'], tp_kind: ['screening_failed'], tp_subject: [RUN] },
      { 'ses:configuration-set': ['tp-production-notices'], tp_kind: ['support_grant_opened'], tp_subject: [NOTICE], tp_practice: [PRACTICE], tp_recipient: [ADMIN] },
      { 'ses:configuration-set': ['tp-production-notices'], tp_kind: ['dunning'], tp_subject: [NOTICE], tp_recipient: [ADMIN] },
      { 'ses:configuration-set': ['tp-production-transactional'] },
    ] as Record<string, string[]>[]) {
      expect(parse(sesEvent('Complaint', { complaint: { complaintSubType: 'OnAccountSuppressionList', timestamp: AT } }, tags))).toMatchObject({
        type: 'event',
        record: { event: 'bounce', bounceKind: 'permanent', bounceSubtype: 'on_account_suppression_list', complaintType: null },
      });
    }
    // A subtype of null, as SES writes it for a complaint it received, is a complaint.
    expect(parse(sesEvent('Complaint', { complaint: { complaintSubType: null, complaintFeedbackType: 'abuse', timestamp: AT } }))).toMatchObject({
      record: { event: 'complaint', complaintType: 'abuse', bounceKind: null },
    });
    // One SES documents no meaning for is left for the dead-letter queue, never read as delivered or as a complaint.
    expect(() => parse(sesEvent('Complaint', { complaint: { complaintSubType: 'SomethingNew', timestamp: AT } }))).toThrow(MailEventUnreadable);
  });

  it('reads a delivery delay at its own time and a rejection (SES found a virus and sent nothing), each by its documented shape', () => {
    const delayed = parse(
      sesEvent('DeliveryDelay', {
        deliveryDelay: { delayType: 'TransientCommunicationFailure', expirationTime: '2026-10-24T12:00:00.000Z', delayedRecipients: [{ emailAddress: 'x', status: '4.4.1' }], timestamp: SENT_AT },
      }),
    );
    expect(delayed).toMatchObject({ type: 'event', record: { event: 'delivery_delay', eventAt: new Date(SENT_AT), bounceKind: null, complaintType: null } });
    expect(parse(sesEvent('Reject', { reject: { reason: 'Bad content' } }))).toMatchObject({ type: 'event', record: { event: 'reject', eventAt: new Date(AT), bounceKind: null } });
  });

  it('never reads a bounce’s diagnostic code or its recipients’ list', () => {
    const read = JSON.stringify(parse(bounce('Permanent', 'General')));
    expect(read).not.toContain('SYNTHETIC-DIAGNOSTIC');
    expect(read).not.toContain('diagnosticCode');
    expect(read).not.toContain('bouncedRecipients');
  });

  it('reads an account warning alarm’s state change as its signal by its metric, and drops one that is not ALARM', () => {
    expect(parse(alarm('ALARM', 'Reputation.BounceRate'))).toEqual({ type: 'account_signal', signal: 'bounce_rate_alarm' });
    expect(parse(alarm('ALARM', 'Reputation.ComplaintRate'))).toEqual({ type: 'account_signal', signal: 'complaint_rate_alarm' });
    expect(parse(alarm('OK', 'Reputation.BounceRate'))).toEqual({ type: 'ignored' });
    expect(Object.keys(MAIL_ACCOUNT_ALARM_METRICS).sort()).toEqual(['Reputation.BounceRate', 'Reputation.ComplaintRate']);
    expect(() => parse(alarm('ALARM', 'CPUUtilization'))).toThrow(MailEventUnreadable);
  });

  it('drops an open, click or subscription event, which no set publishes', () => {
    expect(parse(sesEvent('Open', { open: {} }))).toEqual({ type: 'ignored' });
    expect(parse(sesEvent('Click', { click: {} }))).toEqual({ type: 'ignored' });
  });

  it('refuses, without echoing it, a message it cannot read: not JSON, another shape, another environment’s set, a kind its stream does not carry, a tag that is not an ID', () => {
    const refused = [
      'not json SYNTHETIC',
      JSON.stringify({ source: 'aws.ses', detail: {} }),
      sesEvent('Send', {}, { 'ses:configuration-set': ['tp-staging-screening'], tp_kind: ['screening_result'], tp_subject: [RUN] }),
      sesEvent('Send', {}, { 'ses:configuration-set': ['tp-production-screening'], tp_kind: ['digest'], tp_subject: [RUN] }),
      sesEvent('Send', {}, { 'ses:configuration-set': ['tp-production-notices'] }),
      sesEvent('Send', {}, { 'ses:configuration-set': ['tp-production-screening'], tp_kind: ['screening_result'], tp_subject: ['someone@synthetic.test'] }),
      sesEvent('Send', {}, { 'ses:configuration-set': ['tp-production-screening'], tp_kind: ['screening_result'], tp_subject: [RUN, RUN] }),
      sesEvent('Bounce', {}),
      sesEvent('Subscribed?', {}),
      sesEvent('Send', {}).replace(MESSAGE_ID, 'short'),
    ];
    for (const body of refused) {
      expect(() => parse(body)).toThrow(MailEventUnreadable);
      try {
        parse(body);
      } catch (error) {
        expect((error as Error).message).not.toMatch(/@|SYNTHETIC/);
      }
    }
  });

  it('knows the simulator’s addresses by their local part before any +', () => {
    expect(simulatorOutcome('bounce+e2e7@simulator.amazonses.com')).toBe('bounced');
    expect(simulatorOutcome('BOUNCE@simulator.amazonses.com')).toBe('bounced');
    expect(simulatorOutcome('complaint@simulator.amazonses.com')).toBe('complained');
    expect(simulatorOutcome('suppressionlist@simulator.amazonses.com')).toBe('suppressed');
    expect(simulatorOutcome('success@simulator.amazonses.com')).toBe('delivered');
    expect(simulatorOutcome('bounce@clinic.synthetic.test')).toBe('delivered');
  });
});
