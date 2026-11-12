#!/bin/bash
# proto.sh <out root>: lays two trees in the gate's layout from the checkout's packages/redact/src (a97d73e4):
# <root>/base (unchanged) and <root>/proto (the MEASURING PROTOTYPE of Queues item 34's rule for a digits-only number
# glued to a letter, with its floor settable, and the reader's internals exported for scripts/measure.mts). Not a build.
set -euo pipefail
ROOT=$1; REPO=/home/user/PhysicalTherapy; SRC=$REPO/packages/redact/src
for t in base proto; do mkdir -p $ROOT/$t/packages/model-gateway/src; cp $SRC/redact.ts $SRC/confusables.ts $ROOT/$t/packages/model-gateway/src/; done
python3 -I - "$ROOT/proto/packages/model-gateway/src/redact.ts" "${M34_FLOOR:-0}" <<'PY'
import sys
p=sys.argv[1]; s=open(p,encoding='utf-8').read()
old="""    const holds = (read: string) => holdsAsFirstRead(read, patient, claims) || widerMatchesIn(masked(read, claims.length), subject).length > 0;
"""
new="""    const holds = (read: string) => holdsAsFirstRead(read, patient, claims) || widerMatchesIn(masked(read, claims.length), subject).length > 0 || digitsGluedToLetter(masked(read, claims.length, NAME_MARK), subject);
"""
assert s.count(old)==1; s=s.replace(old,new)
old2="""    // Past the budget the check has not read the whole letter: it answers as it does for an identifier left.
    return true;
  } finally {
    checkWorkSpent = before;
"""
new2="""    // Past the budget the check has not read the whole letter: it answers as it does for an identifier left.
    return true;
  } finally {
    __last.spent = checkWorkSpent ?? -1;
    checkWorkSpent = before;
"""
assert s.count(old2)==1; s=s.replace(old2,new2)
s+="""
// ---- MEASURING PROTOTYPE (Queues item 34), appended by designs/lane-b-redact-item-34/scripts/proto.sh ----
export const __last = { spent: 0 };
let gluedFloor = %s;
export const __setFloor = (floor: number) => { gluedFloor = floor; };
/** A member ID or claim number of digits alone, of gluedFloor digits or more, with a letter right before or after it. */
function digitsGluedToLetter(normal: string, subject: Subject): boolean {
  if (gluedFloor <= 0) return false;
  const outer = widerReading;
  widerReading = true;
  try {
    const read = () => {
      const cores = [...new Set(formsOf(subject).filter((form) => (form.kind === 'claim' || form.kind === 'member') && form.digitsOnly && [...form.compact].length >= gluedFloor).map(coreOf))];
      if (cores.length === 0) return false;
      work(WORK.formCharacter * cores.length * normal.length);
      const text = viewOf(normal, 'join').text;
      return cores.some((core) => new RegExp(`(?<=\\\\p{L})(?:${core})|(?:${core})(?=\\\\p{L})`, 'u').test(text));
    };
    return read() || (alikeReads(normal, subject) && onFold('alike', read));
  } finally {
    widerReading = outer;
  }
}
export const __t = { masked, viewOf, formsOf, coreOf, letterSubject, NAME_MARK, NUMBER_JOINERS };
""" % sys.argv[2]
open(p,'w',encoding='utf-8').write(s)
PY
echo "laid $ROOT/base and $ROOT/proto (floor ${M34_FLOOR:-0})"
