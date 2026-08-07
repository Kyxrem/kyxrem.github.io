#!/usr/bin/env python3
"""Scrape current meta decks (ladder + ranked) from deckshop.pro into decks.js.

Sections used: "New Meta! decks" (ranked/current meta) and "Top Ladder decks".
Evolution slots are marked with an evo- prefix in the deck URL slugs.
"""
import json, os, re, sys, datetime, urllib.request
from bs4 import BeautifulSoup

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "decks.js")
URL = "https://www.deckshop.pro/best-decks/"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126 Safari/537.36"

# deckshop slug -> our card id (slug rules differ for a few names)
SPECIAL = {
    "pekka": "p_e_k_k_a", "mini_pekka": "mini_p_e_k_k_a", "battle_ram": "battle_ram",
    "spear_goblins": "spear_goblins", "three_musketeers": "three_musketeers",
}


def to_id(slug):
    s = slug.strip().lower().replace("-", "_")
    return SPECIAL.get(s, s)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return r.read().decode("utf-8", "replace")


def name_to_id(name):
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def parse_sections(html, wanted):
    """wanted: {header-substring: group-key}; returns {key: [deck,...]}"""
    soup = BeautifulSoup(html, "lxml")
    out = {k: [] for k in wanted.values()}
    for h in soup.find_all(["h1", "h2"]):
        txt = re.sub(r"\s+", " ", h.get_text(" ", strip=True))
        key = next((v for sub, v in wanted.items() if sub.lower() in txt.lower()), None)
        if not key:
            continue
        seen = set()
        for sib in h.find_all_next():
            if sib.name in ("h1", "h2") and sib is not h:
                t2 = re.sub(r"\s+", " ", sib.get_text(" ", strip=True))
                if t2 and t2 != txt:
                    break
            if sib.name == "a" and (sib.get("href") or "").startswith("/deck/detail/"):
                href = sib["href"]
                if href in seen:
                    continue
                seen.add(href)
                slugs = href.split("/deck/detail/")[1].split("?")[0].split(",")
                if len(slugs) != 8:
                    continue
                # evolved slots are marked with an evo- prefix in the URL slugs
                cards, evo = [], []
                for sl in slugs:
                    cid = to_id(sl)
                    if cid.startswith("evo_"):
                        cid = cid[4:]
                        evo.append(cid)
                    cards.append(cid)
                out[key].append({"cards": cards, "evo": evo})
    return out


html = fetch(URL)
groups = parse_sections(html, {"New Meta! decks": "ranked", "Top Ladder decks": "ladder"})

# fetch each deck's detail page for the official in-game copy link
# (contains numeric card ids + evolution slots + tower troop)
import time
link_cache = {}
for decks in groups.values():
    for d in decks:
        slug_path = ",".join(
            ("evo-" if c in d["evo"] else "") + c.replace("_", "-").replace("p-e-k-k-a", "pekka").replace("mini-pekka", "mini-pekka")
            for c in d["cards"])
        # rebuild deckshop slugs: reverse the special-case mapping
        rev = {"p_e_k_k_a": "pekka", "mini_p_e_k_k_a": "mini-pekka"}
        slug_path = ",".join(("evo-" if c in d["evo"] else "") + rev.get(c, c.replace("_", "-")) for c in d["cards"])
        if slug_path in link_cache:
            d["link"] = link_cache[slug_path]
            continue
        try:
            dhtml = fetch("https://www.deckshop.pro/deck/detail/" + slug_path)
            m = re.search(r'(?:https?://)?link\.clashroyale\.com/[^"\s]*copyDeck[^"\s]*', dhtml)
            if m:
                link = m.group(0)
                if not link.startswith("http"):
                    link = "https://" + link
                link = link.replace("&amp;", "&")
                d["link"] = link
                link_cache[slug_path] = link
        except Exception as e:
            print("  ! detail fetch failed:", slug_path, e)
        time.sleep(0.6)
print(f"copy links captured: {sum(1 for g in groups.values() for d in g if d.get('link'))}")
for k, decks in groups.items():
    print(f"{k}: {len(decks)} decks")
    for d in decks[:3]:
        print("   ", ",".join(d["cards"]), "| evo:", d["evo"])

# validate ids against card data if present
data_fp = os.path.join(os.path.dirname(os.path.abspath(OUT)), "data.js")
known = set()
if os.path.exists(data_fp):
    m = re.search(r"window\.CR_DATA = (.*);\n$", open(data_fp).read(), re.S)
    if m:
        known = {c["id"] for c in json.loads(m.group(1))["cards"]}
unknown = set()
for decks in groups.values():
    for d in decks:
        d["unknown"] = [c for c in d["cards"] if known and c not in known]
        unknown.update(d["unknown"])
print("unknown card ids across decks:", sorted(unknown) or "none")

data = {
    "updated": datetime.date.today().isoformat(),
    "source": "deckshop.pro/best-decks",
    "groups": [
        {"key": "ranked", "label": "Ranked · current meta", "decks": groups.get("ranked", [])},
        {"key": "ladder", "label": "Top Ladder", "decks": groups.get("ladder", [])},
    ],
}
js = "// Meta deck snapshot — generated " + data["updated"] + \
     " from deckshop.pro (rerun tools/scrape_decks.py to refresh)\n" + \
     "window.CR_DECKS = " + json.dumps(data, separators=(",", ":")) + ";\n"
open(OUT, "w").write(js)
print(f"wrote {OUT} ({len(js)//1024}KB)")
