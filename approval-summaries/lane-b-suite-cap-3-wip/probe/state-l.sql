-- SUITE-CAP-3's "for Lane A" candidate, measured on top of state (c): the ledger triggers' per-line sums
-- (ledger_line_net, called three times by ledger_entry_within_line) filter on service_line_id alone, which no index
-- leads with (ledger_entry_by_line leads with practice_id).
CREATE INDEX ledger_entry_by_service_line ON ledger_entry (service_line_id, stage);
