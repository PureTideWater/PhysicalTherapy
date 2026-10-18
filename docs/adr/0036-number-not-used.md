# 0036. Number not used

- **Status:** not used
- **Date:** 2026-10-22
- **Deciders:** founder (engineering)
- **PRD sections:** none

## Context

ADR numbers are taken in order. While milestones 6 and 7 were built side by side, two pieces of work each reserved a
number to avoid a collision, and 0036 was never written: 0035 is followed by 0037, 0038, 0039 and 0040. ADRs 0037 to
0040 are cited by number from code comments, migrations, tests and the README, so renumbering them would rewrite those
references for no gain.

## Decision

0036 stays unused, and this note says so. No decision has this number; the next ADR takes the next free number after the
highest one.

## Consequences

A reader who finds no 0036 has the reason here. Nothing cites 0036.

## Revisit when

Never.
