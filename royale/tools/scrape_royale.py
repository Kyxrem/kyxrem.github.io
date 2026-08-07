#!/usr/bin/env python3
"""Scrape Clash Royale card data from clashroyale.fandom.com into data.js.

Collects: canonical card list (from rarity categories), per-card infobox
(rarity, elixir, type, arena), per-level stat tables, rarity upgrade tables
(cards + gold per level) from the Cards page, and king-level XP if available.
"""
import json, os, re, sys, hashlib, urllib.request, urllib.parse, datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "cache")
os.makedirs(CACHE, exist_ok=True)
API = "https://clashroyale.fandom.com/api.php"
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "data.js")


def api_call(**params):
    params.update(dict(format="json"))
    url = API + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "cr-analyzer-scraper/1.0"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.loads(r.read().decode())


def fetch(page):
    fn = os.path.join(CACHE, hashlib.md5(page.encode()).hexdigest() + ".html")
    if os.path.exists(fn):
        return open(fn, encoding="utf-8").read()
    for _ in range(3):
        try:
            d = api_call(action="parse", page=page, prop="text", redirects="1")
            if "error" in d:
                return None
            html = d["parse"]["text"]["*"]
            open(fn, "w", encoding="utf-8").write(html)
            return html
        except Exception:
            pass
    return None


def clean(x):
    return re.sub(r"\[[^\]]*\]", "", x).replace("\xa0", " ").strip()


def num(x):
    x = clean(x).replace(",", "")
    if not x or x.upper() in ("N/A", "-", "?", "NONE"):
        return None
    m = re.search(r"-?\d+(?:\.\d+)?", x)
    return float(m.group(0)) if m else None


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def category_members(cat):
    names, cont = [], {}
    while True:
        d = api_call(action="query", list="categorymembers", cmtitle=cat, cmlimit="500", **cont)
        names += [m["title"] for m in d["query"]["categorymembers"] if m.get("ns", 0) == 0]
        if "continue" in d:
            cont = {"cmcontinue": d["continue"]["cmcontinue"]}
        else:
            break
    return names


# ---- canonical card list from rarity categories ----
RARITY_CATS = [("common", "Category:Common Cards"), ("rare", "Category:Rare Cards"),
               ("epic", "Category:Epic Cards"), ("legendary", "Category:Legendary Cards"),
               ("champion", "Category:Champion Cards")]
NOT_CARDS = {"Cards", "Heroes", "Card Evolution", "Battle Decks", "Trade Tokens",
             "Card Chance Calculator", "Elite Wild Card", "Wild Card"}

rarity_of = {}
for rar, cat in RARITY_CATS:
    for t in category_members(cat):
        if "/" in t or t in NOT_CARDS or t.startswith(("Category:", "Template:")):
            continue
        rarity_of.setdefault(t, rar)
tower_troops = [t for t in category_members("Category:Tower Troop Cards")
                if "/" not in t and t not in NOT_CARDS]
evolutions = set()
for t in category_members("Category:Troop Cards") + category_members("Category:Spell Cards") + \
         category_members("Category:Building Cards"):
    if t.endswith("/Evolution"):
        evolutions.add(t.split("/")[0])
print(f"cards by rarity: {len(rarity_of)}, tower troops: {len(tower_troops)}, evolutions: {len(evolutions)}")


def parse_infobox(soup):
    out = {}
    aside = soup.find("aside")
    if not aside:
        return out
    txt = aside.get_text("|", strip=True)
    m = re.search(r"Elixir Cost\|(\d+|\?)", txt)
    if m and m.group(1) != "?":
        out["elixir"] = int(m.group(1))
    m = re.search(r"Rarity\|(\w+)", txt)
    if m:
        out["rarity"] = m.group(1).lower()
    m = re.search(r"Type\|([\w\s]+?)\|", txt)
    if m:
        out["type"] = m.group(1).strip().lower()
    m = re.search(r"Arena\|([^|]+?)\|", txt)
    if m:
        out["arena"] = m.group(1).strip()
    return out


def parse_stats(soup):
    """First table whose header starts with Level and has >= 6 data rows."""
    for tbl in soup.find_all("table"):
        cls = " ".join(tbl.get("class") or [])
        if "wikitable" not in cls:
            continue
        trs = tbl.find_all("tr")
        if len(trs) < 7:
            continue
        heads = [clean(c.get_text(" ", strip=True)) for c in trs[0].find_all(["th", "td"])]
        if not heads or heads[0].lower() != "level" or len(heads) < 2:
            continue
        rows = []
        for tr in trs[1:]:
            cells = [clean(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
            if not cells:
                continue
            lvl = num(cells[0])
            if lvl is None or lvl != int(lvl) or lvl > 20:
                continue
            rows.append([int(lvl)] + [cells[i] if i < len(cells) else "" for i in range(1, len(heads))])
        if len(rows) >= 6:
            return {"headers": heads[1:8], "rows": [r[:8] for r in rows]}
    return None


def scrape_card(name, rar, ctype):
    html = fetch(name)
    if not html:
        return {"name": name, "rarity": rar, "type": ctype, "error": "no page"}
    soup = BeautifulSoup(html, "lxml")
    info = parse_infobox(soup)
    out = {"id": slug(name), "name": name,
           "rarity": info.get("rarity", rar) if rar != "tower" else "common",
           "type": ctype or info.get("type", ""), "arena": info.get("arena", "")}
    if rar == "tower":
        out["type"] = "tower"
        out["towerRarity"] = info.get("rarity", "common")
    if "elixir" in info:
        out["elixir"] = info["elixir"]
    stats = parse_stats(soup)
    if stats:
        out["stats"] = stats
    out["evo"] = name in evolutions
    return out


jobs = [(n, r, None) for n, r in sorted(rarity_of.items())] + [(n, "tower", "tower") for n in sorted(tower_troops)]
cards = []
with ThreadPoolExecutor(max_workers=6) as ex:
    futs = {ex.submit(scrape_card, n, r, t): n for n, r, t in jobs}
    for f in as_completed(futs):
        c = f.result()
        cards.append(c)
        if "error" in c:
            print("ERR", c["name"])
missing_stats = [c["name"] for c in cards if "stats" not in c and "error" not in c]
print(f"cards scraped: {len(cards)}, without per-level stats: {len(missing_stats)}: {missing_stats[:14]}")

# ---- rarity upgrade tables from Cards page ----
html = fetch("Cards")
soup = BeautifulSoup(html, "lxml")
RARS = ["common", "rare", "epic", "legendary", "champion"]


def parse_rarity_table(soup, header_word):
    for tbl in soup.find_all("table"):
        trs = tbl.find_all("tr")
        if len(trs) < 10:
            continue
        h = clean(trs[0].get_text(" ", strip=True)).lower()
        if "card level" not in h or header_word not in h:
            continue
        out = {r: {} for r in RARS}
        for tr in trs[2:]:
            cells = [clean(c.get_text(" ", strip=True)) for c in tr.find_all(["th", "td"])]
            if not cells or cells[0].lower() == "total":
                continue
            lvl = num(cells[0])
            if lvl is None:
                continue
            for i, r in enumerate(RARS):
                v = num(cells[i + 1]) if i + 1 < len(cells) else None
                if v is not None:
                    out[r][int(lvl)] = int(v)
        return out
    return None


cards_needed = parse_rarity_table(soup, "number of cards")
gold_needed = parse_rarity_table(soup, "gold required")
assert cards_needed and gold_needed, "rarity tables not found"
max_lvl = max(max(v) for v in cards_needed.values() if v)
rarities = {}
for r in RARS:
    levels = []
    for lvl in range(1, max_lvl + 1):
        c = cards_needed[r].get(lvl)
        g = gold_needed[r].get(lvl)
        if c is None and g is None and not levels:
            continue  # below start level
        levels.append({"lvl": lvl, "cards": c or 0, "gold": g or 0})
    rarities[r] = {"start": levels[0]["lvl"] if levels else 1, "levels": levels}
print("rarity start levels:", {r: rarities[r]["start"] for r in RARS}, "| max level:", max_lvl)

# ---- king levels (Experience page) ----
king = []
html = fetch("Experience")
if html:
    soup = BeautifulSoup(html, "lxml")
    for tbl in soup.find_all("table"):
        trs = tbl.find_all("tr")
        if len(trs) < 10:
            continue
        heads = [clean(c.get_text(" ", strip=True)).lower() for c in trs[0].find_all(["th", "td"])]
        if not heads or "level" not in heads[0] or not any("experience" in h or "xp" in h for h in heads):
            continue
        for tr in trs[1:]:
            cells = [clean(c.get_text(" ", strip=True)) for c in tr.find_all(["td", "th"])]
            lvl = num(cells[0]) if cells else None
            xp = num(cells[1]) if len(cells) > 1 else None
            if lvl is not None and lvl == int(lvl) and lvl <= 100:
                king.append({"lvl": int(lvl), "xp": int(xp) if xp else 0})
        if king:
            break
print("king levels:", len(king))

cards.sort(key=lambda c: (c.get("type") == "tower", RARS.index(c["rarity"]) if c["rarity"] in RARS else 9, c["name"]))
data = {
    "meta": {"generated": datetime.date.today().isoformat(), "source": "clashroyale.fandom.com",
             "maxLevel": max_lvl},
    "rarities": rarities,
    "cards": [c for c in cards if "error" not in c],
    "king": king,
}
js = "// Clash Royale card data — generated " + data["meta"]["generated"] + \
     " from clashroyale.fandom.com (see tools/scrape_royale.py)\n" + \
     "window.CR_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n"
os.makedirs(os.path.dirname(os.path.abspath(OUT)), exist_ok=True)
open(OUT, "w").write(js)
print(f"wrote {OUT} ({len(js)//1024}KB)")
