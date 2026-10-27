# PR 42 fix-round integration (progress)
- Start: /home/user/pr6b4 clean at 098636e3… (base merge, pushed), branch co-001/pr-06b-mail-streams
- Builders: db (fix-db, 15 commits to 8128a036), infra (fix-infra, 8 commits to f972a8f0), harness (fix-harness, 9 commits to f077c048)
## Steps
- [x] 1. cherry-pick db: 15 commits, clean (to d8abd613)
- [x] 1. cherry-pick infra: 8 commits, clean (to a3aed2d9)
- [x] 1. cherry-pick harness: 9 commits (to d14f0ac5); one conflict routes.ts (99ae18a8): kept db precheck block then harness checksStarted timing; comment merged. pnpm install --frozen-lockfile linked client-sts (lockfile unchanged)
- [ ] 1. review combined diff
- [x] 2. CI on 098636e3 (run 40434505373 etc.): red = unit (web-entries.test.ts:77, 13 worker modules via route-tests/world.ts -> test-support/*-world.ts -> @tp/worker/runtime) and domain model (expected: approval names no person; SHA 07c4a8ee...). Green: lint, static, build, images, db 1-4, e2e 1/2 2/2, capacity, screening-capacity gate, mutation (6 stryker shards), approval-of-record. all green = failure (from unit + domain model)
- [~] 2. web-entries guard fix: walk now seeds from Next entries (apps/web/src/app/** + modules at apps/web/src root = proxy.ts), 2 fixture cases added; 3/3 pass. Mutation check (billing/public.ts + @tp/db import) running (bgl0gct8b) -- billing/public.ts restored after from scratchpad/billing-public.bak
- [ ] 3. regenerate domain model
- [ ] 4. full suite
- [ ] 5. push
- [ ] 6. PR body
