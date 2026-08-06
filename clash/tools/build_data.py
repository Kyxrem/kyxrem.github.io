#!/usr/bin/env python3
"""Transform raw.json (scraped wiki data) into the app's data.js.

Level rows are packed as arrays: [lvl, cost, time_h, th, dps, hp, cap]
where th is the Town Hall level at which that upgrade becomes available.
"""
import json, os, re, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "data.js")
raw = json.load(open(os.path.join(HERE, "raw.json")))
items = {i["name"]: i for i in raw["items"]}
MAX_TH = 18


def slug(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def th_map_of(building):
    """building level -> TH available (from its own upgrade rows)."""
    m = {}
    for r in items[building]["levels"]:
        th = r.get("th")
        if th:
            m[r["level"]] = th
    # level 1 fallback: first TH where count > 0
    if 1 not in m:
        cnts = items[building].get("counts") or {}
        firsts = [int(t) for t, n in cnts.items() if n > 0]
        m[1] = min(firsts) if firsts else 1
    return m


LAB_TH = th_map_of("Laboratory")
PH_TH = th_map_of("Pet House")
HH_TH = th_map_of("Hero Hall")
UNLOCK_MAPS = {
    "Barracks": th_map_of("Barracks"),
    "Dark Barracks": th_map_of("Dark Barracks"),
    "Spell Factory": th_map_of("Spell Factory"),
    "Dark Spell Factory": th_map_of("Dark Spell Factory"),
    "Workshop": th_map_of("Workshop"),
    "Siege Workshop": th_map_of("Workshop"),
    "Pet House": PH_TH,
}

RES_KEY = {"Gold": "gold", "Elixir": "elixir", "Dark Elixir": "dark"}
RES_OVERRIDE = {
    "Gold Mine": "elixir", "Elixir Collector": "gold", "Dark Elixir Drill": "elixir",
    "Gold Storage": "elixir", "Elixir Storage": "gold", "Dark Elixir Storage": "elixir",
    "Builder's Hut": "gold", "Walls": "gold",
}
MERGES = {
    "Ricochet Cannon": {"source": "cannon", "per": 2},
    "Multi-Archer Tower": {"source": "archer_tower", "per": 2},
    "Multi-Gear Tower": {"sources": [["cannon", 1], ["archer_tower", 1]]},
}

warnings = []


def pack_levels(it, kind):
    name = it["name"]
    rows = it["levels"]
    packed = []
    for r in rows:
        lvl, cost, t = r["level"], r["cost"], round(r["time_h"], 3)
        th = None
        if kind in ("building", "hero", "townhall", "wall"):
            th = r.get("th")
            if kind == "hero" and th is None:
                th = HH_TH.get(r.get("hh"))
            if kind == "townhall":
                th = lvl
        elif kind == "lab":
            th = LAB_TH.get(r.get("lab")) if r.get("lab") else None
        elif kind == "pet":
            th = PH_TH.get(r.get("ph")) if r.get("ph") else None
        if th is None:
            if lvl == 1:
                u = it.get("unlock")
                if u and u["building"] in UNLOCK_MAPS:
                    th = UNLOCK_MAPS[u["building"]].get(u["level"])
                if th is None and packed == [] and len(rows) > 1:
                    nxt = rows[1]
                    th = (LAB_TH.get(nxt.get("lab")) if kind == "lab" else
                          PH_TH.get(nxt.get("ph")) if kind == "pet" else nxt.get("th"))
            else:
                prev_th = packed[-1][3] if packed else 1
                th = prev_th
                warnings.append(f"{name}: level {lvl} missing req, assumed TH{th}")
        if th is None:
            th = 1
            warnings.append(f"{name}: level 1 availability unknown, assumed TH1")
        packed.append([lvl, cost, t, th,
                       r.get("dps"), r.get("hp"), r.get("cap")])
    return packed


def counts_arr(it):
    c = it.get("counts") or {}
    return [c.get(str(t), 0) for t in range(1, MAX_TH + 1)]


data = {
    "meta": {
        "generated": datetime.date.today().isoformat(),
        "source": "clashofclans.fandom.com",
        "maxTH": MAX_TH,
        "levelKeys": ["lvl", "cost", "time", "th", "dps", "hp", "cap"],
    },
    "townHall": pack_levels(items["Town Hall"], "townhall"),
    "buildings": [],
    "walls": None,
    "labItems": [],
    "pets": [],
    "heroes": [],
    "equipment": [],
    "equipCaps": [],
}

for it in raw["items"]:
    name, cat = it["name"], it["cat"]
    if "levels" not in it:
        warnings.append(f"{name}: NO DATA — skipped")
        continue
    res = RES_OVERRIDE.get(name) or RES_KEY.get(it.get("resource") or "", None)
    if cat in ("defense", "trap", "resource", "army"):
        if res is None:
            res = "gold" if cat in ("defense", "trap") else "elixir"
            warnings.append(f"{name}: resource unknown, assumed {res}")
        b = {"id": slug(name), "name": name, "cat": cat, "res": res,
             "counts": counts_arr(it), "levels": pack_levels(it, "building")}
        if name == "Hero Hall":  # counts band on page is stale; derive from levels
            b["counts"] = [1 if any(r[3] and r[3] <= t for r in b["levels"]) else 0
                           for t in range(1, MAX_TH + 1)]
        if name in MERGES:
            b["merge"] = MERGES[name]
        data["buildings"].append(b)
    elif cat in ("troop", "dark_troop", "spell", "dark_spell", "siege"):
        lv = pack_levels(it, "lab")
        data["labItems"].append({"id": slug(name), "name": name, "cat": cat,
                                 "res": res or ("dark" if cat.startswith("dark") else "elixir"),
                                 "unlockTH": lv[0][3], "levels": lv})
    elif cat == "pet":
        lv = pack_levels(it, "pet")
        data["pets"].append({"id": slug(name), "name": name, "res": res or "dark",
                             "unlockTH": lv[0][3], "levels": lv})
    elif cat == "hero":
        lv = pack_levels(it, "hero")
        data["heroes"].append({"id": slug(name), "name": name, "res": res or "dark",
                               "unlockTH": lv[0][3], "levels": lv})
    elif cat == "wall":
        data["walls"] = {"res": "gold", "counts": counts_arr(it),
                         "levels": [[r["level"], r["cost"], 0, r.get("th", 1), None,
                                     r.get("hp"), None] for r in it["levels"]]}

for eq in raw["equipment"]:
    lv = [[r["level"], r.get("shiny", 0), r.get("glowy", 0), r.get("starry", 0), r["bs"]]
          for r in eq["levels"]]
    data["equipment"].append({"id": slug(eq["name"]), "name": eq["name"],
                              "rarity": eq["rarity"], "levels": lv})
data["equipment"].sort(key=lambda e: (e["rarity"], e["name"]))
data["equipCaps"] = [{"bs": c["level"], "common": c["common"], "epic": c["epic"], "th": c["th"]}
                     for c in items["Blacksmith"].get("equip_caps", [])]

# ---- sort stable ----
CAT_ORDER = {"defense": 0, "trap": 1, "resource": 2, "army": 3}
data["buildings"].sort(key=lambda b: (CAT_ORDER[b["cat"]], b["name"]))
LAB_ORDER = {"troop": 0, "dark_troop": 1, "spell": 2, "dark_spell": 3, "siege": 4}
data["labItems"].sort(key=lambda x: (LAB_ORDER[x["cat"]], x["unlockTH"], x["name"]))
data["pets"].sort(key=lambda x: (x["unlockTH"], x["name"]))
HERO_ORDER = ["barbarian_king", "archer_queen", "minion_prince", "grand_warden", "royal_champion"]
data["heroes"].sort(key=lambda h: HERO_ORDER.index(h["id"]))

# ---- report ----
def fmt(n):
    if n >= 1e9: return f"{n/1e9:.2f}B"
    if n >= 1e6: return f"{n/1e6:.1f}M"
    if n >= 1e3: return f"{n/1e3:.0f}K"
    return str(int(n))

print(f"buildings={len(data['buildings'])} labItems={len(data['labItems'])} pets={len(data['pets'])} "
      f"heroes={len(data['heroes'])} equipment={len(data['equipment'])}")
print(f"warnings ({len(warnings)}):")
for w in warnings:
    print("  !", w)

def max_lvl_at(levels, th):
    return max([r[0] for r in levels if r[3] and r[3] <= th] or [0])

# total cost to build+max EVERYTHING at TH18 (excluding TH itself, walls listed separately)
tot = {"gold": 0, "elixir": 0, "dark": 0, "time": 0.0}
for b in data["buildings"]:
    cnt = b["counts"][MAX_TH - 1]
    m = max_lvl_at(b["levels"], MAX_TH)
    for r in b["levels"]:
        if r[0] <= m:
            tot[b["res"]] += r[1] * cnt
            tot["time"] += r[2] * cnt
lab_t = 0.0
for x in data["labItems"] + data["pets"] + data["heroes"]:
    m = max_lvl_at(x["levels"], MAX_TH)
    for r in x["levels"]:
        if r[0] <= m:
            tot[x["res"]] += r[1]
            if x in data["heroes"]:
                tot["time"] += r[2]
            else:
                lab_t += r[2]
wall_gold = sum(r[1] for r in data["walls"]["levels"]) and \
    sum(sum(r[1] for r in data["walls"]["levels"] if r[0] <= max_lvl_at(data["walls"]["levels"], MAX_TH) and r[0] > 1) * 1 for _ in [0])
wall_total = data["walls"]["counts"][MAX_TH - 1] * sum(r[1] for r in data["walls"]["levels"])
print(f"\nFULL-MAX totals (TH{MAX_TH}, builds+upgrades, excl. walls/TH): "
      f"gold={fmt(tot['gold'])} elixir={fmt(tot['elixir'])} dark={fmt(tot['dark'])}")
print(f"  builder+hero time={tot['time']/24:.0f} days, lab time={lab_t/24:.0f} days")
print(f"  walls: {data['walls']['counts'][MAX_TH-1]} x cum-cost {fmt(sum(r[1] for r in data['walls']['levels']))} = {fmt(wall_total)}")
th13 = {"gold": 0, "elixir": 0, "dark": 0}
for b in data["buildings"]:
    cnt = b["counts"][12]
    m = max_lvl_at(b["levels"], 13)
    for r in b["levels"]:
        if r[0] <= m:
            th13[b["res"]] += r[1] * cnt
print(f"TH13 all-buildings cumulative: gold={fmt(th13['gold'])} elixir={fmt(th13['elixir'])} dark={fmt(th13['dark'])}")

js = "// Clash of Clans game data — generated " + data["meta"]["generated"] + \
     " from clashofclans.fandom.com (see tools/scraper)\n" + \
     "window.COC_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n"
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, "w").write(js)
print(f"\nwrote {OUT} ({len(js)//1024}KB)")
