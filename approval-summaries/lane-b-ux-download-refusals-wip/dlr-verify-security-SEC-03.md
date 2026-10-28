# SEC-03 verify (skeptic) — progress
Clone: scratchpad/verify-sec03 at 63aaa7f4.
Checked:
- handler.ts:176 query = Object.fromEntries(new URL(request.url).searchParams): node probe ?codes=ABC&codes=DEF&k=1 -> { codes: 'DEF', k: '1' } (last wins).
- handler.ts:177 params = { ...query, ...context.params }: path params win over a same-named query key (sound).
- handler.ts:357 refusedNavigation gets built.params (same object the route parses at invoke.ts:99), so route and returnTo see the same 'DEF'.
- handler.ts:302-306 comment says "a repeated query key is none"; the filter only drops non-strings (catch-all arrays). Comment is false; added in this PR (git diff e908c214).
- coverage.ts:198-205 payerLetter: route parses codes='DEF', returnTo keptCodes('DEF') -> Location codes=DEF; page reads one value. Consistent, nothing unsafe; repeated key only by hand-crafted URL.
- letter.tsx:52-56 single(): Next searchParams array -> undefined, so the page side really does treat a repeated key as none; ADR 0079 s5 and download-refusal.ts:123 say so for the page reader only. Design doc and PR body say nothing on returnParams.
Verdict: REAL, nit (comment-only). Fix: correct the comment (reviewer's wording fine; better to also say it is the same value the route's params schema parsed and path params win). Changing code to drop repeated keys would be worse (shared routeRequest, and the page could lose the value the route refused).
DONE.
