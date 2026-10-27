# Converts each tour PNG to lossless WebP under gallery/w<width>/s/<id>.webp (synthetic screens only).
#   python3 -I convert.py <scratchpad>      the UX baseline review: its manifest, the PNGs in <scratchpad>/screens/png
#   GALLERY_SHOTS=<TOUR_DIR>/shots.json python3 -I convert.py <gallery root>
#                                           any other tour run (a pull request's before or after): its shots.json, the
#                                           PNGs in <TOUR_DIR>/png, the WebP under <gallery root>/gallery/w<width>/s/
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image
S = sys.argv[1]
SHOTS = os.environ.get('GALLERY_SHOTS', '')
if SHOTS:
    d = json.load(open(SHOTS))['shots']
    PNG = os.path.join(os.path.dirname(os.path.abspath(SHOTS)), 'png')
else:
    d = json.load(open('/home/user/ops/designs/lane-b-ux-review/manifest.json'))
    PNG = f'{S}/screens/png'
# WebP holds at most 16,383 px a side. A taller shot (console.compliance at 390 px is about 16,400 px tall) is scaled
# down to fit, and listed in gallery/w<width>/scaled.json, which build.py names in the shot's note; tiles keep full size.
WEBP_MAX = 16383
def one(m):
    out = f"{S}/gallery/w{m['width']}/s/{m['id']}.webp"
    png = f"{PNG}/{os.path.basename(m['file'])}"
    image = Image.open(png)
    scaled = max(image.size) > WEBP_MAX
    # A retaken shot's PNG is newer than its WebP: convert it again.
    if not os.path.exists(out) or os.path.getmtime(png) > os.path.getmtime(out):
        os.makedirs(os.path.dirname(out), exist_ok=True)
        image = image.convert('RGB')
        if scaled:
            k = WEBP_MAX / max(image.size)
            image = image.resize((max(1, round(image.width * k)), max(1, round(image.height * k))), Image.LANCZOS)
        image.save(out, 'WEBP', lossless=True, method=4)
    return os.path.getsize(out), (m['width'], m['id']) if scaled else None
with ProcessPoolExecutor(3) as ex:
    results = list(ex.map(one, d, chunksize=8))
for width in sorted({m['width'] for m in d}):
    names = sorted(s[1] for _, s in results if s is not None and s[0] == width)
    path = f'{S}/gallery/w{width}/scaled.json'
    if names or os.path.exists(path):
        json.dump(names, open(path, 'w'))
print(len(results), round(sum(size for size, _ in results) / 1e6, 1), 'MB;', sum(1 for _, s in results if s), 'scaled to the WebP limit')
