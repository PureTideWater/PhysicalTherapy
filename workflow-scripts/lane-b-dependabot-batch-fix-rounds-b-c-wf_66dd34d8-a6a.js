export const meta = {
  name: 'lane-b-dependabot-batch-fix-rounds-b-c',
  description: 'Fix rounds for PR B (#94) and PR C (#91) side by side, each through the fix-round workflow (fixer, checker, full local suite once, one push, description)',
  phases: [
    { title: 'B #94', detail: 'fix round' },
    { title: 'C #91', detail: 'fix round' },
  ],
}
const SCRIPT = { scriptPath: '/root/.claude/projects/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/workflows/scripts/lane-b-dependabot-batch-fix-round-wf_416e36ca-397.js' }
const [b, c] = await parallel([
  () => workflow(SCRIPT, args.B),
  () => workflow(SCRIPT, args.C),
])
return { B: b, C: c }