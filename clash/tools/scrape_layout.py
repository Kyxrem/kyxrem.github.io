#!/usr/bin/env python3
"""Scrape building footprints, attack ranges and target types (ground/air)
from clashofclans.fandom.com into layout-data.js for the Base Builder tab.

Sources per building page:
  - <table id="building-size-table">  ->  "Size" "3x3"
  - first wikitable whose header row has Range / Trigger Radius / Unit Type
    Targeted  ->  constant combat stats (these don't change per level)
Special cases:
  - X-Bow: two modes (Ground & Air vs longer-range Ground) parsed from page
  - Town Hall weapon (Giga Tesla TH12, Giga Inferno TH13+): own wiki pages
  - Air Sweeper: pushes air troops in a rotatable cone, no damage
Run:  python3 scrape_layout.py ../layout-data.js
"""
import json, os, re, sys, hashlib, datetime, urllib.request, urllib.parse
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)
API = "https://clashofclans.fandom.com/api.php"
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "layout-data.js")

BUILDINGS = {
    "defense": ["Cannon", "Archer Tower", "Mortar", "Air Defense", "Wizard Tower",
                "Air Sweeper", "Hidden Tesla", "Bomb Tower", "X-Bow", "Inferno Tower",
                "Eagle Artillery", "Scattershot", "Spell Tower", "Monolith",
                "Multi-Archer Tower", "Ricochet Cannon", "Multi-Gear Tower",
                "Firespitter", "Builder's Hut", "Revenge Tower"],
    "trap": ["Bomb", "Spring Trap", "Air Bomb", "Giant Bomb", "Seeking Air Mine",
             "Skeleton Trap", "Tornado Trap", "Giga Bomb"],
    "resource": ["Gold Mine", "Elixir Collector", "Dark Elixir Drill", "Gold Storage",
                 "Elixir Storage", "Dark Elixir Storage"],
    "army": ["Army Camp", "Barracks", "Dark Barracks", "Laboratory", "Spell Factory",
             "Dark Spell Factory", "Clan Castle", "Workshop", "Pet House",
             "Blacksmith", "Hero Hall", "Crafting Station"],
    "other": ["Town Hall"],
}


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def api_call(**params):
    params.update(dict(format="json"))
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "coc-analyzer-scraper/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def fetch(page):
    fn = os.path.join(CACHE, hashlib.md5(page.encode()).hexdigest() + ".html")
    if os.path.exists(fn):
        return open(fn, encoding="utf-8").read()
    last = None
    for _ in range(3):
        try:
            d = api_call(action="parse", page=page, prop="text", redirects="1")
            if "error" in d:
                return None
            html = d["parse"]["text"]["*"]
            open(fn, "w", encoding="utf-8").write(html)
            return html
        except Exception as e:
            last = e
    print(f"  !! fetch failed {page}: {last}", file=sys.stderr)
    return None


def get_page(name):
    for cand in (name + "/Home Village", name):
        html = fetch(cand)
        if html and len(html) > 5000:
            return cand, html
    return None, None


def txt(el):
    return re.sub(r"\s+", " ", el.get_text(" ", strip=True))


def parse_size(soup, page_html):
    t = soup.find("table", id="building-size-table")
    if t:
        m = re.search(r"(\d+)\s*x\s*(\d+)", txt(t))
        if m:
            return [int(m.group(1)), int(m.group(2))]
    # fallback: any "Size" ... "3x3" in page text
    m = re.search(r"Size[^0-9]{0,40}(\d+)\s*x\s*(\d+)", page_html)
    if m:
        return [int(m.group(1)), int(m.group(2))]
    return None


STAT_HDR = re.compile(r"^(Range|Trigger Radius|Damage Type|Unit Type Targeted|Favorite Target)")


def parse_stats(soup):
    """First wikitable that is a label-row + value-row combat summary."""
    out = {}
    for t in soup.find_all("table", class_="wikitable"):
        rows = t.find_all("tr")
        if len(rows) < 2:
            continue
        hdr = [txt(h) for h in rows[0].find_all(["th", "td"])]
        if not any(STAT_HDR.match(h or "") for h in hdr):
            continue
        val = [txt(v) for v in rows[1].find_all(["th", "td"])]
        for h, v in zip(hdr, val):
            out.setdefault(h, v)
        break
    return out


def parse_range(s):
    if not s:
        return None
    s = s.replace("–", "-").replace(" tiles", "").replace(" tile", "")
    m = re.match(r"^\s*([\d.]+)\s*-\s*([\d.]+)", s)
    if m:
        return [float(m.group(1)), float(m.group(2))]
    m = re.match(r"^\s*([\d.]+)", s)
    if m:
        return [0.0, float(m.group(1))]
    return None


def parse_targets(s):
    if not s:
        return None
    s = s.lower()
    g, a = "ground" in s, "air" in s
    if g and a:
        return "b"
    if a:
        return "a"
    if g:
        return "g"
    return None


sizes, defs, notes = {}, {}, []

for cat, names in BUILDINGS.items():
    for name in names:
        sid = slug(name)
        page, html = get_page(name)
        if not html:
            notes.append(f"MISSING PAGE: {name}")
            continue
        soup = BeautifulSoup(html, "lxml")
        size = parse_size(soup, html)
        if size:
            sizes[sid] = size
        else:
            notes.append(f"no size: {name}")
        stats = parse_stats(soup)
        rng = parse_range(stats.get("Range") or stats.get("Trigger Radius"))
        tgt = parse_targets(stats.get("Unit Type Targeted"))
        if cat in ("defense", "trap") and rng and tgt:
            d = {"min": rng[0], "max": rng[1], "t": tgt}
            if cat == "trap":
                d["trap"] = 1
            defs[sid] = d
        elif cat == "defense":
            notes.append(f"no combat stats: {name} (range={stats.get('Range')!r} "
                         f"targets={stats.get('Unit Type Targeted')!r})")

# --- special cases -------------------------------------------------------

# X-Bow: settable to Ground-only (longer range) or Ground & Air — the wiki
# lists one stats table per mode, in that order.
page, html = get_page("X-Bow")
if html:
    soup = BeautifulSoup(html, "lxml")
    ranges = []
    for t in soup.find_all("table", class_="wikitable"):
        rows = t.find_all("tr")
        if len(rows) < 2:
            continue
        hdr = [txt(h) for h in rows[0].find_all(["th", "td"])]
        val = [txt(v) for v in rows[1].find_all(["th", "td"])]
        row = dict(zip(hdr, val))
        r = parse_range(row.get("Range"))
        if r:
            ranges.append(r[1])
    if ranges:
        ground, both = max(ranges), min(ranges)
        defs["x_bow"] = {"min": 0, "max": both, "t": "b",
                         "modes": {"b": both, "g": ground}}
        notes.append(f"x_bow modes from page tables: ground={ground} both={both}")
    if "x_bow" not in sizes:
        sizes["x_bow"] = [3, 3]
        notes.append("x_bow size fell back to 3x3")

# Air Sweeper: no damage, pushes air troops in a 120° cone; rotatable.
if "air_sweeper" in defs:
    defs["air_sweeper"].update({"cone": 120, "push": 1})

# Skeleton Trap: switchable ground/air mode in game.
if "skeleton_trap" in defs:
    defs["skeleton_trap"]["modes"] = {"g": defs["skeleton_trap"]["max"], "a": defs["skeleton_trap"]["max"]}

# Town Hall weapon: Giga Tesla (TH12), Giga Inferno (TH13-16); from TH17 the
# Eagle Artillery is merged into the Town Hall itself.
th_weapon = {}
for wname, ths in (("Giga Tesla", [12]), ("Giga Inferno", [13, 14, 15, 16])):
    page, html = get_page(wname)
    if not html:
        notes.append(f"MISSING PAGE: {wname}")
        continue
    soup = BeautifulSoup(html, "lxml")
    stats = parse_stats(soup)
    rng = parse_range(stats.get("Range"))
    tgt = parse_targets(stats.get("Unit Type Targeted")) or "b"
    if rng:
        for th in ths:
            th_weapon[th] = {"min": rng[0], "max": rng[1], "t": tgt}
    else:
        notes.append(f"no range on {wname} page: {stats}")
# TH17/18: eagle-merged town hall — reuse Eagle Artillery reach if scraped.
if "eagle_artillery" in defs:
    for th in (17, 18):
        th_weapon[th] = {"min": defs["eagle_artillery"]["min"],
                         "max": defs["eagle_artillery"]["max"], "t": defs["eagle_artillery"]["t"]}

sizes.setdefault("wall", [1, 1])

data = {
    "updated": datetime.date.today().isoformat(),
    "grid": 44,
    "sizes": sizes,
    "defs": defs,
    "thWeapon": th_weapon,
}

js = ("// Building footprints, ranges & target types — generated " + data["updated"] +
      " from clashofclans.fandom.com (rerun tools/scrape_layout.py to refresh)\n" +
      "window.COC_LAYOUT = " + json.dumps(data, separators=(",", ":")) + ";\n")
open(OUT, "w").write(js)

print(f"wrote {OUT} ({len(js) // 1024}KB): {len(sizes)} sizes, {len(defs)} combat entries, "
      f"thWeapon for TH{sorted(th_weapon)}")
for n in notes:
    print("  •", n)
