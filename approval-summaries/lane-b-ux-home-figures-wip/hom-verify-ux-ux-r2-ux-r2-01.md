# ux-r2-01 verify (done)
Clone: scratchpad/vR201 at 87691be4.
- Paths are apps/web/src/components/{help.ts:10,shell.tsx:349-353} (finding dropped src/).
- shell.tsx:349-353 renders <details data-help={section}> with HELP[section] inside <main>; HELP.practice (help.ts:10) says "only stage-five amounts are recovered". toContainText uses textContent, so closed details text is read; /stage five/i misses the hyphen. reconciliation.spec.ts:237 passes only because of the hyphen.
- test-matrix.md:386 HOM-02 "no read text of the home ... says stage five" is false at this commit. PR body :77 discloses help.ts as a #42 follow-up, :3 scopes claim to text the PR touches (true).
- #42 branch (fetched) still has the same help.ts:10 line.
- headline.test.tsx:93 already /stage (five|5)/i, tiles only (no help) -> widen for hyphen, no exception needed.
- Only help.ts:10 has stage-five in apps/web; case page (cases help) and reconciliation have none -> widening :244 and :246 passes without exclusion.
- Proposed fix's locator 'main > :not(details[data-help])' resolves to several elements; not.toContainText(regex) on it fails strict mode. Better: allTextContents over that locator, or exclude via evaluate.
Verdict: REAL, should-fix (test blind spot + matrix overclaim; user-visible text pre-existing and disclosed). Fix adjusted.
