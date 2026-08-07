/* Royale Analyzer — all client-side. Data from data.js (window.CR_DATA). */
(function () {
"use strict";

const D = window.CR_DATA;
const MAXL = D.meta.maxLevel;
const RARS = ["common", "rare", "epic", "legendary", "champion"];
const RAR_LABEL = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary",
  champion: "Champion", tower: "Tower troop" };
const CARDS = D.cards;
const byId = {};
CARDS.forEach(c => byId[c.id] = c);

function rarKey(c) { return c.type === "tower" ? (c.towerRarity || "common") : c.rarity; }
function rarRows(c) { return (D.rarities[rarKey(c)] || D.rarities.common).levels; }
function startLvl(c) { return (D.rarities[rarKey(c)] || D.rarities.common).start; }

/* ---------------- state ---------------- */
const LS_KEY = "royaleAnalyzerV1";
let state = null;

function freshState() {
  return { v: 1, tag: "", name: "", king: 0, trophies: 0, best: 0,
    cards: {}, deck: [], settings: { apiEndpoint: "" } };
}
function save() { try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) {} }
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_KEY));
    if (s && s.v === 1) return s;
  } catch (e) {}
  return null;
}
function normalize() {
  state.settings = { ...freshState().settings, ...(state.settings || {}) };
  for (const [id, c] of Object.entries(state.cards)) {
    const card = byId[id];
    if (!card) { delete state.cards[id]; continue; }
    c.lvl = Math.max(0, Math.min(c.lvl || 0, MAXL));
    if (c.lvl > 0) c.lvl = Math.max(c.lvl, startLvl(card));
    c.count = Math.max(0, Math.floor(c.count || 0));
    c.evo = card.evo ? (c.evo ? 1 : 0) : 0;
    c.hero = card.hero ? (c.hero ? 1 : 0) : 0;
  }
  state.deck = (state.deck || []).filter(id => byId[id]).slice(0, 8);
}

/* ---------------- engine ---------------- */
function nextRow(card, lvl) {
  return rarRows(card).find(r => r.lvl === lvl + 1) || null;
}
function goldSpent(card, lvl) {
  return rarRows(card).filter(r => r.lvl <= lvl).reduce((s, r) => s + r.gold, 0);
}
function goldTotal(card) {
  return rarRows(card).reduce((s, r) => s + r.gold, 0);
}
function goldToMax(card, lvl) {
  return rarRows(card).filter(r => r.lvl > Math.max(lvl, 0)).reduce((s, r) => s + r.gold, 0);
}
function cardsToMax(card, lvl) {
  return rarRows(card).filter(r => r.lvl > Math.max(lvl, 0)).reduce((s, r) => s + r.cards, 0);
}

function analyze() {
  const A = { found: 0, total: CARDS.length, maxed: 0, evoOwned: 0,
    evoTotal: CARDS.filter(c => c.evo).length,
    heroOwned: 0, heroTotal: CARDS.filter(c => c.hero).length,
    goldRem: 0, goldSpent: 0, goldAll: 0, ready: [], lvlSum: 0,
    byRar: {} };
  for (const r of RARS.concat("tower")) {
    A.byRar[r] = { found: 0, total: 0, maxed: 0, goldRem: 0, goldSpent: 0, goldAll: 0, cardsRem: 0, have: 0 };
  }
  for (const card of CARDS) {
    const grp = card.type === "tower" ? "tower" : card.rarity;
    const R = A.byRar[grp];
    R.total++;
    const st = state.cards[card.id];
    const lvl = st ? st.lvl : 0;
    const all = goldTotal(card);
    A.goldAll += all; R.goldAll += all;
    if (lvl > 0) {
      A.found++; R.found++;
      A.lvlSum += lvl;
      const spent = goldSpent(card, lvl);
      A.goldSpent += spent; R.goldSpent += spent;
      const rem = goldToMax(card, lvl);
      A.goldRem += rem; R.goldRem += rem;
      R.cardsRem += cardsToMax(card, lvl);
      R.have += st.count || 0;
      if (lvl >= MAXL) { A.maxed++; R.maxed++; }
      if (st.evo) A.evoOwned++;
      if (st.hero) A.heroOwned++;
      const nx = nextRow(card, lvl);
      if (nx && (st.count || 0) >= nx.cards) {
        A.ready.push({ id: card.id, name: card.name, rarity: grp, to: lvl + 1,
          gold: nx.gold, count: st.count, need: nx.cards });
      }
    } else {
      A.goldRem += all;
      R.goldRem += all;
      R.cardsRem += cardsToMax(card, 0);
    }
  }
  A.ready.sort((a, b) => a.gold - b.gold);
  return A;
}

/* ---------------- formatting & helpers ---------------- */
function fmt(n) {
  if (n == null) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6) >= 100 ? Math.round(n / 1e6) + "M" : (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (a >= 1e4) return Math.round(n / 1e3) + "K";
  if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
}
function fmtFull(n) { return Math.round(n).toLocaleString("en-US"); }
function pct(a, b) { return b > 0 ? Math.min(100, 100 * a / b) : 0; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
const $ = sel => document.querySelector(sel);
function rarChip(r) { return `<span class="rar ${r}">${RAR_LABEL[r] || r}</span>`; }
function tile(label, value, cls, sub) {
  return `<div class="card tile"><div class="label"><span class="dot ${cls || "accent"}"></span>${label}</div>
    <div class="value">${value}</div>${sub ? `<div class="delta">${sub}</div>` : ""}</div>`;
}
function progRow(name, a, b, extra) {
  const p = pct(a, b);
  return `<div class="prog-row" title="${fmtFull(a)} of ${fmtFull(b)} gold invested">
    <div class="name">${name}</div>
    <div class="bar"><span style="width:${p.toFixed(1)}%"></span></div>
    <div class="pct"><b>${p.toFixed(1)}%</b>${extra ? ` <span class="muted small">${extra}</span>` : ""}</div></div>`;
}

/* ---------------- tabs ---------------- */
const TABS = ["overview", "collection", "deck", "meta", "stats", "io"];
const DECKS = window.CR_DECKS || { updated: "", groups: [] };
let metaFilter = { group: "ranked", cards: false, evo: false, hero: false };
let activeTab = "overview";
let collFilter = { q: "", rar: "all", sort: "level" };
let statsCard = "knight";

function switchTab(t) {
  activeTab = t;
  for (const name of TABS) $("#tab-" + name).hidden = name !== t;
  document.querySelectorAll("nav.tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === t));
  renderActive();
}
function renderActive() {
  renderHeader();
  if (activeTab === "overview") renderOverview();
  if (activeTab === "collection") renderCollection();
  if (activeTab === "deck") renderDeck();
  if (activeTab === "meta") renderMeta();
  if (activeTab === "stats") renderStats();
  if (activeTab === "io") renderIO();
}
function renderHeader() {
  $("#kingBadge").textContent = "King " + (state.king || "–");
  $("#playerName").textContent = state.name ? `${state.name} ${state.tag || ""}` :
    state.tag ? state.tag : "no profile loaded — try the sample";
}

/* ---------- Overview ---------- */
function ringSVG(p) {
  const r = 62, c = 2 * Math.PI * r;
  return `<div class="ring"><svg width="148" height="148" viewBox="0 0 148 148" role="img" aria-label="collection progress ${p.toFixed(1)}%">
    <circle cx="74" cy="74" r="${r}" fill="none" stroke="var(--surface-2)" stroke-width="13"/>
    <circle cx="74" cy="74" r="${r}" fill="none" stroke="var(--accent)" stroke-width="13" stroke-linecap="round"
      stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}"/></svg>
    <div class="center"><div class="big">${p.toFixed(1)}%</div><div class="cap">of full collection</div></div></div>`;
}

function renderOverview() {
  const A = analyze();
  const root = $("#tab-overview");
  const bars = RARS.concat("tower").filter(r => A.byRar[r].total > 0).map(r => {
    const R = A.byRar[r];
    return progRow(RAR_LABEL[r], R.goldSpent, R.goldAll, `${R.maxed}/${R.total} maxed`);
  }).join("");
  const readyGold = A.ready.reduce((s, r) => s + r.gold, 0);
  const readyRows = A.ready.slice(0, 12).map(r => `
    <div class="plan-item" style="grid-template-columns:1fr auto auto">
      <div class="what"><b>${esc(r.name)}</b> → L${r.to} <span class="muted small">(${fmtFull(r.count)}/${fmtFull(r.need)} cards)</span></div>
      <div class="cost"><span class="dot gold" style="margin-right:4px"></span>${fmt(r.gold)}</div>
      <div class="when">${rarChip(r.rarity)}</div>
    </div>`).join("");
  const rarNeeds = RARS.map(r => {
    const R = A.byRar[r];
    return `<tr><td>${rarChip(r)}</td><td>${R.found} / ${R.total}</td><td>${fmtFull(R.cardsRem)}</td><td>${fmt(R.goldRem)}</td><td>${R.maxed}</td></tr>`;
  }).join("");
  root.innerHTML = `
  <div class="grid cols-2" style="margin-bottom:14px">
    <div class="card"><h2>Collection progress</h2>
      <div class="note">Gold-weighted share of every upgrade in the game (levels 1–${MAXL}, including tower troops).</div>
      <div class="ring-wrap">${ringSVG(pct(A.goldSpent, A.goldAll))}
        <div style="flex:1;min-width:220px">
          ${progRow("Cards found", A.found, A.total, `${A.total - A.found} missing`)}
          ${progRow("Cards maxed", A.maxed, A.total, "")}
          ${progRow("Evolutions", A.evoOwned, A.evoTotal, "")}
          ${progRow("Hero versions", A.heroOwned, A.heroTotal, "")}
        </div>
      </div>
    </div>
    <div class="card"><h2>Progress by rarity</h2>${bars}</div>
  </div>
  <div class="grid cols-4" style="margin-bottom:14px">
    ${tile("Gold to max everything", fmt(A.goldRem), "gold", fmtFull(A.goldRem))}
    ${tile("Upgrades ready now", String(A.ready.length), "accent", A.ready.length ? fmt(readyGold) + " gold to buy them all" : "collect more cards")}
    ${tile("Average card level", A.found ? (A.lvlSum / A.found).toFixed(1) : "–", "accent", "across found cards")}
    ${tile("Trophies", fmtFull(state.trophies || 0), "elixir", "best " + fmtFull(state.best || 0))}
  </div>
  <div class="grid cols-2">
    <div class="card"><h2>Ready to upgrade</h2>
      <div class="note">You already hold enough cards — only gold is missing. Cheapest first.</div>
      ${readyRows || '<p class="muted">Nothing is waiting on gold right now.</p>'}
      ${A.ready.length > 12 ? `<p class="small muted">…and ${A.ready.length - 12} more.</p>` : ""}</div>
    <div class="card"><h2>Cards &amp; gold needed by rarity</h2>
      <div class="table-scroll"><table class="data">
        <thead><tr><th>Rarity</th><th>Found</th><th>Cards needed</th><th>Gold needed</th><th>Maxed</th></tr></thead>
        <tbody>${rarNeeds}</tbody></table></div>
      <p class="small muted">Cards needed counts every copy from your current levels to L${MAXL}, including unfound cards.</p>
    </div>
  </div>`;
}

/* ---------- Collection ---------- */
function renderCollection() {
  const root = $("#tab-collection");
  let list = CARDS.slice();
  if (collFilter.rar !== "all") {
    list = list.filter(c => (c.type === "tower" ? "tower" : c.rarity) === collFilter.rar);
  }
  if (collFilter.q) {
    const q = collFilter.q.toLowerCase();
    list = list.filter(c => c.name.toLowerCase().includes(q));
  }
  const key = collFilter.sort;
  list.sort((a, b) => {
    const sa = state.cards[a.id], sb = state.cards[b.id];
    const la = sa ? sa.lvl : 0, lb = sb ? sb.lvl : 0;
    if (key === "level") return lb - la || a.name.localeCompare(b.name);
    if (key === "name") return a.name.localeCompare(b.name);
    if (key === "gold") return goldToMax(b, lb) - goldToMax(a, la);
    if (key === "ready") {
      const ra = sa && nextRow(a, la) && sa.count >= nextRow(a, la).cards ? 1 : 0;
      const rb = sb && nextRow(b, lb) && sb.count >= nextRow(b, lb).cards ? 1 : 0;
      return rb - ra || lb - la;
    }
    return 0;
  });
  const rows = list.map(c => {
    const st = state.cards[c.id];
    const lvl = st ? st.lvl : 0;
    const nx = lvl > 0 ? nextRow(c, lvl) : null;
    const cnt = st ? st.count : 0;
    const p = nx ? pct(cnt, nx.cards) : (lvl >= MAXL && lvl > 0 ? 100 : 0);
    const lvlOpts = [`<option value="0"${lvl === 0 ? " selected" : ""}>not found</option>`]
      .concat(Array.from({ length: MAXL - startLvl(c) + 1 }, (_, i) => {
        const l = startLvl(c) + i;
        return `<option value="${l}"${lvl === l ? " selected" : ""}>L${l}${l === MAXL ? " · max" : ""}</option>`;
      })).join("");
    return `<tr>
      <td>${esc(c.name)} ${c.evo ? `<span class="evo-badge" title="has an evolution">⚡${st && st.evo ? "" : "?"}</span>` : ""}<br>
        <span class="small">${rarChip(c.type === "tower" ? "tower" : c.rarity)}${c.elixir != null ? ` <span class="muted small">${c.elixir}⧫</span>` : ""}</span></td>
      <td><select data-clvl="${c.id}" class="${lvl >= MAXL && lvl > 0 ? "maxed" : ""}">${lvlOpts}</select></td>
      <td><input type="number" min="0" value="${cnt}" data-ccnt="${c.id}" ${lvl === 0 ? "disabled" : ""}></td>
      <td style="min-width:120px">${lvl === 0 ? '<span class="muted small">–</span>' : lvl >= MAXL ? '<span class="pill good">maxed</span>'
        : `<span class="small">${fmtFull(cnt)} / ${fmtFull(nx.cards)}</span><div class="mini-bar"><span class="${p >= 100 ? "full" : ""}" style="width:${p.toFixed(0)}%"></span></div>`}</td>
      <td>${nx ? fmt(nx.gold) : "–"}</td>
      <td>${lvl >= MAXL && lvl > 0 ? "–" : fmt(goldToMax(c, lvl))}</td>
      <td>${c.evo ? `<input type="checkbox" data-cevo="${c.id}" ${st && st.evo ? "checked" : ""} ${lvl === 0 ? "disabled" : ""}>` : ""}</td>
      <td>${c.hero ? `<input type="checkbox" data-chero="${c.id}" ${st && st.hero ? "checked" : ""} ${lvl === 0 ? "disabled" : ""}>` : ""}</td>
    </tr>`;
  }).join("");
  root.innerHTML = `
  <div class="card">
    <h2>Card collection</h2>
    <div class="note">Everything is editable — level dropdown, copies you hold, and evolution ownership. Changes save automatically.</div>
    <div class="coll-controls">
      <input class="txt" id="collQ" placeholder="Search cards…" value="${esc(collFilter.q)}">
      <label class="field">Rarity <select id="collRar">
        <option value="all">all</option>
        ${RARS.concat("tower").map(r => `<option value="${r}"${collFilter.rar === r ? " selected" : ""}>${RAR_LABEL[r]}</option>`).join("")}
      </select></label>
      <label class="field">Sort <select id="collSort">
        <option value="level"${collFilter.sort === "level" ? " selected" : ""}>level</option>
        <option value="name"${collFilter.sort === "name" ? " selected" : ""}>name</option>
        <option value="gold"${collFilter.sort === "gold" ? " selected" : ""}>gold to max</option>
        <option value="ready"${collFilter.sort === "ready" ? " selected" : ""}>ready first</option>
      </select></label>
      <span class="muted small">${list.length} cards</span>
    </div>
    <div class="table-scroll"><table class="data">
      <thead><tr><th>Card</th><th>Level</th><th>Copies</th><th>To next level</th><th>Gold next</th><th>Gold to max</th><th>Evo</th><th>Hero</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
  </div>`;
}

/* ---------- Deck ---------- */
function renderDeck() {
  const root = $("#tab-deck");
  const opts = sel => `<option value="">— empty —</option>` + CARDS.filter(c => c.type !== "tower")
    .map(c => `<option value="${c.id}"${sel === c.id ? " selected" : ""}>${esc(c.name)}</option>`).join("");
  const slots = Array.from({ length: 8 }, (_, i) => {
    const id = state.deck[i] || "";
    const c = byId[id];
    const st = c ? state.cards[id] : null;
    const lvl = st ? st.lvl : 0;
    let stat = "";
    if (c && c.stats && lvl > 0) {
      const row = c.stats.rows.find(r => r[0] === lvl);
      if (row) stat = c.stats.headers.slice(0, 2).map((h, k) => `${h.replace("Damage Per Second", "DPS").replace("Hitpoints", "HP")}: ${row[k + 1]}`).join(" · ");
    }
    return `<div class="deck-card">
      <select data-deck="${i}" style="width:100%;background:var(--surface);color:var(--ink);border:1px solid var(--border);border-radius:6px;padding:4px">${opts(id)}</select>
      ${c ? `<div class="meta" style="margin-top:6px">${rarChip(c.rarity)} ${c.elixir != null ? c.elixir + "⧫" : ""} ${lvl ? "· L" + lvl : "· not owned"}</div>
      <div class="meta">${stat}</div>
      <div class="meta">${lvl > 0 && lvl < MAXL ? fmt(goldToMax(c, lvl)) + " gold to max" : lvl >= MAXL ? "maxed ✓" : ""}</div>` : ""}
    </div>`;
  }).join("");
  const cardsIn = state.deck.map(id => byId[id]).filter(Boolean);
  const elix = cardsIn.filter(c => c.elixir != null);
  const avgElixir = elix.length ? elix.reduce((s, c) => s + c.elixir, 0) / elix.length : 0;
  const cheapest4 = elix.map(c => c.elixir).sort((a, b) => a - b).slice(0, 4).reduce((s, e) => s + e, 0);
  const lvls = cardsIn.map(c => (state.cards[c.id] || { lvl: 0 }).lvl).filter(l => l > 0);
  const avgLvl = lvls.length ? lvls.reduce((a, b) => a + b, 0) / lvls.length : 0;
  const deckGold = cardsIn.reduce((s, c) => s + goldToMax(c, (state.cards[c.id] || { lvl: 0 }).lvl), 0);
  root.innerHTML = `
  <div class="grid cols-4" style="margin-bottom:14px">
    ${tile("Average elixir", avgElixir ? avgElixir.toFixed(1) : "–", "elixir", "current deck")}
    ${tile("4-card cycle", cheapest4 ? String(cheapest4) : "–", "elixir", "cheapest four cards")}
    ${tile("Average level", avgLvl ? avgLvl.toFixed(1) : "–", "accent", "owned cards in deck")}
    ${tile("Gold to max deck", fmt(deckGold), "gold", "all eight cards to L" + MAXL)}
  </div>
  <div class="card"><h2>Current deck</h2>
    <div class="note">Imported from your profile, or build one here — stats show at your card levels.</div>
    <div class="deck-grid">${slots}</div>
  </div>`;
}

/* ---------- Meta decks ---------- */
function deckOwnership(d) {
  const cards = d.cards.map(id => ({ id, card: byId[id], st: state.cards[id] }));
  const missing = cards.filter(x => !x.card || !x.st || x.st.lvl <= 0).map(x => x.card ? x.card.name : x.id + " (new card)");
  const missEvo = d.evo.filter(id => !(state.cards[id] && state.cards[id].evo))
    .map(id => byId[id] ? byId[id].name : id);
  const heroIds = d.cards.filter(id => byId[id] && byId[id].hero);
  const missHero = heroIds.filter(id => !(state.cards[id] && state.cards[id].hero))
    .map(id => byId[id].name);
  const elix = cards.filter(x => x.card && x.card.elixir != null);
  const avgElixir = elix.length ? elix.reduce((sm, x) => sm + x.card.elixir, 0) / elix.length : 0;
  const lvls = cards.filter(x => x.st && x.st.lvl > 0).map(x => x.st.lvl);
  const avgLvl = lvls.length ? lvls.reduce((a, b) => a + b, 0) / lvls.length : 0;
  return { missing, missEvo, missHero, heroCount: heroIds.length, avgElixir, avgLvl };
}

function renderMeta() {
  const root = $("#tab-meta");
  const group = DECKS.groups.find(g => g.key === metaFilter.group) || DECKS.groups[0];
  if (!group) {
    root.innerHTML = '<div class="card"><p class="muted">No deck snapshot bundled — run tools/scrape_decks.py.</p></div>';
    return;
  }
  let shown = 0;
  const rows = group.decks.map((d, di) => {
    const o = deckOwnership(d);
    if (metaFilter.cards && o.missing.length) return "";
    if (metaFilter.evo && o.missEvo.length) return "";
    if (metaFilter.hero && o.missHero.length) return "";
    shown++;
    const chips = d.cards.map(id => {
      const c = byId[id];
      const owned = state.cards[id] && state.cards[id].lvl > 0;
      const isEvo = d.evo.includes(id);
      return `<span class="deck-chip${isEvo ? " evo" : ""}${owned ? "" : " miss"}"
        title="${c ? esc(c.name) + (isEvo ? " (evolution slot)" : "") + (owned ? " · yours: L" + state.cards[id].lvl : " · not owned") : "new card not in database yet"}">
        ${isEvo ? "⚡" : ""}${c ? esc(c.name) : "🆕 " + esc(id)}</span>`;
    }).join("");
    const probs = [];
    if (o.missing.length) probs.push(`missing: ${o.missing.map(esc).join(", ")}`);
    if (o.missEvo.length) probs.push(`evo needed: ${o.missEvo.map(esc).join(", ")}`);
    if (o.missHero.length) probs.push(`hero versions: ${o.missHero.map(esc).join(", ")}`);
    return `<div class="meta-deck${o.missing.length || o.missEvo.length ? "" : " playable"}">
      <div class="meta-head">
        <b>#${di + 1}</b>
        <span class="muted small">${o.avgElixir.toFixed(1)}⧫ avg</span>
        ${o.avgLvl ? `<span class="muted small">· your avg L${o.avgLvl.toFixed(1)}</span>` : ""}
        ${!o.missing.length && !o.missEvo.length && !o.missHero.length ? '<span class="pill good">fully yours</span>'
          : !o.missing.length && !o.missEvo.length ? '<span class="pill acc">cards + evos ✓</span>'
          : !o.missing.length ? '<span class="pill warn">evos missing</span>' : '<span class="pill crit">cards missing</span>'}
        <span class="spacer"></span>
        <button class="btn sm ghost" data-usedeck="${group.key}:${di}">Use in Deck tab</button>
        ${d.link ? `<a class="btn sm" style="text-decoration:none" href="${esc(d.link)}" target="_blank" rel="noopener"
          title="opens Clash Royale and copies this deck into a free slot">Copy to game ↗</a>` : ""}
      </div>
      <div class="meta-chips">${chips}</div>
      ${probs.length ? `<div class="small muted" style="margin-top:6px">${probs.join(" · ")}</div>` : ""}
    </div>`;
  }).join("");
  root.innerHTML = `
  <div class="card">
    <h2>Meta decks</h2>
    <div class="note">Snapshot of the current meta from
      <a href="https://www.deckshop.pro/best-decks/" target="_blank" rel="noopener">DeckShop</a>
      (${esc(DECKS.updated)}). ⚡ marks the deck's evolution slots. Rerun <code>tools/scrape_decks.py</code> to refresh.</div>
    <div class="coll-controls">
      ${DECKS.groups.map(g => `<button class="btn sm ${metaFilter.group === g.key ? "" : "ghost"}" data-metagroup="${g.key}">${esc(g.label)}</button>`).join("")}
      <span class="spacer"></span>
      <label class="field small"><input type="checkbox" id="mfCards" ${metaFilter.cards ? "checked" : ""}> I have all cards</label>
      <label class="field small"><input type="checkbox" id="mfEvo" ${metaFilter.evo ? "checked" : ""}> …and the evolutions</label>
      <label class="field small"><input type="checkbox" id="mfHero" ${metaFilter.hero ? "checked" : ""}> …and the hero versions</label>
    </div>
    ${rows || `<p class="muted">None of the ${group.decks.length} ${esc(group.label)} decks match your filters — untick something, or check the Collection tab for what to unlock next.</p>`}
    ${rows ? `<p class="small muted">${shown} of ${group.decks.length} decks shown.</p>` : ""}
  </div>`;
}

/* ---------- Card stats ---------- */
function renderStats() {
  const root = $("#tab-stats");
  const c = byId[statsCard] || CARDS[0];
  const st = state.cards[c.id];
  const lvl = st ? st.lvl : 0;
  const rows = c.stats ? c.stats.rows.map(r => {
    const cost = rarRows(c).find(x => x.lvl === r[0]);
    return `<tr ${r[0] === lvl ? 'style="background:var(--surface-2)"' : ""}>
      <td>${r[0] === lvl ? "▶ " : ""}L${r[0]}</td>
      ${c.stats.headers.map((h, i) => `<td>${esc(r[i + 1] || "")}</td>`).join("")}
      <td>${cost && cost.cards ? fmtFull(cost.cards) : "–"}</td>
      <td>${cost && cost.gold ? fmt(cost.gold) : "–"}</td>
    </tr>`;
  }).join("") : "";
  root.innerHTML = `
  <div class="card">
    <h2>Card stats by level</h2>
    <div class="coll-controls">
      <label class="field">Card <select id="statsCard">
        ${CARDS.map(x => `<option value="${x.id}"${x.id === c.id ? " selected" : ""}>${esc(x.name)}</option>`).join("")}
      </select></label>
      ${rarChip(c.type === "tower" ? "tower" : c.rarity)}
      ${c.elixir != null ? `<span class="muted small">${c.elixir} elixir</span>` : ""}
      ${c.arena ? `<span class="muted small">unlocks: ${esc(c.arena)}</span>` : ""}
      ${c.evo ? '<span class="evo-badge">⚡ has evolution</span>' : ""}
      ${lvl ? `<span class="pill acc">yours: L${lvl}</span>` : '<span class="pill">not owned</span>'}
    </div>
    ${c.stats ? `<div class="table-scroll"><table class="data">
      <thead><tr><th>Level</th>${c.stats.headers.map(h => `<th>${esc(h)}</th>`).join("")}<th>Cards to reach</th><th>Gold</th></tr></thead>
      <tbody>${rows}</tbody></table></div>` : '<p class="muted">No per-level stat table on the wiki for this card.</p>'}
  </div>`;
}

/* ---------- Import / Export ---------- */
function displayLevel(apiCard) {
  return Math.max(0, (apiCard.level || 0) + (MAXL - (apiCard.maxLevel || MAXL)));
}
function detectAndImport(obj) {
  if (obj && obj.format === "royale-analyzer" && obj.state) {
    if (obj.state.v !== 1) throw new Error("Unsupported file version.");
    state = obj.state;
    normalize(); save();
    return "Collection file imported.";
  }
  if (obj && (Array.isArray(obj.cards) || Array.isArray(obj.supportCards)) && (obj.tag || obj.name)) {
    state.tag = obj.tag || state.tag;
    state.name = obj.name || "";
    state.king = obj.expLevel || 0;
    state.trophies = obj.trophies || 0;
    state.best = obj.bestTrophies || obj.trophies || 0;
    state.cards = {};
    let matched = 0; const skipped = [];
    const applyCard = (u) => {
      const id = u.name ? u.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") : "";
      const card = byId[id];
      if (!card) { skipped.push(u.name); return; }
      state.cards[id] = { lvl: displayLevel(u), count: u.count || 0,
        evo: (u.evolutionLevel || 0) > 0 ? 1 : 0 };
      matched++;
    };
    (obj.cards || []).forEach(applyCard);
    (obj.supportCards || []).forEach(applyCard);
    state.deck = (obj.currentDeck || []).map(u =>
      u.name ? u.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") : "")
      .filter(id => byId[id]).slice(0, 8);
    normalize(); save();
    return `Profile imported: ${esc(obj.name || obj.tag || "")} (King ${state.king}) — ${matched} cards matched` +
      (skipped.length ? `, ${skipped.length} unknown (${skipped.slice(0, 4).map(esc).join(", ")}${skipped.length > 4 ? "…" : ""})` : "") + ".";
  }
  throw new Error("Unrecognized JSON. Paste a player payload from the Clash Royale API ({\"tag\":\"#...\",\"cards\":[...]}) or a file exported by this tool.");
}
function exportState() {
  return JSON.stringify({ format: "royale-analyzer", exported: new Date().toISOString(), state }, null, 2);
}

async function fetchByTag(tag) {
  const ep = (state.settings.apiEndpoint || "").trim().replace(/\/+$/, "");
  if (!ep) throw new Error("Set your relay URL once (see the setup note in this card)");
  const t = (tag || "").trim().replace(/^#/, "").toUpperCase();
  if (!t) throw new Error("Enter a player tag");
  const res = await fetch(`${ep}/cr/players/${encodeURIComponent(t)}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Relay responded ${res.status}: ${body.error || body.reason || body.message || "unknown error"}`);
  return body;
}

function renderIO() {
  const root = $("#tab-io");
  root.innerHTML = `
  <div class="grid cols-2">
    <div class="card"><h2>Fetch by player tag</h2>
      <div class="note">Enter your tag and pull your whole profile from the official API — card levels, copies,
      evolutions, tower troops and your current deck. Needs the 5-minute self-hosted
      <a href="https://github.com/Kyxrem/kyxrem.github.io/tree/claude/clash-of-clans-analyzer-l3aqze/api-relay" target="_blank" rel="noopener">API relay setup</a>
      once — a tiny Node server at home holding your tokens in <code>api-relay/.env</code>; after that it's tag-only.
      The same relay serves the CoC tool.</div>
      <div class="io-row">
        <input class="txt" id="apiTag" placeholder="#XXXXXXXX" value="${esc(state.tag || "")}" style="max-width:180px">
        <button class="btn" id="apiGo">Fetch</button>
      </div>
      <div class="io-row small"><label class="field" style="flex:1;min-width:260px">Relay URL
        <input class="txt" id="apiEndpoint" value="${esc(state.settings.apiEndpoint || "")}" placeholder="http://localhost:8901 or https://relay.your.domain"></label></div>
      <div id="apiMsg"></div>
    </div>
    <div class="card"><h2>Paste / upload your profile</h2>
      <div class="note">Get your player JSON from <a href="https://developer.clashroyale.com" target="_blank" rel="noopener">developer.clashroyale.com</a>
      (“Try it” on <code>/v1/players/%23YOURTAG</code>) or
      <code>curl -H "Authorization: Bearer TOKEN" "https://api.clashroyale.com/v1/players/%23YOURTAG"</code>.
      Like the CoC API, browsers are blocked by CORS — paste the JSON here instead. Card levels, copies, evolutions,
      tower troops and your current deck all come along.</div>
      <textarea class="io" id="ioPaste" placeholder='{"tag":"#...","name":"...","expLevel":50,"cards":[...]}'></textarea>
      <div class="io-row">
        <button class="btn" id="ioImport">Import</button>
        <label class="btn ghost" style="cursor:pointer">Upload file<input type="file" id="ioFile" accept=".json,application/json" hidden></label>
      </div>
      <div id="ioMsg"></div>
    </div>
    <div class="card"><h2>Export</h2>
      <div class="note">Full collection as JSON — reimport it here anytime.</div>
      <div class="io-row">
        <button class="btn" id="ioDownload">Download collection.json</button>
        <button class="btn ghost" id="ioCopy">Copy to clipboard</button>
      </div>
      <h2 style="margin-top:18px">Sample &amp; reset</h2>
      <div class="io-row">
        <button class="btn ghost" id="ioSample">Load sample profile</button>
        <button class="btn danger" id="ioReset">Clear everything</button>
      </div>
    </div>
  </div>`;
}

/* ---------- sample ---------- */
function loadSample() {
  let seed = 2024;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  state = freshState();
  state.name = "Sample Player"; state.tag = "#SAMPLE";
  state.king = 45; state.trophies = 6400; state.best = 6800;
  const base = { common: 13, rare: 12, epic: 11, legendary: 10, champion: 12 };
  for (const c of CARDS) {
    const grp = c.type === "tower" ? "common" : c.rarity;
    if (rnd() < 0.08 && c.rarity !== "common") continue; // a few unfound
    let lvl = Math.max(startLvl(c), Math.min(MAXL, base[grp] + Math.floor(rnd() * 3) - 1));
    const nx = rarRows(c).find(r => r.lvl === lvl + 1);
    state.cards[c.id] = { lvl, count: nx ? Math.floor(rnd() * nx.cards * 1.4) : 0,
      evo: c.evo && rnd() < 0.3 ? 1 : 0, hero: c.hero && rnd() < 0.35 ? 1 : 0 };
  }
  state.deck = ["knight", "archers", "fireball", "the_log", "hog_rider", "musketeer",
    "ice_spirit", "cannon"].filter(id => byId[id]);
  normalize(); save();
}

/* ---------------- events ---------------- */
function bindEvents() {
  $("#tabs").addEventListener("click", e => {
    const b = e.target.closest("button[data-tab]");
    if (b) switchTab(b.dataset.tab);
  });
  document.querySelector("main").addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.clvl) {
      const id = t.dataset.clvl;
      const lvl = +t.value;
      if (lvl === 0) delete state.cards[id];
      else {
        const st = state.cards[id] || (state.cards[id] = { lvl: 0, count: 0, evo: 0 });
        st.lvl = lvl;
      }
      normalize(); save(); renderActive();
    } else if (t.dataset.ccnt) {
      const st = state.cards[t.dataset.ccnt];
      if (st) { st.count = Math.max(0, +t.value || 0); save(); renderActive(); }
    } else if (t.dataset.cevo) {
      const st = state.cards[t.dataset.cevo];
      if (st) { st.evo = t.checked ? 1 : 0; save(); renderActive(); }
    } else if (t.dataset.chero) {
      const st = state.cards[t.dataset.chero];
      if (st) { st.hero = t.checked ? 1 : 0; save(); renderActive(); }
    } else if (t.dataset.deck !== undefined) {
      state.deck[+t.dataset.deck] = t.value || "";
      state.deck = state.deck.map(x => x || "").slice(0, 8);
      save(); renderDeck();
    } else if (t.id === "collQ") { collFilter.q = t.value; renderCollection(); }
    else if (t.id === "collRar") { collFilter.rar = t.value; renderCollection(); }
    else if (t.id === "collSort") { collFilter.sort = t.value; renderCollection(); }
    else if (t.id === "statsCard") { statsCard = t.value; renderStats(); }
    else if (t.id === "apiEndpoint") { state.settings.apiEndpoint = t.value.trim(); save(); }
    else if (t.id === "mfCards") { metaFilter.cards = t.checked; renderMeta(); }
    else if (t.id === "mfEvo") { metaFilter.evo = t.checked; renderMeta(); }
    else if (t.id === "mfHero") { metaFilter.hero = t.checked; renderMeta(); }
    else if (t.id === "ioFile" && t.files[0]) {
      t.files[0].text().then(txt => {
        try {
          $("#ioMsg").innerHTML = `<div class="msg ok">${detectAndImport(JSON.parse(txt))}</div>`;
          renderHeader();
        } catch (err) { $("#ioMsg").innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
      });
    }
  });
  document.querySelector("main").addEventListener("input", e => {
    if (e.target.id === "collQ") { collFilter.q = e.target.value; renderCollection(); }
  });
  document.querySelector("main").addEventListener("click", async e => {
    const t = e.target;
    if (t.id === "ioImport") {
      try {
        $("#ioMsg").innerHTML = `<div class="msg ok">${detectAndImport(JSON.parse($("#ioPaste").value))}</div>`;
        renderHeader();
      } catch (err) { $("#ioMsg").innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
    }
    if (t.id === "ioDownload") {
      const blob = new Blob([exportState()], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "royale-collection.json";
      a.click();
      URL.revokeObjectURL(a.href);
    }
    if (t.id === "ioCopy") {
      try { await navigator.clipboard.writeText(exportState()); t.textContent = "Copied ✓"; setTimeout(() => t.textContent = "Copy to clipboard", 1500); } catch (e2) {}
    }
    if (t.id === "apiGo") {
      const box = $("#apiMsg");
      box.innerHTML = `<div class="msg info">Fetching…</div>`;
      fetchByTag($("#apiTag").value).then(data => {
        const msg = detectAndImport(data);
        box.innerHTML = `<div class="msg ok">${msg}</div>`;
        renderHeader();
      }).catch(err => {
        box.innerHTML = `<div class="msg err">${esc(err.message)}. No relay yet? Do the one-time setup, or paste your JSON — same data.</div>`;
      });
      return;
    }
    if (t.dataset.metagroup) { metaFilter.group = t.dataset.metagroup; renderMeta(); return; }
    if (t.dataset.usedeck) {
      const [gk, di] = t.dataset.usedeck.split(":");
      const g = DECKS.groups.find(x => x.key === gk);
      const d = g && g.decks[+di];
      if (d) { state.deck = d.cards.filter(id => byId[id]).slice(0, 8); save(); switchTab("deck"); }
      return;
    }
    if (t.id === "ioSample") { loadSample(); switchTab("overview"); }
    if (t.id === "ioReset") {
      if (confirm("Clear the saved collection?")) { state = freshState(); save(); renderActive(); }
    }
  });
}

/* ---------------- boot ---------------- */
function boot() {
  $("#dataDate").textContent = D.meta.generated;
  $("#dataMaxL").textContent = MAXL;
  state = load();
  const first = !state;
  if (!state) state = freshState();
  normalize();
  bindEvents();
  if (first) loadSample();
  renderHeader();
  renderActive();
}
boot();
})();
