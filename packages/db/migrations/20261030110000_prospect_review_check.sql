-- A prospect request's payers are checked by prospect_payers_valid() (its CHECK constraint), which runs as the
-- role that writes the row: a platform administrator's review through the application role checks it again on
-- UPDATE, so the application role executes it (docs/adr/0053). It reads nothing and returns a boolean.
GRANT EXECUTE ON FUNCTION prospect_payers_valid(text[]) TO tp_app;
