"""Cuts each full-page shot into window-height tiles for the UX and brand reviewer.

Usage: python3 -I tile.py <TOUR_DIR> [id-prefix ...]
Writes <TOUR_DIR>/tiles/<id>/NN.png (800 px tall at 1280 wide, 844 px at 390) and <TOUR_DIR>/tiles/index.json, with each
id's tile count and its shots.json entry. Synthetic shots only; the tiles, like the PNGs, never go on a branch.
"""
import json
import os
import sys

from PIL import Image

tour, prefixes = sys.argv[1], sys.argv[2:]
shots = json.load(open(os.path.join(tour, 'shots.json')))['shots']
index = {}
for shot in shots:
    if prefixes and not any(shot['id'].startswith(p) for p in prefixes):
        continue
    image = Image.open(os.path.join(tour, 'png', os.path.basename(shot['file'])))
    step = 844 if image.width <= 500 else 800
    out = os.path.join(tour, 'tiles', shot['id'])
    os.makedirs(out, exist_ok=True)
    count = 0
    for top in range(0, image.height, step):
        count += 1
        image.crop((0, top, image.width, min(top + step, image.height))).save(os.path.join(out, f'{count:02d}.png'))
    index[shot['id']] = {'tiles': count, 'shot': shot}
json.dump(index, open(os.path.join(tour, 'tiles', 'index.json'), 'w'), indent=1)
print(len(index), 'shots tiled into', sum(v['tiles'] for v in index.values()), 'tiles')
