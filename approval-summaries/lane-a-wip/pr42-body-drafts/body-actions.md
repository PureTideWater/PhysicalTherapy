## The founder's actions this pull request needs

1. **The domain model's SHA-256 approval** (below); the build posts the approval line as a suggested change and never writes it.
2. **A second AWS account per environment**: create it, bootstrap it for CDK, deploy `tp-<env>-address-validation` into it, and set `MailValidationRoleArn`; a release is refused until then (deploy runbook, launch checklist; deliverability runbook, section 1).
3. **Phase 1 deploy, then the DNS records** from the stack's outputs for each identity, and wait until both identities read verified; **phase 2** with `MailIdentitiesVerified=true`.
4. **SES production access** per account and region on the Essentials plan (Q1 (f)).
5. **Google Postmaster Tools and Microsoft SNDS**, and two weeks of DMARC reports before `p=quarantine` (O14).
6. **Staging's checks after phase 2** (O11: the complaint-reason suppression, the global-list subtype, CloudTrail's read classification, and now the error SES gives a send through a disabled set, each read by its message ID in the platform's log) and re-reading the AWS prices (O12).
7. **The consumer's size** (issue #41, O9), with CI's measurements above.
8. **Sign off the changed legal text before it goes to counsel** (new; the verification round's finding 11): the section "Legal text awaiting the founder's sign-off" above, word for word before and after: the 90-day address-check sentence on the upload hint, the sent alert, the closed link, the result page and the result email; the refused-address sentence now in the result email; the four `screening-kept-*` rows of `legal-surfaces.md`; and the review round's paused page and its refusal (`screening-mail-paused`), the bounce budget's refusal (`screening-mail-address`), the refused-address sentence, the `screening-kept-result` row, and the data-retention row and paragraph. Record the sign-off, or the words to change, in this pull request before merge. No code change, migration or freeze exception is needed for it.

