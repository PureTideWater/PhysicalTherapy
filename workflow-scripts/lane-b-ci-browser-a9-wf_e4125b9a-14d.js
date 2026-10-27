export const meta = {
  name: 'lane-b-ci-browser-a9',
  description: 'A9 for PR #77: build the old/new baseline evidence (side-by-side, diffs, crops, exact and comparator pixel counts, SHA256SUMS), then an adversarial visual inspection of each picture',
  phases: [
    { title: 'Evidence', detail: 'pictures, counts and the note draft' },
    { title: 'Inspect', detail: 'adversarial visual inspection per picture' },
  ],
}
const SP = '/tmp/claude-0/-home-user-PhysicalTherapy/5b1bc8b7-7846-5c40-a0f8-306593ba96be/scratchpad'
const OUT = '/home/user/ops/designs/lane-b-ci/ci-browser-a9'
const NOTE = '/home/user/ops/designs/lane-b-ci/ci-browser-a9.md'
const COMMON = `Context: PaidWhole build, PR #77 (ci-browser), branch co-001/ci-browser at 64843249 in /home/user/ci-browser (read only; do not commit there). The seven brand baselines (apps/web/e2e/brand.spec.ts-snapshots/*-chromium-linux.png) were regenerated on Chrome for Testing 156.0.8078.4 (revision 1248) under Playwright 1.64.1; the old ones are at e908c21 (unchanged since 6ddd587; 141 / revision 1194 under 1.56.1). Design: /home/user/ops/designs/lane-b-ci.md §3.3.1 "A9", §3.3.7 "A9 under the 2026-10-27 direction", §3.3.8 S7 and N2, §3.3.9. ADR 0058 (apps' docs/adr/0058-*.md in the worktree) gives the brand points and the comparator settings (brand.spec.ts VISUAL: maxDiffPixelRatio 0.01; STRICT: threshold 0.05, maxDiffPixels 6). The UX review found the without-seal cover's change is the title "ROI statement" drawn 1 px lower (1,611 px in 234 x 27 at 83, 418; shifted 1 px the old title matches). Under the co-founder's 2026-10-27 direction, A9's inspection is his, taken as recommended by the session and recorded with its evidence. Synthetic brand pictures only. Every shell command starts with export PATH=/opt/node24/bin:/opt/pnpm-bin:/opt/py312-ci/bin:$PATH; heavy commands under flock /tmp/laneb-heavy.lock. Never run git add/commit/push anywhere. No model name or identifier in any file. Shorten any 64-hex hash in prose to 8 digits and an ellipsis (SHA256SUMS keeps full hashes: it is a checksum file).`

phase('Evidence')
const ev = await agent(`${COMMON}

Your task: build A9's evidence in ${OUT}/ (create it; it may already hold a partial run of yours, continue it) and draft ${NOTE}.
For each of the seven pictures <name> (header-1280, header-390, header-lockup-1280, header-lockup-390, report-cover-top, report-cover-with-seal, report-cover-without-seal):
- <name>.old.png: git -C /home/user/ci-browser show e908c21:apps/web/e2e/brand.spec.ts-snapshots/<name>-chromium-linux.png
- <name>.new.png: the file at the worktree's HEAD (64843249);
- <name>.side.png: old and new side by side with a thin separator (ImageMagick convert +append, or Python PIL if present in /opt/py312-ci or system python; say which);
- <name>.diff.png: changed pixels marked (compare -highlight-color or PIL), only when any pixel differs;
- <name>.crop-<k>.png: old, new and diff crops of each changed region's bounding box, enlarged 4x nearest-neighbour, only when pixels differ;
- the exact changed-pixel count (any channel) and the bounding box; and the count under the journey's own comparator with that picture's setting (VISUAL or STRICT, read from brand.spec.ts) through playwright-core 1.64.1's getComparator('image/png') (require from the worktree's node_modules/.pnpm/playwright-core@1.64.1/node_modules/playwright-core/lib/coreBundle or wherever its utils export it; if it cannot be loaded, say so and give exact counts only); and for the without-seal cover, the 1 px shift test (old shifted down 1 px vs new: changed pixels).
Then SHA256SUMS over the directory (sha256sum *.png > SHA256SUMS), and check its .old and .new lines equal the blobs' SHA-256 (git show | sha256sum) and the committed files'.
Draft ${NOTE}: purpose (A9; the co-founder's inspection taken as recommended under the 2026-10-27 direction), method, a table per picture (old and new SHA-256 shortened, bytes, exact changed pixels, comparator verdict and count, bounding box), the six byte-only changes explained (1.64.1's PNG encoder's scanline filters; pixel-identical), the cover's title 1 px lower, the header's names pixel-neutral, links to each side.png and crop by relative path, ADR 0058's brand points (leave a placeholder section "Visual inspection" for the inspector's verdict), CI's proof (a placeholder line "CI's baseline step on 64843249: pending"), and the recommended option taken.
SAVE: keep ${SP}/a9/progress.md current; continue from it if it exists.
Return: the table, the file list, anything that did not work.`, { label: 'a9:evidence', phase: 'Evidence' })

phase('Inspect')
const insp = await agent(`${COMMON}

You are the ADVERSARIAL VISUAL INSPECTOR for A9. The evidence builder's result:
${ev}
Look at every old and new picture at full resolution and at every side-by-side, diff and crop in ${OUT}/ (the Read tool shows images). Re-count at least the without-seal cover's changed pixels and one header picture yourself (python with PIL, or ImageMagick compare -metric AE) rather than trusting the table. For each picture give a verdict, pass or finding, against ADR 0058's brand points: the lockup and keystone, the brand colours (exact hex values from packages/brand or the brand CSS in the worktree), the faces (the self-hosted brand fonts: no fallback face anywhere), the seal and its definition line on the with-seal cover, a blank Paper foot on the without-seal cover, the header controls' text and spacing, nothing clipped or misaligned, and for the without-seal cover whether the 1 px lower title is acceptable (it is still inside its box, aligned with the rest of the layout, same face and colour). A finding names the picture, the region (coordinates), what is wrong, and the evidence. Then write your verdicts into ${NOTE} under its "Visual inspection" section (replace the placeholder), with a one-line overall verdict.
SAVE: keep ${SP}/a9/inspect-progress.md current; continue from it if it exists.
Return: each picture's verdict with its evidence, any finding, and the overall verdict.`, { label: 'a9:inspect', phase: 'Inspect' })

return { ev, insp }
