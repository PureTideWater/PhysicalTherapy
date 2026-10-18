---
name: golden-diff
description: Explain every difference between current engine output and the golden lines after an intentional change. Read-only; fixtures change by hand with the specialist.
disable-model-invocation: true
allowed-tools: Read Bash(pnpm test:golden *) Bash(git diff *)
---
Run pnpm test:golden --report (writes the diff to fixtures/golden/.report; never touches fixtures). For every
changed cent, state the rate record, release or code change that caused it. If any change has no explanation,
say so and stop. Updating a golden line is a human step with the specialist's worksheet attached.
