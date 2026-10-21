# Decisions for PR 5 and PR 6 (20 October)

Every question below has a recommended answer. Each answer says what it gives up. Where an answer is wording that payers or prospects will read, counsel confirms it before the first real packet is sent or before the screening opens.

## PR 5: the copy of the packet the payer receives (audit #37, part 1)

1. **What the practice must give as a contact before a packet can export.**
   - **Recommended:** a name or office, plus a phone number. Extension, email and mailing address are optional.
   - The contact's email is the only email the payer's copy prints.
   - Gives up: some packets give the examiner only a phone number in writing.
2. **Drop the patient's account number from the payer's PDF and CSV now.**
   - **Recommended: yes.** A narrative that names the number is also refused.
   - Gives up: a payer that searches by the provider's account number has one search key fewer. The payer already has the number from the claim.
3. **Saying the dispute is "timely".**
   - **Recommended:** the copy states only dates that code knows: "The earliest dispute window among the listed lines ends on ‹date›."
   - Gives up: the letter does not assert that the dispute is timely. That claim could be false, because the practice sends the packet after it is printed.
4. **Interest that code could not compute.**
   - **Recommended:** list interest only where code computed it, under "Interest stated in this request: $X", and say nothing about the other lines.
   - Gives up: the copy does not point to other lines that may carry interest. The practice can still claim that interest later.
5. **The reviewer's checklist, which you sign as reviewer.**
   - **Recommended:** seven items. This adds one, "the payer's files carry no login, ID, hash or internal note", and the figures item now covers the contact.
   - Gives up: one more box to tick per sign-off.
6. **A missing contact as a coded refusal.**
   - **Recommended: yes.** This changes one SQL function in PR 5's own unmerged migration, so you approve it with the rest of PR 5.
   - The packet page, the web request and the job then all show the same reason and its fix.
   - Gives up: part 1 is no longer schema-free.

## PR 6: the 60-second test (#53) and the result columns (#57)

7. **What the pages say is kept.**
   - **Recommended:** the plain list. That is ranges of rows, a dollar range, the shares priced, how they heard of us, whether the result was opened and an audit requested, the release and the month.
   - After an audit request: "We keep this screening's totals, practice name, ZIP, email and how you heard of us with your request for 12 months."
   - Gives up: a longer notice than "we keep anonymous counts". Counsel may not accept "anonymous".
8. **The "how did you hear about us" list.**
   - **Recommended:**
     - search engine
     - my billing firm
     - a colleague or another practice
     - a professional association
     - a conference, webinar or event
     - LinkedIn or other social
     - an email from PaidWhole
     - an article, newsletter or podcast
     - something else (optional)
   - Gives up: free text.
9. **Reasons recorded when a prospect declines.**
   - **Recommended:** the 11 reasons in the design, from "no response" and "price" to "chose another vendor".
   - Gives up: a shorter list.
10. **How long a requester's summary is kept.**
    - **Recommended:** 12 months from the screening, the same period as consent.
    - Gives up: a period tied to the request instead.
11. **The cookie that records where a visitor came from.**
    - **Recommended:** first-party, 30 days, the first visit wins. It holds campaign codes and the kind of click, never the advertiser's click ID.
    - Gives up: session-only tracking.
12. **How long counts-only outcomes are kept.**
    - **Recommended:** no end date. They name no one once they are unlinked.
    - Gives up: a fixed deletion period, such as 7 years.
13. **If the speed test is red at launch.**
    - **Recommended:** the screening does not open until the test passes on the deployed image.
    - Gives up: opening early with a "this can take a few minutes" notice.
14. **Which file the 60-second promise covers.**
    - **Recommended:** any accepted 50,000-row file, the worst shape included.
    - PR 6b sizes the screening's own server to that file and tells you its monthly cost first. It may exceed the roughly $18 a month you accepted.
    - Gives up: possibly more cost.
15. **Where the timing test draws the line.**
    - **Recommended:** fail at 48 seconds on GitHub's runner until staging measures how its speed compares with production, then 60 seconds scaled by that factor.
    - Gives up: nothing real, only runs between 48 and 60 seconds.
16. **How PR 6 merges before its own screening server exists (PR 6b).**
    - **Recommended:** the test fails PR 6 on everything PR 6 controls. Timing shows as "open, PR 6b" until PR 6b adds the server, which switches it on in tested code.
    - Gives up: enforcing the time before PR 6b. The screening cannot open before then anyway.
17. **A later screening from a different email for the same practice (same ZIP and name). Counsel confirms this one.**
    - **Recommended:** it replaces the earlier summary and carries the request over, with a notice in your console. This keeps one summary per practice, so two results cannot be subtracted to expose a row of fewer than 11 claim lines.
    - Gives up: someone else could resend under the practice's name. The notice makes that visible.
18. **Whether an outcome records that the screening led to an audit request.**
    - **Recommended: yes.** This shows which results convert. The wording says the record can be matched to a kept request.
    - Gives up: some outcomes can be matched to a request while the request is kept.
19. **Your screening terms, stored with each screening (the PR 6 part of audit #51).**
    - **Recommended:** add the column for the terms' fingerprint now, in PR 6's migration, so PR 6 needs one approval, not two.
    - The terms' wording is yours and counsel's.
    - Gives up: nothing.

## Also noted (no decision needed now)

- PR 7's funnel screens will add read functions, which makes PR 7 a schema PR that you approve.
- Before the first real packet and before the screening opens, counsel confirms:
  - the wording in questions 3, 4, 7 and 17;
  - the cookie notice;
  - the 11-claim-line floor.
