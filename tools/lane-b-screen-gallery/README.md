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

The PNGs never go on a branch: the repository is public. The galleries are private, and only their owner can share them.
