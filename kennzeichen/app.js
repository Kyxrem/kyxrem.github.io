/* Kennzeichen-Sammler – Autobahn-Spiel
   Datengrundlage Karte: BKG KFZ250 (vereinfacht), © BKG 2024, Datenquelle: Kraftfahrt-Bundesamt */
(function () {
"use strict";

const $ = (s) => document.querySelector(s);
const STORAGE_KEY = "kz-sammlung-v1";

const BL = {
  SH: "Schleswig-Holstein", HH: "Hamburg", NI: "Niedersachsen", HB: "Bremen",
  NW: "Nordrhein-Westfalen", HE: "Hessen", RP: "Rheinland-Pfalz", BW: "Baden-Württemberg",
  BY: "Bayern", SL: "Saarland", BE: "Berlin", BB: "Brandenburg",
  MV: "Mecklenburg-Vorpommern", SN: "Sachsen", ST: "Sachsen-Anhalt", TH: "Thüringen",
};

/* ---------- Kartendaten dekodieren & projizieren ---------- */

const Q = KFZ_MAP.q;
const DEG = Math.PI / 180;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)) / DEG;

const features = []; // {ars,name,land,codes,rings:[[x,y]...in lon/lat],areaKm2,d}
for (const f of KFZ_MAP.f) {
  const rings = [];
  for (const enc of f.r) {
    const pts = [];
    let x = 0, y = 0;
    for (let i = 0; i < enc.length; i += 2) {
      x += enc[i]; y += enc[i + 1];
      pts.push([x / Q, y / Q]);
    }
    rings.push(pts);
  }
  features.push({ ars: f.a, name: f.n, land: f.l, codes: f.k, rings });
}

// Fläche in km² (Shoelace mit Breitengrad-Korrektur, Löcher via Vorzeichen)
for (const f of features) {
  let sum = 0;
  for (const ring of f.rings) {
    let a = 0, latSum = 0;
    for (const p of ring) latSum += p[1];
    const kx = 111.32 * Math.cos((latSum / ring.length) * DEG), ky = 110.57;
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
      a += (x1 * kx) * (y2 * ky) - (x2 * kx) * (y1 * ky);
    }
    sum += a / 2;
  }
  f.areaKm2 = Math.abs(sum);
}
const TOTAL_AREA = features.reduce((s, f) => s + f.areaKm2, 0);

// Projektion (Mercator) + Pfade
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const f of features) for (const r of f.rings) for (const [lon, lat] of r) {
  const y = merc(lat);
  if (lon < minX) minX = lon; if (lon > maxX) maxX = lon;
  if (y < minY) minY = y; if (y > maxY) maxY = y;
}
const W = 700, H = Math.round((W * (maxY - minY)) / (maxX - minX));
const px = (lon) => (((lon - minX) / (maxX - minX)) * W);
const py = (lat) => (((maxY - merc(lat)) / (maxY - minY)) * H);

const svg = $("#map");
svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
{
  const parts = [];
  for (const f of features) {
    let d = "";
    for (const ring of f.rings) {
      d += "M";
      for (let i = 0; i < ring.length; i++) {
        d += (i ? "L" : "") + px(ring[i][0]).toFixed(1) + " " + py(ring[i][1]).toFixed(1);
      }
      d += "Z";
    }
    parts.push(`<path d="${d}" fill-rule="evenodd" data-a="${f.ars}"></path>`);
  }
  svg.innerHTML = parts.join("");
}
const pathByArs = {};
svg.querySelectorAll("path").forEach((p) => (pathByArs[p.dataset.a] = p));

/* ---------- Indizes ---------- */

const featByArs = {};
const codeToFeats = {}; // code -> [feature,...]
for (const f of features) {
  featByArs[f.ars] = f;
  for (const c of f.codes) (codeToFeats[c] = codeToFeats[c] || []).push(f);
}
const ALL_CODES = Object.keys(codeToFeats).sort((a, b) => a.localeCompare(b, "de"));
const TOTAL_CODES = ALL_CODES.length;

const expand = (s) =>
  s.toUpperCase().replaceAll("Ä", "AE").replaceAll("Ö", "OE").replaceAll("Ü", "UE");
const codeByExpanded = {};
for (const c of ALL_CODES) codeByExpanded[expand(c)] = c;

const codeState = (code) => (BL[codeToFeats[code][0].land] || "");
const codeName = (code) => (KFZ_FACTS[code] ? KFZ_FACTS[code][0] : codeToFeats[code].map((f) => f.name).join(", "));

// Suchindex
const searchIdx = ALL_CODES.map((c) => ({
  code: c,
  exp: expand(c),
  name: codeName(c),
  hay: expand(codeName(c) + " " + codeToFeats[c].map((f) => f.name).join(" ") + " " + codeState(c)),
}));

/* ---------- Zustand ---------- */

let found = {}; // code -> timestamp
try {
  const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (raw && raw.found) found = raw.found;
} catch (e) { /* frisch starten */ }
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, found }));
const foundCount = () => Object.keys(found).length;

/* ---------- UI-Helfer ---------- */

const plateHTML = (code, cls = "") =>
  `<span class="plate ${cls}"><span class="pl-eu"><span class="pl-stars">★</span>D</span><span class="pl-txt">${code}</span></span>`;

let toastTimer;
function toast(msg, kind = "") {
  const t = $("#toast");
  t.className = "toast " + kind;
  t.innerHTML = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4200);
}

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }) +
  ", " + new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";

/* ---------- Karte aktualisieren ---------- */

function updateMap() {
  for (const f of features) {
    const n = f.codes.filter((c) => found[c]).length;
    const el = pathByArs[f.ars];
    el.classList.toggle("full", n === f.codes.length && n > 0);
    el.classList.toggle("part", n > 0 && n < f.codes.length);
  }
}

function pulse(code) {
  for (const f of codeToFeats[code]) {
    const el = pathByArs[f.ars];
    el.classList.remove("pulse");
    void el.getBoundingClientRect(); // Animation neu starten
    el.classList.add("pulse");
    setTimeout(() => el.classList.remove("pulse"), 1200);
  }
}

/* ---------- Statistik ---------- */

function updateStats() {
  const n = foundCount();
  $("#stat-count").textContent = n;
  $("#stat-total").textContent = TOTAL_CODES;
  $("#bar-codes").style.width = (n / TOTAL_CODES) * 100 + "%";

  let covered = 0;
  for (const f of features) if (f.codes.some((c) => found[c])) covered += f.areaKm2;
  const pct = (covered / TOTAL_AREA) * 100;
  $("#stat-area").innerHTML = (pct >= 10 ? pct.toFixed(0) : pct.toFixed(1)).replace(".", ",") + "&nbsp;%";
  $("#bar-area").style.width = pct + "%";

  // Bundesländer
  const per = {};
  for (const c of ALL_CODES) {
    const l = codeToFeats[c][0].land;
    per[l] = per[l] || { total: 0, found: 0 };
    per[l].total++;
    if (found[c]) per[l].found++;
  }
  $("#land-grid").innerHTML = Object.keys(per)
    .sort((a, b) => BL[a].localeCompare(BL[b], "de"))
    .map((l) => {
      const p = per[l];
      return `<div class="land-row"><div class="lr-top"><span class="lr-name">${BL[l]}</span><span class="lr-count">${p.found}/${p.total}</span></div><div class="bar"><div style="width:${(p.found / p.total) * 100}%"></div></div></div>`;
    })
    .join("");
}

/* ---------- Sammlung ---------- */

function updateCollection() {
  const codes = Object.keys(found);
  $("#coll-empty").hidden = codes.length > 0;
  const mode = $("#coll-sort").value;
  codes.sort(mode === "abc" ? (a, b) => a.localeCompare(b, "de") : (a, b) => found[b] - found[a]);
  $("#collection").innerHTML = codes
    .map((c) => `<button class="coll-chip" data-code="${c}" title="${codeName(c)}">${plateHTML(c)}</button>`)
    .join("");
}

/* ---------- Fakten-Karte ---------- */

function hideFacts() { $("#fact-panel").hidden = true; }

function factMeta(code) {
  const feats = codeToFeats[code];
  const laender = [...new Set(feats.map((f) => BL[f.land]))].join(" & ");
  const bez = feats.map((f) => f.name).join(", ");
  return `${laender} · Zulassungsbezirk${feats.length > 1 ? "e" : ""}: ${bez}`;
}

function showCode(code, scroll = true) {
  const entry = KFZ_FACTS[code] || [codeName(code)];
  const isFound = !!found[code];
  const facts = entry.slice(1);
  const panel = $("#fact-panel");
  panel.innerHTML = `
    <div class="fact-head">
      ${plateHTML(code)}
      <div>
        <h3>${entry[0]}</h3>
        <p class="fact-meta">${factMeta(code)}</p>
      </div>
      <button class="fact-close" aria-label="Schließen">×</button>
    </div>
    ${isFound
      ? `<ul class="facts">${facts.map((f) => `<li>${f}</li>`).join("")}</ul>
         <div class="fact-foot">
           <p class="found-when">✅ Gefunden am ${fmtDate(found[code])}</p>
           <button class="remove-btn">Entfernen</button>
         </div>`
      : `<p class="fact-locked">🔒 Noch nicht in deiner Sammlung – die Fakten schalten sich frei, sobald du dieses Kennzeichen entdeckst!</p>
         <div class="fact-foot"><button class="add-btn2">Jetzt als gefunden markieren</button></div>`}
  `;
  panel.hidden = false;
  panel.querySelector(".fact-close").onclick = hideFacts;
  const rm = panel.querySelector(".remove-btn");
  if (rm) rm.onclick = () => removeCode(code);
  const ad = panel.querySelector(".add-btn2");
  if (ad) ad.onclick = () => addCode(code);
  if (scroll) panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function showDistrict(ars) {
  const f = featByArs[ars];
  if (f.codes.length === 1) return showCode(f.codes[0]);
  const panel = $("#fact-panel");
  panel.innerHTML = `
    <div class="fact-head">
      <div>
        <h3>${f.name}</h3>
        <p class="fact-meta">${BL[f.land]} · ${f.codes.length} Kennzeichen in diesem Bezirk</p>
      </div>
      <button class="fact-close" aria-label="Schließen">×</button>
    </div>
    <div class="collection" style="margin-top:12px">
      ${f.codes.map((c) => `<button class="coll-chip" data-code="${c}" title="${codeName(c)}" style="${found[c] ? "" : "opacity:.45"}">${plateHTML(c)}</button>`).join("")}
    </div>
    <p class="fact-locked" style="border:0;padding-top:6px">Kürzel antippen für Details${f.codes.some((c) => !found[c]) ? " – blasse sind noch offen." : "."}</p>
  `;
  panel.hidden = false;
  panel.querySelector(".fact-close").onclick = hideFacts;
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------- Hinzufügen / Entfernen ---------- */

const MILESTONES = { 10: "Zweistellig! 🎉", 25: "25 – ordentlich was los auf der Bahn!", 50: "50! Halbes Hundert 🏁", 100: "💯 Hundert Kennzeichen!", 200: "200 – du bist ein Profi! 🛣️", 350: "350 – die Hälfte ist geschafft!", 500: "500!! Legendär 🏆", 702: "ALLE 702!! Du hast Deutschland komplett! 👑" };

function addCode(code) {
  if (found[code]) {
    toast(`${plateHTML(code)} hast du schon – gefunden am ${fmtDate(found[code])}.`, "warn");
    showCode(code);
    return;
  }
  found[code] = Date.now();
  save();
  updateMap(); updateStats(); updateCollection();
  pulse(code);
  const n = foundCount();
  toast(`🎉 <b>NEU:</b> ${plateHTML(code)} ${codeName(code)}${MILESTONES[n] ? `<br>🏆 <b>${n}. Fund:</b> ${MILESTONES[n]}` : ""}`, "ok");
  showCode(code, false);
}

function removeCode(code) {
  delete found[code];
  save();
  updateMap(); updateStats(); updateCollection();
  toast(`${plateHTML(code)} entfernt.`, "");
  hideFacts();
}

/* ---------- Eingabe & Vorschläge ---------- */

const input = $("#code-input");
const suggBox = $("#suggestions");
let activeSugg = -1;

function getSuggestions(q) {
  const e = expand(q.trim());
  if (!e) return [];
  const starts = [], names = [];
  for (const s of searchIdx) {
    if (s.exp.startsWith(e)) starts.push(s);
    else if (e.length >= 2 && s.hay.includes(e)) names.push(s);
  }
  starts.sort((a, b) => a.exp.length - b.exp.length || a.code.localeCompare(b.code, "de"));
  return [...starts, ...names].slice(0, 8);
}

function renderSuggestions() {
  const list = getSuggestions(input.value);
  activeSugg = -1;
  if (!list.length || !input.value.trim()) { suggBox.hidden = true; return; }
  suggBox.innerHTML = list
    .map((s, i) => `<button type="button" class="sugg" data-code="${s.code}" data-i="${i}">
        ${plateHTML(s.code)}
        <span class="s-name">${s.name}</span>
        <span class="s-state">${codeToFeats[s.code][0].land}</span>
        ${found[s.code] ? '<span class="s-found">✓</span>' : ""}
      </button>`)
    .join("");
  suggBox.hidden = false;
}

input.addEventListener("input", renderSuggestions);
input.addEventListener("blur", () => setTimeout(() => (suggBox.hidden = true), 150));
input.addEventListener("focus", renderSuggestions);
input.addEventListener("keydown", (e) => {
  const items = [...suggBox.querySelectorAll(".sugg")];
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    if (!items.length) return;
    e.preventDefault();
    activeSugg = (activeSugg + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items.forEach((el, i) => el.classList.toggle("active", i === activeSugg));
  } else if (e.key === "Escape") {
    suggBox.hidden = true;
  } else if (e.key === "Enter" && activeSugg >= 0 && items[activeSugg]) {
    e.preventDefault();
    submitCode(items[activeSugg].dataset.code);
  }
});

suggBox.addEventListener("mousedown", (e) => {
  const btn = e.target.closest(".sugg");
  if (btn) { e.preventDefault(); submitCode(btn.dataset.code); }
});

function submitCode(code) {
  input.value = "";
  suggBox.hidden = true;
  input.focus();
  addCode(code);
}

$("#add-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q) return;
  const exact = codeByExpanded[expand(q)];
  if (exact) return submitCode(exact);
  const sugg = getSuggestions(q);
  if (sugg.length === 1) return submitCode(sugg[0].code);
  if (sugg.length > 1) { renderSuggestions(); toast(`Mehrere Treffer für „${q}“ – wähle unten aus.`, "warn"); return; }
  $(".platebox").classList.add("shake");
  setTimeout(() => $(".platebox").classList.remove("shake"), 400);
  toast(`„${q.toUpperCase()}“ ist kein (aktuelles) deutsches Kennzeichen. 🤔`, "err");
});

/* ---------- Karten-Interaktion ---------- */

const tip = $("#map-tip");
const wrap = $("#map-wrap");

svg.addEventListener("pointermove", (e) => {
  if (e.pointerType === "touch") return;
  const p = e.target.closest("path");
  if (!p) { tip.hidden = true; return; }
  const f = featByArs[p.dataset.a];
  const fCodes = f.codes.filter((c) => found[c]);
  tip.innerHTML = `<b>${f.name}</b><span class="t-codes">${f.codes.join(", ")} · ${BL[f.land]}</span>` +
    (fCodes.length ? `<br><span class="t-found">✓ ${fCodes.join(", ")} gefunden</span>` : "");
  tip.hidden = false;
  const r = wrap.getBoundingClientRect();
  let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
  if (x + tip.offsetWidth > r.width) x = x - tip.offsetWidth - 28;
  if (y + tip.offsetHeight > r.height) y = y - tip.offsetHeight - 28;
  tip.style.left = x + "px";
  tip.style.top = y + "px";
});
svg.addEventListener("pointerleave", () => (tip.hidden = true));
svg.addEventListener("click", (e) => {
  const p = e.target.closest("path");
  if (p) showDistrict(p.dataset.a);
});

/* ---------- Sammlung: Klicks & Sortierung ---------- */

document.addEventListener("click", (e) => {
  const chip = e.target.closest(".coll-chip");
  if (chip) showCode(chip.dataset.code);
});
$("#coll-sort").addEventListener("change", updateCollection);

/* ---------- Export / Import / Reset ---------- */

$("#export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "kennzeichen-sammler", exportiert: new Date().toISOString(), found }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kennzeichen-sammlung.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Sammlung exportiert. 📦", "ok");
});

$("#import-file").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  file.text().then((txt) => {
    try {
      const data = JSON.parse(txt);
      const src = data.found || data;
      let added = 0;
      for (const [c, ts] of Object.entries(src)) {
        if (codeToFeats[c] && !found[c] && typeof ts === "number") { found[c] = ts; added++; }
      }
      save(); updateMap(); updateStats(); updateCollection();
      toast(`Import fertig: ${added} neue Kennzeichen übernommen.`, "ok");
    } catch (err) {
      toast("Datei konnte nicht gelesen werden.", "err");
    }
    e.target.value = "";
  });
});

$("#reset-btn").addEventListener("click", () => {
  if (confirm(`Wirklich alle ${foundCount()} gesammelten Kennzeichen löschen?`)) {
    found = {};
    save(); updateMap(); updateStats(); updateCollection(); hideFacts();
    toast("Sammlung zurückgesetzt – gute Fahrt! 🛣️", "");
  }
});

/* ---------- Start ---------- */

updateMap();
updateStats();
updateCollection();

})();
