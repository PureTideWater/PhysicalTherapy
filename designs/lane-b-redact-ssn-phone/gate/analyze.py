#!/usr/bin/env python3
"""Signatures of a gate run's hits, to map classes to the round-3 findings and ADR 0054 records.
Usage: python3 -I analyze.py <outdir> [<outdir2> ...]  (prints counts per signature, with one short example each)."""
import glob, json, os, re, sys
from collections import Counter, defaultdict

LABEL = re.compile(r'(social\s*security|soc\.?\s?sec|s\.s\.n|ssn|telephone|phone|tel\b|tel\.|fax|call|tty|contact|cell|mobile|medicare|hicn)', re.I)
OWN_PH = r'\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|CLAIM_\d+)\]'
RANGE_END = re.compile('(\\d[\\d/.,]*\\s?[-\u2010-\u2015\u2043\u02d7\u2212\u2796\ufe63\uff0d]{1,2}\\s?\\$?\\d[\\d.,]*\\s?\\d)')


def ssn_phone_sig(h):
    t, a, b = h['t'], h['a'], h['b']
    if not LABEL.search(t):
        return 'unlabeled' + (' (next to a range)' if RANGE_END.search(t) else '')
    bb = b if b not in ('REFUSED', 'THREW') else ''
    # The label's own letters taken by a name read (PHI3-3): the label is in the letter but no longer whole in what B sends.
    if not LABEL.search(re.sub(OWN_PH, ' ', bb)):
        return 'labeled: label word cut by a name read (PHI3-3)'
    m = re.search(LABEL.pattern + r'[^\n\d]{0,40}?' + OWN_PH, bb, re.I)
    if m:
        how = 'A refused' if a == 'REFUSED' else 'A redacted'
        seg = m.group(0)
        glued = re.search(r'[A-Za-z]\[(?:PATIENT_NAME|DATE_OF_BIRTH|MEMBER_ID|CLAIM_\d+)\]|\]\[|\][A-Za-z0-9]', bb[m.start():m.end() + 1])
        kind = 'glued or camel-case (PHI3-1/PHI3-2)' if glued else 'set apart by white space or punctuation (ADR record "sent at cc3dd7f6 as well"; PHI3-5 iii)'
        return f'labeled: own identifier read between label and number, {kind}, {how}'
    if re.search(r'\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|\d\.\d\d', t):
        return 'labeled: a date, amount or range between label and number (recorded GATEWAY1-2 / PHI1-2 / PHI2-4 classes?)'
    return 'labeled: other'


def name_sig(h):
    note = h.get('note', '')
    ctx = note.split('glued ')[-1] if 'glued' in note else '?'
    left, right = (ctx.split('|') + ['?'])[:2]
    if right == 'l' or left == 'l':
        return f'glued to a lower-case letter ({ctx}): the recorded class of a name glued to a word nothing sets apart?'
    if left == 'd' or right == 'd':
        return f'glued to a digit ({ctx})'
    if '­' in h['t'] or '​' in h['t']:
        return f'invisible character inside ({ctx}) (PHI3-4 b)'
    return f'other ({ctx})'


def dob_sig(h):
    note = h.get('note', '')
    ctx = note.split('glued ')[-1] if 'glued' in note else '?'
    if 'd' in ctx.split('|'):
        return f'DOB glued digit-to-digit ({ctx}) (PHI3-4 a)'
    return f'other ({ctx})'


def code_sig(h):
    t, b = h['t'], h['b']
    if b in ('REFUSED', 'THREW'):
        return 'refused'
    if re.search(r'\bMA\d{2,3}\b', t, re.I) and re.search(r'\[PATIENT_NAME\]\d', b):
        return 'MA01-MA130 remark code taken (GATEWAY3-2)'
    if re.search(r'\d{5}\s?-?(XU|GP|GO|GN|KX|XS|XE|XP|CQ)\b', t) and re.search(r'\d\[PATIENT_NAME\]|\s\[PATIENT_NAME\]', b):
        return 'modifier taken (GATEWAY3-2)'
    if re.search(r'\d\s?\[PATIENT_NAME\]', b) and re.search(r'\d\s?(min|MIN|hrs?|u)\b', t):
        return 'unit taken (GATEWAY3-2)'
    if re.search(r'\[PATIENT_NAME\]\d', b):
        return "a code's letter taken as an initial or short part (GATEWAY3-1/3-2)"
    return 'other'


SIGS = {'PHI.ssn': ssn_phone_sig, 'PHI.phone': ssn_phone_sig, 'PHI.name': name_sig, 'PHI.initial': name_sig, 'PHI.dob': dob_sig,
        'KEEP.changed.code': code_sig, 'KEEP.changed.unit': code_sig}


def main():
    for out in sys.argv[1:]:
        print(f'== {out}')
        files = sorted(glob.glob(os.path.join(out, 'hits', '*.jsonl')))
        by = defaultdict(list)
        for f in files:
            cls = re.sub(r'\.w\d+\.jsonl$', '', os.path.basename(f))
            if cls in SIGS:
                with open(f) as fh:
                    for line in fh:
                        by[cls].append(json.loads(line))
        for cls, hits in sorted(by.items()):
            c = Counter()
            ex = {}
            for h in hits:
                s = SIGS[cls](h)
                c[s] += 1
                if s not in ex or len(h['t']) < len(ex[s]['t']):
                    ex[s] = h
            print(f'{cls}: {len(hits)}')
            for s, n in c.most_common():
                e = ex[s]
                print(f'  {n:7d}  {s}  e.g. {json.dumps(e["t"])} [{"; ".join(e["names"])}] A: {e["a"] if e["a"] == "REFUSED" else json.dumps(e["a"])} B: {e["b"] if e["b"] == "REFUSED" else json.dumps(e["b"])}')


if __name__ == '__main__':
    main()
