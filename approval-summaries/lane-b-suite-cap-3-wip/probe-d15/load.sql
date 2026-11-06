-- :hist historical posting rows of practice P, each matched once (plus one claim match per row), then 2,000 new rows unmatched.
INSERT INTO posting_row (practice_id, check_or_trace, posted_on, row_no, amount_cents)
SELECT '00000000-0000-4000-8000-0000000000a1', 'T' || (i % 5000), date '2024-01-01' + (i % 900), i, 3000 FROM generate_series(1, :hist) i;
INSERT INTO ledger_match (practice_id, kind, posting_row_id, remittance_id, service_line_id, evidence_id)
SELECT practice_id, 'posting', id, gen_random_uuid(), gen_random_uuid(), id FROM posting_row;
INSERT INTO ledger_match (practice_id, kind, remittance_id, service_line_id)
SELECT '00000000-0000-4000-8000-0000000000a1', 'claim', gen_random_uuid(), gen_random_uuid() FROM generate_series(1, :hist) i;
INSERT INTO posting_row (practice_id, check_or_trace, posted_on, row_no, amount_cents)
SELECT '00000000-0000-4000-8000-0000000000a1', 'N' || (i % 100), date '2026-11-01', i, 3000 FROM generate_series(1, 2000) i;
