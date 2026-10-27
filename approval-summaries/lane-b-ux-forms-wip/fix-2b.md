# fix-2b progress
Started. At start, worktree had uncommitted changes from another builder (git status at start listed 24 M files incl. action-form.tsx, form-issues.tsx, next.ts, review/page.tsx). Do not revert them.
## Gaps
1 version-form stale refresh: pending
2 export-status stale: pending
3 confirm_ keys group: pending
4 FRM-02 redirects: pending
5 FRM ids in titles: pending
6 hidden input name doc: pending
7 defaults.tsx label tables: pending
8 helpers.ts refusal() doc: pending
9 FRM-01 state carries no value: pending
10 version-form clicked null: pending
11 loading-announcement SETTLE_MS doc: pending
- 1: exported RefreshAfterRefusal (action-form.tsx), version-form renders it for shown.state.stale. DONE
- 10: version-form shown picks draft when clicked null and only draft.state has error. DONE
- 2: next.ts STALE words now end 'Reload the page and try again.' (for #42 upload form); RefusalLead (form-issues, exported, renamed from Lead) writes stale words from the flag; export form uses RefusalLead + RefreshAfterRefusal + pressedHere. DONE (tests pending)
- 3: CheckboxGroup matches box keys (useFieldIssue issueFor + fieldset data-issue-for), new prop itemized -> data-error-name=legend on boxes; both attestation pages pass itemized; fields.test case added. DONE
- 9: new apps/web/src/lib/http/next.test.ts (real runAction/runSignInStep over requestAudit, createTicket, signInWithPassword; mocks next/headers + services) - 4 tests pass. registry FRM-01 add pending
- 5: FRM-04 in action-form.test.tsx describe title; FRM-07 in two sign-in-routes.db.test.ts it titles. DONE
- 7: defaults.tsx tables MATERIALITY_LABELS/PURSUIT_LABELS dropped, labels inline, header comment fixed; defaults.test.tsx asserts the control names directly. DONE
- 4: e2e forms-keep-input: ROI test gains a save to another page and back (suggested period, no summary, new key); console incident test gains a save to the identical address (defaults, no summary, new key) then resolves it; registry FRM-02 why text updated. Not run locally (e2e needs stack) DONE
- browser tests added (version stale, export stale, itemized confirm group): 24/24 pass dev signal chromium-1243. STALE const in browser test now server words.
- 6, 8: ADR 0077 D3 (hidden data-error-name, group box keys/itemized), D10 (flag decides; server words end in reload), Consequences (refusal-summary slot, helpers.ts refusal()). Design note pending.
- 6, 8, 11: design section 12.1 appended (ops/designs/lane-b-ux-forms.md). DONE
- checks: typecheck 22/22 pass; eslint changed files EXIT 0; lint:copy 517 clean; lint:logs 1059 clean; unit web+ui+synth 1040 (1 fixture drift -> pnpm synth --all wrote FRM-01/02/07 expected.json; synth rerun 185 pass); browser 24/24 dev signal; db sign-in-routes 7 pass. e2e not run. ALL DONE
