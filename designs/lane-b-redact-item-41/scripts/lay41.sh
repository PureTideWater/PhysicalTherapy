#!/bin/bash
# lay41.sh <root>: Queues item 41's four trees in the gate's layout, outside packages/ (nothing in the checkout is
# written): base (4d40557f's reader, byte for byte 17c234d2's), head (item 40's, co-001/wip-redact-item-40), and
# base-m and head-m: the same reader as redact-core.ts behind a redact.ts that mends the letter's text first
# (mend.ts), as extraction would, so the reader's rules are untouched; and base-n, head-n, head-s, head-d (n, except between digits), and base-j, head-j, base-k, head-k (below): the reader reads
# every C1 character as a line break (n) or a space (s) while a person sees mendExtracted's text (VARIANTS).
set -euo pipefail
ROOT=$1; HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO=/home/user/PhysicalTherapy
HEAD_REF=${HEAD_REF:-origin/co-001/wip-redact-item-40}
for t in base:4d40557f head:$HEAD_REF; do n=${t%%:*}; ref=${t#*:}; d=$ROOT/$n/packages/model-gateway/src; mkdir -p $d
  for f in redact.ts confusables.ts; do git -C $REPO show "$ref:packages/redact/src/$f" > $d/$f; done
  for v in m:mendExtracted n:readerTextBreaks s:readerTextSpaces d:readerTextBreaksOutsideNumbers; do fn=${v#*:}; m=$ROOT/$n-${v%%:*}/packages/model-gateway/src; mkdir -p $m
  cp $d/confusables.ts $m/; cp $d/redact.ts $m/redact-core.ts; cp $HERE/mend.ts $m/mend.ts
  core=$(sha256sum $d/redact.ts | cut -c1-16)
  cat > $m/redact.ts <<TS
// The reader $core ($n, $(git -C $REPO rev-parse --short=8 $ref)) behind $fn (Queues item 41).
export * from './redact-core';
import * as core from './redact-core';
import { $fn as mendExtracted } from './mend';
type P = Parameters<typeof core.redactLetter>[1]; type C = Parameters<typeof core.redactLetter>[2];
export function redactLetter(text: string, p: P, c: C) { return core.redactLetter(mendExtracted(text), p, c); }
export function redactLetterForScreen(text: string, p: P, c: C) { return core.redactLetterForScreen(mendExtracted(text), p, c); }
export function redactionSpans(text: string, p: P, c: C) { return core.redactionSpans(mendExtracted(text), p, c); }
export function holdsIdentifier(text: string, p: P, c: C, spent = 0) { return core.holdsIdentifier(mendExtracted(text), p, c, spent); }
TS
  done
done
# Variants j and k (the check reads a second text, so the wrapper differs from the one above).
for n in base head; do d=$ROOT/$n/packages/model-gateway/src
  for v in j k; do m=$ROOT/$n-$v/packages/model-gateway/src; mkdir -p $m
  cp $d/confusables.ts $m/; cp $d/redact.ts $m/redact-core.ts; cp $HERE/mend.ts $m/mend.ts; core=$(sha256sum $d/redact.ts | cut -c1-16)
  if [ $v = j ]; then cat > $m/redact.ts <<TS
// The reader $core ($n) behind readerTextJoinChecked, the check also on the joined text (Queues item 41, variant j).
export * from './redact-core';
import * as core from './redact-core';
import { readerTextJoinChecked as fn, JOINED_J as joined } from './mend';
type P = Parameters<typeof core.redactLetter>[1]; type C = Parameters<typeof core.redactLetter>[2];
export function redactLetter(text: string, p: P, c: C) { return core.redactLetter(fn(text), p, c); }
export function redactLetterForScreen(text: string, p: P, c: C) { return core.redactLetterForScreen(fn(text), p, c); }
export function redactionSpans(text: string, p: P, c: C) { return core.redactionSpans(fn(text), p, c); }
export function holdsIdentifier(text: string, p: P, c: C, spent = 0) { return core.holdsIdentifier(text, p, c, spent) || core.holdsIdentifier(joined(text), p, c, spent); }
TS
  else cat > $m/redact.ts <<'TS'
// Variant k (Queues item 41): every C1 a line break, unless the joined reading finds more stored identifiers, then
// the letter as written (the reader refuses it as before).
export * from './redact-core';
import * as core from './redact-core';
import { readerTextBreaks, withoutC1, storedFoundOnlyJoined } from './mend';
type P = Parameters<typeof core.redactLetter>[1]; type C = Parameters<typeof core.redactLetter>[2];
const C1 = /[\u0080-\u009f]/;
const read = (text: string, p: P, c: C): string => {
  if (!C1.test(text)) return text;
  const b = readerTextBreaks(text);
  return storedFoundOnlyJoined(core.redactLetterForScreen(b, p, c).text, core.redactLetterForScreen(withoutC1(text), p, c).text) ? text : b;
};
export function redactLetter(text: string, p: P, c: C) { return core.redactLetter(read(text, p, c), p, c); }
export function redactLetterForScreen(text: string, p: P, c: C) { return core.redactLetterForScreen(read(text, p, c), p, c); }
export function redactionSpans(text: string, p: P, c: C) { return core.redactionSpans(read(text, p, c), p, c); }
export function holdsIdentifier(text: string, p: P, c: C, spent = 0) { return core.holdsIdentifier(read(text, p, c), p, c, spent); }
TS
  fi; done
done
git -C $REPO rev-parse $HEAD_REF > $ROOT/head.ref
sha256sum $ROOT/*/packages/model-gateway/src/redact*.ts $ROOT/*/packages/model-gateway/src/mend.ts | sed "s#$ROOT/##"
