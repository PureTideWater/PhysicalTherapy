export const meta = {
  name: 'pr6b2-confirm-race-fix',
  description: 'PR 6b-2 (#36): the confirmation records only the location the person was shown (database refuses a mismatch, the form carries what it showed), ADR 0064 paragraph corrected, domain model regenerated, targeted checks, one push',
  phases: [{ title: 'Fix', detail: 'one agent in /home/user/pr6b2' }],
}

const WT = '/home/user/pr6b2'
const BR = 'co-001/pr-06b-pricing-location'
const SP = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/scratchpad'
const MIG = 'packages/db/migrations/20261105090000_pricing_location_and_zip_plus_four.sql'
const VERIFYLOG = '/tmp/claude-0/-home-user/e7bf8d14-3b4c-5e38-9cea-a1f92a95083e/tasks/waqcc1hj8.output'

const FIX = { type: 'object', properties: {
  summary: { type: 'string' }, head: { type: 'string' }, marker_used: { type: 'boolean' },
  domain_model_sha256: { type: 'string' }, approval_line_number: { type: 'number' },
  checks: { type: 'array', items: { type: 'object', properties: { command: { type: 'string' }, passed: { type: 'boolean' }, note: { type: 'string' } }, required: ['command', 'passed'] } },
  wording: { type: 'string' },
  approval_summary_update: { type: 'string', description: 'the paragraph(s) to add to the founder approval summary for this change, markdown' },
  open_items: { type: 'array', items: { type: 'string' } },
}, required: ['summary', 'head', 'marker_used', 'domain_model_sha256', 'approval_line_number', 'checks', 'wording', 'approval_summary_update', 'open_items'] }

phase('Fix')
const r = await agent(`Repository PureTideWater/PhysicalTherapy (PaidWhole). PR 6b-2 is draft pull request #36 into claude/build-platform (base 510a26d), branch ${BR}, worktree ${WT}, head 98a5e49, verified by a fresh-clone verification that passed but found two nits (read them in ${VERIFYLOG}, JSON key findings). The build treats the first as a defect of this PR's own commits and fixes it now, before the founder is asked to approve the domain model:

1. A confirmation can be recorded against a location the person was never shown. (a) Race, reproduced by the verifier on PostgreSQL 18 with two connections: practice_confirm_location() reads the old location's status, waits on a console change's row lock, then stamps the confirmation on the NEW row. (b) Stale page: the confirm form posts only confirm=on, so the handler confirms whatever practice_site holds at click time. Fix both, best option: practice_confirm_location takes the ZIP and ZIP+4 the person was shown (practice_confirm_location(target uuid, shown_zip text, shown_zip_plus_four text)) and confirms only when the stored row still holds exactly those values, atomically (lock the row, for example SELECT ... FOR UPDATE, then compare and update, or compare in the UPDATE's WHERE), refusing otherwise with a distinct coded error (for example check_violation with constraint practice_site_changed); keep every existing guard (person, pricing_settings.set, active practice, settled status), SET search_path, REVOKE ALL FROM PUBLIC and exactly GRANT EXECUTE TO tp_app (the old one-argument function is dropped in the same unmerged migration, so there is one signature). The Pricing settings confirm form carries the ZIP and ZIP+4 it shows (hidden fields, Zod-validated), the handler passes them, and a mismatch shows a plain notice ("The billing ZIP changed since this page loaded. Review it, then confirm.") with the page re-read. Tests first, failing on 98a5e49: a db test of the race with two connections (the console change commits while the confirm waits; the confirmation is refused and the row stays unconfirmed), a db test of the stale values, a route test of the stale form, and the existing refusals still refused.
2. ADR 0064's location paragraph (about lines 218-222) describes practice_site without confirmed_by and confirmed_at and says practice_site_rules() lets only the ZIP, ZIP+4 and who set them change; correct it to the code.

The founder's permission for the new-migration marker (Tyler Williams, 2026-10-22, "Yes, allow the marker", for ${MIG} only) still applies: create ${WT}/.claude/.allow-protected-edit with one touch immediately before editing ${MIG}, edit only that file with the Edit tool, remove the marker with rm -f immediately after, before any test, commit or push; never another migration; never commit the marker. If the permission check refuses the marker, stop and report (marker_used false); never route around it.

Then: regenerate docs/product/domain-model.md on a fresh PostgreSQL 18 database (pnpm db:domain-model --out --strict), read its Cross-checks block (expected no difference), report the new SHA-256 and the 1-based line number of the "Approved by:" line. Checks before the push (record each): pnpm typecheck; pnpm lint; pnpm lint:copy; pnpm lint:logs; PR_NUMBER=36 pnpm -s exec tsx tools/engine-freeze/check.ts $(git merge-base origin/claude/build-platform HEAD); the unit and db tests of every file you changed plus packages/db's location, catalog and cross-tenant db tests and the web's settings route db tests, on a fresh PostgreSQL 18 database migrated from empty; pnpm -s db:domain-model --check; the e2e spec that exercises Pricing settings and the onboarding journey on ports 4901-4909; pnpm build. CI runs the full suite on the push. Commit in the repository's style, ending each message with, after a blank line:
Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MXvjcgRoTSrfU3V7a5MShH
Push ONCE: git push -u origin ${BR} (retry 2/4/8/16 s on a network error; never force, never --no-verify). Update #36's body (gh api -X PATCH repos/PureTideWater/PhysicalTherapy/pulls/36 -F body=@<file>): the domain-model summary at the top regenerated (pnpm -s db:domain-model --summary-since origin/claude/build-platform), the verification's two nits recorded as fixed with their commit, the new SHA-256, the new sentence word for word (Q12), the ending lines kept; keep it a draft. Return the head, the SHA-256, the approval line's number, the checks, the wording, a short paragraph to add to the founder's approval summary, and open items.
Environment: export PATH=/opt/node24/bin:/opt/py312-ci/bin:$PATH. PostgreSQL 18 on 5433 (postgres:test, socket /tmp); databases tp_pr6b2_race_<n>, dropped when done. If PostgreSQL stops answering, start it with su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log start". CLAUDE.md binds; the other edit hooks are live and never bypassed; never skip or loosen a test. Logs under ${SP}/pr6b2-race/.`, { label: 'fix: 6b-2 confirmation race', phase: 'Fix', schema: FIX })
if (!r) throw new Error('the fix agent returned nothing')
return r
