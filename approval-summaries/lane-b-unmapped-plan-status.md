# Lane B: one unmapped plan no longer freezes a whole month (audit #32; queue item 10): status

Open questions: none (the co-founder's standing ruling of 2026-10-26 ~00:20 UTC: take the recommended option, record why).

| Time (UTC) | Stage | Detail |
|---|---|---|
| 2026-10-26 02:50 | Design | Taken by the #10 session (superseded-rerun) on the orchestrator's message of 2026-10-26 ~00:24 UTC. It is designed while #10 (PR #50) is in review; the branch `co-001/unmapped-plan` is cut after #10 merges. Reserved: ADR 0075 if needed; test-matrix MAP-06 to MAP-10 and PRC-29 to PRC-31; synth cases the same. The milestone 3 exception was granted in the founder's adoption of the combined audit (2026-10-20 ~15:10 UTC). Design workflow running: an author, one adversarial reviewer, a revision. |

| 2026-10-26 03:52 | Paused | The design workflow wf_98ca48d8-64c was stopped by the session limit (~03:15 UTC); the agents' partial progress is in the scratchpad (`progress/up-design-*.md`). It resumes with resumeFromRunId once #50 merges (the orchestrator's priority of 2026-10-26 ~02:16 UTC). |

| 2026-10-26 09:29 | Design resumed | wf_98ca48d8-64c resumed while #50 is in its final verification. |

| 2026-10-26 10:01 | Design done | `designs/lane-b-unmapped-plan.md`, wf_98ca48d8-64c: an author, one adversarial review (`designs/lane-b-unmapped-plan/review.md`: 2 blocking, 9 should-fix and 7 nits, all dispositioned in the design's last section), a revision.
- **Pricing:** a run no longer refuses a period with an unmapped plan. Its lines stay `NO_MAPPING` one by one, from the contracts resolver (the engine is unchanged), and every other line prices. A period with no mapped plan still gets no run (D2).
- **Coverage:** each run records its unmapped plans in coverage `tp-pricing-coverage/2`.
- **Screens:** Coverage, Pricing runs, home and both reports say "N plans have no mapping; their lines are not priced", in counts and cents. "Price these months again" creates the re-runs through #50's `createRerun`, in the person's name, accepted by hand.
- **No migration for this PR.**
- **Handed on:** the audit's stored notice and email to billing managers needs a migration (a notification kind, figure codes and a recipients function) plus #42's mail files. That goes to Lane A as a migration request, followed by a Lane B PR after #42 merges, with MAP-10 kept for it.
- **IDs:** MAP-01 reworded; MAP-06 to MAP-09 and PRC-29 to PRC-31. One new synthetic 835 (MAP-06) on the existing release 900001 and module; no new number needed.
- **ADR:** 0075, with amendments to 0028, 0030, 0035, 0039 and 0060.
- **Milestone 3:** the exception goes into ADR 0075 and reconciliation-001. |

**For Lane A (the orchestrator to record):** the notice migration of design §3 (a notification kind, two figure codes and a billing-manager recipients function). MAP-10 is reserved for its Lane B follow-up after #42 merges.

**Next step:** cut `co-001/unmapped-plan` from claude/build-platform once #50 merges, then the builders. the design `designs/lane-b-unmapped-plan.md`, confirming no migration.
