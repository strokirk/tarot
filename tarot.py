#!/usr/bin/env python3
"""Tarot for creative inspiration. Pull a card (or a spread) and use it as a prompt.

  tarot.py                    one card
  tarot.py three -r           past/present/future, cards may be reversed
  tarot.py celtic --seed 7    a reproducible Celtic Cross
  tarot.py -n 4 --major       four Major Arcana cards, no positions
  tarot.py story --json       machine-readable, for agents
  tarot.py spreads            list spreads
  tarot.py show "the moon"    look up a card
  tarot.py serve              web app on http://localhost:8078

Set NO_EMOJI=1 for plain text, NO_COLOR=1 to drop colours.
"""
import argparse
import functools
import http.server
import json
import os
import random
import shutil
import sys
import textwrap
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV",
         "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"]
RANKS = {1: "Ace", 11: "Page", 12: "Knight", 13: "Queen", 14: "King"}
COMMANDS = {"spreads", "cards", "show", "serve"}


def env_flag(name):
    return (os.environ.get(name) or os.environ.get(name.lower()) or "").strip().lower() not in ("", "0", "false", "no")


EMOJI = not env_flag("NO_EMOJI")
COLOR = sys.stdout.isatty() and not env_flag("NO_COLOR")


def style(text, code):
    return f"\033[{code}m{text}\033[0m" if COLOR else text


bold = functools.partial(style, code="1")
dim = functools.partial(style, code="2")
gold = functools.partial(style, code="33")
violet = functools.partial(style, code="35")


def e(symbol, fallback=""):
    """An emoji followed by a space, or the fallback when NO_EMOJI is set."""
    return f"{symbol} " if EMOJI else fallback


def load_deck():
    return json.loads((HERE / "deck.json").read_text(encoding="utf-8"))


def subtitle(card, deck):
    if card["arcana"] == "major":
        return f"Major Arcana {ROMAN[card['number']]}"
    suit = deck["suits"][card["suit"]]
    return f"Minor Arcana · {suit['name']} ({suit['element']}: {suit['domain']})"


def draw(deck, count, reversals=False, major_only=False, rng=random):
    pool = [c for c in deck["cards"] if c["arcana"] == "major" or not major_only]
    if count > len(pool):
        sys.exit(f"Can't draw {count} cards from a deck of {len(pool)}.")
    return [{"card": c, "reversed": reversals and rng.random() < 0.5} for c in rng.sample(pool, count)]


def to_json(deck, spread_key, positions, pulls):
    out = []
    for i, pull in enumerate(pulls):
        card, rev = pull["card"], pull["reversed"]
        side = card["reversed" if rev else "upright"]
        item = {
            "position": positions[i]["name"] if positions else None,
            "position_meaning": positions[i]["meaning"] if positions else None,
            "id": card["id"], "name": card["name"], "arcana": card["arcana"], "suit": card.get("suit"),
            "orientation": "reversed" if rev else "upright",
            "keywords": side["keywords"], "meaning": side["meaning"],
            "imagery": card["imagery"], "prompt": card["prompt"], "emoji": card["emoji"],
            "image": f"img/{card['id']}.jpg",
        }
        out.append(item)
    spread = deck["spreads"].get(spread_key)
    return {"spread": spread_key, "spread_name": spread["name"] if spread else None, "cards": out}


def render_card(deck, pull, width, heading=None, meaning=None):
    card, rev = pull["card"], pull["reversed"]
    side = card["reversed" if rev else "upright"]
    wrap = functools.partial(textwrap.fill, width=width, initial_indent="   ", subsequent_indent="   ")
    lines = []
    if heading:
        label = f"── {heading} "
        lines.append(violet(label + "─" * max(0, width - len(label))))
        if meaning:
            lines.append(dim(f"   {meaning}"))
    orient = (e("🙃", "") + "Reversed") if rev else ""
    name = bold(gold(card["name"])) + (f"  {violet('(' + orient + ')')}" if rev else "")
    lines.append(f"{e(card['emoji'])}{name}" if EMOJI else f"* {name}")
    lines.append(dim(f"   {subtitle(card, deck)}"))
    lines.append("")
    lines.append(wrap(f"{e('🔑', 'Keywords: ')}{', '.join(side['keywords'])}"))
    lines.append(wrap(f"{e('👁️', 'Imagery: ')}{card['imagery']}"))
    lines.append(wrap(f"{e('💡', 'Meaning: ')}{side['meaning']}"))
    lines.append(wrap(f"{e('✍️', 'Prompt: ')}{card['prompt']}"))
    if rev:
        lines.append(dim(wrap("Reversed: read the prompt through blocked, inverted or inward energy.")))
    return "\n".join(lines)


def cmd_draw(args, deck):
    rng = random.Random(args.seed)
    if args.cards:
        spread_key, positions = None, None
        pulls = draw(deck, args.cards, args.reversals, args.major, rng)
    else:
        spread_key = args.what
        if spread_key not in deck["spreads"]:
            sys.exit(f"Unknown spread {spread_key!r}. Try: {', '.join(deck['spreads'])} (or `tarot.py spreads`).")
        positions = deck["spreads"][spread_key]["positions"]
        pulls = draw(deck, len(positions), args.reversals, args.major, rng)

    if args.json:
        print(json.dumps(to_json(deck, spread_key, positions, pulls), ensure_ascii=False, indent=2))
        return

    width = min(shutil.get_terminal_size((88, 20)).columns, 88)
    blocks = []
    if spread_key and spread_key != "single":
        spread = deck["spreads"][spread_key]
        blocks.append(f"{e('🔮', '')}{bold(spread['name'])}\n{dim(spread['description'])}")
    for i, pull in enumerate(pulls):
        if positions and len(positions) > 1:
            heading, meaning = f"{i + 1}. {positions[i]['name']}", positions[i]["meaning"]
        elif not positions and len(pulls) > 1:
            heading, meaning = f"Card {i + 1}", None
        else:
            heading = meaning = None
        blocks.append(render_card(deck, pull, width, heading, meaning))
    print("\n\n".join(blocks))


def cmd_spreads(deck):
    for key, s in deck["spreads"].items():
        print(f"{bold(key):<12} {s['name']} ({len(s['positions'])})")
        print(dim(f"{'':<12} {s['description']}"))
        print(dim(f"{'':<12} " + " · ".join(p["name"] for p in s["positions"])))


def cmd_cards(deck):
    for c in deck["cards"]:
        print(f"{e(c['emoji'])}{c['name']:<22} {dim(', '.join(c['upright']['keywords']))}")


def find_card(deck, query):
    q = " ".join(query).lower().strip()
    exact = [c for c in deck["cards"] if q in (c["id"], c["name"].lower(), c["name"].lower().removeprefix("the "))]
    return exact or [c for c in deck["cards"] if q in c["name"].lower()]


def cmd_show(args, deck):
    if not args.rest:
        sys.exit("Usage: tarot.py show <card name>")
    hits = find_card(deck, args.rest)
    if not hits:
        sys.exit(f"No card matching {' '.join(args.rest)!r}.")
    if len(hits) > 1:
        sys.exit("Did you mean: " + ", ".join(c["name"] for c in hits))
    pull = {"card": hits[0], "reversed": args.reversals}
    if args.json:
        print(json.dumps(to_json(deck, None, None, [pull]), ensure_ascii=False, indent=2))
    else:
        print(render_card(deck, pull, min(shutil.get_terminal_size((88, 20)).columns, 88)))


def cmd_serve(args):
    port = args.port
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(HERE))
    with http.server.ThreadingHTTPServer(("127.0.0.1", port), handler) as httpd:
        print(f"{e('🔮')}Tarot at http://localhost:{port}/  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


def main(argv=None):
    deck = load_deck()
    ap = argparse.ArgumentParser(
        prog="tarot.py", description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", nargs="?", default="single", metavar="SPREAD|COMMAND",
                    help=f"a spread ({', '.join(deck['spreads'])}) or one of: {', '.join(sorted(COMMANDS))}")
    ap.add_argument("rest", nargs="*", help=argparse.SUPPRESS)
    ap.add_argument("-n", "--cards", type=int, metavar="N", help="draw N cards with no spread positions")
    ap.add_argument("-r", "--reversals", action="store_true", help="cards may come up upside down")
    ap.add_argument("--major", action="store_true", help="Major Arcana only")
    ap.add_argument("--seed", help="seed the shuffle for a reproducible draw")
    ap.add_argument("--json", action="store_true", help="output JSON")
    ap.add_argument("--port", type=int, default=8078, help="port for `serve`")
    args = ap.parse_args(argv)

    if args.what == "spreads":
        cmd_spreads(deck)
    elif args.what == "cards":
        cmd_cards(deck)
    elif args.what == "show":
        cmd_show(args, deck)
    elif args.what == "serve":
        cmd_serve(args)
    else:
        cmd_draw(args, deck)


if __name__ == "__main__":
    main()
