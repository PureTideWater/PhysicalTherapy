## PR 6b-3 (#39): the screening's own consumer and the 60-second check

**For a prospect.** Free screenings are now priced by their own service, three files at once, instead of one at a time by the platform's job runner.
- After uploading, the page says how long the result is likely to take, as things stood when the file arrived: "usually within a minute", "can take a few minutes", or, past today's limits, "can take longer than usual".
- Heavy users are still accepted. Their files wait behind everyone else's, and the email says why.
- Production's screening stays closed until a release passes the capacity test and the launch value is passed for that release.

**For operations.**
- A fourth always-on service per environment: 2 vCPU and 4 GiB, about $74.50 a month. It is held at zero in production until launch.
- It has its own login and a narrow email permission, reaches no internet host beyond AWS's own services, and has five alarms.
- Every release is measured with the 60-second promise enforced. The launch value is printed only for a passing measurement of the exact images being deployed.

**The schema in plain words.**
- **A new role, `tp_screening`, for that service.** It cannot log in, owns nothing, bypasses no security rule, and may call only the ten screening functions it needs. Its login can switch into it and do nothing else.
- **Five new facts on each screening run:**
  - when the web received the upload (to measure the 60 seconds);
  - a keyed fingerprint of the sender's account (never the address itself);
  - its place in the queue;
  - why it waits, if it does;
  - when it last made progress (a stalled run is retried after 2 minutes).
- **New this round: a small append-only tally of the day's uploads.** It holds only the fingerprint, a row count and the tier, and no role can read it. It stops a sender who resubmits from resetting their daily share. Entries are deleted after the next UTC day ends.
- **New and recreated functions** that queue, price, retry and report screenings. One now refuses to fail a retry that is still making progress.

**What proves it.**
- About 9,000 database tests pass, including the cross-tenant and catalog tests. The only failure is the approval check that waits for you; two stale tests the suite caught are fixed and rerun.
- About 4,400 unit tests, 51 browser end-to-end tests, the golden and oracle tests, and every lint pass. The pricing engine is untouched.
- **CI's capacity run on the previous head is the measurement of record.** Every upload was within the line except two:
  - three of the largest files at once took 57.1, 57.3 and 50.9 s, against 48 s;
  - one file stalled.
- **This round fixed the stall.** Right after a release load the database had no statistics, so it read 2.2 million records instead of probing for the few it needed.
- **This round also fixed the clock.** It now starts when the upload arrives, which the old measurement missed by 3-4 seconds.
- A local rerun of this head (indicative only) shows the worst at 46.2 s, with every check in bounds.

**Your decision before merge: the size.** The three largest files at once still exceed the comfort line of 44 s.
- **Cheapest measured fix:** give the web half a vCPU and 1 GiB instead of a quarter vCPU and 512 MiB, about +$18 a month in production and +$9 in staging. Locally, it brought the worst from 46.2 s to 38.0 s.
- **If CI still shows more than 44 s after that:** a 4-vCPU consumer, about +$72 a month per environment, plus GitHub's 8-core runner, about $44 a month.
- Decide on the CI run that this push has started.

**What changed this round (21 review findings, all verified).**
- The daily share can no longer be bypassed by resubmitting.
- A heavy user's files can never take every thread.
- Production cannot open the screening without its consumer running.
- The page no longer reveals another organization's usage, and no sentence goes stale on reload.
- The 60-second clock starts when the upload arrives.
- The capacity gate cannot be skipped by cancelling, and it watches every file on the screening's path.
- Workflow actions are pinned by commit.
- The rollback steps are corrected.
- The phone-width page passes the accessibility checks.

**SHA-256 to approve:** `6d7a143dd4e5a7145943324afd21a583f9036925978e90d8b9cecf6b4e97f712` (docs/product/domain-model.md, approval line 6859).

**Open items.**
- The sizing decision (O9), on the new CI run.
- Your words, then counsel's, for the new page and email sentences (Q12), listed word for word in the pull request.
- Add `screening-capacity gate` to the branch rulesets (Q8).
- Whether the deploy tool should compute the launch value from the capacity report instead of having it pasted. Recommended, but it changes decision 13's deploy steps.
- After 6b-3 is deployed, remove the old platform's screening permissions (O10).
- Re-check the AWS and GitHub prices before relying on them (O12).

## Sizing question (O9)

**Sizing question for the founder (O9), before merge**

**Measured.** CI's capacity run on 9eb4474 is the measurement of record: Docker runtime, time enforced, the consumer at 1 task of 2 vCPU and 4,096 MiB with 3 threads, and the web at production's quarter vCPU and 512 MiB.
- S4 sends three worst-shape 50,000-row uploads at once to a cold Postgres. They took **57.1, 57.3 and 50.9 s** from upload to email.
- The consumer's own TimeToEmailMs said 53.9, 54.0 and 50.2 s, because it missed the web's share. That is fixed this round.
- The line is 48 s on the runner, and the sizing question starts above 44 s. The worst was S4-2 at 57.3 s.
- Every other upload was within the line: S1-2 24.1, S2-1 13.4, S3-1 11.6, S4-4 35.6, S5-1 24.1, S5-2 18.2, S5-3 24.1 and S5-4 2.3 s. S1-1 stalled, for a separate reason that is fixed this round.

**What drives it.** These figures are from the local process runtime on this round's head. They are indicative only: Postgres is unlimited and warm, but the task limits and CPU layout match CI.
- **The web's quarter vCPU is the largest share.** Three 11-MB uploads arriving at once on one web task reach the queue after 14.6 to 16.0 s (CI: 15.2 s), against 8.6 s for one upload alone. The web was throttled in 326 of 567 periods.
  - I ran one experiment with the web at half a vCPU and 1 GiB (uncommitted, then reverted). The uploads reached the queue after 6.9 s, and S4's times fell from 46.2, 40.0 and 39.3 s to 38.0, 34.6 and 37.6 s.
- **The consumer's two vCPUs are a smaller share.** One worst upload prices in 17.6 s alone and in 19.5 to 21.8 s with three at once (about +17%). Recording takes about 4.5 s and the keyed read about 2.4 s either way.
- **Cold Postgres on gp3's baseline** affects CI but not the local runs. It explains most of the gap between CI's 57 s and the local 46 s.
- **Not the queue** (all three start at once) **and not memory** (the consumer peaked at 1,109 MiB of 4,096).

**Options, best first.** Costs are monthly per environment at AWS us-east-1 on-demand Fargate prices (x86, 730 hours); re-read them on AWS's pages before relying on them (O12). Production pays for the consumer only from launch; staging pays always.

1. **The web at half a vCPU and 1 GiB** (from a quarter vCPU and 512 MiB).
   - Cost: about $18.02 a task-month instead of $9.01. That is +$18.02 in production (two web tasks) and +$9.01 each in staging and dev.
   - Biggest measured gain for the least cost. It also speeds every page for customers, and the harness needs no other change.
   - Measure it on CI first. If CI's worst is then at or below 44 s, nothing else is needed.
2. **If CI's worst is still above 44 s, also make the consumer one task of 4 vCPU and 8 GiB with four threads.**
   - Cost: about $146.60 a month per environment instead of $74.50 (compute $144.16 against $72.08), so +$72.08.
   - Three worst uploads get 1.33 vCPU each instead of 0.67, and a fourth starts at once. The local figures suggest 3 to 4 s off S4.
   - The harness then needs 6 CPUs, so GitHub's 8-core larger runner is needed straight away (about $44 a month at the minutes the 4-core's $22 assumed, Q1 (d)).
3. **Or one consumer task of 4 vCPU and 8 GiB with three threads.** Same cost and runner as option 2, no fourth slot, and no extra load on Postgres.
4. **Or two consumer tasks of 2 vCPU and 4 GiB, two threads each.** Same cost and runner as option 2. It gives back zone redundancy, but three worst uploads get at most 1 vCPU each, and the harness must run two consumers.

**Not options:** keeping the consumer at two threads (audit #53 measured 55.8 s for the third worst file), or widening the 48-s line or the 44-s question.

The push of this round starts a new CI capacity run on 7abb99c, with the stall and the time-metric fixes. Decide on its figures. Compare S1-1 alone with S4: if S1-1 alone is itself near 44 s, the time is in Postgres and the per-row work, not the task sizes.

## Wording (Q12)

The "sent" alert (apps/web/src/lib/screening/sent.ts, SCREENING_SENT_WAIT), shown at /screening?sent=1&wait=<state>:
- soon: "We have your file. The result is emailed to the address you gave as a link, usually within a minute of when you sent it."
- minutes: "We have your file. Other screenings were ahead of it when it arrived, so the result, emailed to the address you gave as a link, can take a few minutes."
- waiting (over the account's share or the day's cap; the page does not say which): "We have your file. It is screened after the files sent within today’s limits, so the result, emailed to the address you gave as a link, can take longer than usual."
- sent (no state, an unknown state, or a failed wait read): "We have your file. The result is emailed to the address you gave as a link."
- Unchanged, after any state: "The link opens the result for 30 days, or until a later screening for the same practice or from the same email address replaces it."

The result email (apps/worker/src/screening/message.ts, SCREENING_WAITED). New: one line after the first line, for a waiting-tier upload only:
- account_share: "It waited behind other screenings because, with it, your email address or its organization had sent more than one day’s share of rows for screening that day."
- daily_cap: "It waited behind other screenings because the screening had reached its limit for that day."

Removed since the build's draft:
- the 'account' and 'day' page sentences;
- the 'We are screening your file … Every screening slot is busy right now …' wording of soon and minutes.

All of these go to the founder, then counsel (Q12).
