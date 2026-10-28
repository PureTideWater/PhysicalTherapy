# p4 build A (stacked-rows.tsx + stacked-rows.test.tsx), progress: DONE

Slice: design 2.6 (a) item description, (b) term column fit-content(40%); section 12 adds nothing to the primitive
(P4-DR-04's font-medium is the callers' heading spans, slice B).

- [x] read design (whole, incl. section 12), review json, scouts' notes
- [x] read stacked-rows.tsx, stacked-rows.test.tsx
- [x] tests first: committed 995f568f. Ran `vitest run --project unit apps/web/src/components/stacked-rows.test.tsx`
      under the lock: 2 failed / 12 passed. (1) description case: item renders `</h3><dl ...>` with no <p>;
      (2) dl case: received `@min-[24rem]:grid-cols-[max-content_1fr]`. Typecheck fails: `description` not in StackedRow.
- [x] change stacked-rows.tsx: committed 8c235304 (StackedRow.description, Row renders
      <p class="mt-1 text-sm text-muted-foreground"> between heading and dl when not rendersNothing; dl class
      @min-[24rem]:grid-cols-[fit-content(40%)_1fr]; StackedRows doc comment)
- [x] checks (under lock): stacked-rows.test.tsx 14/14; components folder 25 files / 235 tests; apps/web tsc clean;
      eslint clean on both files; app/tables.test.ts + type-scale.test.ts 9/9; pnpm lint:copy clean;
      Tailwind 4.3.3 compiles the class to `grid-template-columns: fit-content(40%) 1fr` in `@container (width >= 24rem)`.
Remaining: nothing in slice A. For slice B: `description` is on StackedRow (ReactNode). For slice D: ADR 0078 amendment
and TBL-04 text match the new doc comment.
Note: no prettier config in repo; formatting is eslint's.
