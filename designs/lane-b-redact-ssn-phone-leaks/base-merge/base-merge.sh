#!/bin/bash
# The one base merge of co-001/redact-ssn-phone-leaks onto claude/build-platform after the fold (#141) moved redact.ts to
# packages/redact: run inside the worktree, on the branch, with origin/claude/build-platform fetched. It stops before the commit.
set -euo pipefail
export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH
git merge --no-commit --no-ff origin/claude/build-platform || true
test "$(git diff --name-only --diff-filter=U | sort | tr '\n' ' ')" = "docs/product/test-matrix.md packages/synth/src/cases/matrix.ts packages/synth/src/cases/registry.ts " || { echo "unexpected conflicts:"; git diff --name-only --diff-filter=U; exit 1; }
python3 /home/user/work/p11/resolve.py
git mv packages/model-gateway/src/confusables.ts packages/redact/src/confusables.ts
git mv packages/model-gateway/src/confusables.test.ts packages/redact/src/confusables.test.ts
sed -i "s#} from './redact';#} from '@tp/redact';#" packages/model-gateway/src/redact.leaks.test.ts
sed -i "s#'packages/model-gateway/src/confusables.test.ts'#'packages/redact/src/confusables.test.ts'#" packages/synth/src/cases/registry.ts
python3 - <<'PY'
p='packages/redact/package.json'
s=open(p,encoding='utf-8').read()
old="Pure: no import, no clock, no network."
assert old in s
open(p,'w',encoding='utf-8').write(s.replace(old,"Pure: no import but the look-alike table beside it, no clock, no network."))
p='packages/redact/src/index.ts'
s=open(p,encoding='utf-8').read()
old="One module with no import, so both the gateway and the verifier read with the same code."
assert old in s
open(p,'w',encoding='utf-8').write(s.replace(old,"One module that imports only the look-alike table beside it, so both the gateway and the verifier read with the same code."))
PY
pnpm install --offline --frozen-lockfile 2>&1 | tail -2
pnpm -s synth --case MOD-21 | tail -1
pnpm -s synth --case MOD-22 | tail -1
git add -A
git status --short | grep -v "^[MADR]  " || echo "all staged, no conflict left"
