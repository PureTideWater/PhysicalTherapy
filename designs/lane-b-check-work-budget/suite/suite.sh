#!/bin/bash
# The full local suite, once, on Node 24, on the PR's final tree. Output to files; exit codes to suite.done.
cd /home/user/PhysicalTherapy; export PATH=/opt/node24/bin:/opt/pnpm-bin:$PATH; O=/home/user/gate-out/suite2; mkdir -p $O; : > $O/suite.done
export DATABASE_URL=postgres://postgres:test@localhost:5433/postgres; git checkout -q co-001/check-work-budget; echo "branch $(git rev-parse --abbrev-ref HEAD)" >> $O/suite.done
git rev-parse HEAD >> $O/suite.done; node --version >> $O/suite.done
pnpm install --frozen-lockfile --prefer-offline > $O/install.out 2>&1; echo "install $?" >> $O/suite.done
for step in typecheck lint lint:copy lint:logs check:fixtures verify-content test test:db test:golden test:e2e; do
  pnpm run $step > $O/$(echo $step | tr : -).out 2>&1; echo "$step $?" >> $O/suite.done
done
echo SUITE-DONE >> $O/suite.done
