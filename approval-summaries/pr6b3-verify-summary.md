**PR 6b-3 (#39) at 19aa09c — verification result: one small documentation fix needed. All code and CI checks pass.**

**What passed:**
- **Clean start:** a fresh copy of the repository installs with the exact locked dependencies.
- **Scope:**
  - Only 6b-3's work is in the PR, with exactly one new migration.
  - The pricing engine, golden claims, content releases, the freeze exception and the approval files are untouched.
  - No temporary edit-permission marker exists anywhere in the PR's history.
- **Freeze check:** passes with no engine change and no rule-table DDL.
- **Domain model:**
  - Rebuilt from an empty PostgreSQL 18 database, it regenerates the committed text exactly, and its cross-checks show no differences.
  - The text to approve has SHA-256 `6d7a143dd4e5a7145943324afd21a583f9036925978e90d8b9cecf6b4e97f712`; the approval line is line 6859.
- **Security probes on a live database:**
  - The new tally table is readable by no application or worker login.
  - It refuses edits and early deletion.
  - The daily expiry job clears old entries.
  - No role can reach anything it could not reach before the review round.
- **Upload timestamp:** a browser cannot fake when its upload arrived, and the timestamp cannot move an upload up the queue or around the daily share.
- **Wake-up messages:** the database's wake-up signal carries only the queue's name, and a failing worker cannot spin.
- **Launch gate:** production's screening opens only for a passing capacity report on exactly the deployed images and sizes. Anything else, or a value typed by hand, stops the deploy.
- **CI on 19aa09c:**
  - Every check is green except the domain-model approval test, which waits for you and names the same SHA-256.
  - The capacity test passed with time enforced on one 2 vCPU / 4 GiB consumer running three at once. The worst upload took 38.3 s, under the 44-s line, so the sizing question is closed with your half-vCPU web.

**To fix before you approve:** the PRD's section 15 still gives the old monthly totals ($1,371–$2,021 and $2,371–$3,571). Section 19, which is correct, gives $1,398–$2,048 and $2,398–$3,598 after your web-size ruling. This is a one-line docs edit. Because it touches no schema, the hash you approve and line 6859 stay the same.

**Two minor notes:**
- Two lines still describe the earlier "sent" page wording. The current wording is recorded correctly elsewhere.
- Before launch, check how the deploy machine's Docker stores images. On some setups the launch check would refuse a correct report. It would never open the screening by mistake.
