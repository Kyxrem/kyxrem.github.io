/* Clash Analyzer — all client-side. Data comes from data.js (window.COC_DATA). */
(function () {
"use strict";

const D = window.COC_DATA;
const MAX_TH = D.meta.maxTH;

/* ---------------- data unpacking ---------------- */
function unpackRows(levels) {
  return levels.map(r => ({ lvl: r[0], cost: r[1], time: r[2], th: r[3], dps: r[4], hp: r[5], cap: r[6] }));
}
const BUILDINGS = D.buildings.map(b => ({ ...b, rows: unpackRows(b.levels) }));
const LAB = D.labItems.map(x => ({ ...x, rows: unpackRows(x.levels) }));
const PETS = D.pets.map(x => ({ ...x, rows: unpackRows(x.levels) }));
const HEROES = D.heroes.map(x => ({ ...x, rows: unpackRows(x.levels) }));
const WALLS = { ...D.walls, rows: unpackRows(D.walls.levels) };
const EQUIP = D.equipment.map(e => ({ ...e, rows: e.levels.map(r => ({ lvl: r[0], shiny: r[1], glowy: r[2], starry: r[3], bs: r[4] })) }));
const TH_ROWS = unpackRows(D.townHall);
const byId = {};
BUILDINGS.forEach(b => byId[b.id] = b);
LAB.forEach(x => byId[x.id] = x);
PETS.forEach(x => byId[x.id] = x);
HEROES.forEach(x => byId[x.id] = x);
EQUIP.forEach(x => byId[x.id] = x);

const RES_LABEL = { gold: "Gold", elixir: "Elixir", dark: "Dark Elixir" };
const CAT_LABEL = { defense: "Defenses", trap: "Traps", resource: "Resources", army: "Army",
  troop: "Troops", dark_troop: "Dark troops", spell: "Spells", dark_spell: "Dark spells", siege: "Siege machines" };

/* ---------------- state ---------------- */
const LS_KEY = "clashAnalyzerV1";
let state = null;

function freshState(th) {
  return {
    v: 1, th: th || 11, builders: 5, name: "", tag: "",
    buildings: {}, walls: {}, heroes: {}, lab: {}, pets: {}, equip: {},
    settings: { buildBoost: 0, labBoost: 0, wallRes: "gold",
      lootGold: 12000000, lootElixir: 12000000, lootDark: 60000 },
  };
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && s.v === 1) return s;
  } catch (e) {}
  return null;
}

/* ---------------- core engine ---------------- */
function maxLvlAt(rows, th) {
  let m = 0;
  for (const r of rows) if (r.th && r.th <= th && r.lvl > m) m = r.lvl;
  return m;
}
function builtCount(b) {
  const arr = state.buildings[b.id] || [];
  return arr.filter(l => l >= 1).length;
}
// Effective available count at TH, subtracting instances consumed by merged defenses.
// mode 'max': assume every merged defense that can exist at `th` is built.
// mode 'cur': subtract only merges the user has actually built.
function effCount(b, th, mode) {
  let n = b.counts[th - 1] || 0;
  for (const m of BUILDINGS) {
    if (!m.merge) continue;
    const mCount = mode === "max" ? (m.counts[th - 1] || 0)
      : Math.min(builtCount(m), m.counts[th - 1] || 0);
    if (!mCount) continue;
    if (m.merge.source === b.id) n -= mCount * m.merge.per;
    if (m.merge.sources) for (const [src, per] of m.merge.sources) if (src === b.id) n -= mCount * per;
  }
  return Math.max(0, n);
}
function cumCost(rows, toLvl) { // build + upgrades through toLvl
  let c = 0;
  for (const r of rows) if (r.lvl <= toLvl) c += r.cost;
  return c;
}
function cumTime(rows, toLvl) {
  let t = 0;
  for (const r of rows) if (r.lvl <= toLvl) t += r.time;
  return t;
}
function stepsBetween(rows, from, to) {
  return rows.filter(r => r.lvl > from && r.lvl <= to);
}

// normalize state to TH: clamp levels, fit instance arrays to effective counts
function normalize() {
  const th = state.th;
  for (const b of BUILDINGS) {
    const n = effCount(b, th, "cur");
    let arr = (state.buildings[b.id] || []).slice();
    const mx = maxLvlAt(b.rows, th);
    arr = arr.map(l => Math.max(0, Math.min(l, mx)));
    arr.sort((a, bb) => bb - a);
    if (arr.length > n) arr = arr.slice(0, n);
    while (arr.length < n) arr.push(0);
    state.buildings[b.id] = arr;
  }
  const wMax = maxLvlAt(WALLS.rows, th);
  const wCount = WALLS.counts[th - 1] || 0;
  let placed = 0;
  const walls = {};
  for (let l = wMax; l >= 1; l--) {
    let c = Math.max(0, Math.floor(state.walls[l] || 0));
    c = Math.min(c, wCount - placed);
    if (c > 0) walls[l] = c;
    placed += c;
  }
  if (placed < wCount) walls[1] = (walls[1] || 0) + (wCount - placed);
  state.walls = walls;
  for (const h of HEROES) {
    const mx = maxLvlAt(h.rows, th);
    state.heroes[h.id] = Math.max(0, Math.min(state.heroes[h.id] || 0, mx));
  }
  for (const x of LAB) {
    const mx = maxLvlAt(x.rows, th);
    const unlocked = x.unlockTH <= th;
    let l = state.lab[x.id] || 0;
    if (unlocked && l < 1) l = 1;
    state.lab[x.id] = Math.max(0, Math.min(l, mx));
  }
  for (const p of PETS) {
    const mx = maxLvlAt(p.rows, th);
    const unlocked = p.unlockTH <= th;
    let l = state.pets[p.id] || 0;
    if (unlocked && l < 1) l = Math.max(l, 0);
    state.pets[p.id] = Math.max(0, Math.min(l, mx));
  }
  for (const id of Object.keys(state.equip)) {
    const e = byId[id];
    if (!e) { delete state.equip[id]; continue; }
    state.equip[id] = Math.max(1, Math.min(state.equip[id], e.rarity === "epic" ? 27 : 18));
  }
}

function blacksmithLevel(mode) {
  const bs = byId.blacksmith;
  if (!bs) return 0;
  if (mode === "max") return maxLvlAt(bs.rows, state.th);
  const arr = state.buildings.blacksmith || [];
  return arr.length ? Math.max(...arr, 0) : 0;
}
function equipCapAt(bsLvl, rarity) {
  let cap = 0;
  for (const c of D.equipCaps) if (c.bs <= bsLvl) cap = rarity === "epic" ? c.epic : c.common;
  return cap;
}

/* ---------------- analysis ---------------- */
function emptyRes() { return { gold: 0, elixir: 0, dark: 0 }; }
// Progress weighting: dark elixir is ~100x scarcer per unit of farming effort,
// so cost-weighted percentages value it accordingly (raw totals stay unweighted).
const RES_W = { gold: 1, elixir: 1, dark: 100 };
function wcost(res, v) { return v * (RES_W[res] || 1); }

function analyze() {
  const th = state.th;
  const A = {
    cats: {}, totals: { res: emptyRes(), buildH: 0, labH: 0, petH: 0, heroH: 0,
      shiny: 0, glowy: 0, starry: 0 },
    counts: { done: 0, todo: 0 }, defense: { dpsNow: 0, dpsMax: 0, hpNow: 0, hpMax: 0 },
    storage: { gold: 0, elixir: 0, dark: 0 },
  };
  function cat(name) {
    return A.cats[name] || (A.cats[name] = { spent: 0, total: 0, timeRem: 0, res: emptyRes(), items: 0, maxed: 0 });
  }
  // buildings
  for (const b of BUILDINGS) {
    const n = effCount(b, th, "max");
    if (!n && !builtCount(b)) continue;
    const mx = maxLvlAt(b.rows, th);
    const c = cat(b.cat);
    const arr = (state.buildings[b.id] || []).slice();
    while (arr.length < n) arr.push(0);
    for (let i = 0; i < arr.length; i++) {
      const cur = arr[i];
      c.spent += wcost(b.res, cumCost(b.rows, cur));
      c.total += wcost(b.res, cumCost(b.rows, mx));
      c.items++;
      if (cur >= mx) c.maxed++;
      for (const s of stepsBetween(b.rows, cur, mx)) {
        c.res[b.res] += s.cost;
        c.timeRem += s.time;
        A.totals.res[b.res] += s.cost;
        A.totals.buildH += s.time;
        A.counts.todo++;
      }
      if (cur >= mx) A.counts.done++;
      // defense stats
      const curRow = b.rows.find(r => r.lvl === cur);
      const maxRow = b.rows.find(r => r.lvl === mx);
      if (b.cat === "defense") {
        if (curRow && curRow.dps) A.defense.dpsNow += curRow.dps;
        if (maxRow && maxRow.dps) A.defense.dpsMax += maxRow.dps;
        if (curRow && curRow.hp) A.defense.hpNow += curRow.hp;
        if (maxRow && maxRow.hp) A.defense.hpMax += maxRow.hp;
      }
      if (b.cat === "resource" && curRow && curRow.cap) {
        if (b.id === "gold_storage") A.storage.gold += curRow.cap;
        if (b.id === "elixir_storage") A.storage.elixir += curRow.cap;
        if (b.id === "dark_elixir_storage") A.storage.dark += curRow.cap;
      }
    }
  }
  // walls
  {
    const c = cat("walls");
    const mx = maxLvlAt(WALLS.rows, th);
    const total = WALLS.counts[th - 1] || 0;
    const full = cumCost(WALLS.rows, mx);
    c.total = total * full;
    c.items = total;
    for (const [lvlStr, cnt] of Object.entries(state.walls)) {
      const lvl = +lvlStr;
      c.spent += cnt * cumCost(WALLS.rows, lvl);
      if (lvl >= mx) c.maxed += cnt;
      else {
        const rem = (full - cumCost(WALLS.rows, lvl)) * cnt;
        c.res[state.settings.wallRes === "elixir" ? "elixir" : "gold"] += rem;
        A.totals.res[state.settings.wallRes === "elixir" ? "elixir" : "gold"] += rem;
      }
    }
  }
  // heroes
  for (const h of HEROES) {
    if (h.unlockTH > th) continue;
    const c = cat("heroes");
    const mx = maxLvlAt(h.rows, th);
    const cur = state.heroes[h.id] || 0;
    c.spent += wcost(h.res, cumCost(h.rows, cur));
    c.total += wcost(h.res, cumCost(h.rows, mx));
    c.items++;
    if (cur >= mx) { c.maxed++; A.counts.done++; }
    for (const s of stepsBetween(h.rows, cur, mx)) {
      c.res[h.res] += s.cost; c.timeRem += s.time;
      A.totals.res[h.res] += s.cost; A.totals.heroH += s.time; A.totals.buildH += s.time;
      A.counts.todo++;
    }
  }
  // lab
  for (const x of LAB) {
    if (x.unlockTH > th) continue;
    const c = cat("lab");
    const mx = maxLvlAt(x.rows, th);
    const cur = Math.max(1, state.lab[x.id] || 1);
    c.spent += wcost(x.res, cumCost(x.rows, cur));
    c.total += wcost(x.res, cumCost(x.rows, mx));
    c.items++;
    if (cur >= mx) { c.maxed++; A.counts.done++; }
    for (const s of stepsBetween(x.rows, cur, mx)) {
      c.res[x.res] += s.cost; c.timeRem += s.time;
      A.totals.res[x.res] += s.cost; A.totals.labH += s.time;
      A.counts.todo++;
    }
  }
  // pets
  for (const p of PETS) {
    if (p.unlockTH > th) continue;
    const c = cat("pets");
    const mx = maxLvlAt(p.rows, th);
    const cur = Math.max(1, state.pets[p.id] || 1);
    c.spent += wcost(p.res, cumCost(p.rows, cur));
    c.total += wcost(p.res, cumCost(p.rows, mx));
    c.items++;
    if (cur >= mx) { c.maxed++; A.counts.done++; }
    for (const s of stepsBetween(p.rows, cur, mx)) {
      c.res[p.res] += s.cost; c.timeRem += s.time;
      A.totals.res[p.res] += s.cost; A.totals.petH += s.time;
      A.counts.todo++;
    }
  }
  // equipment (owned only), capped by blacksmith available at this TH
  {
    const bsMax = blacksmithLevel("max");
    if (bsMax > 0) {
      const c = cat("equipment");
      for (const [id, lvl] of Object.entries(state.equip)) {
        const e = byId[id];
        if (!e) continue;
        const cap = equipCapAt(bsMax, e.rarity);
        c.items++;
        const spent = e.rows.filter(r => r.lvl <= lvl).reduce((s, r) => s + r.shiny + r.glowy * 15 + r.starry * 400, 0);
        const total = e.rows.filter(r => r.lvl <= cap).reduce((s, r) => s + r.shiny + r.glowy * 15 + r.starry * 400, 0);
        c.spent += spent; c.total += total;
        if (lvl >= cap) c.maxed++;
        for (const r of e.rows) if (r.lvl > lvl && r.lvl <= cap) {
          A.totals.shiny += r.shiny; A.totals.glowy += r.glowy; A.totals.starry += r.starry;
        }
      }
    }
  }
  // town hall next
  A.thNext = TH_ROWS.find(r => r.lvl === th + 1) || null;
  A.overall = { spent: 0, total: 0 };
  for (const c of Object.values(A.cats)) { A.overall.spent += c.spent; A.overall.total += c.total; }
  return A;
}

/* ---------------- planner ---------------- */
const KEY_DEF = new Set(["eagle_artillery", "scattershot", "inferno_tower", "monolith", "spell_tower",
  "multi_archer_tower", "ricochet_cannon", "multi_gear_tower", "firespitter", "x_bow", "air_defense", "giga_bomb"]);
const SPLASH_DEF = new Set(["wizard_tower", "bomb_tower", "mortar", "air_sweeper", "hidden_tesla"]);
const ARMY_FIRST = new Set(["clan_castle", "hero_hall", "blacksmith", "pet_house", "spell_factory",
  "dark_spell_factory", "barracks", "dark_barracks", "workshop", "laboratory", "army_camp"]);
const LAB_TIER = { // lower = earlier. Meta-ish defaults; everything else tier 3.
  root_rider: 1, electro_titan: 1, dragon: 1, balloon: 1, hog_rider: 1, miner: 1, witch: 1, valkyrie: 2,
  thrower: 1, druid: 1, furnace: 2, apprentice_warden: 2, yeti: 2, electro_dragon: 2, dragon_rider: 2,
  healer: 1, wall_breaker: 1, giant: 3, wizard: 2, bowler: 2, golem: 2, lava_hound: 2, baby_dragon: 2,
  lightning_spell: 1, rage_spell: 1, freeze_spell: 2, healing_spell: 1, invisibility_spell: 2,
  recall_spell: 2, jump_spell: 2, poison_spell: 1, earthquake_spell: 2, haste_spell: 2,
  skeleton_spell: 3, bat_spell: 2, overgrowth_spell: 3, clone_spell: 3, revive_spell: 2,
  log_launcher: 1, flame_flinger: 2, battle_drill: 2, stone_slammer: 2, wall_wrecker: 2, battle_blimp: 3,
};

function buildingTier(b) {
  if (ARMY_FIRST.has(b.id)) return 1;
  if (KEY_DEF.has(b.id)) return 2;
  if (SPLASH_DEF.has(b.id)) return 3;
  if (b.cat === "defense") return 4;           // point defenses & huts
  if (b.cat === "trap") return 5;
  if (b.id.endsWith("_storage")) return 6;
  return 7;                                     // collectors/drills
}
const TIER_WHY = { 1: "army & unlocks first", 2: "high-value defense", 3: "splash defense",
  4: "point defense", 5: "traps", 6: "storages", 7: "collectors" };

function builderTasks(A) {
  const th = state.th;
  const tasks = [];
  // heroes — top priority, always keep them going
  for (const h of HEROES) {
    if (h.unlockTH > th) continue;
    const mx = maxLvlAt(h.rows, th);
    const cur = state.heroes[h.id] || 0;
    stepsBetween(h.rows, cur, mx).forEach((s, k) => {
      tasks.push({ kind: "hero", id: h.id, name: h.name, inst: 0, to: s.lvl, cost: s.cost, res: h.res,
        time: s.time, tier: 0, seq: k, why: "hero — always keep upgrading", value: 0 });
    });
  }
  // buildings
  for (const b of BUILDINGS) {
    const n = effCount(b, th, "max");
    const mx = maxLvlAt(b.rows, th);
    const arr = (state.buildings[b.id] || []).slice();
    while (arr.length < n) arr.push(0);
    const tier = buildingTier(b);
    arr.forEach((cur, i) => {
      stepsBetween(b.rows, cur, mx).forEach((s, k) => {
        const prevRow = b.rows.find(r => r.lvl === s.lvl - 1);
        const dDps = (s.dps || 0) - (prevRow && prevRow.dps || 0);
        const dHp = (s.hp || 0) - (prevRow && prevRow.hp || 0);
        const value = (dDps + dHp / 6) / Math.max(0.05, s.cost / 1e6);
        tasks.push({ kind: "building", id: b.id, name: b.name, inst: i, to: s.lvl, cost: s.cost,
          res: b.res, time: s.time, tier, seq: k, value, why: TIER_WHY[tier] });
      });
    });
  }
  // storage gating: if any single upgrade cost exceeds storage capacity, storages jump the queue
  const capNeed = { gold: 0, elixir: 0 };
  for (const t of tasks) if (t.res in capNeed) capNeed[t.res] = Math.max(capNeed[t.res], t.cost);
  for (const t of tasks) {
    if (t.kind !== "building") continue;
    if (t.id === "gold_storage" && A.storage.gold < capNeed.gold) { t.tier = 1; t.why = "storage too small for coming upgrades"; }
    if (t.id === "elixir_storage" && A.storage.elixir < capNeed.elixir) { t.tier = 1; t.why = "storage too small for coming upgrades"; }
  }
  tasks.sort((a, b) => a.tier - b.tier || b.value - a.value || a.cost - b.cost || a.seq - b.seq);
  return tasks;
}

function schedule(tasks, workers, boostPct) {
  const factor = 1 - (boostPct || 0) / 100;
  const lanes = Array.from({ length: workers }, () => ({ free: 0, items: [] }));
  const timeline = [];
  const pending = tasks.map(t => ({ ...t }));
  const started = {};
  let guard = 0;
  while (pending.length && guard++ < 20000) {
    // earliest-free lane
    let lane = lanes[0];
    for (const l of lanes) if (l.free < lane.free) lane = l;
    // find first pending whose predecessor is done (instance sequencing)
    let idx = -1;
    for (let i = 0; i < pending.length; i++) {
      const t = pending[i];
      const key = t.id + ":" + t.inst;
      const done = started[key] || 0;
      if (t.seq === done) { idx = i; break; }
    }
    if (idx === -1) break;
    const t = pending.splice(idx, 1)[0];
    const key = t.id + ":" + t.inst;
    started[key] = (started[key] || 0) + 1;
    const dur = t.time * factor;
    const item = { ...t, start: lane.free, end: lane.free + dur, lane: lanes.indexOf(lane) };
    lane.free = item.end;
    lane.items.push(item);
    timeline.push(item);
  }
  timeline.sort((a, b) => a.start - b.start || a.end - b.end);
  const finish = Math.max(0, ...lanes.map(l => l.free));
  return { timeline, lanes, finish };
}

function labQueue() {
  const th = state.th;
  const items = [];
  for (const x of LAB) {
    if (x.unlockTH > th) continue;
    const mx = maxLvlAt(x.rows, th);
    const cur = Math.max(1, state.lab[x.id] || 1);
    stepsBetween(x.rows, cur, mx).forEach((s, k) => {
      const prevRow = x.rows.find(r => r.lvl === s.lvl - 1);
      const dDps = (s.dps || 0) - (prevRow && prevRow.dps || 0);
      items.push({ id: x.id, name: x.name, to: s.lvl, cost: s.cost, res: x.res, time: s.time,
        tier: LAB_TIER[x.id] || 3, seq: k, value: dDps / Math.max(0.05, s.cost / 1e6) });
    });
  }
  items.sort((a, b) => a.tier - b.tier || a.seq - b.seq || b.value - a.value);
  return items;
}
function petQueue() {
  const th = state.th;
  const items = [];
  for (const p of PETS) {
    if (p.unlockTH > th) continue;
    const mx = maxLvlAt(p.rows, th);
    const cur = Math.max(1, state.pets[p.id] || 1);
    stepsBetween(p.rows, cur, mx).forEach((s, k) => {
      items.push({ id: p.id, name: p.name, to: s.lvl, cost: s.cost, res: p.res, time: s.time, seq: k });
    });
  }
  return items;
}

/* ---------------- TH reference totals ---------------- */
let thTotalsCache = null;
function thTotals() {
  if (thTotalsCache) return thTotalsCache;
  const rowsOut = [];
  function maxCostAt(th) {
    const out = { res: emptyRes(), buildH: 0, labH: 0 };
    for (const b of BUILDINGS) {
      const n = effCount(b, th, "max");
      const mx = maxLvlAt(b.rows, th);
      if (!n || !mx) continue;
      out.res[b.res] += n * cumCost(b.rows, mx);
      out.buildH += n * cumTime(b.rows, mx);
    }
    const wMax = maxLvlAt(WALLS.rows, th);
    out.res.gold += (WALLS.counts[th - 1] || 0) * cumCost(WALLS.rows, wMax);
    for (const h of HEROES) {
      if (h.unlockTH > th) continue;
      out.res[h.res] += cumCost(h.rows, maxLvlAt(h.rows, th));
      out.buildH += cumTime(h.rows, maxLvlAt(h.rows, th));
    }
    for (const x of LAB) {
      if (x.unlockTH > th) continue;
      out.res[x.res] += cumCost(x.rows, maxLvlAt(x.rows, th));
      out.labH += cumTime(x.rows, maxLvlAt(x.rows, th));
    }
    for (const p of PETS) {
      if (p.unlockTH > th) continue;
      out.res[p.res] += cumCost(p.rows, maxLvlAt(p.rows, th));
      out.labH += cumTime(p.rows, maxLvlAt(p.rows, th));
    }
    return out;
  }
  let prev = null;
  for (let th = 3; th <= MAX_TH; th++) {
    const cur = maxCostAt(th);
    const thRow = TH_ROWS.find(r => r.lvl === th);
    const row = { th, thCost: thRow ? thRow.cost : 0, thTime: thRow ? thRow.time : 0 };
    if (prev) {
      row.gold = cur.res.gold - prev.res.gold;
      row.elixir = cur.res.elixir - prev.res.elixir;
      row.dark = cur.res.dark - prev.res.dark;
      row.buildH = cur.buildH - prev.buildH;
      row.labH = cur.labH - prev.labH;
    }
    prev = cur;
    if (th >= 4) rowsOut.push(row);
  }
  thTotalsCache = rowsOut;
  return rowsOut;
}

/* ---------------- formatting ---------------- */
function fmt(n) {
  if (n == null) return "–";
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6) >= 100 ? Math.round(n / 1e6) + "M" : (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1e4) return Math.round(n / 1e3) + "K";
  if (abs >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}
function fmtFull(n) { return Math.round(n).toLocaleString("en-US"); }
function fmtH(h) {
  if (!h) return "–";
  const d = Math.floor(h / 24), hh = Math.round(h % 24);
  if (d >= 30) return d + "d";
  if (d > 0) return d + "d " + hh + "h";
  if (h >= 1) return Math.round(h) + "h";
  return Math.max(1, Math.round(h * 60)) + "m";
}
function fmtDays(h) { return (h / 24).toFixed(h / 24 >= 100 ? 0 : 1) + " days"; }
function pct(a, b) { return b > 0 ? Math.min(100, 100 * a / b) : 100; }
function pctStr(a, b) { return pct(a, b).toFixed(1) + "%"; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function resTxt(res, n) {
  const cls = res === "dark" ? "dark" : res;
  return `<span class="res-txt"><span class="dot ${cls}"></span>${fmt(n)}</span>`;
}

/* ---------------- UI helpers ---------------- */
const $ = sel => document.querySelector(sel);
function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }

function tile(label, value, cls, sub) {
  return `<div class="card tile"><div class="label"><span class="dot ${cls || "accent"}"></span>${label}</div>
    <div class="value">${value}</div>${sub ? `<div class="delta">${sub}</div>` : ""}</div>`;
}
function progRow(name, spent, total, extra) {
  const p = pct(spent, total);
  return `<div class="prog-row" title="${fmtFull(spent)} of ${fmtFull(total)} spent">
    <div class="name">${name}</div>
    <div class="bar"><span style="width:${p.toFixed(1)}%"></span></div>
    <div class="pct"><b>${p.toFixed(1)}%</b>${extra ? ` <span class="muted small">${extra}</span>` : ""}</div></div>`;
}

/* ---------------- tabs ---------------- */
const TABS = ["overview", "base", "plan", "tomax", "metrics", "io"];
let activeTab = "overview";
let ganttHorizon = 56; // days shown in the plan timetable; 0 = everything
function switchTab(t) {
  activeTab = t;
  for (const name of TABS) {
    $("#tab-" + name).hidden = name !== t;
  }
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  renderActive();
}
function renderActive() {
  renderHeader();
  if (activeTab === "overview") renderOverview();
  if (activeTab === "base") renderBase();
  if (activeTab === "plan") renderPlan();
  if (activeTab === "tomax") renderToMax();
  if (activeTab === "metrics") renderMetrics();
  if (activeTab === "io") renderIO();
}

function renderHeader() {
  $("#thBadge").textContent = "TH " + state.th;
  $("#playerName").textContent = state.name ? `${state.name} ${state.tag || ""}`
    : state.tag ? state.tag : "no base loaded — try the sample";
  const sel = $("#thSelect");
  if (!sel.options.length) {
    for (let t = 2; t <= MAX_TH; t++) sel.add(new Option("TH " + t, t));
  }
  sel.value = state.th;
  $("#builderSelect").value = state.builders;
}

/* ---------- Overview ---------- */
function ringSVG(p) {
  const r = 62, c = 2 * Math.PI * r;
  return `<div class="ring"><svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label="overall progress ${p.toFixed(1)}%">
    <circle cx="74" cy="74" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="13"/>
    <circle cx="74" cy="74" r="${r}" fill="none" stroke="var(--accent)" stroke-width="13" stroke-linecap="round"
      stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}"/></svg>
    <div class="center"><div class="big">${p.toFixed(1)}%</div><div class="cap">of TH${state.th} max</div></div></div>`;
}

function renderOverview() {
  const A = analyze();
  const root = $("#tab-overview");
  const catOrder = [["defense", "Defenses"], ["heroes", "Heroes"], ["lab", "Laboratory"], ["walls", "Walls"],
    ["trap", "Traps"], ["army", "Army buildings"], ["resource", "Resources"], ["pets", "Pets"], ["equipment", "Equipment (ores)"]];
  const bars = catOrder.filter(([k]) => A.cats[k] && A.cats[k].total > 0)
    .map(([k, label]) => {
      const c = A.cats[k];
      return progRow(label, c.spent, c.total, `${c.maxed}/${c.items} maxed`);
    }).join("");
  const days = A.totals.buildH / 24 / state.builders;
  const labDays = A.totals.labH / 24;
  root.innerHTML = `
  <div class="grid cols-2" style="margin-bottom:14px">
    <div class="card"><h2>Overall progress</h2>
      <div class="note">Cost-weighted share of everything your TH${state.th} can build, upgrade and research (dark elixir weighted &times;100).</div>
      <div class="ring-wrap">${ringSVG(pct(A.overall.spent, A.overall.total))}
        <div style="flex:1;min-width:220px">
          ${progRow("Upgrades done", A.counts.done, A.counts.done + A.counts.todo, `${A.counts.todo} to go`)}
          ${A.thNext ? `<p class="small muted" style="margin:10px 0 0">Next Town Hall: TH${A.thNext.lvl} costs <b>${fmt(A.thNext.cost)}</b> gold, takes <b>${fmtH(A.thNext.time)}</b>.</p>` : `<p class="small muted" style="margin:10px 0 0">You're at the maximum Town Hall. Legend.</p>`}
        </div>
      </div>
    </div>
    <div class="card"><h2>Progress by category</h2>${bars || '<p class="muted">Load a base first.</p>'}</div>
  </div>
  <div class="grid cols-4">
    ${tile("Gold needed", fmt(A.totals.res.gold), "gold", "incl. walls (" + fmt((A.cats.walls || { res: emptyRes() }).res.gold) + ")")}
    ${tile("Elixir needed", fmt(A.totals.res.elixir), "elixir", "buildings + research")}
    ${tile("Dark Elixir needed", fmt(A.totals.res.dark), "dark", "heroes + research")}
    ${tile("Builder time left", fmtDays(A.totals.buildH), "time", `≈ ${fmtDays(A.totals.buildH / state.builders)} with ${state.builders} builders`)}
    ${tile("Lab time left", fmtDays(A.totals.labH), "time", "single laboratory queue")}
    ${PETS.some(p => p.unlockTH <= state.th) ? tile("Pet House queue", fmtDays(A.totals.petH), "time", "") : ""}
    ${tile("Ores needed", `${fmt(A.totals.shiny)} / ${fmt(A.totals.glowy)} / ${fmt(A.totals.starry)}`, "shiny", "shiny / glowy / starry (owned equipment)")}
    ${tile("Wall segments left", String((A.cats.walls ? A.cats.walls.items - A.cats.walls.maxed : 0)), "accent", "of " + (WALLS.counts[state.th - 1] || 0))}
  </div>
  <p class="small muted" style="margin-top:14px">Rough finish estimate: builders ≈ <b>${fmtDays(days * 24)}</b> · lab ≈ <b>${fmtDays(labDays * 24)}</b> (no boosts, uninterrupted queue). See the Upgrade Plan tab for a real schedule.</p>`;
}

/* ---------- Base editor ---------- */
function lvlOptions(cur, mx, zeroLabel) {
  let o = zeroLabel == null ? "" : `<option value="0"${cur === 0 ? " selected" : ""}>${zeroLabel}</option>`;
  for (let l = 1; l <= mx; l++)
    o += `<option value="${l}"${cur === l ? " selected" : ""}>L${l}${l === mx ? " · max" : ""}</option>`;
  return o;
}

function renderBase() {
  const root = $("#tab-base");
  const th = state.th;
  const parts = [];
  parts.push(`<div class="card" style="margin-bottom:16px"><h2>Edit your base</h2>
    <div class="note">The Clash of Clans API doesn't expose building levels, so set them here (or load the sample / your exported JSON).
    <b>0 = not built yet.</b> Values are capped at your TH's max. Changes save automatically.</div>
    <div class="io-row">
      <button class="btn sm ghost" data-bulk="max">Everything → TH${th} max</button>
      <button class="btn sm ghost" data-bulk="prev">Everything → TH${th - 1} max (fresh TH${th})</button>
      <button class="btn sm ghost" data-bulk="zero">Reset buildings to 0</button>
    </div></div>`);
  const cats = [["defense", "Defenses"], ["trap", "Traps"], ["resource", "Resources"], ["army", "Army buildings"]];
  for (const [cat, label] of cats) {
    const cards = [];
    for (const b of BUILDINGS.filter(x => x.cat === cat)) {
      const n = effCount(b, th, "cur");
      const nMax = effCount(b, th, "max");
      if (!nMax && !n) continue;
      const mx = maxLvlAt(b.rows, th);
      if (!mx) continue;
      const arr = state.buildings[b.id] || [];
      const inputs = arr.map((l, i) =>
        `<select data-b="${b.id}" data-i="${i}" class="${l >= mx ? "maxed" : l === 0 ? "zero" : ""}"
          aria-label="${esc(b.name)} #${i + 1}">${lvlOptions(l, mx, "not built")}</select>`).join("");
      const mergeNote = b.merge ? `<div class="note">merged defense — building one consumes ${b.merge.per ? b.merge.per + "× maxed " + byId[b.merge.source].name : "a maxed geared-up Cannon + Archer Tower"}</div>` : "";
      cards.push(`<div class="b-card"><header><span class="nm">${esc(b.name)}</span>
        <span class="mx">×${arr.length} · max L${mx}</span></header>
        ${mergeNote}<div class="inst-grid">${inputs || '<span class="muted small">none at this TH</span>'}</div>
        <div class="quick"><button class="btn sm ghost" data-bmax="${b.id}">all max</button>
        <button class="btn sm ghost" data-bmin="${b.id}">all 0</button></div></div>`);
    }
    parts.push(`<div class="edit-cat"><h2>${label}</h2><div class="grid cols-3">${cards.join("")}</div></div>`);
  }
  // walls
  {
    const mx = maxLvlAt(WALLS.rows, th);
    const total = WALLS.counts[th - 1] || 0;
    const placed = Object.values(state.walls).reduce((a, b) => a + b, 0);
    const rows = [];
    for (let l = mx; l >= 1; l--) {
      rows.push(`<label class="wl">L${l}<input type="number" min="0" max="${total}" value="${state.walls[l] || 0}" data-wall="${l}"></label>`);
    }
    parts.push(`<div class="edit-cat"><h2>Walls</h2>
      <div class="note">${total} wall segments at TH${th}, max level ${mx}. Currently placed: ${placed}. Count per level:</div>
      <div class="card"><div class="wall-grid">${rows.join("")}</div>
      <div class="quick" style="margin-top:10px"><button class="btn sm ghost" data-wallmax="1">all max</button>
      <button class="btn sm ghost" data-wallmin="1">all level 1</button></div></div></div>`);
  }
  // heroes
  {
    const cards = HEROES.filter(h => h.unlockTH <= th).map(h => {
      const mx = maxLvlAt(h.rows, th);
      const cur = state.heroes[h.id] || 0;
      return `<div class="b-card"><header><span class="nm">${esc(h.name)}</span><span class="mx">max L${mx}</span></header>
        <div class="inst-grid"><select data-hero="${h.id}" class="${cur >= mx ? "maxed" : cur === 0 ? "zero" : ""}"
          aria-label="${esc(h.name)} level">${lvlOptions(cur, mx, "not unlocked")}</select></div></div>`;
    });
    parts.push(`<div class="edit-cat"><h2>Heroes</h2><div class="grid cols-4">${cards.join("") || '<p class="muted">No heroes at this TH.</p>'}</div></div>`);
  }
  // lab
  {
    const groups = [["troop", "Troops"], ["dark_troop", "Dark troops"], ["spell", "Spells"], ["dark_spell", "Dark spells"], ["siege", "Siege machines"]];
    for (const [g, label] of groups) {
      const cards = LAB.filter(x => x.cat === g && x.unlockTH <= th).map(x => {
        const mx = maxLvlAt(x.rows, th);
        const cur = Math.max(1, state.lab[x.id] || 1);
        return `<div class="b-card"><header><span class="nm">${esc(x.name)}</span><span class="mx">max L${mx}</span></header>
          <div class="inst-grid"><select data-lab="${x.id}" class="${cur >= mx ? "maxed" : ""}"
            aria-label="${esc(x.name)} level">${lvlOptions(cur, mx, null)}</select></div></div>`;
      });
      if (cards.length) parts.push(`<div class="edit-cat"><h2>${label}</h2><div class="grid cols-4">${cards.join("")}</div></div>`);
    }
  }
  // pets
  {
    const cards = PETS.filter(p => p.unlockTH <= th).map(p => {
      const mx = maxLvlAt(p.rows, th);
      const cur = Math.max(1, state.pets[p.id] || 1);
      return `<div class="b-card"><header><span class="nm">${esc(p.name)}</span><span class="mx">max L${mx}</span></header>
        <div class="inst-grid"><select data-pet="${p.id}" class="${cur >= mx ? "maxed" : ""}"
          aria-label="${esc(p.name)} level">${lvlOptions(cur, mx, null)}</select></div></div>`;
    });
    if (cards.length) parts.push(`<div class="edit-cat"><h2>Hero pets</h2><div class="grid cols-4">${cards.join("")}</div></div>`);
  }
  // equipment
  {
    const bsMax = blacksmithLevel("max");
    if (bsMax > 0) {
      const cards = EQUIP.map(e => {
        const owned = e.id in state.equip;
        const cap = equipCapAt(bsMax, e.rarity);
        const cur = state.equip[e.id] || 0;
        return `<div class="b-card"><header><span class="nm">${esc(e.name)}</span>
          <span class="mx">${e.rarity} · cap L${cap}</span></header>
          <div class="inst-grid" style="align-items:center">
            <label class="small muted"><input type="checkbox" data-eqown="${e.id}" ${owned ? "checked" : ""}> owned</label>
            ${owned ? `<select data-eq="${e.id}" class="${cur >= cap ? "maxed" : ""}" aria-label="${esc(e.name)} level">${lvlOptions(cur, cap, null)}</select>` : ""}
          </div></div>`;
      });
      parts.push(`<div class="edit-cat"><h2>Hero equipment</h2>
        <div class="note">Tick what you own; ore math only counts owned equipment. Cap follows your TH's Blacksmith.</div>
        <div class="grid cols-4">${cards.join("")}</div></div>`);
    }
  }
  root.innerHTML = parts.join("");
}

/* ---------- Plan ---------- */
function taskLabel(t) {
  const multi = t.kind === "building" && (state.buildings[t.id] || []).length > 1;
  return `${t.name}${multi ? " #" + (t.inst + 1) : ""} → L${t.to}`;
}

function ganttHTML(sched, labTL, petTL) {
  const PX = 26;
  const finishH = Math.max(sched.finish,
    labTL.length ? labTL[labTL.length - 1].end : 0,
    petTL.length ? petTL[petTL.length - 1].end : 0);
  if (finishH <= 0) return '<p class="muted">Nothing left to schedule — this TH is done. 🎉</p>';
  const horizonD = ganttHorizon === 0 ? Math.ceil(finishH / 24) + 1 : ganttHorizon;
  const width = horizonD * PX;
  const rows = [];
  for (let i = 0; i < state.builders; i++)
    rows.push({ label: "Builder " + (i + 1), items: (sched.lanes[i] || { items: [] }).items });
  rows.push({ label: "Laboratory", items: labTL });
  rows.push({ label: "Pet House", items: petTL });
  let ticks = "";
  for (let d = 0; d < horizonD; d += 7) {
    const date = new Date(Date.now() + d * 86400000)
      .toLocaleDateString("en-US", { month: "short", day: "numeric" });
    ticks += `<div class="g-tick" style="left:${d * PX}px"><b>${d === 0 ? "today" : "day " + d}</b>${date}</div>`;
  }
  const tracks = rows.map(r => {
    const blocks = r.items.map(t => {
      const sD = t.start / 24, eD = t.end / 24;
      if (sD >= horizonD || t.end <= t.start) return "";
      const cut = eD > horizonD;
      const w = Math.max(3, (Math.min(eD, horizonD) - sD) * PX - 2);
      const label = taskLabel(t);
      const endDate = new Date(Date.now() + t.end * 3600000)
        .toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const title = `${label} · ${fmt(t.cost)} ${RES_LABEL[t.res]} · ${fmtH(t.end - t.start)} · day ${Math.floor(sD)}–${Math.ceil(eD)} (done ${endDate})`;
      return `<div class="g-block ${t.res === "dark" ? "dark" : t.res}${cut ? " cut" : ""}" ` +
        `style="left:${(sD * PX).toFixed(1)}px;width:${w.toFixed(1)}px" title="${esc(title)}">` +
        `${w > 68 ? esc(label) : ""}</div>`;
    }).join("");
    return `<div class="g-track" style="width:${width}px">${blocks}</div>`;
  }).join("");
  const labels = rows.map(r => `<div class="g-label">${r.label}</div>`).join("");
  return `<div class="gantt" style="--px:${PX}px">
    <div class="g-labels"><div class="g-corner"></div>${labels}</div>
    <div class="g-scroll"><div class="g-head" style="width:${width}px">${ticks}</div>${tracks}</div>
  </div>`;
}

function renderPlan() {
  const A = analyze();
  const root = $("#tab-plan");
  const tasks = builderTasks(A);
  const sched = schedule(tasks, state.builders, state.settings.buildBoost);
  const lab = labQueue();
  const pets = petQueue();
  const labFactor = 1 - (state.settings.labBoost || 0) / 100;
  let accL = 0;
  const labTL = lab.map(t => { const start = accL; accL += t.time * labFactor; return { ...t, start, end: accL }; });
  let accPt = 0;
  const petTL = pets.map(t => { const start = accPt; accPt += t.time * labFactor; return { ...t, start, end: accPt }; });

  const planRows = sched.timeline.slice(0, 60).map((t, i) => `
    <div class="plan-item">
      <div class="idx">${i + 1}</div>
      <div class="what"><b>${esc(t.name)}</b>${t.kind === "building" && (state.buildings[t.id] || []).length > 1 ? ` <span class="muted">#${t.inst + 1}</span>` : ""}
        → L${t.to} <div class="why">${esc(t.why)}</div></div>
      <div class="cost">${resTxt(t.res, t.cost)}</div>
      <div class="dur">${fmtH(t.time * (1 - state.settings.buildBoost / 100))}</div>
      <div class="when" title="builder ${t.lane + 1}">day ${Math.floor(t.start / 24)}–${Math.ceil(t.end / 24)} · B${t.lane + 1}</div>
    </div>`).join("");

  const labRows = labTL.slice(0, 40).map((t, i) => `<div class="plan-item"><div class="idx">${i + 1}</div>
      <div class="what"><b>${esc(t.name)}</b> → L${t.to}<div class="why">lab tier ${t.tier}</div></div>
      <div class="cost">${resTxt(t.res, t.cost)}</div>
      <div class="dur">${fmtH(t.end - t.start)}</div>
      <div class="when">day ${Math.floor(t.start / 24)}–${Math.ceil(t.end / 24)}</div></div>`).join("");
  const petRows = petTL.slice(0, 20).map((t, i) => `<div class="plan-item"><div class="idx">${i + 1}</div>
      <div class="what"><b>${esc(t.name)}</b> → L${t.to}</div>
      <div class="cost">${resTxt(t.res, t.cost)}</div>
      <div class="dur">${fmtH(t.end - t.start)}</div>
      <div class="when">day ${Math.floor(t.start / 24)}–${Math.ceil(t.end / 24)}</div></div>`).join("");

  const labDays = accL / 24;
  root.innerHTML = `
  <div class="grid cols-4" style="margin-bottom:14px">
    ${tile("Builder queue", `${tasks.length} upgrades`, "time", `≈ ${fmtDays(sched.finish)} with ${state.builders} builders`)}
    ${tile("Lab queue", `${lab.length} researches`, "time", `≈ ${fmtDays(labDays * 24)}`)}
    ${tile("Pet queue", `${pets.length} upgrades`, "time", `≈ ${fmtDays(accPt)}`)}
    <div class="card tile"><div class="label"><span class="dot accent"></span>Boosts</div>
      <div class="io-row" style="margin:6px 0 0">
        <label class="field small">builder −<select id="buildBoost">${[0, 10, 15, 20].map(v => `<option ${v === state.settings.buildBoost ? "selected" : ""}>${v}</option>`).join("")}</select>%</label>
        <label class="field small">lab −<select id="labBoost">${[0, 10, 15, 20].map(v => `<option ${v === state.settings.labBoost ? "selected" : ""}>${v}</option>`).join("")}</select>%</label>
      </div><div class="delta">Gold Pass / events time discount</div></div>
  </div>
  <div class="card" style="margin-bottom:14px"><h2>Timetable</h2>
    <div class="note">Every queue as a lane, every upgrade as a bar spanning its days. Builders follow the
    priority order below; the Laboratory and Pet House are single queues. Hover a bar for cost and finish date.
    Walls aren't shown — they're instant. Change the builder count in the header to add or remove lanes.</div>
    <div class="g-legend">
      <span><span class="dot gold"></span> costs gold</span>
      <span><span class="dot elixir"></span> costs elixir</span>
      <span><span class="dot dark"></span> costs dark elixir</span>
      <span class="spacer"></span>
      <label class="field small">show
        <select id="ganttHorizon">
          <option value="28"${ganttHorizon === 28 ? " selected" : ""}>4 weeks</option>
          <option value="56"${ganttHorizon === 56 ? " selected" : ""}>8 weeks</option>
          <option value="84"${ganttHorizon === 84 ? " selected" : ""}>12 weeks</option>
          <option value="0"${ganttHorizon === 0 ? " selected" : ""}>everything</option>
        </select></label>
    </div>
    ${ganttHTML(sched, labTL, petTL)}
  </div>
  <div class="grid cols-2">
    <div class="card"><h2>Builder schedule</h2>
      <div class="note">Priority: heroes → army/unlock buildings → storages when gating → key defenses → splash → point → traps → resources.
      Within a tier, best (ΔDPS + ΔHP/6) per cost first. Days assume builders never idle.
      Walls aren't scheduled — they're instant and only cost resources.</div>
      ${planRows || '<p class="muted">Nothing to upgrade — this TH is maxed. 🎉</p>'}
      ${sched.timeline.length > 60 ? `<p class="small muted">…and ${sched.timeline.length - 60} more.</p>` : ""}</div>
    <div>
      <div class="card" style="margin-bottom:14px"><h2>Laboratory order</h2>
        <div class="note">Single queue — meta troops and war spells first (tier 1 → 3), then value per cost.</div>
        ${labRows || '<p class="muted">Lab is done for this TH.</p>'}
        ${lab.length > 40 ? `<p class="small muted">…and ${lab.length - 40} more.</p>` : ""}</div>
      <div class="card"><h2>Pet House order</h2>${petRows || '<p class="muted">No pet upgrades available.</p>'}</div>
    </div>
  </div>`;
}

/* ---------- To Max ---------- */
function renderToMax() {
  const A = analyze();
  const root = $("#tab-tomax");
  const s = state.settings;
  const dGold = s.lootGold > 0 ? A.totals.res.gold / s.lootGold : Infinity;
  const dElix = s.lootElixir > 0 ? A.totals.res.elixir / s.lootElixir : Infinity;
  const dDark = s.lootDark > 0 ? A.totals.res.dark / s.lootDark : Infinity;
  const buildDays = A.totals.buildH / 24 / state.builders;
  const labDays = A.totals.labH / 24;
  const bottleneck = Math.max(dGold, dElix, dDark, buildDays, labDays);
  const bottleneckName = [["farming gold", dGold], ["farming elixir", dElix], ["farming dark elixir", dDark],
    [state.builders + " builders", buildDays], ["the laboratory", labDays]].sort((a, b) => b[1] - a[1])[0][0];
  const eta = new Date(Date.now() + bottleneck * 86400000);

  const catRows = Object.entries(A.cats).filter(([, c]) => c.total > 0).map(([k, c]) => {
    const label = { defense: "Defenses", trap: "Traps", resource: "Resources", army: "Army buildings",
      walls: "Walls", heroes: "Heroes", lab: "Laboratory", pets: "Pets", equipment: "Equipment" }[k] || k;
    if (k === "equipment") return "";
    return `<tr><td>${label}</td><td>${fmt(c.res.gold)}</td><td>${fmt(c.res.elixir)}</td><td>${fmt(c.res.dark)}</td>
      <td>${c.timeRem ? fmtDays(c.timeRem) : "–"}</td><td>${c.items - c.maxed}</td></tr>`;
  }).join("");

  const thRows = thTotals().map(r => `
    <tr ${r.th === state.th ? 'style="background:var(--surface-2)"' : ""}><td>${r.th === state.th ? "▶ " : ""}TH${r.th}</td>
      <td>${fmt(r.thCost)}</td><td>${fmt(r.gold)}</td><td>${fmt(r.elixir)}</td><td>${fmt(r.dark)}</td>
      <td>${fmtDays(r.buildH)}</td><td>${fmtDays(r.labH)}</td></tr>`).join("");

  root.innerHTML = `
  <div class="grid cols-4" style="margin-bottom:14px">
    ${tile("Gold to max TH" + state.th, fmt(A.totals.res.gold), "gold", fmtFull(A.totals.res.gold))}
    ${tile("Elixir to max TH" + state.th, fmt(A.totals.res.elixir), "elixir", fmtFull(A.totals.res.elixir))}
    ${tile("Dark Elixir to max TH" + state.th, fmt(A.totals.res.dark), "dark", fmtFull(A.totals.res.dark))}
    ${tile("Ores to max owned equipment", `${fmt(A.totals.shiny)} / ${fmt(A.totals.glowy)} / ${fmt(A.totals.starry)}`, "glowy", "shiny / glowy / starry")}
  </div>
  <div class="grid cols-2" style="margin-bottom:14px">
    <div class="card"><h2>Time to max at TH${state.th}</h2>
      <table class="data"><tbody>
        <tr><td>Builder work (${state.builders} builders)</td><td>${fmtDays(A.totals.buildH / state.builders)}</td></tr>
        <tr><td>Laboratory</td><td>${fmtDays(A.totals.labH)}</td></tr>
        <tr><td>Pet House</td><td>${fmtDays(A.totals.petH)}</td></tr>
        <tr><td>Gold at your loot rate</td><td>${isFinite(dGold) ? dGold.toFixed(0) + " days" : "set loot/day"}</td></tr>
        <tr><td>Elixir at your loot rate</td><td>${isFinite(dElix) ? dElix.toFixed(0) + " days" : "set loot/day"}</td></tr>
        <tr><td>Dark elixir at your loot rate</td><td>${isFinite(dDark) ? dDark.toFixed(0) + " days" : "set loot/day"}</td></tr>
      </tbody></table>
      <p class="small" style="margin-top:10px">Bottleneck: <b>${bottleneckName}</b> →
        maxed around <b>${eta.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</b>
        (${Math.round(bottleneck)} days) at current pace.</p>
      <div class="io-row small">
        <label class="field">Gold/day <input type="number" class="wide" id="lootGold" value="${s.lootGold}" step="500000"></label>
        <label class="field">Elixir/day <input type="number" class="wide" id="lootElixir" value="${s.lootElixir}" step="500000"></label>
        <label class="field">DE/day <input type="number" class="wide" id="lootDark" value="${s.lootDark}" step="5000"></label>
        <label class="field">Walls paid with
          <select id="wallRes"><option value="gold" ${s.wallRes === "gold" ? "selected" : ""}>gold</option>
          <option value="elixir" ${s.wallRes === "elixir" ? "selected" : ""}>elixir</option></select></label>
      </div>
    </div>
    <div class="card"><h2>Remaining by category</h2>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Category</th><th>Gold</th><th>Elixir</th><th>Dark</th><th>Work time</th><th>Upgrades</th></tr></thead>
        <tbody>${catRows}</tbody></table></div>
      <p class="small muted">Equipment is tracked in ores, not resources — see the tiles above.</p>
    </div>
  </div>
  <div class="card"><h2>Every Town Hall, from scratch</h2>
    <div class="note">Cost of taking a <i>fully maxed</i> TH(n−1) to a fully maxed TH(n): everything new plus every level unlocked. Straight from the data — handy for planning ahead.</div>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>Level</th><th>TH upgrade (gold)</th><th>Gold</th><th>Elixir</th><th>Dark</th><th>Builder time</th><th>Lab time</th></tr></thead>
      <tbody>${thRows}</tbody></table></div></div>`;
}

/* ---------- Metrics ---------- */
function renderMetrics() {
  const A = analyze();
  const th = state.th;
  const root = $("#tab-metrics");
  const defRows = BUILDINGS.filter(b => b.cat === "defense").map(b => {
    const n = effCount(b, th, "max");
    const mx = maxLvlAt(b.rows, th);
    if (!n || !mx) return "";
    const arr = (state.buildings[b.id] || []).slice();
    while (arr.length < n) arr.push(0);
    let remCost = 0, remTime = 0, dpsNow = 0, dpsMax = 0;
    for (const cur of arr) {
      for (const s of stepsBetween(b.rows, cur, mx)) { remCost += s.cost; remTime += s.time; }
      const curRow = b.rows.find(r => r.lvl === cur), maxRow = b.rows.find(r => r.lvl === mx);
      if (curRow && curRow.dps) dpsNow += curRow.dps;
      if (maxRow && maxRow.dps) dpsMax += maxRow.dps;
    }
    const lvls = arr.filter(l => l > 0);
    const range = lvls.length ? (Math.min(...lvls) === Math.max(...lvls) ? "L" + lvls[0] : "L" + Math.min(...lvls) + "–" + Math.max(...lvls)) : "not built";
    return `<tr><td>${esc(b.name)}</td><td>×${arr.length}</td><td>${range}</td><td>L${mx}</td>
      <td>${dpsMax ? Math.round(dpsNow) + " / " + Math.round(dpsMax) : "–"}</td>
      <td>${remCost ? resTxt(b.res, remCost) : '<span class="pill good">maxed</span>'}</td>
      <td>${remTime ? fmtH(remTime) : "–"}</td></tr>`;
  }).join("");

  const nextSteps = [];
  for (const b of BUILDINGS.filter(x => x.cat === "defense")) {
    const n = effCount(b, th, "max");
    const mx = maxLvlAt(b.rows, th);
    const arr = (state.buildings[b.id] || []).slice();
    while (arr.length < n) arr.push(0);
    arr.forEach((cur, i) => {
      if (cur >= mx) return;
      const s = b.rows.find(r => r.lvl === cur + 1);
      if (!s) return;
      const prevRow = b.rows.find(r => r.lvl === cur);
      const dDps = (s.dps || 0) - (prevRow && prevRow.dps || 0);
      const dHp = (s.hp || 0) - (prevRow && prevRow.hp || 0);
      nextSteps.push({ name: b.name + (arr.length > 1 ? ` #${i + 1}` : ""), to: s.lvl, cost: s.cost, res: b.res,
        time: s.time, dDps, dHp, score: (dDps + dHp / 6) / Math.max(0.05, s.cost / 1e6) });
    });
  }
  nextSteps.sort((a, b) => b.score - a.score);
  const effRows = nextSteps.slice(0, 25).map((t, i) => `
    <tr><td>${i + 1}. ${esc(t.name)} → L${t.to}</td><td>+${Math.round(t.dDps)}</td><td>+${fmt(t.dHp)}</td>
      <td>${resTxt(t.res, t.cost)}</td><td>${fmtH(t.time)}</td><td>${t.score.toFixed(1)}</td></tr>`).join("");

  const labRows = LAB.filter(x => x.unlockTH <= th).map(x => {
    const mx = maxLvlAt(x.rows, th);
    const cur = Math.max(1, state.lab[x.id] || 1);
    const next = x.rows.find(r => r.lvl === cur + 1 && r.lvl <= mx);
    const curRow = x.rows.find(r => r.lvl === cur);
    const dDps = next && next.dps != null && curRow && curRow.dps != null ? next.dps - curRow.dps : null;
    let remCost = 0;
    for (const s of stepsBetween(x.rows, cur, mx)) remCost += s.cost;
    return { cat: x.cat, html: `<tr><td>${esc(x.name)}</td><td>${cur} / ${mx}</td>
      <td>${next ? resTxt(x.res, next.cost) : '<span class="pill good">maxed</span>'}</td>
      <td>${dDps != null ? "+" + Math.round(dDps) : "–"}</td>
      <td>${next && dDps ? (dDps / (next.cost / 1e6)).toFixed(1) : "–"}</td>
      <td>${remCost ? fmt(remCost) : "–"}</td></tr>` };
  });

  root.innerHTML = `
  <div class="grid cols-4" style="margin-bottom:14px">
    ${tile("Defense DPS", `${fmt(A.defense.dpsNow)} <span class="muted" style="font-size:1rem">/ ${fmt(A.defense.dpsMax)}</span>`, "accent", pctStr(A.defense.dpsNow, A.defense.dpsMax) + " of TH max")}
    ${tile("Defense hitpoints", `${fmt(A.defense.hpNow)} <span class="muted" style="font-size:1rem">/ ${fmt(A.defense.hpMax)}</span>`, "accent", pctStr(A.defense.hpNow, A.defense.hpMax) + " of TH max")}
    ${tile("Storage capacity", `${fmt(A.storage.gold)} <span class="muted" style="font-size:1rem">g</span> · ${fmt(A.storage.elixir)} <span class="muted" style="font-size:1rem">e</span>`, "gold", "dark: " + fmt(A.storage.dark))}
    ${tile("Hero levels", HEROES.filter(h => h.unlockTH <= th).map(h => (state.heroes[h.id] || 0)).reduce((a, b) => a + b, 0) + " <span class='muted' style='font-size:1rem'>/ " + HEROES.filter(h => h.unlockTH <= th).map(h => maxLvlAt(h.rows, th)).reduce((a, b) => a + b, 0) + "</span>", "dark", "combined levels")}
  </div>
  <div class="card" style="margin-bottom:14px"><h2>Best defense value right now</h2>
    <div class="note">Next available step for every defense, ranked by (ΔDPS + ΔHP⁄6) per million cost — spend where it defends hardest.</div>
    <div class="table-scroll"><table class="data">
    <thead><tr><th>Upgrade</th><th>ΔDPS</th><th>ΔHP</th><th>Cost</th><th>Time</th><th>Value</th></tr></thead>
    <tbody>${effRows || "<tr><td colspan=6 class='muted'>All defenses maxed.</td></tr>"}</tbody></table></div></div>
  <div class="card" style="margin-bottom:14px"><h2>Defense matrix</h2>
    <div class="table-scroll"><table class="data">
    <thead><tr><th>Defense</th><th>Count</th><th>Levels</th><th>TH max</th><th>DPS now/max</th><th>Remaining</th><th>Time</th></tr></thead>
    <tbody>${defRows}</tbody></table></div></div>
  <div class="card"><h2>Laboratory matrix</h2>
    <div class="note">ΔDPS is the next level's damage gain; value = ΔDPS per million. Remaining is the full cost to this TH's cap.</div>
    <div class="table-scroll"><table class="data">
    <thead><tr><th>Unit</th><th>Level</th><th>Next cost</th><th>ΔDPS</th><th>Value</th><th>Remaining</th></tr></thead>
    <tbody>${labRows.map(r => r.html).join("")}</tbody></table></div></div>`;
}

/* ---------- Import / Export ---------- */
/* Supercell internal data IDs, as used by the in-game village export
   ("buildings"/"units"/... arrays of {data, lvl, cnt}). ID tables from the
   MIT-licensed clash-of-clans-data npm package, cross-checked against real
   exports; unknown IDs are counted and reported, never guessed. */
const VILLAGE_BUILDING_IDS = {
  1000000: "army_camp", 1000002: "elixir_collector", 1000003: "elixir_storage",
  1000004: "gold_mine", 1000005: "gold_storage", 1000006: "barracks", 1000007: "laboratory",
  1000008: "cannon", 1000009: "archer_tower", 1000011: "wizard_tower", 1000012: "air_defense",
  1000013: "mortar", 1000014: "clan_castle", 1000015: "builder_s_hut", 1000019: "hidden_tesla",
  1000020: "spell_factory", 1000021: "x_bow", 1000023: "dark_elixir_drill",
  1000024: "dark_elixir_storage", 1000026: "dark_barracks", 1000027: "inferno_tower",
  1000028: "air_sweeper", 1000029: "dark_spell_factory", 1000031: "eagle_artillery",
  1000032: "bomb_tower", 1000059: "workshop", 1000067: "scattershot", 1000068: "pet_house",
  1000070: "blacksmith", 1000071: "hero_hall", 1000072: "spell_tower", 1000077: "monolith",
  1000079: "multi_gear_tower", 1000084: "multi_archer_tower", 1000085: "ricochet_cannon",
  1000086: "revenge_tower", 1000089: "firespitter",
};
const VILLAGE_IGNORE_BUILDINGS = new Set([1000016, 1000017, 1000018, 1000064, 1000093]); // B.O.B's Hut, Helper Hut, unused
const VILLAGE_TRAP_IDS = {
  12000000: "bomb", 12000001: "spring_trap", 12000002: "giant_bomb", 12000005: "air_bomb",
  12000006: "seeking_air_mine", 12000008: "skeleton_trap", 12000016: "tornado_trap",
  12000020: "giga_bomb",
};
const VILLAGE_UNIT_IDS = {
  4000000: "barbarian", 4000001: "archer", 4000002: "goblin", 4000003: "giant",
  4000004: "wall_breaker", 4000005: "balloon", 4000006: "wizard", 4000007: "healer",
  4000008: "dragon", 4000009: "p_e_k_k_a", 4000010: "minion", 4000011: "hog_rider",
  4000012: "valkyrie", 4000013: "golem", 4000015: "witch", 4000017: "lava_hound",
  4000022: "bowler", 4000023: "baby_dragon", 4000024: "miner",
  4000051: "wall_wrecker", 4000052: "battle_blimp", 4000053: "yeti",
  4000058: "ice_golem", 4000059: "electro_dragon", 4000062: "stone_slammer",
  4000065: "dragon_rider", 4000075: "siege_barracks", 4000082: "headhunter",
  4000087: "log_launcher", 4000091: "flame_flinger", 4000092: "battle_drill",
  4000095: "electro_titan", 4000097: "apprentice_warden", 4000110: "root_rider",
  4000123: "druid", 4000132: "thrower", 4000135: "troop_launcher", 4000150: "furnace",
};
const VILLAGE_IGNORE_UNITS = new Set([4000177]); // temporary event troops (Meteor Golem)
const VILLAGE_SPELL_IDS = {
  26000000: "lightning_spell", 26000001: "healing_spell", 26000002: "rage_spell",
  26000003: "jump_spell", 26000005: "freeze_spell", 26000009: "poison_spell",
  26000010: "earthquake_spell", 26000011: "haste_spell", 26000016: "clone_spell",
  26000017: "skeleton_spell", 26000028: "bat_spell", 26000035: "invisibility_spell",
  26000053: "recall_spell", 26000070: "overgrowth_spell", 26000098: "revive_spell",
  26000109: "ice_block_spell",
};
const VILLAGE_IGNORE_SPELLS = new Set([26000120]); // temporary event spells (Totem)
const VILLAGE_HERO_IDS = {
  28000000: "barbarian_king", 28000001: "archer_queen", 28000002: "grand_warden",
  28000004: "royal_champion", 28000006: "minion_prince", 28000007: "dragon_duke",
};
const VILLAGE_PET_IDS = {
  73000000: "l_a_s_s_i", 73000001: "mighty_yak", 73000002: "electro_owl", 73000003: "unicorn",
  73000004: "phoenix", 73000007: "poison_lizard", 73000008: "diggy", 73000009: "frosty",
  73000010: "spirit_fox", 73000011: "angry_jelly", 73000016: "sneezy", 73000017: "greedy_raven",
};
const VILLAGE_EQUIP_IDS = {
  90000000: "barbarian_puppet", 90000001: "rage_vial", 90000002: "archer_puppet",
  90000003: "invisibility_vial", 90000004: "eternal_tome", 90000005: "life_gem",
  90000006: "seeking_shield", 90000007: "royal_gem", 90000008: "earthquake_boots",
  90000009: "hog_rider_puppet", 90000010: "giant_gauntlet", 90000011: "vampstache",
  90000012: "haste_vial", 90000013: "rocket_spear", 90000014: "spiky_ball",
  90000015: "frozen_arrow", 90000017: "giant_arrow", 90000019: "heroic_torch",
  90000020: "healer_puppet", 90000022: "fireball", 90000024: "rage_gem",
  90000032: "snake_bracelet", 90000034: "healing_tome", 90000035: "dark_crown",
  90000039: "magic_mirror", 90000040: "electro_boots", 90000041: "lavaloon_puppet",
  90000042: "henchmen_puppet", 90000043: "dark_orb", 90000044: "metal_pants",
  90000047: "noble_iron", 90000048: "action_figure", 90000049: "meteor_staff",
  90000050: "frost_flake", 90000051: "stick_horse", 90000052: "fire_heart",
  90000053: "rocket_backpack", 90000056: "stun_blaster", 90000057: "flame_blower",
};

function importVillage(obj) {
  const unknown = { building: 0, trap: 0, unit: 0, spell: 0, hero: 0, pet: 0, equipment: 0 };
  let matched = 0;
  // Town Hall level from the TH entry
  const thEntry = (obj.buildings || []).find(b => b.data === 1000001);
  if (thEntry) state.th = Math.min(MAX_TH, thEntry.lvl);
  const hutEntry = (obj.buildings || []).find(b => b.data === 1000015);
  const hasBob = (obj.buildings || []).some(b => b.data === 1000064);
  if (hutEntry) state.builders = Math.min(6, (hutEntry.cnt || 1) + (hasBob ? 1 : 0));
  if (obj.tag && obj.tag !== state.tag) state.name = "";
  if (obj.tag) state.tag = obj.tag;
  state.buildings = {}; state.walls = {}; state.heroes = {}; state.lab = {}; state.pets = {};
  // equipment is merged, not reset — a prior API import may already name items exactly
  const addInstances = (slug, lvl, cnt) => {
    const arr = state.buildings[slug] || (state.buildings[slug] = []);
    for (let i = 0; i < cnt; i++) arr.push(lvl);
  };
  for (const e of (obj.buildings || []).concat(obj.traps || [])) {
    const cnt = e.cnt || 1;
    if (e.data === 1000001) continue;
    if (e.data === 1000010) { state.walls[e.lvl] = (state.walls[e.lvl] || 0) + cnt; matched++; continue; }
    const slug = VILLAGE_BUILDING_IDS[e.data] || VILLAGE_TRAP_IDS[e.data];
    if (slug && byId[slug]) { addInstances(slug, e.lvl, cnt); matched++; }
    else if (!VILLAGE_IGNORE_BUILDINGS.has(e.data)) unknown[e.data >= 12000000 ? "trap" : "building"]++;
  }
  for (const e of (obj.units || []).concat(obj.siege_machines || [])) {
    const slug = VILLAGE_UNIT_IDS[e.data];
    if (slug && byId[slug]) { state.lab[slug] = e.lvl; matched++; }
    else if (!VILLAGE_IGNORE_UNITS.has(e.data)) unknown.unit++;
  }
  for (const e of obj.spells || []) {
    const slug = VILLAGE_SPELL_IDS[e.data];
    if (slug && byId[slug]) { state.lab[slug] = e.lvl; matched++; }
    else if (!VILLAGE_IGNORE_SPELLS.has(e.data)) unknown.spell++;
  }
  for (const e of obj.heroes || []) {
    const slug = VILLAGE_HERO_IDS[e.data];
    if (slug) { state.heroes[slug] = e.lvl; matched++; } else unknown.hero++;
  }
  for (const e of obj.pets || []) {
    const slug = VILLAGE_PET_IDS[e.data];
    if (slug && byId[slug]) { state.pets[slug] = e.lvl; matched++; } else unknown.pet++;
  }
  for (const e of obj.equipment || []) {
    const slug = VILLAGE_EQUIP_IDS[e.data];
    if (slug && byId[slug]) { state.equip[slug] = e.lvl; matched++; } else unknown.equipment++;
  }
  normalize(); save();
  const missed = Object.entries(unknown).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${k}${n > 1 ? "s" : ""}`);
  let msg = `Village imported (TH${state.th}): ${matched} entries matched, including buildings, walls, traps, heroes, lab and pets.`;
  if (missed.length) {
    msg += ` Couldn't identify ${missed.join(", ")} (newer game content uses IDs this tool doesn't know yet) — ` +
      `check “My Base” and fill any gaps, and consider also importing your player payload from the official API, ` +
      `which names troops/heroes/equipment exactly.`;
  }
  return msg;
}

function detectAndImport(obj) {
  if (obj && Array.isArray(obj.buildings) && obj.buildings.length && obj.buildings[0] && typeof obj.buildings[0].data === "number") {
    return importVillage(obj);   // in-game village export (ID-based)
  }
  if (obj && obj.format === "clash-analyzer-base" && obj.state) {
    const s = obj.state;
    if (s.v !== 1) throw new Error("Unsupported base file version.");
    state = s;
    normalize(); save();
    return "Base file imported.";
  }
  if (obj && obj.townHallLevel) {
    // official player API payload — replaces units; buildings stay manual
    const wasSample = state.tag === "#SAMPLE";
    state.th = Math.min(MAX_TH, obj.townHallLevel);
    state.name = obj.name || "";
    state.tag = obj.tag || "";
    state.heroes = {}; state.lab = {}; state.pets = {}; state.equip = {};
    if (wasSample) { state.buildings = {}; state.walls = {}; }
    let matched = 0, skipped = [];
    const applyList = (list) => {
      for (const u of list || []) {
        if (u.village && u.village !== "home") continue;
        const id = u.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
        const item = byId[id];
        if (!item) { skipped.push(u.name); continue; }
        if (HEROES.includes(item)) state.heroes[id] = u.level;
        else if (PETS.includes(item)) state.pets[id] = u.level;
        else if (LAB.includes(item)) state.lab[id] = u.level;
        else if (EQUIP.includes(item)) state.equip[id] = u.level;
        else continue;
        matched++;
      }
    };
    applyList(obj.heroes); applyList(obj.troops); applyList(obj.spells); applyList(obj.heroEquipment);
    normalize(); save();
    return `Player imported: ${esc(obj.name || obj.tag || "")} (TH${state.th}) — ${matched} units/heroes/spells/equipment matched. ` +
      `Building levels aren't in the API: set them in “My Base” (start from “Everything → TH${state.th - 1} max” and adjust).`;
  }
  throw new Error("Unrecognized JSON. Accepted: an in-game village export ({\"buildings\":[{\"data\":100...}]}), a player payload from the Clash of Clans API ({\"townHallLevel\":...}), or a base file exported by this tool.");
}

function exportState() {
  return JSON.stringify({ format: "clash-analyzer-base", exported: new Date().toISOString(), state }, null, 2);
}

async function fetchFromAPI(tag, token, base) {
  const t = tag.trim().replace(/^#/, "").toUpperCase();
  const b = (base || "https://api.clashofclans.com").replace(/\/+$/, "");
  const url = `${b}/v1/players/%23${encodeURIComponent(t)}`;
  const res = await fetch(url, { headers: token ? { Authorization: "Bearer " + token.trim() } : {} });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API responded ${res.status}. ${body.slice(0, 160)}`);
  }
  return res.json();
}

function renderIO() {
  const root = $("#tab-io");
  root.innerHTML = `
  <div class="grid cols-2">
    <div class="card"><h2>Fetch from the Clash of Clans API</h2>
      <div class="note">Needs a token from <a href="https://developer.clashofclans.com" target="_blank" rel="noopener">developer.clashofclans.com</a>.
      The official API blocks browsers (no CORS) and pins your IP, so from this page you usually need a proxy you trust —
      e.g. run <code>cocproxy</code> locally, or use the RoyaleAPI proxy IP (<code>45.79.218.79</code>) when creating the key and
      set the proxy base URL below. If it fails, use “Paste JSON” instead — same data.</div>
      <div class="io-row"><input class="txt" id="apiTag" placeholder="Player tag, e.g. #2PP0J0LL" style="max-width:220px">
        <input class="txt" id="apiBase" placeholder="API base (default: https://api.clashofclans.com — or your proxy)" ></div>
      <textarea class="io" id="apiToken" placeholder="API token (kept only in this browser)" style="min-height:70px"></textarea>
      <div class="io-row"><button class="btn" id="apiGo">Fetch player</button></div>
      <div id="apiMsg"></div>
    </div>
    <div class="card"><h2>Paste / upload JSON</h2>
      <div class="note">Accepts three formats, auto-detected:
      <b>an in-game village export</b> (<code>{"buildings":[{"data":1000001,...}]}</code> — the only format that
      includes building levels and walls), <b>an official API player payload</b> (from the developer portal's “Try it”, or
      <code>curl -H "Authorization: Bearer TOKEN" https://api.clashofclans.com/v1/players/%23YOURTAG</code> —
      troops/heroes/spells/equipment by name), or <b>a base file exported by this tool</b>.
      Importing both of the first two gives the most complete picture.</div>
      <textarea class="io" id="ioPaste" placeholder='{"tag":"#...","buildings":[{"data":1000001,"lvl":14,...}]}  ·  {"tag":"#...","townHallLevel":14,...}  ·  {"format":"clash-analyzer-base",...}'></textarea>
      <div class="io-row">
        <button class="btn" id="ioImport">Import</button>
        <label class="btn ghost" style="cursor:pointer">Upload file<input type="file" id="ioFile" accept=".json,application/json" hidden></label>
      </div>
      <div id="ioMsg"></div>
    </div>
    <div class="card"><h2>Export</h2>
      <div class="note">Full base (buildings, walls, heroes, lab, pets, equipment, settings) as JSON. Reimport it here anytime — nothing leaves your browser otherwise.</div>
      <div class="io-row">
        <button class="btn" id="ioDownload">Download base.json</button>
        <button class="btn ghost" id="ioCopy">Copy to clipboard</button>
      </div>
    </div>
    <div class="card"><h2>My base, sample &amp; reset</h2>
      <div class="note">${window.MY_BASE ? `This site's default base is <b>${esc(window.MY_BASE.tag)}</b> (TH${window.MY_BASE.th}, snapshot baked into the page) — new visits start from it, and your edits stay saved in this browser on top.` : "The sample is a mid-progress TH13 so you can explore every tab."}</div>
      <div class="io-row">
        ${window.MY_BASE ? `<button class="btn" id="ioMyBase">Reset to my base (${esc(window.MY_BASE.tag)})</button>` : ""}
        <button class="btn ghost" id="ioSample">Load sample TH13 base</button>
        <button class="btn danger" id="ioReset">Clear everything</button>
      </div>
    </div>
  </div>`;
}

/* ---------- sample base ---------- */
function loadSample() {
  let seed = 1337;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  state = freshState(13);
  state.name = "Sample Village";
  state.tag = "#SAMPLE";
  const th = 13;
  for (const b of BUILDINGS) {
    const n = effCount(b, th, "max");
    if (!n) continue;
    const mx = maxLvlAt(b.rows, th);
    const mxPrev = maxLvlAt(b.rows, th - 1);
    const arr = [];
    for (let i = 0; i < n; i++) {
      const r = rnd();
      let lvl;
      if (r < 0.25) lvl = mx;                       // pushed into TH13
      else if (r < 0.8) lvl = mxPrev;               // solid TH12 base
      else lvl = Math.max(1, mxPrev - 1 - Math.floor(rnd() * 2));
      arr.push(Math.max(1, Math.min(lvl, mx)));
    }
    state.buildings[b.id] = arr;
  }
  state.walls = { 13: 90, 12: 130, 11: 80 };
  state.heroes = { barbarian_king: 65, archer_queen: 68, minion_prince: 45, grand_warden: 40, royal_champion: 12 };
  for (const x of LAB) {
    if (x.unlockTH > th) continue;
    const mx = maxLvlAt(x.rows, th);
    const mxPrev = maxLvlAt(x.rows, th - 1);
    const r = rnd();
    state.lab[x.id] = Math.max(1, r < 0.3 ? mx : r < 0.85 ? mxPrev : Math.max(1, mxPrev - 1));
  }
  state.equip = { barbarian_puppet: 15, rage_vial: 12, earthquake_boots: 9, archer_puppet: 15,
    invisibility_vial: 12, giant_arrow: 9, eternal_tome: 12, life_gem: 9, royal_gem: 9, seeking_shield: 12,
    giant_gauntlet: 14, frozen_arrow: 11 };
  normalize(); save();
}

/* ---------------- events ---------------- */
function bindEvents() {
  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if (b) switchTab(b.dataset.tab);
  });
  $("#thSelect").addEventListener("change", e => {
    state.th = +e.target.value; normalize(); save(); renderActive();
  });
  $("#builderSelect").addEventListener("change", e => {
    state.builders = +e.target.value; save(); renderActive();
  });

  document.querySelector("main").addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.b !== undefined && t.dataset.i !== undefined) {
      const arr = state.buildings[t.dataset.b];
      arr[+t.dataset.i] = Math.max(0, +t.value || 0);
      normalize(); save(); renderActive();
    } else if (t.dataset.wall) {
      state.walls[+t.dataset.wall] = Math.max(0, +t.value || 0);
      // rebalance: normalize() fills the remainder into level 1
      const explicit = { ...state.walls };
      delete explicit[1];
      state.walls = explicit;
      normalize(); save(); renderActive();
    } else if (t.dataset.hero) {
      state.heroes[t.dataset.hero] = Math.max(0, +t.value || 0); normalize(); save(); renderActive();
    } else if (t.dataset.lab) {
      state.lab[t.dataset.lab] = Math.max(1, +t.value || 1); normalize(); save(); renderActive();
    } else if (t.dataset.pet) {
      state.pets[t.dataset.pet] = Math.max(1, +t.value || 1); normalize(); save(); renderActive();
    } else if (t.dataset.eqown) {
      if (t.checked) state.equip[t.dataset.eqown] = state.equip[t.dataset.eqown] || 1;
      else delete state.equip[t.dataset.eqown];
      normalize(); save(); renderActive();
    } else if (t.dataset.eq) {
      state.equip[t.dataset.eq] = Math.max(1, +t.value || 1); normalize(); save(); renderActive();
    } else if (t.id === "buildBoost") { state.settings.buildBoost = +t.value; save(); renderActive(); }
    else if (t.id === "labBoost") { state.settings.labBoost = +t.value; save(); renderActive(); }
    else if (t.id === "lootGold") { state.settings.lootGold = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "lootElixir") { state.settings.lootElixir = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "lootDark") { state.settings.lootDark = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "wallRes") { state.settings.wallRes = t.value; save(); renderActive(); }
  });

  document.querySelector("main").addEventListener("click", async e => {
    const t = e.target;
    if (t.dataset.bulk) {
      const mode = t.dataset.bulk;
      for (const b of BUILDINGS) {
        const n = effCount(b, state.th, "max");
        const mx = mode === "zero" ? 0 : maxLvlAt(b.rows, mode === "prev" ? state.th - 1 : state.th);
        state.buildings[b.id] = Array.from({ length: n }, () => mx);
      }
      const wMx = mode === "zero" ? 1 : maxLvlAt(WALLS.rows, mode === "prev" ? state.th - 1 : state.th);
      state.walls = { [Math.max(1, wMx)]: WALLS.counts[state.th - 1] || 0 };
      if (mode !== "zero") {
        for (const h of HEROES) if (h.unlockTH <= state.th) state.heroes[h.id] = maxLvlAt(h.rows, mode === "prev" ? state.th - 1 : state.th);
        for (const x of LAB) if (x.unlockTH <= state.th) state.lab[x.id] = Math.max(1, maxLvlAt(x.rows, mode === "prev" ? state.th - 1 : state.th));
        for (const p of PETS) if (p.unlockTH <= state.th) state.pets[p.id] = Math.max(1, maxLvlAt(p.rows, mode === "prev" ? state.th - 1 : state.th));
      }
      normalize(); save(); renderActive();
    }
    if (t.dataset.bmax) {
      const b = byId[t.dataset.bmax];
      const mx = maxLvlAt(b.rows, state.th);
      state.buildings[b.id] = state.buildings[b.id].map(() => mx);
      normalize(); save(); renderActive();
    }
    if (t.dataset.bmin) {
      state.buildings[t.dataset.bmin] = state.buildings[t.dataset.bmin].map(() => 0);
      normalize(); save(); renderActive();
    }
    if (t.dataset.wallmax) {
      state.walls = { [maxLvlAt(WALLS.rows, state.th)]: WALLS.counts[state.th - 1] || 0 };
      normalize(); save(); renderActive();
    }
    if (t.dataset.wallmin) {
      state.walls = { 1: WALLS.counts[state.th - 1] || 0 };
      normalize(); save(); renderActive();
    }
    if (t.id === "ioImport") {
      const box = $("#ioMsg");
      try {
        const msg = detectAndImport(JSON.parse($("#ioPaste").value));
        box.innerHTML = `<div class="msg ok">${msg}</div>`;
        renderHeader();
      } catch (err) { box.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
    }
    if (t.id === "ioDownload") {
      const blob = new Blob([exportState()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `clash-base-th${state.th}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
    if (t.id === "ioCopy") {
      try { await navigator.clipboard.writeText(exportState()); t.textContent = "Copied ✓"; setTimeout(() => t.textContent = "Copy to clipboard", 1500); } catch (e2) {}
    }
    if (t.id === "ioSample") { loadSample(); switchTab("overview"); }
    if (t.id === "ioMyBase") { loadMyBase(); switchTab("overview"); }
    if (t.id === "ioReset") {
      if (confirm("Clear the saved base and start over?")) {
        state = freshState(11); save(); renderActive();
      }
    }
    if (t.id === "apiGo") {
      const box = $("#apiMsg");
      box.innerHTML = `<div class="msg info">Fetching…</div>`;
      try {
        const data = await fetchFromAPI($("#apiTag").value, $("#apiToken").value, $("#apiBase").value);
        const msg = detectAndImport(data);
        box.innerHTML = `<div class="msg ok">${msg}</div>`;
        renderHeader();
      } catch (err) {
        box.innerHTML = `<div class="msg err">${esc(err.message)} — browsers are usually blocked by the API's CORS policy; use a proxy base URL or the “Paste JSON” box instead.</div>`;
      }
    }
  });

  $("#tab-io").addEventListener("change", e => {
    if (e.target.id === "ioFile" && e.target.files[0]) {
      const box = $("#ioMsg");
      e.target.files[0].text().then(txt => {
        try {
          const msg = detectAndImport(JSON.parse(txt));
          box.innerHTML = `<div class="msg ok">${msg}</div>`;
          renderHeader();
        } catch (err) { box.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
      });
    }
  });
}

/* ---------------- boot ---------------- */
function loadMyBase() {
  state = JSON.parse(JSON.stringify(window.MY_BASE));
  normalize(); save();
}

function boot() {
  $("#dataDate").textContent = D.meta.generated;
  $("#dataMaxTH").textContent = D.meta.maxTH;
  state = load();
  const firstVisit = !state;
  if (!state) state = freshState(11);
  normalize();
  bindEvents();
  renderHeader();
  if (firstVisit) {
    if (window.MY_BASE) loadMyBase(); else loadSample();
  }
  renderActive();
}
boot();
})();
