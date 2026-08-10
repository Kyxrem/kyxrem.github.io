# ⚔️ Clash Analyzer

A fully client-side Clash of Clans base analyzer, hosted on GitHub Pages at
**`/clash/`**. Import your base, then get:

- **Overview** — cost-weighted progress toward maxing your current Town Hall,
  per-category progress (defenses, heroes, lab, walls, traps, army, resources,
  pets, equipment), and headline totals.
- **My Base** — an editor for every building instance, wall counts per level,
  heroes, lab levels, pets and owned hero equipment (the API doesn't expose
  building levels, so these are set here; everything persists in
  `localStorage`).
- **Upgrade Plan** — a "Next up" card with the first N builder jobs to
  queue (N = your builder count) and their combined resource bill, above
  a Gantt-style timetable (one lane per builder plus the
  Laboratory and Pet House, days on the x-axis, bars spanning each upgrade's
  duration, colored by the resource it costs) above a prioritized builder
  schedule across your builder count
  (heroes → army/unlock buildings → storages when they gate affordability →
  key defenses → splash → point → traps → resources; ranked inside each tier
  by ΔDPS + ΔHP/6 per cost), plus separate single-queue Laboratory and Pet
  House orders, with optional Gold-Pass style time discounts. Each free
  builder takes the top job from whichever resource is least ahead of your
  loot/day rates, so gold/elixir/dark spending stays even — but an upgrade
  chain long enough to set the finish date (usually a hero) always continues
  immediately, so balancing never extends the plan.
- **To Max** — gold / elixir / dark elixir / ore totals needed to max the
  current TH, time bottleneck analysis at your loot-per-day rates with an ETA
  date, and a reference table of what *every* TH costs from scratch.
- **Base Builder** — a layout creator for every Town Hall level: the exact
  building counts for that TH on the 44×44 grid, click/drag placement, wall
  painting, and a coverage overlay showing which tiles your defenses can
  actually hit — toggle **ground / air / both** (X-Bow modes, Air Sweeper push
  cones and the TH12+ Town Hall weapon included). A layout **library** holds
  a whole collection of bases across TH levels: paste an in-game share link
  (`link.clashofclans.com … OpenLayout&id=TH15:HV:…`) to file it under its TH
  with a one-tap "open in game" button — the link itself is an opaque pointer
  to Supercell's servers, so the grid is for sketching/analyzing the design.
  PNG and JSON export per layout. Footprints/ranges/targets come from the
  wiki via `tools/scrape_layout.py` (`layout-data.js`).
- **Metrics** — total defensive DPS/HP vs. TH max, storage capacity, a
  per-defense matrix (counts, level ranges, remaining cost/time), a
  "best value right now" ranking of every available defense upgrade, and a
  laboratory value matrix.
- **Running upgrades** — live timers from the village export (and a "start"
  button on any next step) occupy their lanes in the timetable as striped
  in-progress bars; when a timer lapses the level applies automatically.
- **Wall sprint** — walls are costed separately from other gold (they're
  payable with gold *or* elixir from level 5), with a daily wall budget,
  walls-per-week rate and a finish date.
- **Equipment & ore plan** — weekly ore income → when each owned equipment
  (and all of them) maxes for this TH's Blacksmith.
- **Next-TH preview** — what the jump costs, what it unlocks, and what your
  progress % would read the day you upgrade.
- **Share links** — the full base compressed into a URL hash; recipients get
  a read-only view they can optionally keep. The site owner's base is baked
  in as the default (`mybase.js`).

## Importing your base

Three paths, all on the **Import / Export** tab:

0. **In-game village export JSON** (recommended) — the ID-based snapshot that
   starts `{"tag":"#...","buildings":[{"data":1000001,...}]}`. This is the only
   format that includes building levels, walls and traps, so paste or upload it
   if you have it. Internal `data` IDs are resolved via tables from the
   MIT-licensed [`clash-of-clans-data`](https://www.npmjs.com/package/clash-of-clans-data)
   npm package; IDs the tables don't know (brand-new content) are counted in
   the import message rather than guessed.
1. **Fetch by player tag** — after a one-time [API relay setup](../api-relay/README.md)
   (a tiny self-hosted Node server; tokens live in `api-relay/.env` at home),
   the tool needs only a tag. The relay serves both this tool and the Royale
   one. Without a relay, use option 0 or 2 — Supercell's API blocks browsers
   directly (no CORS, IP-locked tokens).
2. **Paste / upload JSON** — paste the player payload from the developer
   portal's "Try it" button or from
   `curl -H "Authorization: Bearer TOKEN" "https://api.clashofclans.com/v1/players/%23YOURTAG"`.
   The same box also accepts a full base file exported by this tool
   (`{"format":"clash-analyzer-base", ...}`), which round-trips buildings and
   walls too.

The API payload covers TH level, heroes, troops, spells, sieges, pets and hero
equipment. Building levels aren't exposed by the API — use *My Base* →
"Everything → TH(n−1) max" as a starting point and adjust what you've already
upgraded.

## Data

`data.js` is generated from the
[Clash of Clans Wiki](https://clashofclans.fandom.com) (all home-village
upgrade tables through TH18): costs, times, TH availability, per-TH building
counts, DPS/HP where published, hero-equipment ore costs and Blacksmith caps.

Notes on modeling:

- Merged defenses (Ricochet Cannon, Multi-Archer Tower, Multi-Gear Tower) are
  counted as "all merges done" at max; the source buildings they consume are
  removed from the max configuration, and merge level 1 carries the merge cost.
- TH18 **supercharges** and Builder-Base **gear-ups** are excluded.
- Wall costs count as gold by default (switchable to elixir in *To Max*).
- Progress percentages are cost-weighted with dark elixir valued at 100×
  gold/elixir (it's roughly that much scarcer per raid); raw resource totals
  are always shown unweighted.
- Equipment ore totals count **owned** equipment only, capped by the
  Blacksmith level your TH allows.

### Refreshing the data after a game update

```bash
cd clash/tools
pip install beautifulsoup4 lxml
python3 scrape.py          # scrapes the wiki into raw.json (cached per page)
python3 build_data.py ../data.js
python3 scrape_layout.py ../layout-data.js   # sizes/ranges/targets for the Base Builder
```

`build_data.py` prints a validation report (level continuity, missing
requirements, full-max totals). If Supercell adds a new troop/building, add its
page name to `ITEMS` in `scrape.py`.

This is a fan project — not affiliated with, endorsed or sponsored by
Supercell. See [Supercell's Fan Content Policy](https://supercell.com/en/fan-content-policy/).
