import json, html, os, re, struct, sys
SD = sys.argv[1]
g = json.load(open(os.path.join(SD, 'gallery.json')))
items = g['items'] if isinstance(g, dict) else g
ORDER = ["Getting started", "Payments in", "Contracts and pricing", "Disputes", "Recovery and reports", "Free screening", "Operator console", "Account", "On a phone"]
INTRO = {
 "Getting started": "Signing in and the practice's home: the three numbers the product never adds together.",
 "Payments in": "The insurer payment files a practice uploads, checked line by line.",
 "Contracts and pricing": "Each contract's rates, tied to the page they came from, and every line priced against them.",
 "Disputes": "Shortfalls grouped by insurer pattern, worked as cases, and sent as packets a person approves.",
 "Recovery and reports": "Proof that money came back: matched to postings and bank deposits, then reported.",
 "Free screening": "The public, no-patient-data screening that brings a practice in.",
 "Operator console": "PaidWhole's own staff side, behind a hardware security key.",
 "Account": "Billing and the practice's access log.",
 "On a phone": "Four of the same screens at phone width (390 px).",
}
def esc(s): return html.escape(s, quote=True)
def role(r):
    r = r.split(' (')[0].strip()
    return r[:1].upper() + r[1:]
def size(p):
    b = open(p, 'rb').read(24); return struct.unpack('>II', b[16:24])
groups = {a: [] for a in ORDER}
for n, it in enumerate(items, 1):
    area = "On a phone" if it['width'] <= 500 else it['area']
    groups.setdefault(area, []).append((n, it))
nav = ''.join(f'<a href="#{re.sub("[^a-z]+","-",a.lower()).strip("-")}">{esc(a)}<span>{len(groups[a])}</span></a>' for a in ORDER if groups.get(a))
sections = []
for a in ORDER:
    if not groups.get(a): continue
    sid = re.sub("[^a-z]+", "-", a.lower()).strip("-")
    phone = a == "On a phone"
    figs = []
    for n, it in groups[a]:
        fn = os.path.basename(it['file']); w, h = size(os.path.join(SD, 'png', fn))
        r = role(it['role'])
        who = 'Public page' if r.lower().startswith('public') else f'Signed in as {r.lower()}'
        figs.append(f'''<figure class="shot{' phone' if phone else ''}" id="s{n:02d}">
  <button class="frame" type="button" data-src="png/{fn}" data-title="{esc(it['title'])}" data-n="{n}" aria-label="Open screen {n}, {esc(it['title'])}, at full size">
    <img src="png/{fn}" alt="{esc(it['title'])}: {esc(it['caption'])}" width="{w}" height="{h}" loading="lazy" decoding="async">
    <span class="more">Full screen &middot; {h:,} px tall</span>
  </button>
  <figcaption><span class="num">{n:02d}</span><div><h3>{esc(it['title'])}</h3><p class="who">{esc(who)}</p><p>{esc(it['caption'])}</p></div></figcaption>
</figure>''')
    sections.append(f'<section id="{sid}" class="area"><header class="area-head"><h2>{esc(a)}</h2><p>{esc(INTRO.get(a,""))}</p></header><div class="grid{" phones" if phone else ""}">' + '\n'.join(figs) + '</div></section>')
issues = [
 ("Phone width", "The ROI statement's file fingerprint does not wrap, so that page scrolls sideways on a phone (it renders 489 px wide on a 390 px screen)."),
 ("Phone width", "Two tables cut off their last column: the agreements on the practice home, and the file template on the free screening page."),
 ("Desktop", "On the free screening result, two wide tables run past the right edge of the page."),
 ("Worth a check", "The practice home shows $0.00 actionable while the ROI statement lists $30.00 actionable in open cases for the same practice. The two count different things; the wording should make that plain."),
 ("Wording", "A notification reads “on 1 lines”."),
]
iss = ''.join(f'<li><span class="tag">{esc(k)}</span>{esc(v)}</li>' for k, v in issues)
PAGE = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'page.html')).read()
out = PAGE.replace('{{NAV}}', nav).replace('{{SECTIONS}}', '\n'.join(sections)).replace('{{ISSUES}}', iss).replace('{{COUNT}}', str(len(items)))
open(os.path.join(SD, 'paidwhole-screen-tour.html'), 'w').write(out)
print('written', len(out), 'bytes,', len(items), 'screens')
