# pr42g review: legal sign-off records (head 10db232c) -- DONE
Checked: git show 10db232c (3 files, 4 places); no legal sentence changed (all quoted sentences byte-identical);
git diff be63bdc2 HEAD -- apps/worker/src/screening docs/product/legal-surfaces.md docs/policies: empty;
O4 (ADR 0065 now :358) not in diff; name Tyler Williams, date 2026-11-01 / November 1, 2026 (recon file style), "as written",
"relayed by the co-founder", counsel still reviews, new sign-off for change: present in all four; recon edited in place.
Pending-wording grep: remaining hits are 6b-2/6b-3/ZIP+4 (other PRs), as merge report says.
Findings:
1 minor: ADR 0062:1554-1555 "these among them (word for word in its pull request, before and after)" claims all 11 listed
  sentences are in the signed text; record s1 holds only paused, raced, bounce budget, what-is-kept, ADDRESS_CHECK_KEPT;
  refused-address sentence, mailbox/typo/ending hints, keep box are in record s6 ("unchanged ... listed for completeness", no before/after).
2 minor: ADR 0062:1551 is 123 chars, over the 120 wrap of the surrounding prose.
