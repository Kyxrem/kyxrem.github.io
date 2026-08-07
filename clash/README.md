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
- **Upgrade Plan** — a prioritized builder schedule across your builder count
  (heroes → army/unlock buildings → storages when they gate affordability →
  key defenses → splash → point → traps → resources; ranked inside each tier
  by ΔDPS + ΔHP/6 per cost), plus separate single-queue Laboratory and Pet
  House orders, with optional Gold-Pass style time discounts.
- **To Max** — gold / elixir / dark elixir / ore totals needed to max the
  current TH, time bottleneck analysis at your loot-per-day rates with an ETA
  date, and a reference table of what *every* TH costs from scratch.
- **Metrics** — total defensive DPS/HP vs. TH max, storage capacity, a
  per-defense matrix (counts, level ranges, remaining cost/time), a
  "best value right now" ranking of every available defense upgrade, and a
  laboratory value matrix.

## Importing your base

Three paths, all on the **Import / Export** tab:

0. **In-game village export JSON** (recommended) — the ID-based snapshot that
   starts `{"tag":"#...","buildings":[{"data":1000001,...}]}`. This is the only
   format that includes building levels, walls and traps, so paste or upload it
   if you have it. Internal `data` IDs are resolved via tables from the
   MIT-licensed [`clash-of-clans-data`](https://www.npmjs.com/package/clash-of-clans-data)
   npm package; IDs the tables don't know (brand-new content) are counted in
   the import message rather than guessed.
1. **Clash of Clans API** — enter your player tag and a token from
   [developer.clashofclans.com](https://developer.clashofclans.com). Note the
   official API does not send CORS headers and pins keys to IPs, so calling it
   straight from a browser page usually fails. Options:
   - run a local proxy (e.g. `cocproxy`) and put its URL in the *API base* box;
   - create your key whitelisting the RoyaleAPI proxy IP `45.79.218.79` and use
     that proxy as the base URL;
   - or skip straight to option 2.
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
```

`build_data.py` prints a validation report (level continuity, missing
requirements, full-max totals). If Supercell adds a new troop/building, add its
page name to `ITEMS` in `scrape.py`.

This is a fan project — not affiliated with, endorsed or sponsored by
Supercell. See [Supercell's Fan Content Policy](https://supercell.com/en/fan-content-policy/).
