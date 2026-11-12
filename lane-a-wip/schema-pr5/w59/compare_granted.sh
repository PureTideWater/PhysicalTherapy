#!/bin/bash
# W59: the two generated function files against the granted appendices, byte for byte from CREATE OR REPLACE to the
# closing $function$; (the note's section 7). Prints only whether they are equal and any differing line.
A=/home/user/ops/approval-summaries; F=/home/user/PhysicalTherapy/packages/db/functions
blk() { sed -n '/^CREATE OR REPLACE FUNCTION/,/^\$function\$;/p' "$1"; }
sed -n '181,195p' $A/lane-a-ledger-freeze-ask-pr5-2026-11-07.md > /tmp/w59_A.sql
sed -n '187,263p' $A/lane-a-ledger-freeze-ask-pr5-d2-2026-11-12.md > /tmp/w59_D2.sql
blk $F/roi_links_valid.sql > /tmp/w59_genA.sql; blk $F/roi_statement_rules.sql > /tmp/w59_genD2.sql
echo "roi_links_valid: appendix A $(wc -l < /tmp/w59_A.sql) lines, generated $(wc -l < /tmp/w59_genA.sql)"; cmp /tmp/w59_A.sql /tmp/w59_genA.sql && echo "  EQUAL, byte for byte"
echo "roi_statement_rules: appendix D2 $(wc -l < /tmp/w59_D2.sql) lines, generated $(wc -l < /tmp/w59_genD2.sql)"; cmp /tmp/w59_D2.sql /tmp/w59_genD2.sql && echo "  EQUAL, byte for byte"
echo "  diff (appendix D2 < > generated):"; diff /tmp/w59_D2.sql /tmp/w59_genD2.sql | sed 's/^/    /'
echo "generated files' own hash lines:"; grep -h 'Body SHA-256' $F/roi_links_valid.sql $F/roi_statement_rules.sql
