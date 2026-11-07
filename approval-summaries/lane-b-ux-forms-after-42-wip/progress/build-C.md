# build-C (slice C) progress

- Worktree /home/user/ufa42-c, branch co-001/wip-ux-forms-after-42-c from base 31a7345f; installed.
- DONE, pushed to origin (fast-forward, through the pre-push hook): head a1ba3b0f1555f462c6ff5775187ef3b7377e1f16.
- Commits: fe2eef98 users page (2 ScrollTables, CheckboxField, sr-only column names, curly apostrophes; tables.test.ts AFTER_42 line deleted);
  73635b8a console support Ticket hint + maxLength 64, "PaidWhole staff", curly apostrophes; 7c4c781e console mail resume-review describedBy;
  a1ba3b0f shell skip link + main#content tabIndex -1 (both branches).
- Evidence (logs under scratchpad/ufa42/logs): c-tables-red.log (2 bare tables at :52, :132) -> c-tables-green.log (7/7);
  c-formhints-red.log (U's ALLOWED entry removed locally, base page: support/page.tsx:57 <Field>) -> c-formhints-green.log (16/16; U's file restored, not committed);
  c-skiplink-red.log / c-skiplink-green.log (scratch render test, not committed); c-typecheck-2.log pass; c-lint.log pass; c-lintcopy.log pass;
  c-unit-web.log: 638/639, the one failure is form-hints "keeps its allowlist short" (support page now has a hint; U removes the entry; expected until U lands).
- Not run: e2e (onboarding atPhoneWidth, mail-cutoff describedby, skip-link spec are slice E's); no route changed so no db test.
