#!/bin/bash
S=/tmp/claude-0/-home-user-PhysicalTherapy/f344a4ea-3385-5c28-91fb-5af3309c1929/scratchpad; O=$S/out2; mkdir -p $O; REPO=/home/user/PhysicalTherapy; H=17028cfa
export PATH=/opt/node24/bin:$PATH; OPS=/home/user/ops/designs; T=$S/trees-$H
cd $REPO
[ -d /home/user/tree-ef3 ] || git worktree add --detach /home/user/tree-ef3 ef3e8d20 > $O/worktrees.out 2>&1
[ -d /home/user/tree-cc3 ] || git worktree add --detach /home/user/tree-cc3 cc3dd7f6 >> $O/worktrees.out 2>&1
[ -d /home/user/gate ] || cp -r $OPS/lane-b-redact-ssn-phone/gate /home/user/gate
for side in hr:head; do d=${side%%:*}; t=${side##*:}
  bash $OPS/lane-b-redact-item-26/tools/lay.sh /home/user/bt/$d $T/$t/packages/model-gateway/src > $O/lay-$d.out 2>&1; echo "lay exit $?" >> $O/lay-$d.out
  (cd /home/user/bt/$d/work && O=/home/user/bt/$d/work/pr PREV=/home/user/bt/rr/work/pr bash battery.sh > $O/battery-$d-r.stdout 2>&1) &
  (cd /home/user/bt/$d/work && O=/home/user/bt/$d/work/pf PREV=/home/user/bt/rr/work/pf bash battery-fresh.sh > $O/battery-$d-f.stdout 2>&1) &
  wait
  cp /home/user/bt/$d/work/pr/fuzz-all.out $O/battery-${d}-recorded.out; cp /home/user/bt/$d/work/pf/fuzz-all.out $O/battery-${d}-fresh.out
done
echo BATTERY DONE $(date) > $O/battery.done
pnpm exec vitest run --project unit packages/redact packages/packets packages/synth packages/model-gateway > $O/unit4.out 2>&1; echo "exit $?" >> $O/unit4.out
su postgres -c "/opt/pg18/bin/pg_ctl -D /root/pgdata18 -o '-p 5433 -k /tmp' -l /tmp/pg18.log -w start" > $O/pg.out 2>&1
export DATABASE_URL=postgres://postgres:test@localhost:5433/postgres
pnpm db:migrate > $O/migrate.out 2>&1; echo "exit $?" >> $O/migrate.out
pnpm test:db > $O/test-db.out 2>&1; echo "exit $?" >> $O/test-db.out
for c in typecheck lint lint:logs verify-content; do pnpm $c > $O/${c/:/-}.out 2>&1; echo "exit $?" >> $O/${c/:/-}.out; done
echo ALL DONE $(date) > $O/phase2.done
