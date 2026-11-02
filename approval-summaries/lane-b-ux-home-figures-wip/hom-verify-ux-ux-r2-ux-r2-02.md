# ux-r2-02 verify (clone vR202 at 87691be4)
Verdict: REAL, should-fix (confirmed).
- cases/page.tsx:262 now `{actionableNowLines} of {openLines}`; was `{openLines} of {lines}` at 43565235. closed_written_off => openLines 0 => "0 of 0"; row loses total line count.
- case page [caseId]/page.tsx:83 `on {actionableLinesWords(item)}`; display.tsx:108 equality branch => "$0.00 on 0 lines"; display.test.tsx:40 pins '0 lines' for 0/0.
- Mitigation: case page Written off fact (line 86) still says "(3 lines, struck through below)"; Cases row State badge says written off. So vacuous, not false -> should-fix not blocking.
- Fix: proposed fix right in substance; better wording "no line (all 3 lines written off)" vs "none: all 3 lines written off"; update display.test.tsx:40.
