export const meta = {
  name: 'lane-b-dependabot-batch-reviews-b-c',
  description: 'Run the dependabot-batch review workflow for PR B (#94) and PR C (#91) side by side (two lenses each, skeptics, critic, loop until dry, records)',
  phases: [
    { title: 'B #94', detail: 'reviews of the CDK, @aws-sdk and stripe PR' },
    { title: 'C #91', detail: 'reviews of the group-routing fix' },
  ],
}
const SCRIPT = { scriptPath: '/root/.claude/projects/-home-user-PhysicalTherapy/9403d8f7-c652-5574-8dfa-f848fcb558dc/workflows/scripts/lane-b-dependabot-batch-reviews-wf_48c765bd-7af.js' }
const [b, c] = await parallel([
  () => workflow(SCRIPT, args.B),
  () => workflow(SCRIPT, args.C),
])
return { B: b, C: c }