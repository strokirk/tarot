#!/usr/bin/env python3
"""Download the public-domain Rider–Waite–Smith card scans from Wikimedia Commons into img/.

One-off helper; the images are committed, so you only need this to re-fetch or change the size.
Needs Pillow. Usage: python3 fetch_art.py [--width 400] [--force]
"""
import argparse
import hashlib
import io
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
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


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--width", type=int, default=400)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    cards = json.loads((HERE / "deck.json").read_text())["cards"]
    (HERE / "img").mkdir(exist_ok=True)
    todo = [c for c in cards if args.force or not (HERE / "img" / f"{c['id']}.jpg").exists()]
    from PIL import Image

    missing = []
    for c in todo:
        try:
            raw = get(original_url(commons_name(c)))
        except urllib.error.HTTPError as err:
            missing.append(f"{commons_name(c)} ({err.code})")
            continue
        dest = HERE / "img" / f"{c['id']}.jpg"
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        img.thumbnail((args.width, args.width * 2), Image.LANCZOS)
        img.save(dest, "JPEG", quality=82, optimize=True, progressive=True)
        print(f"{c['id']:<14} {dest.stat().st_size // 1024:>4} KB  {commons_name(c)}")
        time.sleep(0.5)
    if missing:
        print("Not found on Commons:", ", ".join(missing))


if __name__ == "__main__":
    main()
