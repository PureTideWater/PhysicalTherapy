# Lane B screen gallery

Turns a screen tour's PNGs into two private artifact galleries, one per width. One artifact version holds at most 511
files, and the UX baseline review has 857 shots, so each width gets its own gallery.

- `convert.py <scratchpad>` writes lossless WebP copies (857 shots: 155 MB of PNG, 42.7 MB of WebP).
- `build.py <scratchpad> <width> [other gallery URL]` writes `gallery/pub<width>/index.html`. The images are named
  `s/0001.webp` onward, so a publish's file list is a plain sequence; ids stay in the page's data, and `#shot-id` opens
  a shot. Once `gallery/findings-by-shot.json` exists (shot id to `[{ux, sev, title}]`), cards and the viewer show the
  findings that cite each shot.
- Publish with the Artifact tool: the page as `file_path`, `root` the pub folder, and the images in batches of at most
  250 files per publish (the limit is 255 files and 64 MB per publish).
- **Any other tour run** (a pull request's before and after, `tools/lane-b-screen-tour`, "From another lane"): set
  `GALLERY_SHOTS=<TOUR_DIR>/shots.json` and give each run its own gallery root, for example
  `GALLERY_SHOTS=$TOUR_DIR/shots.json python3 -I convert.py <scratchpad>/gallery-before`, then `build.py` with the same
  root and each width. The PNGs are read from `<TOUR_DIR>/png`. `GALLERY_TITLE` and `GALLERY_LEDE` (which may hold
  `__WIDTH__` and `__COUNT__`) replace the baseline's heading and lede. A run's shots carry no checker's verdict, so the
  page hides the verdict filter, says "Not checked" and heads each note "Capture note". `build.py` uses
  `<root>/gallery/template.html` when that copy exists (the baseline's), else this folder's `template.html`.
  `convert.py` converts a shot again when its PNG is newer than its WebP (a retake).
- WebP holds at most 16,383 px a side. `convert.py` scales a taller shot down to fit (console.compliance at 390 px runs
  about 16,400 px) and lists it in `gallery/w<width>/scaled.json`; `build.py` adds that to the shot's note. The PNG and
  its tiles keep full size.

The PNGs never go on a branch: the repository is public. The galleries are private, and only their owner can share them.
