# 👑 Royale Analyzer

Client-side Clash Royale companion at **`/royale/`**, sharing the Clash
Analyzer's design system.

- **Overview** — gold-weighted collection progress (levels 1–16 including
  tower troops), progress by rarity, gold/cards needed per rarity, and a
  "ready to upgrade" list (enough copies held, only gold missing, cheapest
  first).
- **Collection** — searchable, filterable table of every card with editable
  level dropdowns, copy counts, progress bars to the next level, gold to
  next/max, and evolution ownership.
- **Deck** — your imported (or hand-built) deck with average elixir, 4-card
  cycle cost, average level and gold to max the deck; per-card stats at your
  levels.
- **Card stats** — full per-level stat table for any card (from the wiki),
  with cards/gold requirements and your level highlighted.
- **Meta decks** — a snapshot of the current meta (Ranked and Top Ladder,
  from [DeckShop](https://www.deckshop.pro/best-decks/), evolution slots
  marked ⚡) with ownership filters: only show decks where you have all the
  cards, the evolutions, and/or the hero versions. One click loads any deck
  into the Deck tab. Refresh the snapshot with `tools/scrape_decks.py`.
  Hero-version ownership (the 15 cards with /Hero variants on the wiki) is
  tracked per card in the Collection tab.
- **Import** — paste the official Clash Royale API player payload
  (`/v1/players/#TAG`, from the developer portal's "Try it" or curl; the API
  blocks browsers via CORS so paste is the path). Card levels are normalized
  from the API's rarity-relative levels, and `supportCards` (tower troops),
  evolutions and `currentDeck` are picked up. The tool's own export format
  round-trips everything.

## Data

`data.js` is generated from the
[Clash Royale Wiki](https://clashroyale.fandom.com): the canonical card list
from the rarity categories, per-card infoboxes (rarity, elixir, type, arena),
per-level stat tables, the rarity upgrade tables (cards + gold per level,
1–16), and king-level XP.

Refresh after a balance patch:

```bash
pip install beautifulsoup4 lxml
python3 tools/scrape_royale.py data.js
```

Fan project — not affiliated with, endorsed or sponsored by Supercell.
See [Supercell's Fan Content Policy](https://supercell.com/en/fan-content-policy/).
