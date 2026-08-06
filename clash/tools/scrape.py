#!/usr/bin/env python3
"""Scrape Clash of Clans upgrade data (home village) from clashofclans.fandom.com.

Produces raw.json with per-item level tables (cost/time/req/dps/hp), per-TH
availability counts, unlock requirements, and hero-equipment ore costs.
A separate build step turns this into the app's data.js.
"""
import json, os, re, sys, hashlib, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)
API = "https://clashofclans.fandom.com/api.php"

ITEMS = {
    "defense": ["Cannon", "Archer Tower", "Mortar", "Air Defense", "Wizard Tower",
                 "Air Sweeper", "Hidden Tesla", "Bomb Tower", "X-Bow", "Inferno Tower",
                 "Eagle Artillery", "Scattershot", "Spell Tower", "Monolith",
                 "Multi-Archer Tower", "Ricochet Cannon", "Multi-Gear Tower",
                 "Firespitter", "Builder's Hut"],
    "trap": ["Bomb", "Spring Trap", "Air Bomb", "Giant Bomb", "Seeking Air Mine",
              "Skeleton Trap", "Tornado Trap", "Giga Bomb"],
    "resource": ["Gold Mine", "Elixir Collector", "Dark Elixir Drill", "Gold Storage",
                  "Elixir Storage", "Dark Elixir Storage"],
    "army": ["Army Camp", "Barracks", "Dark Barracks", "Laboratory", "Spell Factory",
              "Dark Spell Factory", "Clan Castle", "Workshop", "Pet House",
              "Blacksmith", "Hero Hall"],
    "troop": ["Barbarian", "Archer", "Giant", "Goblin", "Wall Breaker", "Balloon",
               "Wizard", "Healer", "Dragon", "P.E.K.K.A", "Baby Dragon", "Miner",
               "Electro Dragon", "Yeti", "Dragon Rider", "Electro Titan", "Root Rider",
               "Thrower"],
    "dark_troop": ["Minion", "Hog Rider", "Valkyrie", "Golem", "Witch", "Lava Hound",
                    "Bowler", "Ice Golem", "Headhunter", "Apprentice Warden", "Druid",
                    "Furnace"],
    "spell": ["Lightning Spell", "Healing Spell", "Rage Spell", "Jump Spell",
               "Freeze Spell", "Clone Spell", "Invisibility Spell", "Recall Spell",
               "Revive Spell"],
    "dark_spell": ["Poison Spell", "Earthquake Spell", "Haste Spell", "Skeleton Spell",
                    "Bat Spell", "Overgrowth Spell"],
    "siege": ["Wall Wrecker", "Battle Blimp", "Stone Slammer", "Siege Barracks",
               "Log Launcher", "Flame Flinger", "Battle Drill", "Troop Launcher",
               "Sky Wagon"],
    "pet": ["L.A.S.S.I", "Electro Owl", "Mighty Yak", "Unicorn", "Frosty", "Diggy",
             "Poison Lizard", "Phoenix", "Spirit Fox", "Angry Jelly", "Sneezy",
             "Greedy Raven"],
    "hero": ["Barbarian King", "Archer Queen", "Minion Prince", "Grand Warden",
              "Royal Champion"],
    "wall": ["Walls"],
    "townhall": ["Town Hall"],
}

RES_NAMES = {"Gold", "Elixir", "Dark Elixir", "Gems", "Shiny Ore", "Glowy Ore", "Starry Ore"}
SKIP_HDR = re.compile(r"cumulative|gear\s*up|boost|catch")


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


def clean(s):
    s = re.sub(r"\[[^\]]*\]", "", s)
    return s.replace("\xa0", " ").strip()


def num(s):
    s = clean(s)
    s = re.sub(r"[*†‡]", "", s).replace(",", "").strip()
    if not s or s.upper() in ("N/A", "-", "?", "NONE"):
        return None
    m = re.search(r"(\d+(?:\.\d+)?)", s)
    return float(m.group(1)) if m else None


def parse_time_h(s):
    s = clean(s).lower()
    if not s or s in ("n/a", "-", "?", "none", "instant"):
        return 0.0
    total = 0.0
    for val, unit in re.findall(r"(\d+(?:\.\d+)?)\s*([wdhms])", s):
        total += float(val) * {"w": 168, "d": 24, "h": 1, "m": 1 / 60, "s": 1 / 3600}[unit]
    return round(total, 4)


def table_grid(tbl):
    """Expand a table into a rowspan/colspan-aware grid of {t: text, c: cell}."""
    grid = []
    pending = {}  # col index -> [cell_dict, remaining_rows]
    for tr in tbl.find_all("tr"):
        row = []
        col = 0
        cells = tr.find_all(["th", "td"], recursive=False) or tr.find_all(["th", "td"])
        ci = 0
        while ci < len(cells) or col in pending:
            if col in pending:
                cd, rem = pending[col]
                row.append(cd)
                if rem <= 1:
                    del pending[col]
                else:
                    pending[col][1] = rem - 1
                col += 1
                continue
            if ci >= len(cells):
                break
            c = cells[ci]
            ci += 1
            cs = int(c.get("colspan") or 1)
            rs = int(c.get("rowspan") or 1)
            cd = {"t": clean(c.get_text(" ", strip=True)), "c": c}
            for k in range(cs):
                row.append(cd)
                if rs > 1:
                    pending[col + k] = [cd, rs - 1]
            col += cs
        grid.append(row)
    return grid


def cell_resource(cell, allow_gems=False):
    found = []
    for a in cell.find_all(["a", "img"]):
        t = (a.get("title") or a.get("alt") or "").strip()
        if t in RES_NAMES:
            found.append(t)
    pref = [f for f in found if f != "Gems"]
    if pref:
        return pref[0]
    return found[0] if (found and allow_gems) else None


HDR_MAP = [
    (r"^(th\s*)?level$", "level"),
    (r"(?:^|\s)cost$", "cost"),
    (r"(?:^|\s)time$", "time"),
    (r"town\s*hall.*required", "th"),
    (r"laboratory.*required", "lab"),
    (r"hero\s*hall.*required", "hh"),
    (r"pet\s*house.*required", "ph"),
    (r"blacksmith.*required", "bs"),
    (r"^damage\s*per\s*second", "dps"),
    (r"^hitpoints", "hp"),
    (r"(storage|troop|spell)\s*capacity", "cap"),
]


def map_columns(headers):
    cols = {}
    for i, h in enumerate(headers):
        hl = re.sub(r"[*†‡]", "", h).strip().lower()
        if SKIP_HDR.search(hl):
            continue
        for pat, key in HDR_MAP:
            if re.search(pat, hl) and key not in cols:
                cols[key] = i
                break
    return cols


def parse_upgrade_table(soup):
    """Return (rows, resource) from the most plausible upgrade table."""
    best = None
    for tbl in soup.find_all("table"):
        cls = " ".join(tbl.get("class") or [])
        if "wikitable" not in cls:
            continue
        grid = table_grid(tbl)
        if len(grid) < 2 or len(grid[0]) < 3:
            continue
        headers = [cd["t"] for cd in grid[0]]
        cols = map_columns(headers)
        if "level" not in cols or "cost" not in cols:
            continue
        resource = cell_resource(grid[0][cols["cost"]]["c"])
        rows = []
        for grow in grid[1:]:
            def cv(key):
                i = cols.get(key)
                return grow[i]["t"] if i is not None and i < len(grow) else None
            lvl = num(cv("level") or "")
            if lvl is None or lvl != int(lvl) or lvl > 500:
                continue
            cost = num(cv("cost") or "")
            row = {"level": int(lvl), "cost": int(cost) if cost else 0,
                   "time_h": parse_time_h(cv("time") or "")}
            for k in ("th", "lab", "hh", "ph", "bs"):
                v = num(cv(k) or "")
                if v is not None:
                    row[k] = int(v)
            for k in ("dps", "hp", "cap"):
                v = num(cv(k) or "")
                if v is not None:
                    row[k] = v
            if resource is None and cols.get("cost") is not None and cols["cost"] < len(grow):
                rr = cell_resource(grow[cols["cost"]]["c"])
                if rr:
                    row["res"] = rr
            rows.append(row)
        # dedupe by level; require contiguous ascending from first
        seen, uniq = set(), []
        for r in rows:
            if r["level"] not in seen:
                seen.add(r["level"])
                uniq.append(r)
        uniq.sort(key=lambda r: r["level"])
        # keep the longest run starting at level 1 (drops stray stat rows)
        run = [r for r in uniq if r["level"] == len([x for x in uniq if x["level"] < r["level"]]) + uniq[0]["level"]] if uniq else []
        if uniq and uniq[0]["level"] == 1:
            run = []
            expect = 1
            for r in uniq:
                if r["level"] == expect:
                    run.append(r)
                    expect += 1
            uniq = run
        n_cost = sum(1 for r in uniq if r["cost"] > 0)
        if uniq and (best is None or n_cost > best[2]):
            best = (uniq, resource, n_cost)
    return (best[0], best[1]) if best else (None, None)


def parse_counts(soup):
    """Parse horizontal 'Town Hall Level / Number Available' band tables,
    including unlabeled continuation rows (TH 10-18 bands)."""
    counts = {}
    for tbl in soup.find_all("table"):
        cls = " ".join(tbl.get("class") or [])
        if "article-table" not in cls and "wikitable" not in cls:
            continue
        grid = table_grid(tbl)
        rows = [[cd["t"] for cd in grow] for grow in grid]
        i = 0
        while i + 1 < len(rows):
            a, b = rows[i], rows[i + 1]
            la = a[0].lower() if a else "x"
            ok_label = la == "" or "town hall" in la
            if ok_label and len(a) >= 3 and len(b) == len(a):
                ths = [num(x) for x in a[1:]]
                if all(t is not None and 1 <= t <= 20 and t == int(t) for t in ths) and \
                   all(ths[j + 1] == ths[j] + 1 for j in range(len(ths) - 1)):
                    lb = b[0].lower()
                    if lb == "" or "available" in lb or "number" in lb:
                        ns = [num(x) for x in b[1:]]
                        for t, n in zip(ths, ns):
                            counts[int(t)] = int(n) if n is not None else 0
                        i += 2
                        continue
            i += 1
    return counts


UNLOCK_PAT = re.compile(
    r"^(barracks|dark barracks|spell factory|dark spell factory|workshop|siege workshop|pet house)\s*level\s*required$", re.I)


def parse_unlock(soup):
    """Find 'X Level Required' in small stats tables -> (building, level)."""
    for tbl in soup.find_all("table"):
        cls = " ".join(tbl.get("class") or [])
        if "wikitable" not in cls:
            continue
        grid = table_grid(tbl)
        if not (2 <= len(grid) <= 3):
            continue
        headers = [cd["t"] for cd in grid[0]]
        vals = [cd["t"] for cd in grid[1]] if len(grid) > 1 else []
        for i, h in enumerate(headers):
            m = UNLOCK_PAT.match(re.sub(r"[*†‡]", "", h).strip())
            if m and i < len(vals):
                v = num(vals[i])
                if v is not None:
                    return {"building": m.group(1).title(), "level": int(v)}
    return None


def parse_blacksmith_caps(soup):
    for tbl in soup.find_all("table"):
        cls = " ".join(tbl.get("class") or [])
        if "wikitable" not in cls:
            continue
        grid = table_grid(tbl)
        if len(grid) < 3:
            continue
        headers = [cd["t"] for cd in grid[0]]
        if not any("maximum equipment" in h.lower() for h in headers):
            continue
        start = next(i for i, h in enumerate(headers) if "maximum equipment" in h.lower())
        cols = map_columns(headers)
        caps = []
        for grow in grid[1:]:
            cells = [cd["t"] for cd in grow]
            lvl = num(cells[0]) if cells else None
            if lvl is None:
                continue
            common = num(cells[start]) if start < len(cells) else None
            epic = num(cells[start + 1]) if start + 1 < len(cells) else None
            th = num(cells[cols["th"]]) if "th" in cols and cols["th"] < len(cells) else None
            if common and epic:
                caps.append({"level": int(lvl), "common": int(common), "epic": int(epic),
                             "th": int(th or 0)})
        if caps:
            return caps
    return None


def parse_equipment_table(soup):
    for tbl in soup.find_all("table"):
        cls = " ".join(tbl.get("class") or [])
        if "wikitable" not in cls:
            continue
        grid = table_grid(tbl)
        if len(grid) < 3:
            continue
        h1 = [cd["t"] for cd in grid[0]]
        if not any("upgrade cost" in h.lower() for h in h1) or \
           not any("blacksmith" in h.lower() for h in h1):
            continue
        h2 = [cd["t"] for cd in grid[1]]
        ore_names = [h for h in h2 if re.search(r"(shiny|glowy|starry)\s*ore", h, re.I)]
        n_ores = len(dict.fromkeys(ore_names))
        ore_keys = list(dict.fromkeys(n.split()[0].lower() for n in ore_names))
        rows = []
        for grow in grid[1:]:
            cells = [cd["t"] for cd in grow]
            if len(cells) < n_ores + 2:
                continue
            lvl = num(cells[0])
            if lvl is None or lvl != int(lvl) or lvl > 40:
                continue
            bs_req = num(cells[-1])
            ores = [num(x) or 0 for x in cells[-1 - n_ores:-1]]
            row = {"level": int(lvl), "bs": int(bs_req or 0)}
            for k, v in zip(ore_keys, ores):
                row[k] = int(v)
            rows.append(row)
        seen, uniq = set(), []
        for r in rows:
            if r["level"] not in seen:
                seen.add(r["level"])
                uniq.append(r)
        uniq.sort(key=lambda r: r["level"])
        if uniq and uniq[0]["level"] == 1:
            return uniq
    return None


def scrape_item(name, cat):
    page, html = get_page(name)
    if not html:
        return {"name": name, "cat": cat, "error": "page not found"}
    soup = BeautifulSoup(html, "lxml")
    rows, resource = parse_upgrade_table(soup)
    out = {"name": name, "cat": cat, "page": page, "resource": resource}
    if rows:
        out["levels"] = rows
    else:
        out["error"] = "no upgrade table"
    counts = parse_counts(soup)
    if counts:
        out["counts"] = counts
    if cat in ("troop", "dark_troop", "spell", "dark_spell", "siege", "pet"):
        u = parse_unlock(soup)
        if u:
            out["unlock"] = u
    if name == "Blacksmith":
        caps = parse_blacksmith_caps(soup)
        if caps:
            out["equip_caps"] = caps
    return out


def scrape_equipment(name):
    page, html = get_page(name)
    if not html:
        return None
    soup = BeautifulSoup(html, "lxml")
    rows = parse_equipment_table(soup)
    if not rows:
        return None
    rarity = "epic" if len(rows) > 20 else "common"
    return {"name": name, "cat": "equipment", "page": page, "rarity": rarity, "levels": rows}


def equipment_names():
    d = api_call(action="query", list="categorymembers", cmtitle="Category:Hero Equipment", cmlimit="200")
    names = []
    for m in d.get("query", {}).get("categorymembers", []):
        t = m["title"]
        if m.get("ns", 0) != 0 or ":" in t or t in ("Hero Equipment", "Noble Iron"):
            continue
        names.append(t)
    return names


def main():
    jobs = [(n, cat) for cat, names in ITEMS.items() for n in names]
    results = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(scrape_item, n, c): (n, c) for n, c in jobs}
        for f in as_completed(futs):
            r = f.result()
            results.append(r)
            tag = "OK " if "levels" in r else "ERR"
            u = r.get("unlock")
            print(f"{tag} {r['cat']:>10} {r['name']:<22} lv={len(r.get('levels', [])):<3} res={r.get('resource')} "
                  f"counts={len(r.get('counts', {}))} unlock={u['building'] + ' ' + str(u['level']) if u else '-'}")
    eq_names = equipment_names()
    equipment = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = {ex.submit(scrape_equipment, n): n for n in eq_names}
        for f in as_completed(futs):
            r = f.result()
            n = futs[f]
            if r:
                equipment.append(r)
            else:
                print(f"SKIP equipment {n} (no ore table)")
    print(f"equipment parsed: {len(equipment)}/{len(eq_names)}")
    out = {"items": results, "equipment": equipment}
    with open(os.path.join(HERE, "raw.json"), "w") as f:
        json.dump(out, f, indent=1)
    print(f"wrote raw.json: {len(results)} items, {len(equipment)} equipment")


if __name__ == "__main__":
    main()
