# Bring the test-matrix row MOD-21 and its word-for-word copy in the case registry to the rules as built (run in the worktree).
import re, sys, json
TITLE_OLD = "an amount's cents before a bare nine or ten), behind its label"
TITLE_NEW = "an amount's cents before a bare nine or ten, or a date after one), behind its label"
MASK_OLD = "masked and glued to a word, a year, a date or an amount's cents, after a Social Security label glued to a word"
MASK_NEW = "masked and glued to a word, a year, a date, an amount's cents, a currency amount or three digits or more, after a Social Security label glued to a word"
A1_OLD = "an invisible character among the joiners); a twin in its own shape"
A1_NEW = "an invisible character among the joiners); the scan reads a text as ef3e8d20 read it too wherever its own reading may hold less in a chain, so a letter ef3e8d20 refuses for a chain stays refused (a number's own first digits written as a list number); a twin in its own shape"
A2_OLD = "under a phone word or Medicare too where the noun stands nearer the number, or that no structure marks"
A2_NEW = "under a phone word or Medicare too where the noun stands nearer the number, with one line break at most inside their label and one at most after it, or that no structure marks"
A3_OLD = "a row of long numbers and dates, the cells of a row joined by a bar, a masked account number"
A3_NEW = "a reference before a date written with its month's word, a row of long numbers and dates, the cells of a row joined by a bar, a file's name, a label's list number before a row of amounts, a masked account number"
for path, esc in (('docs/product/test-matrix.md', False), ('packages/synth/src/cases/matrix.ts', True)):
    s = open(path, encoding='utf-8').read()
    for old, new in ((TITLE_OLD, TITLE_NEW), (MASK_OLD, MASK_NEW), (A1_OLD, A1_NEW), (A2_OLD, A2_NEW), (A3_OLD, A3_NEW)):
        assert s.count(old) == 1, (path, old[:50], s.count(old))
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8').write(s)
print('rows updated')
