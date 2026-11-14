#!/bin/bash
# lay42.sh <root> [name:rule ...]: Queues item 42's trees in the gate's layout, outside packages/ (nothing in the
# checkout is written): base (claude/build-platform 6299c550's reader, item 40 merged) and, for each name:rule, the
# same reader as redact-core.ts behind wrapper42.ts with that rule (rules42.ts's ruleOf), so the reader's own rules
# are untouched and each candidate only adds. Default trees: the candidates of the design note.
set -euo pipefail
ROOT=$1; shift; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO=/home/user/PhysicalTherapy; BASE=${BASE:-6299c550}
d=$ROOT/base/packages/model-gateway/src; mkdir -p $d
for f in redact.ts confusables.ts; do git -C $REPO show "$BASE:packages/redact/src/$f" > $d/$f; done
cp $HERE/rules42.ts $d/rules42.ts; cp $d/redact.ts $d/redact-core.ts
DEFAULT="r1:ins=1,insFloor=5,nameInsFloor=5,act=refuse r2:ins=2,insFloor=5,nameInsFloor=5,act=refuse p1:ins=1,insFloor=5,nameInsFloor=5,act=replace p2:ins=2,insFloor=5,nameInsFloor=5,act=replace gc:glue=case,glueFloor=4,act=replace gcr:glue=case,glueFloor=4,act=refuse ga:glue=any,glueFloor=4,act=refuse"
for t in ${*:-$DEFAULT}; do n=${t%%:*}; m=$ROOT/$n/packages/model-gateway/src; mkdir -p $m
  cp $d/confusables.ts $m/; cp $d/redact.ts $m/redact-core.ts; cp $HERE/rules42.ts $m/rules42.ts; cp $HERE/wrapper42.ts $m/redact.ts
  # The rule is part of redact.ts's bytes too, so the gate's hash of the tree names it.
  echo "// rule42: ${t#*:}" >> $m/redact.ts; echo "{\"rule\":\"${t#*:}\"}" > $m/rule42.json
done
sha256sum $ROOT/*/packages/model-gateway/src/redact.ts | sed "s#$ROOT/##"
