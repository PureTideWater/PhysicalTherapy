# Database functions, one generated file per name

Every function in schema `public`, as a freshly migrated database holds it, one file per function name:
`<name>.sql`, every overload of the name in that one file, sorted by signature (docs/adr/0068). The files exist so a
pull request shows exactly which lines of which function it changes, and so
`git log -p packages/db/functions/<name>.sql` is that function's whole history.

## Generated, never edited

`pnpm db:domain-model --out` writes them, in the same read-only snapshot it writes `docs/product/domain-model.md` from
(`packages/db/src/domain-model`; README.md, "The domain model gate"). Never edit one by hand: change the function in a
new migration (`/new-migration`), migrate a fresh database and regenerate. `--out` writes each changed file and removes
each `*.sql` no function produces; it owns only the `*.sql` files here and leaves this README alone.

`pnpm db:domain-model --check` compares this directory as well as the document, and exits 1 listing every missing,
extra or differing file with its first differing line; any other entry git would commit here (a stray file, a
directory, a symlink) fails it too. The database suite's drift file (`function-files.db.test.ts`) and CI's
`domain model` job both run that comparison, so a migration merged without its regenerated files fails them, and so
does a hand edit.

## Reading a diff

Each overload reads, in order:

- `-- <name>(<argument types>)`: the signature exactly as Appendix C of the domain model prints it.
- `-- Body SHA-256 (the text between the dollar quotes only), as Appendix C prints it: <16 hex digits>`: the hash of
  the body alone, so the file can be matched to its Appendix C row. A function with a SQL-standard body, which has no
  dollar quotes (`screening_standing`, whose body is a `RETURN` expression), says
  `(the SQL-standard body only, from RETURN or BEGIN ATOMIC)` instead. A changed body changes this line with it; a
  change to the header or the privileges does not.
- `-- Trigger function of: <table>.<trigger>`: one line per trigger that calls the function, or `(none)`. A line added
  here is a new trigger on another table, not a change to the function; a line removed is a trigger dropped.
- The definition, as PostgreSQL's `pg_get_functiondef()` prints it: the arguments and their defaults, the return
  type, the language, volatility, `SECURITY DEFINER`, `LEAKPROOF`, `STRICT`, parallel safety, cost, rows and every
  `SET`, then the body verbatim. Its whitespace is PostgreSQL's (`.editorconfig` leaves it alone).
- The owner and the privileges, every line explicit: `ALTER FUNCTION ... OWNER TO`, then `REVOKE ALL ... FROM PUBLIC`
  when PUBLIC cannot execute it, or `GRANT EXECUTE ... TO PUBLIC` when it can, then one `GRANT EXECUTE ... TO <role>`
  per role in C order (`WITH GRANT OPTION` where the role may pass it on, `GRANTED BY <role>` where someone other than
  the owner granted it), and `REVOKE EXECUTE ... FROM <owner>` when the owner revoked its own. Opening a function to
  PUBLIC therefore turns the `REVOKE ALL ... FROM PUBLIC` line into a `GRANT ... TO PUBLIC` line, and a new grantee is
  one added line. A procedure's lines say `PROCEDURE` where a function's say `FUNCTION`.
- `COMMENT ON FUNCTION`, when the function has a comment.

The lines that most need a reviewer's eye are a SECURITY DEFINER function without `SET search_path` (or with
`pg_temp` anywhere but last), `LEAKPROOF` added, `STRICT` removed, a volatility change on a function a policy calls,
a grant to PUBLIC or to a new role, an owner change, a new overload of a scope function, and a changed or removed
read of `app.practice_ids` (`.claude/agents/security-reviewer.md`).

A pull request that recreates a function without changing it changes no file here. A new PostgreSQL major version may
change how `pg_get_functiondef()` lays a definition out, and so every file, without any function changing; that
regeneration is a pull request of its own.

## Not the approval of record

These files are not part of the domain model's text, and their diffs approve nothing. The founder approves the
document by its SHA-256, and the approval of record is the founder's APPROVED GitHub review of the pull request's
latest commit (docs/adr/0063). The files are bound to what the founder signed by the drift check, which holds them to
the same freshly migrated database as the document, and by Appendix D's SHA-256 of every migration, inside the signed
text; the body-hash line is a cross-reference, not that binding. `pnpm db:domain-model --summary-since <base>` prints
each changed file's diff under "Function definitions changed since <base>", SECURITY DEFINER and scope-setting
functions first, in the summary that opens every domain-model pull request.

## What is not here

- Functions that belong to an extension (`pg_depend.deptype = 'e'`): their definitions follow the extension's version,
  not a migration. None exists today.
- Aggregates: the generator refuses one (exit 2), naming it, until it supports them; `pg_get_functiondef()` does not
  print an aggregate. None exists today.
