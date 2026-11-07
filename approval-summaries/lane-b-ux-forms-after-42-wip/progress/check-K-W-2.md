# check-K-W-2 (adversarial checker round 2, slices W1/W2)
Status: started 2026-11-07. Clone /home/user/ux42-K-W-2 at 09377f21.
- [x] clone at 09377f21
- [ ] install under lock
- [ ] review repair commits touching W (81c657de settings, 47a4ff0d signedOn, 09377f21 payers, 85a5f0a7 lead, 877ce95c/094de2c2/684dd9e7 docs)
- [ ] guard mutation, legal surfaces, PHI detector, sign-in, stale pins
- [x] install under lock; diffs of 81c657de 47a4ff0d 09377f21 85a5f0a7 094de2c2 684dd9e7 877ce95c read
- [x] stale old literals: none (minutes/dollars/10,000/console signedOn)
- [x] guard mutation: 4 violating settings/console edits all caught (scratchpad kw2/guard-mutated.log); reverted clean
- candidate: 85a5f0a7 lead says "a second email follows" whenever first press reached PaidWhole; db test 'before the first is priced' sends 1 mail
- candidate nit: BRAND.md exceptions list names 2 of the ADR's 5 exclusions
- [x] unit (messages + upload-form) 61/61, db (settings, onboarding, screening routes, sign-in) 121/121 on 5433 (scratchpad kw2/w-unit.log, w-db.log); early re-send test passes with 1 mail
- [x] sign-in diff unchanged since round 1 (4 message lines, ':'->';'); PHI detector/observability untouched; legal-surface files untouched except page.tsx prop pass-through
- findings: KW2-1 lead overclaims second email (should); KW2-2 BRAND.md exceptions omit ZIP wording after 877ce95c (should); OK summary
- [x] clone removed; DONE
