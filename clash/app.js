/* Clash Analyzer — all client-side. Data comes from data.js (window.COC_DATA). */
(function () {
"use strict";

const D = window.COC_DATA;
const MAX_TH = D.meta.maxTH;

/* ---------------- data unpacking ---------------- */
function unpackRows(levels) {
  return levels.map(r => ({ lvl: r[0], cost: r[1], time: r[2], th: r[3], dps: r[4], hp: r[5], cap: r[6], elixirOk: !!r[7] }));
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
    buildings: {}, walls: {}, heroes: {}, lab: {}, pets: {}, equip: {}, running: [],
    settings: { buildBoost: 0, labBoost: 0,
      lootGold: 12000000, lootElixir: 12000000, lootDark: 60000,
      wallGoldDay: 3000000, wallElixirDay: 3000000, apiEndpoint: "",
      oreWeekShiny: 6500, oreWeekGlowy: 550, oreWeekStarry: 15 },
  };
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && s.v === 1) {
      if (!Array.isArray(s.running)) s.running = [];
      s.settings = { ...freshState(1).settings, ...s.settings };
      return s;
    }
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

function completeRunning(r) {
  const item = byId[r.id];
  if (!item) return;
  if (r.q === "builder") {
    if (HEROES.includes(item)) state.heroes[r.id] = Math.max(state.heroes[r.id] || 0, r.to);
    else {
      const arr = state.buildings[r.id] || [];
      const i = arr.indexOf(r.to - 1);
      if (i >= 0) arr[i] = r.to;
    }
  } else if (r.q === "lab") state.lab[r.id] = Math.max(state.lab[r.id] || 1, r.to);
  else if (r.q === "pet") state.pets[r.id] = Math.max(state.pets[r.id] || 1, r.to);
}

// normalize state to TH: clamp levels, fit instance arrays to effective counts
function normalize() {
  const th = state.th;
  state.settings = { ...freshState(1).settings, ...(state.settings || {}) };
  if (!Array.isArray(state.running)) state.running = [];
  const now = Date.now();
  state.running = state.running.filter(r => {
    if (!byId[r.id] || !(r.endTs > 0)) return false;
    if (r.endTs <= now) { completeRunning(r); return false; }
    const item = byId[r.id];
    if (r.q === "builder") {
      if (HEROES.includes(item)) return (state.heroes[r.id] || 0) === r.to - 1;
      return (state.buildings[r.id] || []).includes(r.to - 1);
    }
    if (r.q === "lab") return Math.max(1, state.lab[r.id] || 1) === r.to - 1;
    if (r.q === "pet") return Math.max(1, state.pets[r.id] || 1) === r.to - 1;
    return false;
  });
  // one lab / one pet queue at most, builders capped by count
  const labs = state.running.filter(r => r.q === "lab");
  const petsR = state.running.filter(r => r.q === "pet");
  const builds = state.running.filter(r => r.q === "builder");
  state.running = builds.slice(0, 6).concat(labs.slice(0, 1), petsR.slice(0, 1));
  // Levels are stored raw and only clamped when read, so viewing a lower TH
  // is a non-destructive preview — switching back restores everything.
  for (const b of BUILDINGS) {
    const n = effCount(b, th, "cur");
    let arr = (state.buildings[b.id] || []).slice();
    arr = arr.map(l => Math.max(0, Math.floor(l || 0)));
    arr.sort((a, bb) => bb - a);
    while (arr.length < n) arr.push(0);
    state.buildings[b.id] = arr;
  }
  const wCount = WALLS.counts[th - 1] || 0;
  const walls = {};
  let placed = 0;
  for (const [lvlStr, cnt] of Object.entries(state.walls)) {
    const c = Math.max(0, Math.floor(cnt || 0));
    const l = Math.floor(+lvlStr);
    if (c > 0 && l >= 1) { walls[l] = (walls[l] || 0) + c; placed += c; }
  }
  if (placed < wCount) walls[1] = (walls[1] || 0) + (wCount - placed);
  state.walls = walls;
  for (const h of HEROES) {
    state.heroes[h.id] = Math.max(0, Math.floor(state.heroes[h.id] || 0));
  }
  for (const x of LAB) {
    let l = Math.max(0, Math.floor(state.lab[x.id] || 0));
    if (x.unlockTH <= th && l < 1) l = 1;
    state.lab[x.id] = l;
  }
  for (const p of PETS) {
    state.pets[p.id] = Math.max(0, Math.floor(state.pets[p.id] || 0));
  }
  for (const id of Object.keys(state.equip)) {
    const e = byId[id];
    if (!e) { delete state.equip[id]; continue; }
    state.equip[id] = Math.max(1, Math.min(state.equip[id], e.rarity === "epic" ? 27 : 18));
  }
}

function blacksmithLevel(mode, thArg) {
  const bs = byId.blacksmith;
  if (!bs) return 0;
  if (mode === "max") return maxLvlAt(bs.rows, thArg || state.th);
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

function analyze(thArg) {
  const th = thArg || state.th;
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
    if (!n) continue;
    const mx = maxLvlAt(b.rows, th);
    const c = cat(b.cat);
    const arr = (state.buildings[b.id] || []).slice().sort((x, y) => y - x);
    while (arr.length < n) arr.push(0);
    for (let i = 0; i < n; i++) {
      const cur = Math.min(arr[i], mx);
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
  // walls — tracked separately (mixable gold/elixir payment, no builder time)
  A.wall = { rem: 0, remElixirOk: 0, segsLeft: 0, total: 0, levels: [] };
  {
    const c = cat("walls");
    const mx = maxLvlAt(WALLS.rows, th);
    const total = WALLS.counts[th - 1] || 0;
    const full = cumCost(WALLS.rows, mx);
    c.total = total * full;
    c.items = total;
    A.wall.total = total * full;
    for (const [lvlStr, cnt] of Object.entries(state.walls)) {
      const lvl = +lvlStr;
      c.spent += cnt * cumCost(WALLS.rows, lvl);
      const toMax = full - cumCost(WALLS.rows, lvl);
      if (lvl >= mx) c.maxed += cnt;
      else {
        A.wall.rem += toMax * cnt;
        A.wall.segsLeft += cnt;
        let elig = 0;
        for (const r of WALLS.rows) if (r.lvl > lvl && r.lvl <= mx && r.elixirOk) elig += r.cost;
        A.wall.remElixirOk += elig * cnt;
      }
      A.wall.levels.push({ lvl, cnt, each: toMax, maxed: lvl >= mx });
    }
    A.wall.levels.sort((a, b) => b.lvl - a.lvl);
  }
  // heroes
  for (const h of HEROES) {
    if (h.unlockTH > th) continue;
    const c = cat("heroes");
    const mx = maxLvlAt(h.rows, th);
    const cur = Math.min(state.heroes[h.id] || 0, mx);
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
    const cur = Math.min(Math.max(1, state.lab[x.id] || 1), mx);
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
    const cur = Math.min(Math.max(1, state.pets[p.id] || 1), mx);
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
    const bsMax = blacksmithLevel("max", th);
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
  const seeds = [];
  const nowMs = Date.now();
  const runPool = state.running.filter(r => r.q === "builder").slice();
  const consume = (id, cur, key, name, res) => {
    const i = runPool.findIndex(r => r.id === id && r.to === cur + 1);
    if (i === -1) return false;
    const r = runPool.splice(i, 1)[0];
    seeds.push({ kind: "run", id, inst: +key.split(":")[1], key, name, to: r.to, cost: 0, res,
      time: (r.endTs - nowMs) / 3.6e6, end: (r.endTs - nowMs) / 3.6e6, why: "in progress now" });
    return true;
  };
  // heroes — top priority, always keep them going
  for (const h of HEROES) {
    if (h.unlockTH > th) continue;
    const mx = maxLvlAt(h.rows, th);
    let cur = Math.min(state.heroes[h.id] || 0, mx);
    const seeded = consume(h.id, cur, h.id + ":0", h.name, h.res);
    stepsBetween(h.rows, cur + (seeded ? 1 : 0), mx).forEach((s, k) => {
      tasks.push({ kind: "hero", id: h.id, name: h.name, inst: 0, to: s.lvl, cost: s.cost, res: h.res,
        time: s.time, tier: 0, seq: k, why: "hero — always keep upgrading", value: 0 });
    });
  }
  // buildings
  for (const b of BUILDINGS) {
    const n = effCount(b, th, "max");
    const mx = maxLvlAt(b.rows, th);
    const arr = (state.buildings[b.id] || []).slice().sort((x, y) => y - x);
    while (arr.length < n) arr.push(0);
    const tier = buildingTier(b);
    arr.slice(0, n).forEach((cur, i) => {
      cur = Math.min(cur, mx);
      const seeded = consume(b.id, cur, b.id + ":" + i, b.name, b.res);
      if (seeded) cur += 1;
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
  return { tasks, seeds };
}

function schedule(tasks, workers, boostPct, seeds) {
  const factor = 1 - (boostPct || 0) / 100;
  const lanes = Array.from({ length: workers }, () => ({ free: 0, items: [] }));
  const instAvail = {}; // instance key -> hour its current upgrade finishes
  (seeds || []).slice(0, workers).forEach((sd, i) => {
    const item = { ...sd, start: 0, lane: i, running: true };
    lanes[i].free = sd.end;
    lanes[i].items.push(item);
    instAvail[sd.key] = sd.end;
  });
  // Resource balancing: each free builder takes the highest-priority job from
  // whichever resource is least ahead of its farming budget (loot/day rates
  // from To Max), so spending is spread across gold/elixir/dark instead of
  // burning one resource first.
  const rate = {
    gold: Math.max(1, state.settings.lootGold || 0),
    elixir: Math.max(1, state.settings.lootElixir || 0),
    dark: Math.max(1, state.settings.lootDark || 0),
  };
  const spent = { gold: 0, elixir: 0, dark: 0 };
  const timeline = [];
  const pending = tasks.map(t => ({ ...t }));
  // remaining same-instance chain hours: a hero's queued levels can only run
  // one after another, so a long chain is a hard lower bound on the finish date
  const chainRem = {};
  let workLeft = 0;
  for (const t of pending) {
    const dur = t.time * factor;
    chainRem[t.id + ":" + t.inst] = (chainRem[t.id + ":" + t.inst] || 0) + dur;
    workLeft += dur;
  }
  const started = {};
  let guard = 0;
  while (pending.length && guard++ < 30000) {
    let lane = lanes[0];
    for (const l of lanes) if (l.free < lane.free) lane = l;
    // gather every task whose instance is idle by the time this lane frees up
    const nowIdx = [];
    let fbIdx = -1, fbAvail = Infinity;
    for (let i = 0; i < pending.length; i++) {
      const t = pending[i];
      const key = t.id + ":" + t.inst;
      if ((started[key] || 0) !== t.seq) continue;
      const avail = instAvail[key] || 0;
      if (avail <= lane.free) nowIdx.push(i);
      else if (avail < fbAvail) { fbAvail = avail; fbIdx = i; }
    }
    let idx = -1;
    if (nowIdx.length) {
      // time comes first: if the longest startable chain is at least the
      // average remaining load per builder, postponing it would push the whole
      // finish date — continue that chain now. Resource balancing only gets to
      // reorder work that has slack.
      let busyBeyond = 0;
      for (const l of lanes) busyBeyond += Math.max(0, l.free - lane.free);
      let bestC = -1, bestH = 0;
      for (const i of nowIdx) {
        const h = chainRem[pending[i].id + ":" + pending[i].inst] || 0;
        if (h > bestH) { bestH = h; bestC = i; }
      }
      if (bestC !== -1 && bestH >= (workLeft + busyBeyond) / lanes.length) {
        idx = bestC;
      } else {
        const day = lane.free / 24 + 1;
        const resOrder = ["gold", "elixir", "dark"]
          .sort((a, b) => spent[a] / (rate[a] * day) - spent[b] / (rate[b] * day));
        for (const res of resOrder) {
          const hit = nowIdx.find(i => pending[i].res === res);
          if (hit !== undefined) { idx = hit; break; }
        }
        if (idx === -1) idx = nowIdx[0];
      }
    } else {
      idx = fbIdx;
    }
    if (idx === -1) break;
    const t = pending.splice(idx, 1)[0];
    const key = t.id + ":" + t.inst;
    started[key] = (started[key] || 0) + 1;
    const start = Math.max(lane.free, instAvail[key] || 0);
    const dur = t.time * factor;
    const item = { ...t, start, end: start + dur, lane: lanes.indexOf(lane), ord: timeline.length };
    lane.free = item.end;
    lane.items.push(item);
    instAvail[key] = item.end;
    chainRem[key] = Math.max(0, (chainRem[key] || 0) - dur);
    workLeft = Math.max(0, workLeft - dur);
    spent[t.res] += t.cost;
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
    const cur = Math.min(Math.max(1, state.lab[x.id] || 1), mx);
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
    const cur = Math.min(Math.max(1, state.pets[p.id] || 1), mx);
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
const TABS = ["overview", "base", "plan", "tomax", "metrics", "builder", "io"];
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
  if (activeTab === "builder") renderBuilder();
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
    ${tile("Gold needed", fmt(A.totals.res.gold), "gold", "buildings + traps, excl. walls")}
    ${tile("Elixir needed", fmt(A.totals.res.elixir), "elixir", "buildings + research")}
    ${tile("Dark Elixir needed", fmt(A.totals.res.dark), "dark", "heroes + research")}
    ${tile("Builder time left", fmtDays(A.totals.buildH), "time", `≈ ${fmtDays(A.totals.buildH / state.builders)} with ${state.builders} builders`)}
    ${tile("Lab time left", fmtDays(A.totals.labH), "time", "single laboratory queue")}
    ${PETS.some(p => p.unlockTH <= state.th) ? tile("Pet House queue", fmtDays(A.totals.petH), "time", "") : ""}
    ${tile("Ores needed", `${fmt(A.totals.shiny)} / ${fmt(A.totals.glowy)} / ${fmt(A.totals.starry)}`, "shiny", "shiny / glowy / starry (owned equipment)")}
    ${tile("Walls remaining", fmt(A.wall.rem), "accent", `${A.wall.segsLeft} of ${WALLS.counts[state.th - 1] || 0} segments · gold or elixir`)}
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
    const bsMax = blacksmithLevel("max", th);
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
  const finishH = Math.max(sched.finish,
    labTL.length ? labTL[labTL.length - 1].end : 0,
    petTL.length ? petTL[petTL.length - 1].end : 0);
  if (finishH <= 0) return '<p class="muted">Nothing left to schedule — this TH is done. 🎉</p>';
  const horizonD = ganttHorizon === 0 ? Math.ceil(finishH / 24) + 1 : ganttHorizon;
  // zoom: the selected horizon always fills the available width
  const mainW = (document.querySelector("main") || document.body).clientWidth || 1100;
  const avail = Math.max(320, mainW - 36 /* card padding */ - 108 /* labels */ - 4);
  const PX = Math.min(48, Math.max(7, Math.floor(avail / horizonD)));
  const width = horizonD * PX;
  const rows = [];
  for (let i = 0; i < state.builders; i++)
    rows.push({ label: "Builder " + (i + 1), items: (sched.lanes[i] || { items: [] }).items });
  rows.push({ label: "Laboratory", items: labTL });
  rows.push({ label: "Pet House", items: petTL });
  const tickStep = horizonD > 90 ? 28 : horizonD > 45 ? 14 : 7;
  let ticks = "";
  for (let d = 0; d < horizonD; d += tickStep) {
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
      return `<div class="g-block ${t.res === "dark" ? "dark" : t.res}${cut ? " cut" : ""}${t.running ? " running" : ""}" ` +
        `style="left:${(sD * PX).toFixed(1)}px;width:${w.toFixed(1)}px" data-tip="${esc((t.running ? "IN PROGRESS — " : "") + title)}">` +
        `${w > 68 ? (t.running ? "▶ " : "") + esc(label) : ""}</div>`;
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
  const { tasks, seeds } = builderTasks(A);
  const sched = schedule(tasks, state.builders, state.settings.buildBoost, seeds);
  const lab = labQueue();
  const pets = petQueue();
  const labFactor = 1 - (state.settings.labBoost || 0) / 100;
  const bFactor = 1 - (state.settings.buildBoost || 0) / 100;
  const nowMs = Date.now();
  const runLab = state.running.find(r => r.q === "lab");
  let accL = 0;
  const labTL = [];
  if (runLab && byId[runLab.id]) {
    accL = Math.max(0.01, (runLab.endTs - nowMs) / 3.6e6);
    labTL.push({ id: runLab.id, name: byId[runLab.id].name, to: runLab.to, cost: 0,
      res: byId[runLab.id].res, tier: 0, start: 0, end: accL, running: true });
  }
  for (const t of lab) {
    if (runLab && t.id === runLab.id && t.to === runLab.to) continue;
    const start = accL; accL += t.time * labFactor;
    labTL.push({ ...t, start, end: accL });
  }
  const runPet = state.running.find(r => r.q === "pet");
  let accPt = 0;
  const petTL = [];
  if (runPet && byId[runPet.id]) {
    accPt = Math.max(0.01, (runPet.endTs - nowMs) / 3.6e6);
    petTL.push({ id: runPet.id, name: byId[runPet.id].name, to: runPet.to, cost: 0,
      res: byId[runPet.id].res, start: 0, end: accPt, running: true });
  }
  for (const t of pets) {
    if (runPet && t.id === runPet.id && t.to === runPet.to) continue;
    const start = accPt; accPt += t.time * labFactor;
    petTL.push({ ...t, start, end: accPt });
  }

  const runningRows = state.running.map(r => {
    const item = byId[r.id];
    if (!item) return "";
    const remH = (r.endTs - nowMs) / 3.6e6;
    const icon = r.q === "lab" ? "🧪" : r.q === "pet" ? "🐾" : "🔨";
    return `<div class="plan-item" style="grid-template-columns:34px 1fr auto">
      <div class="idx">${icon}</div>
      <div class="what"><b>${esc(item.name)}</b> → L${r.to}
        <div class="why">imported from your village — the level applies automatically when the timer ends</div></div>
      <div class="cost">${fmtH(remH)} left · done ${new Date(r.endTs).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
    </div>`;
  }).join("");

  // ---- next up: the first builder jobs to queue, with their price tags ----
  const nextUp = sched.timeline.filter(t => !t.running)
    .sort((a, b) => a.start - b.start || a.ord - b.ord).slice(0, state.builders);
  const nuTotal = { gold: 0, elixir: 0, dark: 0, time: 0 };
  const nextRows = nextUp.map((t, i) => {
    nuTotal[t.res] += t.cost; nuTotal.time += t.end - t.start;
    const startTxt = t.start < 1 ? "start now"
      : `in ${fmtH(t.start)} (${new Date(Date.now() + t.start * 3.6e6).toLocaleDateString("en-US", { month: "short", day: "numeric" })})`;
    return `<div class="plan-item" style="grid-template-columns:34px 1fr auto">
      <div class="idx">${i + 1}</div>
      <div class="what"><b>${esc(t.name)}</b> → L${t.to}
        <div class="why">${esc(t.why || "")}</div></div>
      <div class="cost"><span class="dot ${t.res === "dark" ? "dark" : t.res}"></span> ${fmt(t.cost)} ${RES_LABEL[t.res]}
        · ${fmtH((t.end - t.start))} · ${startTxt}</div>
    </div>`;
  }).join("");
  const nuParts = ["gold", "elixir", "dark"].filter(r => nuTotal[r])
    .map(r => `<b>${fmt(nuTotal[r])}</b> ${RES_LABEL[r]}`);
  const nuLab = labTL.find(t => !t.running);
  const nuPet = petTL.find(t => !t.running);
  const nuSide = [
    nuLab ? `Laboratory: <b>${esc(nuLab.name)}</b> → L${nuLab.to} (${fmt(nuLab.cost)} ${RES_LABEL[nuLab.res]})` : "",
    nuPet ? `Pet House: <b>${esc(nuPet.name)}</b> → L${nuPet.to} (${fmt(nuPet.cost)} ${RES_LABEL[nuPet.res]})` : "",
  ].filter(Boolean).join(" · ");

  // ---- queue + category summaries instead of per-upgrade lists ----
  const sumRes = list => {
    const o = { n: 0, time: 0, gold: 0, elixir: 0, dark: 0 };
    for (const t of list) { o.n++; o.time += t.time || 0; o[t.res] += t.cost || 0; }
    return o;
  };
  const bSum = sumRes(tasks.map(t => ({ ...t, time: t.time * bFactor })));
  const lSum = sumRes(lab.map(t => ({ ...t, time: t.time * labFactor })));
  const pSum = sumRes(pets.map(t => ({ ...t, time: t.time * labFactor })));
  const resCells = o => `<td>${o.gold ? fmt(o.gold) : "–"}</td><td>${o.elixir ? fmt(o.elixir) : "–"}</td><td>${o.dark ? fmt(o.dark) : "–"}</td>`;
  const queueRows = `
    <tr><td>Builders × ${state.builders}</td><td>${bSum.n}</td><td>${fmtDays(bSum.time)}</td>
      <td>${fmtDays(sched.finish)}</td>${resCells(bSum)}</tr>
    <tr><td>Laboratory</td><td>${lSum.n}</td><td>${fmtDays(lSum.time)}</td><td>${fmtDays(accL)}</td>${resCells(lSum)}</tr>
    <tr><td>Pet House</td><td>${pSum.n}</td><td>${fmtDays(pSum.time)}</td><td>${fmtDays(accPt)}</td>${resCells(pSum)}</tr>`;

  const TIER_LABEL = { 0: "Heroes", 1: "Army, unlocks & gating storages", 2: "Key defenses",
    3: "Splash defenses", 4: "Point defenses & huts", 5: "Traps", 6: "Storages", 7: "Collectors" };
  const byTier = {};
  for (const t of tasks) {
    const g = byTier[t.tier] || (byTier[t.tier] = { n: 0, time: 0, gold: 0, elixir: 0, dark: 0 });
    g.n++; g.time += t.time * bFactor; g[t.res] += t.cost;
  }
  const tierRows = Object.keys(byTier).sort((a, b) => a - b).map(k => {
    const g = byTier[k];
    return `<tr><td>${TIER_LABEL[k] || "Other"}</td><td>${g.n}</td><td>${fmtDays(g.time)}</td><td></td>${resCells(g)}</tr>`;
  }).join("");

  root.innerHTML = `
  <div class="grid cols-4" style="margin-bottom:14px">
    ${tile("Builder queue", `${tasks.length} upgrades`, "time", `≈ ${fmtDays(sched.finish)} with ${state.builders} builders`)}
    ${tile("Lab queue", `${lab.length} researches`, "time", `≈ ${fmtDays(accL)}`)}
    ${tile("Pet queue", `${pets.length} upgrades`, "time", `≈ ${fmtDays(accPt)}`)}
    <div class="card tile"><div class="label"><span class="dot accent"></span>Boosts</div>
      <div class="io-row" style="margin:6px 0 0">
        <label class="field small">builder −<select id="buildBoost">${[0, 10, 15, 20].map(v => `<option ${v === state.settings.buildBoost ? "selected" : ""}>${v}</option>`).join("")}</select>%</label>
        <label class="field small">lab −<select id="labBoost">${[0, 10, 15, 20].map(v => `<option ${v === state.settings.labBoost ? "selected" : ""}>${v}</option>`).join("")}</select>%</label>
      </div><div class="delta">Gold Pass / events time discount</div></div>
  </div>
  ${state.running.length ? `<div class="card" style="margin-bottom:14px"><h2>Running now</h2>${runningRows}</div>` : ""}
  <div class="card" style="margin-bottom:14px"><h2>Next up — fill your queue</h2>
    <div class="note">The first ${nextUp.length} builder jobs from the timetable, in order. "Start now" rows fit a
    free builder today; the others begin when a builder (or that building's own running upgrade) frees up.</div>
    ${nextRows || '<p class="muted">Nothing left to build — this TH is done. 🎉</p>'}
    ${nextUp.length ? `<div class="nu-total">Together they'll take ${nuParts.join(" + ")}
      · ${fmtDays(nuTotal.time)} of builder time</div>` : ""}
    ${nuSide ? `<div class="nu-side">Also queue — ${nuSide}</div>` : ""}
  </div>
  <div class="card" style="margin-bottom:14px"><h2>Timetable</h2>
    <div class="note">Every queue as a lane, every upgrade as a bar spanning its days — the selected range always
    fills the width, so picking fewer weeks zooms in. Hover or tap a bar for full details. Each free builder takes
    the highest-priority job (heroes → army & unlocks → key defenses → splash → point → traps → resources) from
    whichever resource is least ahead of your loot/day rates (set in To Max), so gold, elixir and dark elixir
    spending stay balanced instead of burning one resource first — except when an upgrade chain is long enough
    to set the finish date (usually a hero): that always continues immediately, so balancing never makes the
    plan take longer. The Laboratory and Pet House are single queues.
    Walls aren't scheduled — they're instant and only cost resources.</div>
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
    <div class="card"><h2>Queue summary</h2>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Queue</th><th>Upgrades</th><th>Work</th><th>Calendar</th><th>Gold</th><th>Elixir</th><th>Dark</th></tr></thead>
        <tbody>${queueRows}</tbody></table></div>
      <p class="small muted">Work = summed upgrade time (boosts applied) · Calendar = when the queue actually finishes.</p>
    </div>
    <div class="card"><h2>Builder work by priority group</h2>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Group</th><th>Upgrades</th><th>Work</th><th></th><th>Gold</th><th>Elixir</th><th>Dark</th></tr></thead>
        <tbody>${tierRows}</tbody></table></div>
      <p class="small muted">Groups are scheduled top to bottom; the timetable shows the resulting order per builder.</p>
    </div>
  </div>`;
}

/* ---------- To Max ---------- */
function wallETA(A) {
  const G = state.settings.wallGoldDay || 0, E = state.settings.wallElixirDay || 0;
  if (A.wall.rem <= 0) return 0;
  if (G + E <= 0) return Infinity;
  const goldOnly = Math.max(0, A.wall.rem - A.wall.remElixirOk);
  let d = A.wall.rem / (G + E);
  if (goldOnly > 0) d = Math.max(d, G > 0 ? goldOnly / G : Infinity);
  return d;
}

function renderToMax() {
  const A = analyze();
  const root = $("#tab-tomax");
  const s = state.settings;
  const dGold = s.lootGold > 0 ? A.totals.res.gold / s.lootGold : Infinity;
  const dElix = s.lootElixir > 0 ? A.totals.res.elixir / s.lootElixir : Infinity;
  const dDark = s.lootDark > 0 ? A.totals.res.dark / s.lootDark : Infinity;
  const buildDays = A.totals.buildH / 24 / state.builders;
  const labDays = A.totals.labH / 24;
  const wallDays = wallETA(A);
  const bottleneck = Math.max(dGold, dElix, dDark, buildDays, labDays, wallDays);
  const bottleneckName = [["farming gold", dGold], ["farming elixir", dElix], ["farming dark elixir", dDark],
    [state.builders + " builders", buildDays], ["the laboratory", labDays], ["walls at your wall budget", wallDays]]
    .sort((a, b) => b[1] - a[1])[0][0];
  const eta = new Date(Date.now() + Math.min(bottleneck, 36500) * 86400000);
  const wallEtaDate = isFinite(wallDays) ? new Date(Date.now() + wallDays * 86400000) : null;
  const segCost = A.wall.segsLeft ? A.wall.rem / A.wall.segsLeft : 0;
  // split the wall bill across both currencies, following your daily budget ratio
  const wg = s.wallGoldDay || 0, we = s.wallElixirDay || 0;
  const ratioE = wg + we > 0 ? we / (wg + we) : 0.5;
  const wallElixirShare = Math.min(A.wall.remElixirOk, Math.round(A.wall.rem * ratioE));
  const wallGoldShare = A.wall.rem - wallElixirShare;
  const segsPerWeek = segCost > 0 ? 7 * ((s.wallGoldDay || 0) + (s.wallElixirDay || 0)) / segCost : 0;

  const catRows = Object.entries(A.cats).filter(([k, c]) => c.total > 0 && k !== "walls" && k !== "equipment").map(([k, c]) => {
    const label = { defense: "Defenses", trap: "Traps", resource: "Resources", army: "Army buildings",
      heroes: "Heroes", lab: "Laboratory", pets: "Pets" }[k] || k;
    return `<tr><td>${label}</td><td>${fmt(c.res.gold)}</td><td>${fmt(c.res.elixir)}</td><td>${fmt(c.res.dark)}</td>
      <td>${c.timeRem ? fmtDays(c.timeRem) : "–"}</td><td>${c.items - c.maxed}</td></tr>`;
  }).join("");

  const wallRows = A.wall.levels.map(w => `
    <tr><td>Level ${w.lvl}${w.maxed ? ' <span class="pill good">max</span>' : ""}</td>
      <td>${w.cnt}</td><td>${w.maxed ? "–" : fmt(w.each)}</td><td>${w.maxed ? "–" : fmt(w.each * w.cnt)}</td></tr>`).join("");

  // ore planner
  const oreRem = { shiny: A.totals.shiny, glowy: A.totals.glowy, starry: A.totals.starry };
  const oreWk = { shiny: s.oreWeekShiny, glowy: s.oreWeekGlowy, starry: s.oreWeekStarry };
  const oreWeeks = Object.fromEntries(Object.keys(oreRem).map(k =>
    [k, oreWk[k] > 0 ? oreRem[k] / oreWk[k] : (oreRem[k] > 0 ? Infinity : 0)]));
  const oreBottleneckW = Math.max(...Object.values(oreWeeks));
  const bsMax = blacksmithLevel("max");
  const eqRows = Object.entries(state.equip).map(([id, lvl]) => {
    const e = byId[id];
    if (!e) return null;
    const cap = equipCapAt(bsMax, e.rarity);
    const rem = { shiny: 0, glowy: 0, starry: 0 };
    for (const r of e.rows) if (r.lvl > lvl && r.lvl <= cap) { rem.shiny += r.shiny; rem.glowy += r.glowy; rem.starry += r.starry; }
    const wk = Math.max(oreWk.shiny > 0 ? rem.shiny / oreWk.shiny : (rem.shiny ? Infinity : 0),
      oreWk.glowy > 0 ? rem.glowy / oreWk.glowy : (rem.glowy ? Infinity : 0),
      oreWk.starry > 0 ? rem.starry / oreWk.starry : (rem.starry ? Infinity : 0));
    return { name: e.name, rarity: e.rarity, lvl, cap, rem, wk };
  }).filter(Boolean).filter(r => r.lvl < r.cap).sort((a, b) => a.wk - b.wk);
  const eqTable = eqRows.slice(0, 14).map(r => `
    <tr><td>${esc(r.name)} <span class="muted small">${r.rarity}</span></td><td>${r.lvl} / ${r.cap}</td>
      <td>${fmt(r.rem.shiny)}</td><td>${fmt(r.rem.glowy)}</td><td>${fmt(r.rem.starry)}</td>
      <td>${isFinite(r.wk) ? r.wk.toFixed(1) + " wk" : "–"}</td></tr>`).join("");

  // next TH preview
  let thPreview = "";
  if (state.th < MAX_TH) {
    const next = state.th + 1;
    const A2 = analyze(next);
    const thRow = TH_ROWS.find(r => r.lvl === next);
    const unlockNames = LAB.filter(x => x.unlockTH === next).map(x => x.name)
      .concat(PETS.filter(p => p.unlockTH === next).map(p => p.name))
      .concat(HEROES.filter(h => h.unlockTH === next).map(h => h.name));
    let newInstances = 0, newLevels = 0;
    for (const b of BUILDINGS) {
      const c1 = effCount(b, state.th, "max"), c2 = effCount(b, next, "max");
      newInstances += Math.max(0, c2 - c1);
      newLevels += c2 * Math.max(0, maxLvlAt(b.rows, next) - maxLvlAt(b.rows, state.th));
    }
    const dRes = { gold: A2.totals.res.gold - A.totals.res.gold, elixir: A2.totals.res.elixir - A.totals.res.elixir,
      dark: A2.totals.res.dark - A.totals.res.dark };
    const dWall = A2.wall.rem - A.wall.rem;
    thPreview = `<div class="card" style="margin-bottom:14px"><h2>If you jumped to TH${next} today</h2>
      <div class="grid cols-3">
        <div class="tile"><div class="label"><span class="dot gold"></span>The jump itself</div>
          <div class="value">${fmt(thRow ? thRow.cost : 0)}</div><div class="delta">gold · ${fmtH(thRow ? thRow.time : 0)} build time</div></div>
        <div class="tile"><div class="label"><span class="dot accent"></span>Progress would read</div>
          <div class="value">${pctStr(A2.overall.spent, A2.overall.total)}</div><div class="delta">of TH${next} max (now ${pctStr(A.overall.spent, A.overall.total)} of TH${state.th})</div></div>
        <div class="tile"><div class="label"><span class="dot elixir"></span>Extra work unlocked</div>
          <div class="value">${fmt(dRes.gold + dRes.elixir)} <span class="muted" style="font-size:1rem">g+e</span></div>
          <div class="delta">+${fmt(dRes.dark)} dark · +${fmt(dWall)} walls</div></div>
      </div>
      <p class="small muted" style="margin:10px 0 0">TH${next} adds ${newInstances} new buildings and ${newLevels} building levels${unlockNames.length ? ", and unlocks " + unlockNames.slice(0, 8).map(esc).join(", ") + (unlockNames.length > 8 ? " +" + (unlockNames.length - 8) + " more" : "") : ""}.</p>
    </div>`;
  }

  const thRows = thTotals().map(r => `
    <tr ${r.th === state.th ? 'style="background:var(--surface-2)"' : ""}><td>${r.th === state.th ? "▶ " : ""}TH${r.th}</td>
      <td>${fmt(r.thCost)}</td><td>${fmt(r.gold)}</td><td>${fmt(r.elixir)}</td><td>${fmt(r.dark)}</td>
      <td>${fmtDays(r.buildH)}</td><td>${fmtDays(r.labH)}</td></tr>`).join("");

  root.innerHTML = `
  <div class="grid cols-4" style="margin-bottom:14px">
    ${tile("Gold to max TH" + state.th, fmt(A.totals.res.gold), "gold", "buildings + traps — walls tracked separately")}
    ${tile("Elixir to max TH" + state.th, fmt(A.totals.res.elixir), "elixir", "buildings + research")}
    ${tile("Dark Elixir to max TH" + state.th, fmt(A.totals.res.dark), "dark", "heroes + research")}
    ${tile("Walls to max", fmt(A.wall.rem), "gold", A.wall.rem > 0 ? `${A.wall.segsLeft} segments ≈ <span class="res-txt"><span class="dot gold"></span>${fmt(wallGoldShare)}</span> + <span class="res-txt"><span class="dot elixir"></span>${fmt(wallElixirShare)}</span> at your split` : "done")}
  </div>
  ${thPreview}
  <div class="grid cols-2" style="margin-bottom:14px">
    <div class="card"><h2>Time to max at TH${state.th}</h2>
      <table class="data"><tbody>
        <tr><td>Builder work (${state.builders} builders)</td><td>${fmtDays(A.totals.buildH / state.builders)}</td></tr>
        <tr><td>Laboratory</td><td>${fmtDays(A.totals.labH)}</td></tr>
        <tr><td>Pet House</td><td>${fmtDays(A.totals.petH)}</td></tr>
        <tr><td>Gold at your loot rate (excl. walls)</td><td>${isFinite(dGold) ? dGold.toFixed(0) + " days" : "set loot/day"}</td></tr>
        <tr><td>Elixir at your loot rate</td><td>${isFinite(dElix) ? dElix.toFixed(0) + " days" : "set loot/day"}</td></tr>
        <tr><td>Dark elixir at your loot rate</td><td>${isFinite(dDark) ? dDark.toFixed(0) + " days" : "set loot/day"}</td></tr>
        <tr><td>Walls at your wall budget</td><td>${isFinite(wallDays) ? wallDays.toFixed(0) + " days" : "set a wall budget"}</td></tr>
      </tbody></table>
      <p class="small" style="margin-top:10px">Bottleneck: <b>${bottleneckName}</b> →
        maxed around <b>${eta.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</b>
        (${Math.round(bottleneck)} days) at current pace.</p>
      <div class="io-row small">
        <label class="field">Gold/day <input type="number" class="wide" id="lootGold" value="${s.lootGold}" step="500000"></label>
        <label class="field">Elixir/day <input type="number" class="wide" id="lootElixir" value="${s.lootElixir}" step="500000"></label>
        <label class="field">DE/day <input type="number" class="wide" id="lootDark" value="${s.lootDark}" step="5000"></label>
      </div>
    </div>
    <div class="card"><h2>Remaining by category</h2>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Category</th><th>Gold</th><th>Elixir</th><th>Dark</th><th>Work time</th><th>Upgrades</th></tr></thead>
        <tbody>${catRows}</tbody></table></div>
      <p class="small muted">Walls and equipment have their own cards — walls spend either resource, equipment spends ores.</p>
    </div>
  </div>
  <div class="grid cols-2" style="margin-bottom:14px">
    <div class="card"><h2>Wall sprint</h2>
      <div class="note">${A.wall.segsLeft ? `${A.wall.segsLeft} segments to go, <b>${fmt(A.wall.rem)}</b> total (avg ${fmt(segCost)} per segment).
        ${A.wall.remElixirOk >= A.wall.rem ? "All of it can be paid with gold <i>or</i> elixir." : fmt(A.wall.remElixirOk) + " of it can be paid with elixir."}
        Set how much loot you can dump into walls per day:` : "Walls are done for this TH. 🧱✨"}</div>
      ${A.wall.segsLeft ? `<div class="io-row small">
        <label class="field">Gold/day <input type="number" class="wide" id="wallGoldDay" value="${s.wallGoldDay}" step="500000"></label>
        <label class="field">Elixir/day <input type="number" class="wide" id="wallElixirDay" value="${s.wallElixirDay}" step="500000"></label>
      </div>
      <p class="small" style="margin:6px 0 10px">≈ <b>${segsPerWeek.toFixed(1)}</b> walls/week →
        done in <b>${isFinite(wallDays) ? Math.ceil(wallDays) + " days" : "∞"}</b>${wallEtaDate ? ` (<b>${wallEtaDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</b>)` : ""}.
        Split at this budget: <span class="res-txt"><span class="dot gold"></span><b>${fmt(wallGoldShare)}</b> gold</span> +
        <span class="res-txt"><span class="dot elixir"></span><b>${fmt(wallElixirShare)}</b> elixir</span>${wallElixirShare >= A.wall.remElixirOk && A.wall.remElixirOk < A.wall.rem ? " (elixir capped by eligibility)" : ""}.</p>` : ""}
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Walls</th><th>Count</th><th>To max, each</th><th>Subtotal</th></tr></thead>
        <tbody>${wallRows}</tbody></table></div>
    </div>
    <div class="card"><h2>Equipment & ore plan</h2>
      <div class="note">Weekly ore income (raid medals, trader, events) → when your owned equipment maxes for this TH's Blacksmith.</div>
      <div class="io-row small">
        <label class="field"><span class="dot shiny"></span>Shiny/wk <input type="number" class="wide" id="oreWeekShiny" value="${s.oreWeekShiny}" step="500"></label>
        <label class="field"><span class="dot glowy"></span>Glowy/wk <input type="number" class="wide" id="oreWeekGlowy" value="${s.oreWeekGlowy}" step="50"></label>
        <label class="field"><span class="dot starry"></span>Starry/wk <input type="number" class="wide" id="oreWeekStarry" value="${s.oreWeekStarry}" step="5"></label>
      </div>
      <p class="small" style="margin:6px 0 10px">Remaining: <b>${fmt(oreRem.shiny)}</b> shiny (${isFinite(oreWeeks.shiny) ? oreWeeks.shiny.toFixed(0) : "∞"} wk) ·
        <b>${fmt(oreRem.glowy)}</b> glowy (${isFinite(oreWeeks.glowy) ? oreWeeks.glowy.toFixed(0) : "∞"} wk) ·
        <b>${fmt(oreRem.starry)}</b> starry (${isFinite(oreWeeks.starry) ? oreWeeks.starry.toFixed(0) : "∞"} wk)
        → all owned equipment maxed in ≈ <b>${isFinite(oreBottleneckW) ? Math.ceil(oreBottleneckW) + " weeks" : "∞"}</b>.</p>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Equipment</th><th>Level</th><th>Shiny</th><th>Glowy</th><th>Starry</th><th>Alone</th></tr></thead>
        <tbody>${eqTable || '<tr><td colspan=6 class="muted">Everything owned is maxed for this Blacksmith.</td></tr>'}</tbody></table></div>
      ${eqRows.length > 14 ? `<p class="small muted">…and ${eqRows.length - 14} more. "Alone" = weeks if all income went to that one item.</p>` : '<p class="small muted">"Alone" = weeks if all income went to that one item.</p>'}
    </div>
  </div>
  <div class="card"><h2>Every Town Hall, from scratch</h2>
    <div class="note">Cost of taking a <i>fully maxed</i> TH(n−1) to a fully maxed TH(n): everything new plus every level unlocked, walls included in the gold column.</div>
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
  const running = [];
  const ts = obj.timestamp ? obj.timestamp * 1000 : Date.now();
  const addRun = (q, slug, lvl, timer) => {
    if (timer > 0 && slug && byId[slug]) running.push({ q, id: slug, to: lvl + 1, endTs: ts + timer * 1000 });
  };
  const addInstances = (slug, lvl, cnt) => {
    const arr = state.buildings[slug] || (state.buildings[slug] = []);
    for (let i = 0; i < cnt; i++) arr.push(lvl);
  };
  for (const e of (obj.buildings || []).concat(obj.traps || [])) {
    const cnt = e.cnt || 1;
    if (e.data === 1000001) continue;
    if (e.data === 1000010) { state.walls[e.lvl] = (state.walls[e.lvl] || 0) + cnt; matched++; continue; }
    const slug = VILLAGE_BUILDING_IDS[e.data] || VILLAGE_TRAP_IDS[e.data];
    if (slug && byId[slug]) { addInstances(slug, e.lvl, cnt); addRun("builder", slug, e.lvl, e.timer); matched++; }
    else if (!VILLAGE_IGNORE_BUILDINGS.has(e.data)) unknown[e.data >= 12000000 ? "trap" : "building"]++;
  }
  for (const e of (obj.units || []).concat(obj.siege_machines || [])) {
    const slug = VILLAGE_UNIT_IDS[e.data];
    if (slug && byId[slug]) { state.lab[slug] = e.lvl; addRun("lab", slug, e.lvl, e.timer); matched++; }
    else if (!VILLAGE_IGNORE_UNITS.has(e.data)) unknown.unit++;
  }
  for (const e of obj.spells || []) {
    const slug = VILLAGE_SPELL_IDS[e.data];
    if (slug && byId[slug]) { state.lab[slug] = e.lvl; addRun("lab", slug, e.lvl, e.timer); matched++; }
    else if (!VILLAGE_IGNORE_SPELLS.has(e.data)) unknown.spell++;
  }
  for (const e of obj.heroes || []) {
    const slug = VILLAGE_HERO_IDS[e.data];
    if (slug) { state.heroes[slug] = e.lvl; addRun("builder", slug, e.lvl, e.timer); matched++; }
    else unknown.hero++;
  }
  for (const e of obj.pets || []) {
    const slug = VILLAGE_PET_IDS[e.data];
    if (slug && byId[slug]) { state.pets[slug] = e.lvl; addRun("pet", slug, e.lvl, e.timer); matched++; }
    else unknown.pet++;
  }
  for (const e of obj.equipment || []) {
    const slug = VILLAGE_EQUIP_IDS[e.data];
    if (slug && byId[slug]) { state.equip[slug] = e.lvl; matched++; } else unknown.equipment++;
  }
  state.running = running;
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

async function fetchByTag(game, tag) {
  const ep = (state.settings.apiEndpoint || "").trim().replace(/\/+$/, "");
  if (!ep) throw new Error("Set your relay URL once (see the setup note in this card)");
  const t = (tag || "").trim().replace(/^#/, "").toUpperCase();
  if (!t) throw new Error("Enter a player tag");
  const res = await fetch(`${ep}/${game}/players/${encodeURIComponent(t)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Relay responded ${res.status}: ${body.error || body.reason || body.message || "unknown error"}`);
  return body;
}

function renderIO() {
  const root = $("#tab-io");
  root.innerHTML = `
  <div class="grid cols-2">
    <div class="card"><h2>Fetch by player tag</h2>
      <div class="note">Enter your tag and fetch straight from the official API — troops, heroes, spells, pets and
      equipment come in by name. Needs the 5-minute self-hosted
      <a href="https://github.com/Kyxrem/kyxrem.github.io/tree/claude/clash-of-clans-analyzer-l3aqze/api-relay" target="_blank" rel="noopener">API relay setup</a>
      once — a tiny Node server at home holding your tokens in <code>api-relay/.env</code>; after that it's tag-only.
      Building levels still come from the village export / My Base.</div>
      <div class="io-row">
        <input class="txt" id="apiTag" placeholder="#QCPPQLQU" value="${esc(state.tag || "")}" style="max-width:180px">
        <button class="btn" id="apiGo">Fetch</button>
      </div>
      <div class="io-row small"><label class="field" style="flex:1;min-width:260px">Relay URL
        <input class="txt" id="apiEndpoint" value="${esc(state.settings.apiEndpoint || "")}" placeholder="http://localhost:8901 or https://relay.your.domain"></label></div>
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
        <button class="btn ghost" id="ioShare">Copy share link</button>
      </div>
      <div id="shareMsg"></div>
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
function bindTooltip() {
  const tip = el('<div class="g-tip" hidden></div>');
  document.body.appendChild(tip);
  let pinned = false;
  const place = (x, y) => {
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(x + 12, innerWidth - w - 8)) + "px";
    tip.style.top = (y + 16 + h > innerHeight ? y - h - 10 : y + 16) + "px";
  };
  const show = (b, x, y) => { tip.textContent = b.dataset.tip; place(x, y); };
  const hide = () => { tip.hidden = true; pinned = false; };
  const main = document.querySelector("main");
  main.addEventListener("pointerover", e => {
    if (pinned || e.pointerType === "touch") return;
    const b = e.target.closest(".g-block[data-tip]");
    if (b) show(b, e.clientX, e.clientY);
  });
  main.addEventListener("pointermove", e => {
    if (pinned || tip.hidden || e.pointerType === "touch") return;
    place(e.clientX, e.clientY);
  });
  main.addEventListener("pointerout", e => {
    if (!pinned && e.target.closest && e.target.closest(".g-block[data-tip]")) tip.hidden = true;
  });
  document.addEventListener("click", e => {   // tap on mobile pins the tip; tap elsewhere closes it
    const b = e.target.closest && e.target.closest(".g-block[data-tip]");
    if (b) { pinned = true; show(b, e.clientX, e.clientY); }
    else hide();
  });
}

/* ---------- Base Builder (layout creator with ground/air coverage) ---------- */
const LAY = window.COC_LAYOUT || { grid: 44, sizes: {}, defs: {}, thWeapon: {} };
const BGRID = LAY.grid || 44;
const BLS_KEY = "clashLayoutsV1";
const B_ABBR = {
  cannon: "Ca", archer_tower: "AT", mortar: "Mo", air_defense: "AD", wizard_tower: "WT",
  air_sweeper: "AS", hidden_tesla: "Te", bomb_tower: "BT", x_bow: "XB", inferno_tower: "IT",
  eagle_artillery: "EA", scattershot: "Sc", spell_tower: "SpT", monolith: "Mn",
  multi_archer_tower: "MA", ricochet_cannon: "RC", multi_gear_tower: "MG", firespitter: "FS",
  builder_s_hut: "BH", revenge_tower: "RT",
  bomb: "b", spring_trap: "sp", air_bomb: "ab", giant_bomb: "GB", seeking_air_mine: "sam",
  skeleton_trap: "sk", tornado_trap: "to", giga_bomb: "GB!",
  gold_mine: "GM", elixir_collector: "EC", dark_elixir_drill: "DD", gold_storage: "GS",
  elixir_storage: "ES", dark_elixir_storage: "DS",
  army_camp: "Camp", barracks: "Br", dark_barracks: "DBr", laboratory: "Lab",
  spell_factory: "SF", dark_spell_factory: "DSF", clan_castle: "CC", workshop: "WS",
  pet_house: "PH", blacksmith: "BS", hero_hall: "HH", crafting_station: "CS", town_hall: "TH",
};
const B_COLOR = { defense: "#d95926", trap: "#57534e", resource: "#c98500",
  army: "#9085e9", other: "#3987e5", wall: "#c3c2b7" };

let layouts = null;
let bTool = null;      // {mode:"place", id} | {mode:"erase"} | null = select/move
let bSel = -1;         // selected item index in slot.items
let bCover = "off";    // off | g | a | b
let bHover = null;     // hovered tile {x,y}
let bDrag = null;      // {i, ox, oy, gx, gy, moved}
let bPaint = false;    // painting walls / erasing during drag
let bShellBuilt = false;
let bDelArm = 0;
let bPx = 12;

function bLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(BLS_KEY));
    if (s && s.v === 1 && Array.isArray(s.slots)) return s;
  } catch (e) {}
  return { v: 1, cur: 0, slots: [] };
}
function bSaveL() { try { localStorage.setItem(BLS_KEY, JSON.stringify(layouts)); } catch (e) {} }
function bSlot() {
  if (!layouts.slots.length) {
    layouts.slots.push({ name: "TH" + state.th + " layout 1", th: state.th, items: [], walls: [] });
    layouts.cur = 0;
    bSaveL();
  }
  layouts.cur = Math.min(Math.max(0, layouts.cur), layouts.slots.length - 1);
  return layouts.slots[layouts.cur];
}

function bSizeOf(id) { return LAY.sizes[id] || [1, 1]; }
function bInventory(th) {
  const inv = [{ id: "town_hall", name: "Town Hall", cat: "other", count: 1 }];
  const order = { defense: 1, trap: 2, resource: 3, army: 4 };
  const rest = [];
  for (const b of BUILDINGS) {
    const n = effCount(b, th, "max");
    if (n && LAY.sizes[b.id]) rest.push({ id: b.id, name: b.name, cat: b.cat, count: n });
  }
  rest.sort((a, c) => order[a.cat] - order[c.cat] || a.name.localeCompare(c.name));
  inv.push(...rest);
  const wallN = WALLS.counts[th - 1] || 0;
  if (wallN) inv.push({ id: "wall", name: "Walls", cat: "wall", count: wallN });
  return inv;
}
function bPlacedCounts(slot) {
  const m = { wall: slot.walls.length };
  for (const it of slot.items) m[it.b] = (m[it.b] || 0) + 1;
  return m;
}
function bRect(it) { const s = bSizeOf(it.b); return { x: it.x, y: it.y, w: s[0], h: s[1] }; }
function bItemAt(slot, x, y) {
  for (let i = slot.items.length - 1; i >= 0; i--) {
    const r = bRect(slot.items[i]);
    if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) return i;
  }
  return -1;
}
function bWallAt(slot, x, y) { return slot.walls.findIndex(w => w[0] === x && w[1] === y); }
function bCollide(slot, id, x, y, skip) {
  const s = bSizeOf(id);
  if (x < 0 || y < 0 || x + s[0] > BGRID || y + s[1] > BGRID) return true;
  for (let i = 0; i < slot.items.length; i++) {
    if (i === skip) continue;
    const r = bRect(slot.items[i]);
    if (x < r.x + r.w && x + s[0] > r.x && y < r.y + r.h && y + s[1] > r.y) return true;
  }
  for (const [wx, wy] of slot.walls)
    if (wx >= x && wx < x + s[0] && wy >= y && wy < y + s[1]) return true;
  return false;
}

// effective combat reach of a placed item (null = doesn't count for coverage)
function bDefOf(it, th) {
  if (it.b === "town_hall") return LAY.thWeapon[th] || null;
  const d = LAY.defs[it.b];
  if (!d || d.trap || d.push) return null; // traps trigger, sweepers push — not damage coverage
  if (it.b === "x_bow" && d.modes) {
    const m = it.m === "g" ? "g" : "b";
    return { min: d.min, max: d.modes[m], t: m };
  }
  return d;
}
function bCoverage(slot) {
  const g = new Uint8Array(BGRID * BGRID), a = new Uint8Array(BGRID * BGRID);
  for (const it of slot.items) {
    const d = bDefOf(it, slot.th);
    if (!d) continue;
    const s = bSizeOf(it.b);
    const cx = it.x + s[0] / 2, cy = it.y + s[1] / 2;
    const min2 = d.min * d.min, max2 = d.max * d.max;
    const x0 = Math.max(0, Math.floor(cx - d.max)), x1 = Math.min(BGRID - 1, Math.ceil(cx + d.max));
    const y0 = Math.max(0, Math.floor(cy - d.max)), y1 = Math.min(BGRID - 1, Math.ceil(cy + d.max));
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const dx = tx + 0.5 - cx, dy = ty + 0.5 - cy, dd = dx * dx + dy * dy;
        if (dd < min2 || dd > max2) continue;
        const k = ty * BGRID + tx;
        if (d.t !== "a" && g[k] < 250) g[k]++;
        if (d.t !== "g" && a[k] < 250) a[k]++;
      }
    }
  }
  return { g, a };
}

function bShellHTML() {
  let ths = "";
  for (let t = 2; t <= MAX_TH; t++) ths += `<option${t === state.th ? " selected" : ""}>${t}</option>`;
  return `<div class="card" style="margin-bottom:14px">
    <h2>Base Builder</h2>
    <div class="note">Design a layout for any Town Hall with that TH's real building counts, then check which
    tiles your defenses can actually hit. Coverage counts every damage-dealing defense that targets
    <b>ground</b> or <b>air</b> — X-Bows use their set mode (click one), and the Town Hall weapon counts from
    TH12. Air Sweepers show their push cone (rotate via the selection bar) but deal no damage, so they aren't
    counted; Spell Towers, the Builder's Hut turret, Clan Castle troops and traps aren't counted either.
    Ranges are wiki values, measured building center → tile center. In-game layout links
    (link.clashofclans.com … OpenLayout) are pointers to layouts stored on Supercell's servers — nothing
    outside the game can turn one into tile positions, and the village export has none either. Attach links
    to saved layouts to build your per-TH collection and reopen any of them in the game with one tap; the
    grid is for sketching and analyzing the design itself.</div>
    <div class="b-toolbar">
      <label class="field">Layout <select id="bSlotSel"></select></label>
      <button class="btn sm ghost" id="bDup" title="copy this layout into a new slot">⧉ duplicate</button>
      <button class="btn sm ghost" id="bDel" title="delete this layout">✕ delete</button>
      <span class="b-sep"></span>
      <label class="field">TH <select id="bNewTH">${ths}</select></label>
      <button class="btn sm" id="bNew">+ new layout</button>
      <span class="b-sep"></span>
      <label class="field">Coverage <select id="bCoverSel">
        <option value="off">off</option><option value="g">ground</option>
        <option value="a">air</option><option value="b">ground + air</option></select></label>
      <button class="btn sm ghost" id="bPng">⬇ PNG</button>
    </div>
    <div class="b-toolbar">
      <label class="field">Name <input id="bName" maxlength="40"></label>
      <span class="b-linkbox" id="bLinkBox"></span>
    </div>
    <div class="b-cat" style="margin:2px 2px 6px">Library — click a base to edit it</div>
    <div class="b-lib" id="bLib"></div>
    <div class="b-main">
      <div class="b-palette" id="bPalette"></div>
      <div class="b-canvas-wrap">
        <div class="b-selbar" id="bSelbar"></div>
        <canvas id="bCanvas"></canvas>
        <div class="b-status" id="bStatus">select a building in the palette, then click the map to place it</div>
        <div class="b-cover-stats" id="bCoverStats"></div>
      </div>
    </div>
    <details class="b-io"><summary>Layout JSON (backup / share)</summary>
      <textarea id="bJson" rows="4" spellcheck="false" placeholder="export fills this box — or paste a layout here and load it"></textarea>
      <div class="io-row">
        <button class="btn sm" id="bJsonOut">→ export to box</button>
        <button class="btn sm" id="bJsonIn">← load from box</button>
        <span id="bJsonMsg" class="muted small"></span>
      </div>
    </details>
  </div>`;
}

function bLinkHref(id) {
  return "https://link.clashofclans.com/en?action=OpenLayout&id=" + encodeURIComponent(id);
}
// accepts a full share URL or a raw id like TH15:HV:AAAA… (HV = home village)
function bParseLink(txt) {
  try { txt = decodeURIComponent(txt); } catch (e) {}
  const m = String(txt).match(/TH(\d+):(HV|BB\d*):([A-Za-z0-9_-]{8,})/i);
  if (!m) return null;
  if (!/^HV$/i.test(m[2])) return { bb: true };
  const th = +m[1];
  if (th < 2 || th > MAX_TH) return null;
  return { th, id: `TH${th}:HV:${m[3]}` };
}
function bThumbCanvas(slot, px) {
  const cv = document.createElement("canvas");
  const n = BGRID * px;
  cv.width = n; cv.height = n;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#161615"; ctx.fillRect(0, 0, n, n);
  ctx.fillStyle = "#8e8b80";
  for (const [x, y] of slot.walls) ctx.fillRect(x * px, y * px, px, px);
  for (const it of slot.items) {
    const sz = bSizeOf(it.b);
    const cat = it.b === "town_hall" ? "other" : (byId[it.b] || {}).cat || "other";
    ctx.fillStyle = B_COLOR[cat];
    ctx.fillRect(it.x * px + 0.5, it.y * px + 0.5, sz[0] * px - 1, sz[1] * px - 1);
  }
  return cv;
}
function bUpdateLibrary() {
  const lib = $("#bLib");
  lib.innerHTML = "";
  const order = layouts.slots.map((sl, i) => ({ sl, i }))
    .sort((a, c) => c.sl.th - a.sl.th || a.sl.name.localeCompare(c.sl.name));
  for (const { sl, i } of order) {
    const card = document.createElement("div");
    card.className = "b-card" + (i === layouts.cur ? " cur" : "");
    card.dataset.bslot = i;
    card.appendChild(bThumbCanvas(sl, 3));
    const meta = document.createElement("div");
    meta.className = "b-card-meta";
    meta.innerHTML = `<span class="th-badge">TH ${sl.th}</span><b>${esc(sl.name)}</b>
      <span class="muted small">${sl.items.length} bld · ${sl.walls.length} walls</span>
      ${sl.link ? `<a href="${bLinkHref(sl.link)}" target="_blank" rel="noopener"
        title="opens Clash of Clans and offers to save this layout">▶ open in game</a>` : ""}`;
    card.appendChild(meta);
    lib.appendChild(card);
  }
}
function bUpdateToolbar() {
  const sel = $("#bSlotSel");
  const byTH = {};
  layouts.slots.forEach((sl, i) => (byTH[sl.th] = byTH[sl.th] || []).push(i));
  sel.innerHTML = Object.keys(byTH).sort((a, c) => c - a).map(th =>
    `<optgroup label="TH ${th}">` + byTH[th].map(i =>
      `<option value="${i}"${i === layouts.cur ? " selected" : ""}>${esc(layouts.slots[i].name)}</option>`).join("") +
    "</optgroup>").join("");
  $("#bCoverSel").value = bCover;
  $("#bDel").textContent = bDelArm ? "sure? click again" : "✕ delete";
  const slot = bSlot();
  const nameEl = $("#bName");
  if (nameEl && document.activeElement !== nameEl) nameEl.value = slot.name;
  const box = $("#bLinkBox");
  if (box) box.innerHTML = (slot.link
    ? `<a class="btn sm" href="${bLinkHref(slot.link)}" target="_blank" rel="noopener">▶ open in game</a>
       <button class="btn sm ghost" id="bUnlink" title="detach the in-game link from this layout">unlink</button>`
    : "") +
    `<input id="bLink" placeholder="paste an in-game layout link (…OpenLayout&amp;id=TH15:HV:…)">
     <button class="btn sm" id="bLinkAdd" title="attach the pasted link to this layout">⚲ attach here</button>
     <button class="btn sm ghost" id="bLinkNew" title="start a new library entry from the pasted link">+ new from link</button>
     <span id="bLinkMsg" class="muted small"></span>`;
  bUpdateLibrary();
}

function bUpdatePalette() {
  const slot = bSlot();
  const inv = bInventory(slot.th);
  const placed = bPlacedCounts(slot);
  const cats = [["other", "Town Hall"], ["defense", "Defenses"], ["trap", "Traps"],
    ["resource", "Resources"], ["army", "Army & support"], ["wall", "Walls"]];
  let html = `<div class="b-tools">
    <button class="b-pal${!bTool ? " armed" : ""}" data-btool="select">🖱 select / move</button>
    <button class="b-pal${bTool && bTool.mode === "erase" ? " armed" : ""}" data-btool="erase">⌫ eraser</button>
  </div>`;
  for (const [cat, label] of cats) {
    const rows = inv.filter(x => x.cat === cat);
    if (!rows.length) continue;
    html += `<div class="b-cat">${label}</div>`;
    for (const x of rows) {
      const left = x.count - (placed[x.id] || 0);
      const armed = bTool && bTool.mode === "place" && bTool.id === x.id;
      const d = LAY.defs[x.id];
      const tgt = x.id === "town_hall" ? (LAY.thWeapon[slot.th] ? "g+a" : "")
        : d && !d.trap ? (d.t === "b" ? "g+a" : d.t === "g" ? "gnd" : "air") : "";
      const size = bSizeOf(x.id);
      html += `<button class="b-pal${armed ? " armed" : ""}${left ? "" : " done"}" data-bid="${x.id}"
        title="${esc(x.name)} — ${size[0]}×${size[1]}${d ? ` · range ${d.min ? d.min + "–" : ""}${d.max}` : ""}">
        <span class="b-chip" style="background:${B_COLOR[x.cat]}"></span>
        <span class="b-nm">${esc(x.name)}</span>
        ${tgt ? `<span class="b-tgt">${tgt}</span>` : ""}
        <b>${left}</b></button>`;
    }
  }
  $("#bPalette").innerHTML = html;
}

function bUpdateSelbar() {
  const bar = $("#bSelbar");
  const slot = bSlot();
  const it = slot.items[bSel];
  if (!it) {
    const name = bTool && bTool.mode === "place" ? (bTool.id === "wall" ? "Walls" : (byId[bTool.id] || { name: "Town Hall" }).name) : null;
    bar.innerHTML = name
      ? `<span class="muted">placing: <b>${esc(name)}</b> — click the map (walls: click-drag paints), Esc to stop</span>`
      : bTool && bTool.mode === "erase" ? `<span class="muted">eraser — click or drag over buildings and walls</span>`
      : `<span class="muted">nothing selected</span>`;
    return;
  }
  const nm = it.b === "town_hall" ? "Town Hall" : (byId[it.b] || { name: it.b }).name;
  const d = LAY.defs[it.b];
  let extra = "";
  if (it.b === "x_bow" && d && d.modes)
    extra += `<button class="btn sm" id="bMode">mode: ${it.m === "g" ? `Ground · ${d.modes.g}` : `Ground & Air · ${d.modes.b}`} ⇄</button>`;
  if (d && d.push)
    extra += `<button class="btn sm" id="bRot">⟳ rotate</button>`;
  bar.innerHTML = `<b>${esc(nm)}</b>
    ${d && !d.trap ? `<span class="muted small">range ${d.min ? d.min + "–" : ""}${it.b === "x_bow" && d.modes ? d.modes[it.m === "g" ? "g" : "b"] : d.max}</span>` : ""}
    ${extra}<button class="btn sm ghost" id="bRemove">✕ remove (Del)</button>`;
}

function bCoverStats(slot, maps) {
  const el = $("#bCoverStats");
  if (bCover === "off") { el.textContent = ""; return; }
  const tot = BGRID * BGRID;
  let cg = 0, ca = 0;
  for (let k = 0; k < tot; k++) { if (maps.g[k]) cg++; if (maps.a[k]) ca++; }
  const parts = [];
  if (bCover !== "a") parts.push(`ground-covered: ${cg} tiles (${Math.round(cg / tot * 100)}%)`);
  if (bCover !== "g") parts.push(`air-covered: ${ca} tiles (${Math.round(ca / tot * 100)}%)`);
  el.textContent = parts.join(" · ");
}

function bDraw() {
  const cv = $("#bCanvas");
  if (!cv) return;
  const slot = bSlot();
  const wrap = cv.parentElement;
  bPx = Math.max(9, Math.min(16, Math.floor((wrap.clientWidth - 2) / BGRID)));
  const cw = bPx * BGRID;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== cw * dpr) { cv.width = cw * dpr; cv.height = cw * dpr; }
  cv.style.width = cw + "px"; cv.style.height = cw + "px";
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cw, cw);
  ctx.fillStyle = "#161615";
  ctx.fillRect(0, 0, cw, cw);

  const maps = bCoverage(slot);
  if (bCover !== "off") {
    for (let ty = 0; ty < BGRID; ty++) {
      for (let tx = 0; tx < BGRID; tx++) {
        const k = ty * BGRID + tx;
        if (bCover !== "a" && maps.g[k]) {
          ctx.fillStyle = `rgba(201,133,0,${Math.min(0.12 + 0.09 * maps.g[k], 0.55)})`;
          ctx.fillRect(tx * bPx, ty * bPx, bPx, bPx);
        }
        if (bCover !== "g" && maps.a[k]) {
          ctx.fillStyle = `rgba(57,135,229,${Math.min(0.12 + 0.09 * maps.a[k], 0.55) * (bCover === "b" ? 0.75 : 1)})`;
          ctx.fillRect(tx * bPx, ty * bPx, bPx, bPx);
        }
      }
    }
  }

  ctx.strokeStyle = "rgba(255,255,255,0.045)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= BGRID; i++) {
    ctx.moveTo(i * bPx + 0.5, 0); ctx.lineTo(i * bPx + 0.5, cw);
    ctx.moveTo(0, i * bPx + 0.5); ctx.lineTo(cw, i * bPx + 0.5);
  }
  ctx.stroke();

  // sweeper push cones (air modes)
  if (bCover === "a" || bCover === "b") {
    for (const it of slot.items) {
      const d = LAY.defs[it.b];
      if (!d || !d.push) continue;
      const s = bSizeOf(it.b);
      const cx = (it.x + s[0] / 2) * bPx, cy = (it.y + s[1] / 2) * bPx;
      const a0 = (-90 + (it.d || 0) * 45 - (d.cone || 120) / 2) * Math.PI / 180;
      const a1 = (-90 + (it.d || 0) * 45 + (d.cone || 120) / 2) * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, d.max * bPx, a0, a1);
      ctx.closePath();
      ctx.fillStyle = "rgba(57,135,229,0.10)";
      ctx.strokeStyle = "rgba(57,135,229,0.45)";
      ctx.fill(); ctx.stroke();
    }
  }

  for (const [wx, wy] of slot.walls) {
    ctx.fillStyle = "#8e8b80";
    ctx.fillRect(wx * bPx + 1.5, wy * bPx + 1.5, bPx - 3, bPx - 3);
  }

  slot.items.forEach((it, i) => {
    if (bDrag && bDrag.i === i && bDrag.moved) return; // drawn as ghost below
    bDrawItem(ctx, it, i === bSel);
  });

  // selected: range rings
  const sel = slot.items[bSel];
  if (sel) {
    const d = bDefOf(sel, slot.th) || (LAY.defs[sel.b] && !LAY.defs[sel.b].trap ? LAY.defs[sel.b] : null);
    if (d) {
      const s = bSizeOf(sel.b);
      const cx = (sel.x + s[0] / 2) * bPx, cy = (sel.y + s[1] / 2) * bPx;
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, d.max * bPx, 0, 7); ctx.stroke();
      if (d.min) {
        ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.arc(cx, cy, d.min * bPx, 0, 7); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // ghost: placement preview or drag target
  let ghost = null;
  if (bDrag && bDrag.moved) {
    const it = slot.items[bDrag.i];
    ghost = { id: it.b, x: bDrag.gx, y: bDrag.gy, ok: !bCollide(slot, it.b, bDrag.gx, bDrag.gy, bDrag.i), it };
  } else if (bTool && bTool.mode === "place" && bTool.id !== "wall" && bHover) {
    const s = bSizeOf(bTool.id);
    const x = bHover.x - ((s[0] - 1) >> 1), y = bHover.y - ((s[1] - 1) >> 1);
    ghost = { id: bTool.id, x, y, ok: !bCollide(slot, bTool.id, x, y, -1) };
  }
  if (ghost) {
    const s = bSizeOf(ghost.id);
    ctx.globalAlpha = 0.75;
    bDrawItem(ctx, { b: ghost.id, x: ghost.x, y: ghost.y, m: ghost.it && ghost.it.m, d: ghost.it && ghost.it.d }, false);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ghost.ok ? "rgba(12,163,12,0.9)" : "rgba(208,59,59,0.95)";
    ctx.lineWidth = 2;
    ctx.strokeRect(ghost.x * bPx + 1, ghost.y * bPx + 1, s[0] * bPx - 2, s[1] * bPx - 2);
    ctx.lineWidth = 1;
    const gd = ghost.id === "town_hall" ? LAY.thWeapon[slot.th] : LAY.defs[ghost.id];
    if (gd && !gd.trap && ghost.ok) {
      const cx = (ghost.x + s[0] / 2) * bPx, cy = (ghost.y + s[1] / 2) * bPx;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.beginPath(); ctx.arc(cx, cy, (gd.push || !gd.modes ? gd.max : gd.modes.b) * bPx, 0, 7); ctx.stroke();
    }
  }

  bCoverStats(slot, maps);
}

function bDrawItem(ctx, it, selected) {
  const s = bSizeOf(it.b);
  const x = it.x * bPx, y = it.y * bPx, w = s[0] * bPx, h = s[1] * bPx;
  const cat = it.b === "town_hall" ? "other" : (byId[it.b] || {}).cat || "other";
  const d = LAY.defs[it.b];
  ctx.fillStyle = B_COLOR[cat] + (cat === "trap" ? "88" : "cc");
  if (ctx.roundRect) {
    ctx.beginPath(); ctx.roundRect(x + 1.5, y + 1.5, w - 3, h - 3, 3); ctx.fill();
  } else ctx.fillRect(x + 1.5, y + 1.5, w - 3, h - 3);
  if (cat === "trap") {
    ctx.setLineDash([3, 2]);
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.setLineDash([]);
  }
  if (selected) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.lineWidth = 1;
  }
  const label = B_ABBR[it.b] || "?";
  if (w >= 18) {
    ctx.fillStyle = cat === "trap" ? "#e7e5df" : "#0d0d0d";
    ctx.font = `bold ${Math.min(11, Math.floor(bPx * 0.75))}px system-ui`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(label, x + w / 2, y + h / 2 + 0.5);
  }
  // sweeper facing arrow
  if (d && d.push) {
    const ang = (-90 + (it.d || 0) * 45) * Math.PI / 180;
    const cx = x + w / 2, cy = y + h / 2, r = Math.min(w, h) * 0.42;
    ctx.strokeStyle = "#0d0d0d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  // x-bow ground-mode marker
  if (it.b === "x_bow" && it.m === "g") {
    ctx.fillStyle = "#0d0d0d";
    ctx.fillRect(x + w - 7, y + 3, 4, 4);
  }
}

function bStatusMsg(msg) { $("#bStatus").textContent = msg; }

function bRefresh(saveIt) {
  if (saveIt) bSaveL();
  bUpdateToolbar(); bUpdatePalette(); bUpdateSelbar(); bDraw();
}

function bTileFromEvent(e) {
  const cv = $("#bCanvas");
  const r = cv.getBoundingClientRect();
  const x = Math.floor((e.clientX - r.left) / bPx), y = Math.floor((e.clientY - r.top) / bPx);
  if (x < 0 || y < 0 || x >= BGRID || y >= BGRID) return null;
  return { x, y };
}

function bPlaceAt(t) {
  const slot = bSlot();
  const inv = bInventory(slot.th);
  const placed = bPlacedCounts(slot);
  const entry = inv.find(x => x.id === bTool.id);
  const left = entry ? entry.count - (placed[bTool.id] || 0) : 0;
  if (bTool.id === "wall") {
    if (left <= 0) { bStatusMsg("no wall pieces left at TH" + slot.th); return; }
    if (bWallAt(slot, t.x, t.y) >= 0 || bItemAt(slot, t.x, t.y) >= 0) return;
    slot.walls.push([t.x, t.y]);
    bRefresh(true);
    return;
  }
  const s = bSizeOf(bTool.id);
  const x = t.x - ((s[0] - 1) >> 1), y = t.y - ((s[1] - 1) >> 1);
  if (left <= 0) { bStatusMsg("all placed — none left at TH" + slot.th); bTool = null; bRefresh(false); return; }
  if (bCollide(slot, bTool.id, x, y, -1)) { bStatusMsg("doesn't fit there"); return; }
  slot.items.push({ b: bTool.id, x, y });
  if (left - 1 <= 0) { bTool = null; bSel = slot.items.length - 1; }
  bRefresh(true);
}

function bEraseAt(t) {
  const slot = bSlot();
  const wi = bWallAt(slot, t.x, t.y);
  if (wi >= 0) { slot.walls.splice(wi, 1); bRefresh(true); return; }
  const ii = bItemAt(slot, t.x, t.y);
  if (ii >= 0) {
    slot.items.splice(ii, 1);
    if (bSel === ii) bSel = -1; else if (bSel > ii) bSel--;
    bRefresh(true);
  }
}

function bHoverInfo(t) {
  const slot = bSlot();
  const ii = bItemAt(slot, t.x, t.y);
  if (ii >= 0) {
    const it = slot.items[ii];
    const nm = it.b === "town_hall" ? "Town Hall" : (byId[it.b] || { name: it.b }).name;
    const s = bSizeOf(it.b);
    const d = it.b === "town_hall" ? LAY.thWeapon[slot.th] : LAY.defs[it.b];
    const T = { g: "ground", a: "air", b: "ground & air" };
    bStatusMsg(`${nm} — ${s[0]}×${s[1]}` +
      (d ? ` · ${d.trap ? "trigger" : "range"} ${d.min ? d.min + "–" : ""}${it.b === "x_bow" && d.modes ? d.modes[it.m === "g" ? "g" : "b"] : d.max} · ${d.push ? "pushes air" : "hits " + T[it.b === "x_bow" ? (it.m === "g" ? "g" : "b") : d.t]}` : "") +
      ` · tile ${t.x},${t.y}`);
  } else if (bWallAt(slot, t.x, t.y) >= 0) bStatusMsg(`Wall · tile ${t.x},${t.y}`);
  else bStatusMsg(`tile ${t.x},${t.y}`);
}

function bBindCanvas() {
  const cv = $("#bCanvas");
  cv.addEventListener("pointerdown", e => {
    const t = bTileFromEvent(e);
    if (!t) return;
    e.preventDefault();
    cv.setPointerCapture(e.pointerId);
    const slot = bSlot();
    if (bTool && bTool.mode === "place") {
      bPlaceAt(t);
      if (bTool && bTool.id === "wall") bPaint = true;
      return;
    }
    if (bTool && bTool.mode === "erase") { bEraseAt(t); bPaint = true; return; }
    const ii = bItemAt(slot, t.x, t.y);
    if (ii >= 0) {
      bSel = ii;
      const it = slot.items[ii];
      bDrag = { i: ii, ox: t.x - it.x, oy: t.y - it.y, gx: it.x, gy: it.y, moved: false };
    } else bSel = -1;
    bRefresh(false);
  });
  cv.addEventListener("pointermove", e => {
    const t = bTileFromEvent(e);
    if (!t) return;
    const changed = !bHover || bHover.x !== t.x || bHover.y !== t.y;
    bHover = t;
    if (bPaint && bTool) {
      if (bTool.mode === "erase") bEraseAt(t);
      else if (bTool.id === "wall") bPlaceAt(t);
      return;
    }
    if (bDrag) {
      const gx = t.x - bDrag.ox, gy = t.y - bDrag.oy;
      if (gx !== bDrag.gx || gy !== bDrag.gy || !bDrag.moved) {
        bDrag.gx = gx; bDrag.gy = gy;
        bDrag.moved = bDrag.moved || gx !== bSlot().items[bDrag.i].x || gy !== bSlot().items[bDrag.i].y;
        bDraw();
      }
      return;
    }
    if (changed) {
      bHoverInfo(t);
      if (bTool && bTool.mode === "place") bDraw();
    }
  });
  cv.addEventListener("pointerup", e => {
    bPaint = false;
    if (bDrag) {
      const slot = bSlot();
      const it = slot.items[bDrag.i];
      if (bDrag.moved && !bCollide(slot, it.b, bDrag.gx, bDrag.gy, bDrag.i)) {
        it.x = bDrag.gx; it.y = bDrag.gy;
        bDrag = null;
        bRefresh(true);
      } else {
        bDrag = null;
        bDraw();
      }
    }
  });
  cv.addEventListener("pointerleave", () => {
    bHover = null; bPaint = false;
    if (!bDrag) bDraw();
  });
}

function bImportJSON(txt) {
  let s;
  try { s = JSON.parse(txt); } catch (e) { return "not valid JSON"; }
  const th = Math.min(Math.max(2, +s.th || 0), MAX_TH);
  if (!th || !Array.isArray(s.items) || !Array.isArray(s.walls)) return "missing th / items / walls";
  const slot = { name: String(s.name || `TH${th} import`).slice(0, 40), th, items: [], walls: [] };
  const pl = bParseLink(String(s.link || ""));
  if (pl && pl.id) slot.link = pl.id;
  const inv = bInventory(th);
  const caps = {}; inv.forEach(x => caps[x.id] = x.count);
  let dropped = 0;
  for (const raw of s.items) {
    const it = { b: String(raw.b), x: raw.x | 0, y: raw.y | 0 };
    if (raw.m === "g") it.m = "g";
    if (raw.d) it.d = raw.d & 7;
    const used = slot.items.filter(z => z.b === it.b).length;
    if (!LAY.sizes[it.b] || !(caps[it.b] > used) || bCollide(slot, it.b, it.x, it.y, -1)) { dropped++; continue; }
    slot.items.push(it);
  }
  for (const raw of s.walls) {
    const x = raw[0] | 0, y = raw[1] | 0;
    if (x < 0 || y < 0 || x >= BGRID || y >= BGRID || slot.walls.length >= (caps.wall || 0)
      || bWallAt(slot, x, y) >= 0 || bItemAt(slot, x, y) >= 0) { dropped++; continue; }
    slot.walls.push([x, y]);
  }
  layouts.slots.push(slot);
  layouts.cur = layouts.slots.length - 1;
  bSel = -1; bTool = null;
  bRefresh(true);
  return `loaded "${slot.name}"` + (dropped ? ` — ${dropped} entr${dropped === 1 ? "y" : "ies"} dropped (over count / collision / unknown)` : "");
}

function bBindShell() {
  const root = $("#tab-builder");
  root.addEventListener("click", e => {
    const tool = e.target.closest("[data-btool]");
    if (tool) {
      bTool = tool.dataset.btool === "erase" ? { mode: "erase" } : null;
      bSel = -1; bRefresh(false); return;
    }
    const pal = e.target.closest("[data-bid]");
    if (pal) {
      const id = pal.dataset.bid;
      bTool = bTool && bTool.mode === "place" && bTool.id === id ? null : { mode: "place", id };
      bSel = -1; bRefresh(false); return;
    }
    if (e.target.id === "bNew") {
      const th = +$("#bNewTH").value;
      const n = layouts.slots.filter(s => s.th === th).length + 1;
      layouts.slots.push({ name: `TH${th} layout ${n}`, th, items: [], walls: [] });
      layouts.cur = layouts.slots.length - 1;
      bSel = -1; bTool = null; bRefresh(true); return;
    }
    if (e.target.id === "bDup") {
      const cur = bSlot();
      layouts.slots.push(JSON.parse(JSON.stringify({ ...cur, name: cur.name.slice(0, 34) + " copy" })));
      layouts.cur = layouts.slots.length - 1;
      bSel = -1; bRefresh(true); return;
    }
    if (e.target.id === "bDel") {
      if (!bDelArm) {
        bDelArm = 1; bUpdateToolbar();
        setTimeout(() => { bDelArm = 0; const d = $("#bDel"); if (d) bUpdateToolbar(); }, 2500);
        return;
      }
      bDelArm = 0;
      layouts.slots.splice(layouts.cur, 1);
      layouts.cur = Math.max(0, layouts.cur - 1);
      bSel = -1; bTool = null; bRefresh(true); return;
    }
    if (e.target.id === "bPng") {
      const cv = $("#bCanvas");
      const name = bSlot().name.replace(/[^\w-]+/g, "-");
      cv.toBlob(bl => {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(bl);
        a.download = name + ".png";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      });
      return;
    }
    if (e.target.id === "bJsonOut") {
      $("#bJson").value = JSON.stringify(bSlot());
      $("#bJsonMsg").textContent = "copy the box contents somewhere safe";
      return;
    }
    if (e.target.id === "bJsonIn") {
      $("#bJsonMsg").textContent = bImportJSON($("#bJson").value.trim());
      return;
    }
    if (e.target.id === "bRemove") {
      const slot = bSlot();
      if (bSel >= 0) { slot.items.splice(bSel, 1); bSel = -1; bRefresh(true); }
      return;
    }
    if (e.target.id === "bMode") {
      const it = bSlot().items[bSel];
      if (it) { it.m = it.m === "g" ? "b" : "g"; bRefresh(true); }
      return;
    }
    if (e.target.id === "bRot") {
      const it = bSlot().items[bSel];
      if (it) { it.d = ((it.d || 0) + 1) & 7; bRefresh(true); }
      return;
    }
    if (e.target.id === "bLinkAdd" || e.target.id === "bLinkNew") {
      const raw = ($("#bLink").value || "").trim();
      const pl = bParseLink(raw);
      const msg = $("#bLinkMsg");
      if (!raw) { msg.textContent = "paste a link first"; return; }
      if (!pl) { msg.textContent = "that doesn't look like a layout link (expected …id=TH##:HV:…)"; return; }
      if (pl.bb) { msg.textContent = "that's a Builder Base link — only home-village layouts are supported"; return; }
      if (e.target.id === "bLinkAdd") {
        const slot = bSlot();
        slot.link = pl.id;
        bRefresh(true);
        $("#bLinkMsg").textContent = pl.th !== slot.th
          ? `attached — note: the link says TH${pl.th} but this layout is set up for TH${slot.th}`
          : "attached ✓";
      } else {
        const n = layouts.slots.filter(sl => sl.th === pl.th).length + 1;
        layouts.slots.push({ name: `TH${pl.th} base ${n}`, th: pl.th, items: [], walls: [], link: pl.id });
        layouts.cur = layouts.slots.length - 1;
        bSel = -1; bTool = null;
        bRefresh(true);
        $("#bLinkMsg").textContent = `added to the library — sketch it on the grid or just keep the link`;
      }
      return;
    }
    if (e.target.id === "bUnlink") {
      delete bSlot().link;
      bRefresh(true);
      return;
    }
    const card = e.target.closest("[data-bslot]");
    if (card && !e.target.closest("a")) {
      layouts.cur = +card.dataset.bslot;
      bSel = -1; bTool = null;
      bRefresh(true);
      return;
    }
  });
  root.addEventListener("change", e => {
    if (e.target.id === "bName") {
      const v = e.target.value.trim();
      if (v) { bSlot().name = v.slice(0, 40); bRefresh(true); }
      return;
    }
    if (e.target.id === "bSlotSel") {
      layouts.cur = +e.target.value;
      bSel = -1; bTool = null; bRefresh(true);
    } else if (e.target.id === "bCoverSel") {
      bCover = e.target.value; bDraw();
    }
  });
  bBindCanvas();
  window.addEventListener("resize", () => { if (activeTab === "builder") bDraw(); });
  document.addEventListener("keydown", e => {
    if (activeTab !== "builder") return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName || "")) return;
    if (e.key === "Escape") { bTool = null; bDrag = null; bRefresh(false); }
    else if ((e.key === "Delete" || e.key === "Backspace") && bSel >= 0) {
      e.preventDefault();
      const slot = bSlot();
      slot.items.splice(bSel, 1); bSel = -1; bRefresh(true);
    } else if ((e.key === "r" || e.key === "R") && bSel >= 0) {
      const it = bSlot().items[bSel];
      const d = LAY.defs[it.b];
      if (d && d.push) { it.d = ((it.d || 0) + 1) & 7; bRefresh(true); }
      else if (it.b === "x_bow") { it.m = it.m === "g" ? "b" : "g"; bRefresh(true); }
    }
  });
}

function renderBuilder() {
  const root = $("#tab-builder");
  if (!root) return;
  layouts = layouts || bLoad();
  if (!bShellBuilt) {
    root.innerHTML = bShellHTML();
    bBindShell();
    bShellBuilt = true;
  }
  bRefresh(false);
}

function bindEvents() {
  bindTooltip();
  const restore = $("#restoreBase");
  if (restore) {
    restore.hidden = !window.MY_BASE;
    restore.addEventListener("click", () => { loadMyBase(); renderActive(); });
  }
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
    } else if (t.id === "ganttHorizon") { ganttHorizon = +t.value; renderPlan(); }
    else if (t.id === "buildBoost") { state.settings.buildBoost = +t.value; save(); renderActive(); }
    else if (t.id === "labBoost") { state.settings.labBoost = +t.value; save(); renderActive(); }
    else if (t.id === "lootGold") { state.settings.lootGold = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "lootElixir") { state.settings.lootElixir = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "lootDark") { state.settings.lootDark = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "apiEndpoint") { state.settings.apiEndpoint = t.value.trim(); save(); }
    else if (t.id === "wallGoldDay") { state.settings.wallGoldDay = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "wallElixirDay") { state.settings.wallElixirDay = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "oreWeekShiny") { state.settings.oreWeekShiny = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "oreWeekGlowy") { state.settings.oreWeekGlowy = Math.max(0, +t.value || 0); save(); renderActive(); }
    else if (t.id === "oreWeekStarry") { state.settings.oreWeekStarry = Math.max(0, +t.value || 0); save(); renderActive(); }
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
    if (t.id === "ioShare") {
      shareLink().then(url => navigator.clipboard.writeText(url).then(() => url)).then(url => {
        $("#shareMsg").innerHTML = `<div class="msg ok">Link copied (${url.length} chars) — anyone opening it sees a read-only copy of this base and can choose to keep it.</div>`;
      }).catch(err => {
        $("#shareMsg").innerHTML = `<div class="msg err">Couldn't build the link: ${esc(err.message)}</div>`;
      });
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
        const data = await fetchByTag("coc", $("#apiTag").value);
        const msg = detectAndImport(data);
        box.innerHTML = `<div class="msg ok">${msg}</div>`;
        renderHeader();
      } catch (err) {
        box.innerHTML = `<div class="msg err">${esc(err.message)}. No relay yet? Do the one-time setup, or use “Paste JSON” — same data.</div>`;
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

/* ---------------- share links ---------------- */
let viewShared = false;
const _save = save;
save = function () { if (!viewShared) _save(); };

async function shareLink() {
  const json = JSON.stringify(state);
  let bytes = new TextEncoder().encode(json);
  let flag = "r";
  if (typeof CompressionStream !== "undefined") {
    const cs = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    bytes = new Uint8Array(await new Response(cs).arrayBuffer());
    flag = "d";
  }
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  const b64 = btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return location.origin + location.pathname + "#b=" + flag + b64;
}

async function tryHashImport() {
  const m = location.hash.match(/^#b=([dr])([A-Za-z0-9_-]+)$/);
  if (!m) return false;
  try {
    const bin = atob(m[2].replace(/-/g, "+").replace(/_/g, "/"));
    let bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (m[1] === "d") {
      const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      bytes = new Uint8Array(await new Response(ds).arrayBuffer());
    }
    const st = JSON.parse(new TextDecoder().decode(bytes));
    if (st.v !== 1) return false;
    state = st;
    viewShared = true;
    return true;
  } catch (e) {
    console.warn("share link decode failed", e);
    return false;
  }
}

function showSharedBanner() {
  const banner = el(`<div class="msg info" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 14px">
    <span style="flex:1">Viewing a <b>shared base</b> ${esc(state.tag || "")} (TH${state.th}) — nothing is saved unless you keep it.</span>
    <button class="btn sm" id="shareKeep">Keep this base</button>
    <button class="btn sm ghost" id="shareDismiss">✕ back to mine</button></div>`);
  document.querySelector("main").before(banner);
  banner.querySelector("#shareKeep").addEventListener("click", () => {
    viewShared = false; save();
    history.replaceState(null, "", location.pathname);
    banner.remove(); renderActive();
  });
  banner.querySelector("#shareDismiss").addEventListener("click", () => {
    viewShared = false;
    history.replaceState(null, "", location.pathname);
    state = load() || (window.MY_BASE ? JSON.parse(JSON.stringify(window.MY_BASE)) : freshState(11));
    normalize(); banner.remove(); renderHeader(); renderActive();
  });
}

/* ---------------- boot ---------------- */
function loadMyBase() {
  state = JSON.parse(JSON.stringify(window.MY_BASE));
  normalize(); save();
}

async function boot() {
  $("#dataDate").textContent = D.meta.generated;
  $("#dataMaxTH").textContent = D.meta.maxTH;
  const shared = await tryHashImport();
  if (shared) {
    normalize();
  } else {
    state = load();
    const firstVisit = !state;
    if (!state) state = freshState(11);
    normalize();
    if (firstVisit) {
      if (window.MY_BASE) loadMyBase(); else loadSample();
    }
  }
  bindEvents();
  renderHeader();
  if (shared) showSharedBanner();
  renderActive();
}
boot();
})();
