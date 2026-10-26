# Database functions, one generated file per name

Every function in schema `public`, as a freshly migrated database holds it, one file per function name:
`<name>.sql`, every overload of the name in that one file, sorted by signature (docs/adr/0068). The files exist so a
pull request shows exactly which lines of which function it changes, and so
`git log -p packages/db/functions/<name>.sql` is that function's whole history.

## Generated, never edited

`pnpm db:domain-model --out` writes them, in the same READ ONLY transaction it writes `docs/product/domain-model.md`
from, on a database nothing else is migrating (`packages/db/src/domain-model`; README.md, "The domain model gate").
Never edit one by hand: change the function in a new migration (`/new-migration`), migrate a fresh database and
regenerate.

`--out` checks this directory before it writes anything, the document included, and writes nothing if it refuses
(exit 2): a symlinked directory, an entry git would commit that is neither a generated file nor this README, a file
name outside `^[a-z_][a-z0-9_]*\.sql$`, or a `*.sql` file whose first line is not the generator's banner. Then it
writes each changed file and removes each stale `*.sql` no function produces, only when that file opens with the
banner, so it can never delete SQL it did not write. It leaves this README alone.

`pnpm db:domain-model --check` compares this directory as well as the document, and exits 1 listing every missing,
extra or differing file with its first differing line. Any other entry git would commit here (a stray file, a
directory, a symlink, a refused name) fails it too, and so does a function file with an executable bit (every file is
mode 100644). A generated file git ignores is reported as "ignored by git", since it would never be committed; a
directory that does not exist is reported once. The database suite's drift file (`function-files.db.test.ts`) and
CI's `domain model` job both run that comparison, so a migration merged without its regenerated files fails them,
and so does a hand edit.

The exit codes: 0 when the document and the files match, 1 when either differs, 2 when the tool refuses or cannot run,
including any git or file-system failure, which it reports with git's own message. `--functions DIR` points at another
directory (resolved against the directory you ran the command from); a custom `--out FILE` or `--check FILE` needs it
(exit 2 without: "give --functions DIR with a custom FILE"), so a preview of the document written elsewhere never
rewrites or prunes these files.

`.gitattributes` gives these files `linguist-generated=false text eol=lf`: GitHub shows their diffs open, and a
checkout with `core.autocrlf=true` still holds them LF, so `--check` compares the same bytes on every machine.

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
- `-- Called by policy: <table>.<policy>`: one line per row-level security policy whose `USING` or `WITH CHECK`
  expression calls the function directly, or `(none)`; a policy that reaches it only through another function is
  listed in that function's file. A change of volatility, strictness or body in a function with such a line reaches
  those policies; a line added here is a new policy calling it, not a change to the function.
- `-- Event trigger: <name> ON <event>`: one line per event trigger that calls the function, only when there is one
  (none is, today).
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

The lines that most need a reviewer's eye (`.claude/agents/security-reviewer.md`):

- SECURITY DEFINER without `SET search_path` naming `pg_catalog` first and `pg_temp` explicitly last;
- a new `set_config` or `SET` of `app.practice_ids` or `app.actor_id`, or one with `is_local` false;
- `EXECUTE` of built SQL in a definer without `format()`'s `%I`/`%L` or `quote_*`;
- `LEAKPROOF` added; `STRICT` removed;
- a volatility change on a function a policy calls (a `-- Called by policy:` line);
- a grant to PUBLIC or to a new role; an owner change;
- a new overload of a scope function (`allowed_practice_ids`, `effective_practice_access`, `practice_in_scope`,
  `open_practice_scope`, the `app_actor_*` functions);
- a read of `app.practice_ids` or `app.actor_id` removed or changed, or a scope check removed.

A pull request that recreates a function without changing it changes no file here. A new PostgreSQL major version may
change how `pg_get_functiondef()` lays a definition out, and so every file, without any function changing; that
regeneration is a pull request of its own.

## In the summary that opens each approval

`pnpm db:domain-model --summary-since <base>` ends with "Function definitions changed since <base>", comparing the
files at `git merge-base <base> HEAD` (it names that commit) with this directory, or with the files `--out` or
`--check` generated. It has three parts:

1. One line saying these are the committed (or generated) files and that `--check` proves they equal the migrated
   catalog.
2. A compact list of every changed file with `+N/-M` and its flags, the files flagged "SECURITY DEFINER, tenant scope,
   privileges or PUBLIC" first: a definer or a scope-setting header, a read or set of the tenant scope, a grant to
   PUBLIC on either side, or a diff that touches a GRANT, REVOKE, OWNER, LEAKPROOF, STRICT, SECURITY or SET line.
3. "Diffs": each file's unified diff, in the list's order, until a budget of 900,000 bytes (UTF-8) for the whole section,
   then one line naming the files whose diffs were left out (see "Files changed").

`--function-diffs list` prints the same output without the Diffs part (a byte prefix of the full form): that is the
form for the pull request's description, which GitHub caps at 65,536 characters. CI's `domain model` job writes the
full form to its job summary; the founder checks that the description's list matches the CI copy's list and reads the
diffs there and in "Files changed". When the base holds no generated `*.sql` file, the section is one line saying so.
The diffs come from git with the system and global configuration switched off and fixed diff options, so they read
the same on every machine.

## Not the approval of record

These files are not part of the domain model's text, and their diffs approve nothing. The founder approves the
document by its SHA-256, and the approval of record is the founder's APPROVED GitHub review of the pull request's
latest commit (docs/adr/0063). The files are bound to what the founder signed by the drift check, which holds them to
the same freshly migrated database as the document, and by Appendix D's SHA-256 of every migration, inside the signed
text; the body-hash line is a cross-reference, not that binding.

## What is not here

- Functions in any schema other than `public`: the generator refuses one (exit 2), naming it, so none can exist
  unseen. None exists today.
- Functions that belong to an extension (`pg_depend.deptype = 'e'`): their definitions follow the extension's version,
  not a migration. None exists today.
- Aggregates: the generator refuses one (exit 2), naming it, until it supports them; `pg_get_functiondef()` does not
  print an aggregate. None exists today.
- Event triggers themselves: an event trigger has no file of its own; its function's file lists it on an
  `-- Event trigger:` line. None exists today.
