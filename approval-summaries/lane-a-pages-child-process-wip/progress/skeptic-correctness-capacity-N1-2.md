# Skeptic 3 of 3, correctness-capacity N1 (lone surrogate through UTF-8 framing)

Clone at origin/co-001/wip-pages-child-process c369bc77... (read only, removed after).

Mechanism confirmed by construction: page-reader.ts writeFrame uses Buffer.from(body,'utf8'), which writes a lone
U+D800 as EF BF BD, so the parent decodes U+FFFD; decodeXml (unchanged from 7fb3e102...) emits the lone surrogate.

Stated consequence refuted: pageTextHash hashes normalizePageText(text) with update(...,'utf8'), and Node's UTF-8
encoder already turns a lone surrogate into EF BF BD. Probe: sha256 of normalized "Rate 9 \uD800" equals that of
"Rate 9 �" (true). So the citation hash taken on re-read is identical in-process and via the child;
resolve.ts's hash_mismatch cannot fire from this.

Only raw-string comparison differs (quoteOnPage with a quote that itself holds a lone surrogate). Quotes reach
the resolver through Postgres (UTF8 text cannot hold a lone surrogate; the driver's UTF-8 encoding writes U+FFFD)
or the model API (JSON/UTF-8), so a stored quote already carries U+FFFD; the child's output matches it better than
the thread's did. No data is stored pre-launch, so no old stored page text to mismatch.

Verdict: refuted (not a reachable defect); severity none. Optional hygiene: map D800-DFFF to U+FFFD in decodeXml
so in-process and child text are byte-identical strings.
