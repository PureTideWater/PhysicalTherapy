# Skeptic 1 of 3, correctness-capacity S2 (in progress)
- Clone /home/user/sk-pcp-correctness-capacity-S2-0 at c369bc77..., installed.
- Read the reviewer's logs: parent heap limit in every run was 752 MiB (host-sized), not 560.
- ADR 0033 Consequences already defers the sum to milestone 11 ("intake concurrency times the reader's process bound must fit the worker task").
- Base thread reader under same 800-fill load: 1,001 MiB, so the risk predates the branch.
- Hypothesis: RSS sum double counts the node binary's file pages (RssFile ~45 MiB) the cgroup charges once. Measuring RssAnon next.
