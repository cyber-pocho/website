# misc/

Image assets. The site is a terminal, so the only image it uses is the
portrait — and it uses it as *source material*, not as a rendered `<img>`.

- `pfp.png` — your portrait. It is never shown directly. Instead
  `scripts/gen-ascii.py` converts it to the ASCII art in `src/ascii.ts`,
  which is what `neofetch` and `cat ~/about/portrait.txt` print.

  After replacing this file, regenerate the art:

      python3 scripts/gen-ascii.py

  The script assumes a portrait on a plain light backdrop that is brighter
  than every part of the subject. If you swap in a photo shot against a dark
  or busy background, the backdrop removal will need a different
  `--threshold` (or a different approach entirely).

- `favicon.svg` — the `>_` tab icon.

- `background.jpg` — **unused.** Left over from the previous design, which
  used a painting as a page background. The terminal has no background
  image; delete this whenever you like.
