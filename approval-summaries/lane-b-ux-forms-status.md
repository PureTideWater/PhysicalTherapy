# Lane B: ux-forms status (co-001/ux-forms)

Forms keep what the person typed, and name the refused field (the UX baseline review's first PR). Session
session_01VNsi2Kru6pfk8CAbQ2AaYB. Claims: ADR 0077 if needed; test-matrix FRM-01 to FRM-08; no synth cases.

## Log
| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-26 04:57 | Started | Machine set up (setup-container OK; gh login PureTideWater). Worktree /home/user/ux-forms, co-001/ux-forms from 4d99df8. |
| 2026-10-26 06:25 | Design done | `designs/lane-b-ux-forms.md` (wf_58d3ea85-4e0: three scouts, the author, one adversarial reviewer with 3 blocking, 11 should-fix and 8 nits, all dispositioned in its section 12). **No migration.** ADR 0077 (amends 0056's type scale for phones). FRM-01 to FRM-08 written. Mechanism proved in a real browser: `action=` kept for the no-JavaScript post, onSubmit + preventDefault + synchronous startTransition, nothing echoed from the server; success resets through Next's redirect remount; passwords and codes emptied after a refusal; a ref guards double presses; a dropped connection keeps the values. Unit tests run in the existing Playwright browser (no new dependency; apps/web/package.json is #42's). |
| 2026-10-26 06:25 | Waiting on #50 | #50 (superseded-rerun) also rewrites `action-form.tsx` and `next.ts` and adds `action-form.test.tsx`; it is at its final verification. The build starts on the base once #50 merges, keeping #50's exports. Postgres restarted after the worker restart (setup-container re-run). |
| 2026-10-26 09:05 | Resumed, build part 1 | The 5-hour limit stopped the session about 06:15; resumed 09:00 on the orchestrator's message. Branch fast-forwarded to 7ef421b (#54 merged). #50 still open (a3c583d, CI green), so build part 1 (wf_2292c24d-611) builds slices B, D and E against the design's component API; slice A, C1 and C2 follow once #50 merges. |

## Decisions (each with its reason in the design)
- Keep values in the browser, never echo them (security, the safer option); without JavaScript the post works and shows the errors, but values are lost (the accepted cost).
- Field names come from the label the person sees, read from the page: one source, no per-form table.
- The summary first in the form, "Fix the field(s) listed here, then try again.", items linking to fields; inline "Error:" under each field; a 2 px danger border (not colour alone).
- Secrets (password, one-time code) emptied after a refusal, with a note under each.
- 16 px controls below 48rem; a pasted code with spaces accepted, client and server.
- Show password: yes (hidden until mounted, spell check and autocapitalise off, re-hidden before submit).

## Next step
Build after #50 merges: slices A (form core), B (sign-in and server words), C1/C2 (practice pages), D (console, shared states), E (e2e and docs).
