# Resolve the three "both sides added here" conflicts of the base merge: the base's MOD-19 and MOD-20, then this branch's MOD-21 and MOD-22.
import re, sys
def resolve(path, between=''):
    s = open(path, encoding='utf-8').read()
    pattern = re.compile(r'<<<<<<< [^\n]*\n(.*?)=======\n(.*?)>>>>>>> [^\n]*\n', re.S)
    assert len(pattern.findall(s)) == 1, path
    s = pattern.sub(lambda m: m.group(2) + between + m.group(1), s)
    open(path, 'w', encoding='utf-8').write(s)
resolve('docs/product/test-matrix.md')
resolve('packages/synth/src/cases/registry.ts')
resolve('packages/synth/src/cases/matrix.ts', '  },\n  {\n')
