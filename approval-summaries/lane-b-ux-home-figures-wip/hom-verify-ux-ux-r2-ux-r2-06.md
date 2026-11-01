# ux-r2-06 verify (done)
Clone: scratchpad/v06 at 87691be4.
- display.tsx:107-112 actionableLinesWords returns a plain string; counts via String()/counted(), no mono span.
- Used as text in cases/[caseId]/page.tsx:83 and cases/[caseId]/packet/page.tsx:219, beside <Money> (mono).
- cases/page.tsx:261-262 renders the same counts in a font-mono tabular-nums cell.
- Rule: .claude/rules/brand.md:36 and docs/brand/BRAND.md:94 ("every ... unit count ... mono, tabular").
- <Counted> exists at components/remittances/display.tsx:23 and is used in sentences (uploads page, settings defaults).
- PR rewrote both sites (base had sans counts too, but the PR introduced the helper, so it owns them).
- Home note (dashboard/headline.tsx:40-42 actionableNote, outOfFigureWords) is also sans; no rule allows that, so the reviewer's "allowed" exception is wrong.
Verdict: real, nit. Better fix: one JSX component for case page, packet builder AND home tile note.
