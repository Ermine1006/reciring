# Together card illustrations

Drop two files here and the Together page uses them instead of its
built-in SVG drawings. No code change is needed.

    mock-interview.png     the Mock Interview card
    groups-events.png      the Groups & Events card

Rules:

* The art is drawn into a 74x60 box. Export at 2x or 3x
  (148x120 or 222x180) so it stays sharp on a phone screen.
* Transparent background. The cards sit on pale matcha and pale
  gold, so a white rectangle will show as a box.
* PNG or SVG both work. For SVG, name the files with a .svg
  extension and change the two `art` paths in
  src/data/togetherContent.js to match.
* Keep each file small. These load on the Together page every time.

If a file is missing or fails to load, the card silently falls back
to its built-in SVG, so a typo can never leave a broken image on the
page.
