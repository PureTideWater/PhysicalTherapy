# Skeptic 2 of 3: correctness-capacity N1 (lone surrogate becomes U+FFFD)

Clone: /home/user/sk-pcp-correctness-capacity-N1-1 at origin/co-001/wip-pages-child-process c369bc77... (read only, removed after).

## Reproduction
- Mechanism confirmed by reading: decodeXml (page-reader.ts:120) returns String.fromCodePoint for D800-DFFF; writeFrame (page-reader.ts:432) encodes with Buffer.from(body,'utf8'), which writes EF BF BD for a lone surrogate. So the page TEXT does change: '9\uD800' arrives as '9�'.
- The stated consequence does not hold. pageTextHash (page-text.ts:18) hashes with createHash().update(text,'utf8'), which already maps a lone surrogate to EF BF BD. Node 24: sha256 of normalize('9\uD800') === sha256 of normalize('9�') -> true. The citation hash is the same in-process and through the child.
- What does differ: quoteOnPage with a quote that itself holds a lone surrogate (true in-process, false via child), and the stored JSON (old '\ud800' escape vs a raw U+FFFD). A quote with a lone surrogate fails closed (no citation, a person sees it unresolved); no page text has been stored through the thread path (pre-launch, no PR), so no stored text or hash is invalidated.

## Verdict
refuted=true for the finding as stated (the quote hash does not differ). Residual: a text-only difference, nit. Optional fix: decodeXml maps 0xD800-0xDFFF to U+FFFD itself (keeps in-process and child text the same), plus a test on a synthetic xlsx cell with &#xD800;.

## Resumed run (2026-11-05)
- Branch head still c369bc77...; clone already removed. Re-checked on Node 24: sha256('9\uD800' as utf8) === sha256('9�') -> true; pageTextHash (page-text.ts:18) unchanged at head. Verdict stands: refuted=true, residual nit.
