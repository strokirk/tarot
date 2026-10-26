# Tarot Muse

A tarot deck for creative inspiration. Pull a card, read its imagery, keywords and prompt, and let it push an idea somewhere new. It has a CLI for humans and agents and a web app with a shuffle-and-deal animation, live at https://strokirk.github.io/tarot/.

All 78 cards use the public-domain Rider–Waite–Smith art (Pamela Colman Smith, 1909, via Wikimedia Commons). Each card has an imagery description, upright and reversed keywords and meanings, and a creative writing prompt. Everything lives in `deck.json`, which both interfaces share.

## CLI

Python 3.9+, no dependencies.

```sh
./tarot.py                     # one card (the default)
./tarot.py three -r            # Past · Present · Future, cards may come up reversed
./tarot.py story               # Protagonist · Desire · Obstacle · Twist · Resolution
./tarot.py celtic --seed 42    # reproducible ten-card Celtic Cross
./tarot.py -n 4 --major        # four Major Arcana cards, no positions
./tarot.py sao --json          # JSON output, handy for agents
./tarot.py spreads             # list spreads
./tarot.py cards               # list all cards
./tarot.py show "the moon" -r  # look up one card (reversed)
NO_EMOJI=1 ./tarot.py          # plain text, no emoji (NO_COLOR=1 drops ANSI colour)
```

Spreads: `single`, `three`, `sao` (situation/action/outcome), `story`, `cross`, `horseshoe` and `celtic`.

## Web

```sh
./tarot.py serve               # http://localhost:8078
```

Choose a spread and turn reversals or Major-only on if you want them. Then press **Shuffle & draw** or <kbd>Space</kbd>. The deck riffles, deals the cards into the spread and flips them one by one. Upside-down cards land reversed. Click a card to jump to its entry in the reading. **Copy as text** copies the reading so you can paste it elsewhere. You can deep-link a setup with `?spread=celtic&reversals=1&major=0`.

The app is static (`index.html`, `style.css`, `app.js`). It fetches `deck.json`, so it has to be served over HTTP; opening the file directly won't work.

## Art

`originals/` holds the full-size scans from Wikimedia Commons, committed so they never need fetching again. `img/` is generated from them: each scan is trimmed to its black frame line and resized to 400px wide. The web app draws the paper margin and rounded corners itself, so every card looks the same whatever its scan's edges were like.

`./fetch_art.py` downloads any missing originals (normally none), then regenerates `img/` from them, entirely offline. Re-run it as often as you like while you experiment with processing. It needs Pillow.

## License

MIT, see `LICENSE`. The card art is public domain.
