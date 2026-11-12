#!/bin/bash
# a4.sh <root>: after proto.sh <root>, lays <root>/a4 (the merged reader with GAP.apart as A-4's rule: any run that is
# no letter, no digit and none of the checks' marks joins inside a name's part) and runs item 26's cost-names.mts,
# base against it, over the repository's synthetic prose. Output: measure/a4-cost.out. A measuring copy, not a build.
set -euo pipefail
ROOT=$1; G=/home/user/ops/designs/lane-b-redact-ssn-phone/gate; export PATH=/opt/node24/bin:$PATH
mkdir -p $ROOT/a4/packages/model-gateway/src; cp $ROOT/base/packages/model-gateway/src/confusables.ts $ROOT/a4/packages/model-gateway/src/
python3 -I - "$ROOT" <<'PY'
import sys
r=sys.argv[1]; s=open(r+'/base/packages/model-gateway/src/redact.ts',encoding='utf-8').read()
old="""  apart: `[${NAME_JOINERS}\\\\s\\\\u0085.]*`,"""
assert s.count(old)==1
open(r+'/a4/packages/model-gateway/src/redact.ts','w',encoding='utf-8').write(s.replace(old,"""  apart: `[^\\\\p{L}\\\\p{N}\\\\u0001-\\\\u0003]*`,"""))
PY
node --import $G/ts-resolve.mjs /home/user/ops/designs/lane-b-redact-item-26/scripts/cost-names.mts $ROOT/base/packages/model-gateway/src/redact.ts $ROOT/a4/packages/model-gateway/src/redact.ts
