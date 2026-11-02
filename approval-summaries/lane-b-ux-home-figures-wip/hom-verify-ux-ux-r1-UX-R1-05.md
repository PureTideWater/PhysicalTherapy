# UX-R1-05 verify (clone scratchpad/v05 at 87691be4)
- display.tsx:91 joins causes with ', ' (not listed()); words.ts:3-5,17-20 ask for 'a, b and c'. Confirmed.
- display.tsx:112 joins clause with '; '; packet/page.tsx:219 appends ', as of {asOf}.' after it -> date binds to the last cause. Confirmed.
- Before (base 43565235) the packet put the clause in parentheses; design line 187 also specifies parentheses. Regression vs both.
- headline.tsx:42 tile note ends the sentence with '; out...' - no trailing clause, only the listed() part applies there.
- Verdict: real, nit (meaning recoverable). Fix: listed(parts) + parentheses in actionableLinesWords; update display.test.tsx, headline.test.tsx:47, PR body lines 34-35.
