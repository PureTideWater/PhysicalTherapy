# Converts each tour PNG to lossless WebP under gallery/w<width>/s/<id>.webp (synthetic screens only).
import json, os, sys
from concurrent.futures import ProcessPoolExecutor
from PIL import Image
S = sys.argv[1]
d = json.load(open('/home/user/ops/designs/lane-b-ux-review/manifest.json'))
def one(m):
    out = f"{S}/gallery/w{m['width']}/s/{m['id']}.webp"
    if not os.path.exists(out):
        Image.open(f"{S}/screens/png/{m['file']}").convert('RGB').save(out, 'WEBP', lossless=True, method=4)
    return os.path.getsize(out)
with ProcessPoolExecutor(3) as ex:
    sizes = list(ex.map(one, d, chunksize=8))
print(len(sizes), round(sum(sizes) / 1e6, 1), 'MB')
