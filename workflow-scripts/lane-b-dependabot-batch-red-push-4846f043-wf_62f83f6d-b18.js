export const meta = {
  name: 'acting-s4-4846f043-red-push',
  description: 'Investigate the red ci (images: Trivy) and screening-capacity (measure, 9 s) push runs of 4846f043 (#94 merge): whose, root cause, fix; skeptic',
  phases: [
    { title: 'Investigate', detail: 'images Trivy findings and capacity measure failure' },
    { title: 'Skeptic', detail: 'try to refute each conclusion' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/41a30c20-8b29-54c0-aac9-2d7e26acf337/scratchpad/red'
const COMMON = `Context: PaidWhole build, repository PureTideWater/PhysicalTherapy. #94 (aws-cdk-lib 2.275, CLI 2.1146.1, @aws-sdk ^3.1160.0, stripe ^23.1.0; head e3fc02e4) merged into claude/build-platform as 4846f043 at 2026-11-04T02:50Z. On #94's head e3fc02e4 (2026-11-02 ~10:40Z) every job passed, including ci's images job (job 125226140767) and the capacity job (125228651914, 17 min). The push runs of 4846f043: ci 41763423759 FAILED: only the images job 126356134153 (steps "Scan the web image (fails on HIGH or CRITICAL)" and "Scan the worker image (fails on HIGH or CRITICAL)"); unit, db (6 shards), e2e (3 shards), static, lint, build, domain model passed; all green failed for it. screening-capacity 41763423983 FAILED: capacity job 126356184270 step "Measure under production limits" failed after 9 s (02:55:59-02:56:08Z), after "Restore the scale release" restored a cache and "Build the scale release" was skipped; gate job 126357826300 failed accordingly; notify opened/updated the screening-capacity issue. mutation 41763423868 green. Note: the PR run used db 4 shards / e2e 2, the push run 6 / 3 (find why: ci.yml's push matrix?).
Rules: read only. GitHub through the mcp__github__ tools (ToolSearch "select:mcp__github__get_job_logs,mcp__github__actions_list,mcp__github__actions_get,mcp__github__issue_read,mcp__github__list_issues"); gh only for search; never re-run a job, comment, push or write on GitHub. Logs: get_job_logs with return_content and tail_lines large enough (e.g. 3000), or the job's raw log URL if reachable; find the exact failing lines. Local repo /home/user/PhysicalTherapy is at 4846f043 (read files there; use git show for other commits). Heavy commands under flock /tmp/laneb-heavy.lock with export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH. No model identifier in any file. Scratch under ${SP}. docs/runbooks/ci.md says when a re-run is allowed (only infrastructure failures): quote it.`
const SAVE = (f) => `Save as you go in ${SP}/progress/${f}; continue from it if it exists.`

phase('Investigate')
const [img, cap] = await parallel([
  () => agent(`${COMMON}

IMAGES: read job 126356134153's log: list every HIGH/CRITICAL finding Trivy reports for each image (package, installed version, fixed version, CVE id, its publish date if the log or the Trivy DB says, which layer/target: OS package, node_modules path, base image). For each: is it brought by #94 (compare against 21fa10df: git diff 21fa10df 4846f043 -- pnpm-lock.yaml for that package's version; was the same version present at 21fa10df and on e3fc02e4 when its images job passed?), or new in the vulnerability DB since 2026-11-02 (same versions, newer DB)? Read the base push run of 21fa10df's images job (ci run 41428286317) and #94's PR images job 125226140767 for the Trivy DB date and findings. Read the repo's Trivy config (.trivyignore? trivy.yaml? the images job in .github/workflows/ci.yml, docs/runbooks on image vulnerabilities, ADRs on Trivy) and the documented path for a new finding (bump, digest refresh, recorded exception). Also check whether open PR #86 (ci-images-digest, branch co-001/ci-images-digest, being finished by another session) touches this. Conclude: whose it is, the minimal correct fix per the runbook, who owns it (a new PR? which lane's item?), and whether other open PRs' CI will now be red on images too.
${SAVE('images.md')}
Write ${SP}/images.md and return it.`, { label: 'investigate:images', phase: 'Investigate' }),
  () => agent(`${COMMON}

CAPACITY: read job 126356184270's log around "Restore the scale release" and "Measure under production limits": the exact error. Is it the cached scale release (its cache key, what it restored, whether its contents match 4846f043's code or an older tree), the images, Postgres, Docker, a dependency #94 moved (an @aws-sdk client, stripe, the CDK), or the runner? Compare with the PR run's capacity job 125228651914 on e3fc02e4 (did it build the release instead of restoring?) and the base's push run 41428286155 on 21fa10df. Read .github/workflows/screening-capacity.yml and tools/screening-capacity for the cache key and the measure step. Read the screening-capacity issue the notify job opened or updated (list_issues, label or title). Also: why did the push ci run use db 6 shards / e2e 3 shards where the PR ran 4 / 2 (ci.yml)? If you can reproduce locally cheaply (no Docker here: say so), do. Conclude: whose it is, the root cause, the fix, whether a re-run is allowed by docs/runbooks/ci.md (quote), and the owner.
${SAVE('capacity.md')}
Write ${SP}/capacity.md and return it.`, { label: 'investigate:capacity', phase: 'Investigate' }),
])

phase('Skeptic')
const sk = await agent(`${COMMON}

You are the SKEPTIC. Two investigations:
IMAGES:
${img}
CAPACITY:
${cap}
Try to refute each conclusion against the logs and the repo (re-read the key log lines and diffs yourself). In particular: is "not #94's" really shown (same package versions before and after, or the finding's package outside #94's lockfile moves)? Is the proposed fix the runbook's documented path, the safest, and minimal? Is a re-run allowed or forbidden for each by docs/runbooks/ci.md?
${SAVE('skeptic.md')}
Return per conclusion "UPHELD" or "REFUTED: <why>", and the final, corrected summary: whose, root cause, fix, owner, re-run allowed.`, { label: 'skeptic', phase: 'Skeptic' })
return { img, cap, sk }
