# Builds gallery/pub<width>/index.html from the review manifest (and, once written, the synthesis's findings by shot), or
# from any tour run's shots.json (GALLERY_SHOTS, as convert.py takes it).
#   python3 -I build.py <scratchpad> <width> [other gallery URL]
#   GALLERY_SHOTS=<TOUR_DIR>/shots.json GALLERY_TITLE='...' GALLERY_LEDE='...' python3 -I build.py <gallery root> <width> [other URL]
# GALLERY_LEDE may hold __WIDTH__ and __COUNT__. A run's shots carry no checker's verdict: the page then shows none, and
# its notes are the capture's.
import json, os, sys, html
S, width, other_url = sys.argv[1], int(sys.argv[2]), (sys.argv[3] if len(sys.argv) > 3 else '')
SHOTS = os.environ.get('GALLERY_SHOTS', '')
source = json.load(open(SHOTS))['shots'] if SHOTS else json.load(open('/home/user/ops/designs/lane-b-ux-review/manifest.json'))
d = sorted((m for m in source if m['width'] == width), key=lambda m: m['id'])
# Published files get short sequential names (s/0001.webp ...), so a publish's file list is a plain sequence.
pub = f'{S}/gallery/pub{width}'
os.makedirs(f'{pub}/s', exist_ok=True)
for k, m in enumerate(d, 1):
    dst = f'{pub}/s/{k:04d}.webp'
    if os.path.exists(dst): os.remove(dst)
    os.link(f"{S}/gallery/w{width}/s/{m['id']}.webp", dst)
# A pub folder of an earlier build with more shots keeps no image past this one's count.
for name in os.listdir(f'{pub}/s'):
    if name.endswith('.webp') and name[:-5].isdigit() and int(name[:-5]) > len(d): os.remove(f'{pub}/s/{name}')
AREA = {'p': 'Practice', 'console': 'Console', 'settings': 'Account and organization', 'account': 'Account and organization',
        'support': 'Support'}
def area(i):
    pre = i.split('.')[0]
    if pre.startswith('sign-in'): return 'Sign-in'
    return AREA.get(pre, 'Public and shared')
byshot = {}
fp = f'{S}/gallery/findings-by-shot.json'
if os.path.exists(fp): byshot = json.load(open(fp))
# Shots convert.py scaled down to the WebP limit (16,383 px a side): the note says so.
sp = f'{S}/gallery/w{width}/scaled.json'
scaled = set(json.load(open(sp))) if os.path.exists(sp) else set()
SCALED = ' This gallery copy is scaled down to 16,383 px, the WebP limit; the PNG and its tiles are full size.'
rows = [{'k': k, 'id': m['id'], 'a': area(m['id']), 'r': m['routePattern'], 'p': m['path'], 'o': m['role'], 't': 'dark' if m['theme'].startswith('dark') else 'light',
         's': m['state'], 'v': m.get('verdict', ''), 'n': (m['note'] + (SCALED if m['id'] in scaled else '')).strip(), 'rt': bool(m.get('retaken')), 'f': byshot.get(m['id'], [])} for k, m in enumerate(d, 1)]
data = json.dumps(rows, ensure_ascii=False).replace('</', '<\\/')
other_w = 390 if width == 1280 else 1280
other = f'<a class="swap" href="{html.escape(other_url)}" target="_blank" rel="noopener">Open the {other_w} px gallery</a>' if other_url else f'<span class="swap muted">The {other_w} px gallery is a separate page</span>'
TITLE = os.environ.get('GALLERY_TITLE', 'PaidWhole Screen Review')
LEDE = os.environ.get('GALLERY_LEDE', "The UX/UI and brand baseline review's capture, 2026-10-26: every reachable screen and state at __WIDTH__ px, as the role that uses it, from claude/build-platform 6ddd587 on synthetic data. A checker looked at every shot first; its notes are leads the eleven reviewers verified. __COUNT__ shots.")
NOTE_HEADING = "Checker's note" if any(r['v'] for r in rows) else 'Capture note'
own = f'{S}/gallery/template.html'
tpl = open(own if os.path.exists(own) else os.path.join(os.path.dirname(os.path.abspath(__file__)), 'template.html')).read()
out = (tpl.replace('__TITLE__', html.escape(TITLE)).replace('__LEDE__', html.escape(LEDE)).replace('__NOTE_HEADING__', html.escape(NOTE_HEADING, quote=False))
       .replace('__WIDTH__', str(width)).replace('__COUNT__', str(len(rows))).replace('__OTHER__', other).replace('__CARDMIN__', '250px' if width == 1280 else '160px')
       .replace('__RATIO__', '16 / 10' if width == 1280 else '9 / 16').replace('__DATA__', data))
open(f'{pub}/index.html', 'w').write(out)
print(width, len(rows), 'shots;', sum(1 for r in rows if r['f']), 'with findings;', os.path.getsize(f'{pub}/index.html') // 1024, 'KB')
