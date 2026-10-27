# PR 42 fix round: infra builder progress

Clone: /tmp/claude-0/-home-user-PhysicalTherapy/e99dbc78-96e5-5013-a491-2b14e5309bfe/scratchpad/pr42/build-infra
Branch: fix-infra from 098636e3…
Items: S3, S5, M3, M10 (= known (f)), M11

## Status
- [ ] clone + install
- [ ] read findings
- [x] clone + install (pnpm 10.34.8, frozen lockfile ok)
- [x] read findings (md + json) for S3, S5, M3, M10, M11

## S3 facts checked (docs.aws.amazon.com unreachable here; used AWS's own API models and docs text)
- Event history: LookupEvents (botocore 1.43.119 cloudtrail model): management events of the last 90 days per Region, lookup attribute ReadOnly exists (read events included); AWS docs (search): automatic, cannot delete events, default console filter Read only=false.
- SES sensitivity: GetEmailAddressInsightsRequest.EmailAddress shape = plain string (no sensitive) in botocore 1.43.119 and @aws-sdk/client-sesv2 3.1157.0 (latest) and 3.1152.0; InsightsEmailAddress (other APIs) sensitive:true. HTTP POST /v2/email/email-address-insights/ (readOnly classification unverified).
- Selectors: aws-cdk-lib 2.275.0 (latest) CFN docs: trails filter management events only by readOnly and eventSource NotEquals kms/rdsdata; eventName on management events = event data stores only. CloudTrail Lake closed to new customers since 2026-05-31 (AWS availability-change page) -> no EDS option.
- SES sends are CloudTrail data events (AWS::SES::EmailIdentity/ConfigurationSet), off by default, never in event history.
- Decision: dedicated validation account per environment (stack tp-<env>-mail-validation), role allows only ses:GetEmailAddressInsights, trusted by main account web task role (aws:PrincipalArn); its trail write-only; main web role loses ses:GetEmailAddressInsights, gains sts:AssumeRole on MailValidationRoleArn parameter; CfnRule refuses released deploy without it. Residual: 90 days event history in validation account (+ trail if classified write -> fallback).

## Items
- S5 REAL (IAM: ForAllValues true when key absent). Repro: operator-role.test.ts asserts Condition.Null {'ses:Recipients':'false'} -> 3 failed before fix. Fix: Null guard in MailProbes + comment; ADR 0049 table row. Test passes 27/27. Commit 60ff8654.
- M10/(f) REAL: deliverability.md:157 said Q1 (b); plan line 310 has (f) SES plan. Fixed to Q1 (f). Other Q1 refs checked (49, 212 (g); deploy 39, 152 (b) consumer: correct). Commit fe7f54f2.
- M11 REAL: PERMANENT_SEND_ERRORS has MessageRejected (streams.ts:61); operator_support_notice_failed/billing_dunning_notice_failed fail at once on permanent; digests pg-boss retryLimit 2 delay 30 backoff. Fixed deploy-and-rollback.md + deliverability outbox line. Considered a CfnRule (release only after MailIdentitiesVerified=true): rejected, it would make a later MailFromAddress change impossible without stopping every task. Commit 7815bfb7.
