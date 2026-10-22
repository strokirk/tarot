#!/usr/bin/env python3
"""Build img/ from the public-domain Rider–Waite–Smith scans on Wikimedia Commons.

Two steps:
  1. Download each full-size original into originals/, unless it is already there.
     The originals are committed, so normally nothing is downloaded and Commons is left alone.
  2. Process every original into img/: trim to the black frame line (the web app draws the
     rounded card margin itself) and resize.

Re-run freely to experiment with processing. Needs Pillow.
Usage: python3 fetch_art.py [--width 400]
"""
import argparse
import hashlib
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
ORIGINALS = HERE / "originals"
IMG = HERE / "img"
UA = "tarot-deck/0.1 (https://github.com/strokirk/00-random)"
MAJORS = ["00 Fool", "01 Magician", "02 High Priestess", "03 Empress", "04 Emperor", "05 Hierophant",
          "06 Lovers", "07 Chariot", "08 Strength", "09 Hermit", "10 Wheel of Fortune", "11 Justice",
          "12 Hanged Man", "13 Death", "14 Temperance", "15 Devil", "16 Tower", "17 Star", "18 Moon",
          "19 Sun", "20 Judgement", "21 World"]
SUIT_FILE = {"wands": "Wands", "cups": "Cups", "swords": "Swords", "pentacles": "Pents"}


def commons_name(card):
    if card["arcana"] == "major":
        return f"RWS Tarot {MAJORS[card['number']]}.jpg"
    return f"{SUIT_FILE[card['suit']]}{card['rank']:02d}.jpg"


def get(url, tries=6):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA})) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            # upload.wikimedia.org also answers 429 for files that don't exist, so give up eventually.
            if e.code != 429 or i == tries - 1:
                raise
            time.sleep(2 ** (i + 2))


def original_url(name):
    """Commons stores originals under an md5-derived path, so no (rate-limited) API call is needed."""
    name = name.replace(" ", "_")
    h = hashlib.md5(name.encode()).hexdigest()
    return f"https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{urllib.parse.quote(name)}"


def download(cards):
    ORIGINALS.mkdir(exist_ok=True)
    missing = []
    for c in cards:
        dest = ORIGINALS / f"{c['id']}.jpg"
        if dest.exists():
            continue
        try:
            dest.write_bytes(get(original_url(commons_name(c))))
        except urllib.error.HTTPError as err:
            missing.append(f"{commons_name(c)} ({err.code})")
            continue
        print(f"downloaded {c['id']:<14} {dest.stat().st_size // 1024:>5} KB  {commons_name(c)}")
        time.sleep(0.5)
    if missing:
        print("Not found on Commons:", ", ".join(missing))


def border_box(img, dark=110, fill=0.5):
    """Bounding box of the card's black frame line: from each side, the first row or column that is mostly dark."""
    g = img.convert("L")
    w, h = g.size
    px = g.load()

    def is_dark_row(y):
        xs = range(w // 5, w - w // 5)
        return sum(px[x, y] < dark for x in xs) > fill * len(xs)

    def is_dark_col(x):
        ys = range(h // 5, h - h // 5)
        return sum(px[x, y] < dark for y in ys) > fill * len(ys)

    def frame(lines, is_dark, fallback, thickness=4):
        # Some scans start with a dark scanner edge, or have a thin one out in the paper margin. Skip past the
        # leading one, then take the first run of `thickness` dark lines: the frame is thicker than a scan edge.
        dark = [is_dark(n) for n in lines]
        start = next((i for i, d in enumerate(dark) if not d), 0)
        for i in range(start, len(dark) - thickness):
            if all(dark[i:i + thickness]):
                return lines[i]
        return fallback

    limit = 0.1  # the frame is never further in than this; fall back to no crop on that side
    top = frame(range(int(h * limit)), is_dark_row, 0)
    bottom = frame(range(h - 1, int(h * (1 - limit)), -1), is_dark_row, h - 1)
    left = frame(range(int(w * limit)), is_dark_col, 0)
    right = frame(range(w - 1, int(w * (1 - limit)), -1), is_dark_col, w - 1)
    return left, top, right + 1, bottom + 1


def process(cards, width):
    from PIL import Image

    IMG.mkdir(exist_ok=True)
    for c in cards:
        src = ORIGINALS / f"{c['id']}.jpg"
        if not src.exists():
            continue
        img = Image.open(src).convert("RGB")
        box = border_box(img)
        img = img.crop(box)
        img.thumbnail((width, width * 2), Image.LANCZOS)
        img.save(IMG / f"{c['id']}.jpg", "JPEG", quality=82, optimize=True, progressive=True)
        print(f"processed  {c['id']:<14} crop={box} -> {img.size[0]}x{img.size[1]}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=400)
    args = ap.parse_args()
    cards = json.loads((HERE / "deck.json").read_text())["cards"]
    download(cards)
    process(cards, args.width)


if __name__ == "__main__":
    main()
