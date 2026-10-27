# PR 42 fix-round integration (progress)
- Start: /home/user/pr6b4 clean at 098636e3… (base merge, pushed), branch co-001/pr-06b-mail-streams
- Builders: db (fix-db, 15 commits to 8128a036), infra (fix-infra, 8 commits to f972a8f0), harness (fix-harness, 9 commits to f077c048)
## Steps
- [x] 1. cherry-pick db: 15 commits, clean (to d8abd613)
- [x] 1. cherry-pick infra: 8 commits, clean (to a3aed2d9)
- [x] 1. cherry-pick harness: 9 commits (to d14f0ac5); one conflict routes.ts (99ae18a8): kept db precheck block then harness checksStarted timing; comment merged. pnpm install --frozen-lockfile linked client-sts (lockfile unchanged)
- [ ] 1. review combined diff
- [ ] 2. CI on 098636e3
- [ ] 2. web-entries guard fix
- [ ] 3. regenerate domain model
- [ ] 4. full suite
- [ ] 5. push
- [ ] 6. PR body
