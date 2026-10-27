#!/usr/bin/env bash
# Prints pictures into a CI job's log so that a person can rebuild each one from the log alone, where the run's
# artifacts cannot be fetched (docs/adr/0058). Reads one path per line on standard input and, for each that is a
# regular file, prints
#
#   <path> sha256 <hex>                       the picture's SHA-256, first
#   <path> <i>/<n> <up to 8,000 characters>   its base64 in n numbered chunks, i = 1..n
#
# so a log reader that cuts long lines still gets every chunk, and the SHA-256 proves the decode: join the chunks of
# 1/n to n/n in order (any gap means the log was read short), base64-decode them, and require sha256sum to equal the
# printed hex (docs/runbooks/ci.md, "Upgrading the browser"). A path that is not a regular file (a deleted baseline) is
# skipped. ci.yml's e2e job prints with it a failed comparison's pictures and every brand baseline its runner draws
# otherwise. Needs GNU base64's -w, as GitHub's Ubuntu runners have. The path is printed as given (awk reads it from
# the environment, which leaves backslashes alone), and the SHA-256 and the base64 are read from the file's bytes on
# standard input, so no name is escaped.
set -euo pipefail

CHUNK=8000

while IFS= read -r file; do
  [ -f "$file" ] || continue
  chunks="$(base64 -w "$CHUNK" < "$file" | wc -l | tr -d ' ')"
  echo "$file sha256 $(sha256sum < "$file" | cut -d ' ' -f 1)"
  base64 -w "$CHUNK" < "$file" | PICTURE="$file" CHUNKS="$chunks" awk '{ print ENVIRON["PICTURE"] " " NR "/" ENVIRON["CHUNKS"] " " $0 }'
done
