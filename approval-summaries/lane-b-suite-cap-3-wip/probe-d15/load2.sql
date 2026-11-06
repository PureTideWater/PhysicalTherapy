-- The pass's trap: tables analyzed while empty, then :n claim matches (the pass's own) and :n new posting rows.
INSERT INTO ledger_match (practice_id, kind, remittance_id, service_line_id)
SELECT '00000000-0000-4000-8000-0000000000a1', 'claim', gen_random_uuid(), gen_random_uuid() FROM generate_series(1, :n) i;
INSERT INTO posting_row (practice_id, check_or_trace, posted_on, row_no, amount_cents)
SELECT '00000000-0000-4000-8000-0000000000a1', 'N' || (i % 100), date '2026-11-01', i, 3000 FROM generate_series(1, :n) i;
