# 0011. Keep apps/web to the bare App Router shell until each screen's milestone

- **Status:** accepted
- **Date:** 2026-10-15
- **Deciders:** founder (engineering)
- **PRD sections:** 7 (screens), 17 (milestone 0: "apps/web (Next.js, App Router, Tailwind, shadcn/ui)"; milestone 11: "security headers, rate limits, error pages")

## Context

Milestone 0 part A built a sixteen-screen workspace shell with placeholder pages, a sign-in page, a not-found
page, a practice-switcher placeholder and a full security-header set (CSP, HSTS, COOP, CORP and others). None of
it held behaviour. The milestone 0 prompt asks only for the app skeleton; the plan schedules each screen in the
milestone that builds it, and security headers and error pages in milestone 11. The house rule is not to add
features the plan does not ask for.

## Decision

apps/web is the App Router shell: the root layout (rendered per request), one page that uses `@tp/ui` (the
shadcn/ui components on Tailwind), and the standalone build the container runs. The placeholder screens, sign-in,
not-found page, practice switcher and security headers were removed; each comes back in its milestone with its
behaviour and tests. `packages/ui` keeps its components and the empty, loading, error and permission states every
screen will use. The Playwright smoke test checks the production build serves the page, sends Cache-Control with
`private` and `no-store` (Next does so for dynamic pages), and loads nothing from another origin.

## Alternatives considered

| Option | Why not |
| --- | --- |
| Keep the placeholders as accepted scaffolding | Screens and headers ahead of their milestones; placeholders that look finished hide what is missing |
| Keep the security headers only | They are milestone 11's, with its rate limits and error pages; no page carries PHI before milestone 1 |

## Consequences

- The milestone that adds the first PHI page adds the `private, no-store` response rule and its test with it
  (.claude/rules/privacy-and-tenant.md), if it is not yet part of milestone 11's header set.
- The deleted code is in the repository history (milestone 0 part A) should a later milestone want to start from it.

## Revisit when

Milestone 1 adds sign-in, or milestone 3 the first workspace screens.
