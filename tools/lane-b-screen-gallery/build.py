# Builds gallery/w<width>/index.html from the review manifest (and, once written, the synthesis's findings by shot).
import json, os, sys, html
S, width, other_url = sys.argv[1], int(sys.argv[2]), (sys.argv[3] if len(sys.argv) > 3 else '')
d = sorted((m for m in json.load(open('/home/user/ops/designs/lane-b-ux-review/manifest.json')) if m['width'] == width), key=lambda m: m['id'])
# Published files get short sequential names (s/0001.webp ...), so a publish's file list is a plain sequence.
pub = f'{S}/gallery/pub{width}'
os.makedirs(f'{pub}/s', exist_ok=True)
for k, m in enumerate(d, 1):
    dst = f'{pub}/s/{k:04d}.webp'
    if os.path.exists(dst): os.remove(dst)
    os.link(f"{S}/gallery/w{width}/s/{m['id']}.webp", dst)
AREA = {'p': 'Practice', 'console': 'Console', 'settings': 'Account and organization', 'account': 'Account and organization',
        'support': 'Support'}
def area(i):
    pre = i.split('.')[0]
    if pre.startswith('sign-in'): return 'Sign-in'
    return AREA.get(pre, 'Public and shared')
byshot = {}
fp = f'{S}/gallery/findings-by-shot.json'
if os.path.exists(fp): byshot = json.load(open(fp))
rows = [{'k': k, 'id': m['id'], 'a': area(m['id']), 'r': m['routePattern'], 'p': m['path'], 'o': m['role'], 't': 'dark' if m['theme'].startswith('dark') else 'light',
         's': m['state'], 'v': m['verdict'], 'n': m['note'], 'rt': bool(m.get('retaken')), 'f': byshot.get(m['id'], [])} for k, m in enumerate(d, 1)]
data = json.dumps(rows, ensure_ascii=False).replace('</', '<\\/')
other_w = 390 if width == 1280 else 1280
other = f'<a class="swap" href="{html.escape(other_url)}" target="_blank" rel="noopener">Open the {other_w} px gallery</a>' if other_url else f'<span class="swap muted">The {other_w} px gallery is a separate page</span>'
tpl = open(f'{S}/gallery/template.html').read()
out = tpl.replace('__WIDTH__', str(width)).replace('__COUNT__', str(len(rows))).replace('__OTHER__', other).replace('__CARDMIN__', '250px' if width == 1280 else '160px').replace('__RATIO__', '16 / 10' if width == 1280 else '9 / 16').replace('__DATA__', data)
open(f'{pub}/index.html', 'w').write(out)
print(width, len(rows), 'shots;', sum(1 for r in rows if r['f']), 'with findings;', os.path.getsize(f'{pub}/index.html') // 1024, 'KB')
