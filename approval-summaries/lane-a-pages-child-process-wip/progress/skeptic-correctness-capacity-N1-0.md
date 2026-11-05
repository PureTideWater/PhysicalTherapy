# Skeptic 1 of 3, correctness-capacity N1 (lone surrogate becomes U+FFFD)

Clone: /home/user/sk-pcp-correctness-capacity-N1-0 at c369bc77... (removed after).

Checked:
- page-reader.ts decodeXml returns String.fromCodePoint for D800-DFFF; writeFrame does Buffer.from(body,'utf8'), so a lone surrogate becomes EF BF BD and the parent decodes U+FFFD. Mechanism real (same as base thread code, which kept D800 via structured clone).
- Claimed consequence is refuted: pageTextHash hashes with update(text,'utf8'), which already turns a lone surrogate into U+FFFD bytes. Probe (synthetic strings): hashEqual true for "rate 9\uD800" vs "rate 9�". Citation hashes and inputHashes do not change.
- What does change: serializePageText (JSON.stringify keeps "\ud800" as an escape) stores different bytes (storedEqual false); quoteOnPage with an U+FFFD quote now matches where the thread did not (child is the better-formed side).
- Also reachable from PDF text (pdfjs ToUnicode), so a decodeXml-only fix is incomplete.

Verdict: not refuted on the text change, refuted on the hash consequence. Severity nit.
Fix: make every page text well-formed in one place before it leaves the reader (text.toWellFormed() in the child before writeFrame, and the same on the in-process path if any), plus a unit test; one line in ADR 0033 that page text is well-formed UTF-16 (lone surrogates read as U+FFFD).
Log: scratchpad/pcp/logs/skeptic-N1-0.log
