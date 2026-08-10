/* Kennzeichen-Sammler – Autobahn-Spiel
   Datengrundlage Karte/Einwohner: BKG KFZ250 + VG250-EW (vereinfacht), © BKG 2024/2025,
   Datenquelle: Kraftfahrt-Bundesamt */
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

const features = []; // {idx,ars,name,land,codes,ew,rings,areaKm2}
KFZ_MAP.f.forEach((f, idx) => {
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
  features.push({ idx, ars: f.a, name: f.n, land: f.l, codes: f.k, ew: f.e || 0, rings });
});

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

// Projektion (Mercator) + Pfade – Schlüssel ist der Feature-Index
// (nicht der ARS: einige Städte teilen sich den ARS mit ihrem Landkreis)
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
    parts.push(`<path d="${d}" fill-rule="evenodd" data-i="${f.idx}"></path>`);
  }
  svg.innerHTML = parts.join("");
}
const pathByIdx = [];
svg.querySelectorAll("path").forEach((p) => (pathByIdx[+p.dataset.i] = p));

/* ---------- Indizes ---------- */

const codeToFeats = {}; // code -> [feature,...]
for (const f of features) {
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

/* ---------- Raritäten (Fortnite-Stil, nach Einwohnern) ---------- */

const RARITY = [
  { n: "Gewöhnlich",   c: "#a8b0bb" },
  { n: "Ungewöhnlich", c: "#2fce4f" },
  { n: "Selten",       c: "#37a6ff" },
  { n: "Episch",       c: "#c95cff" },
  { n: "Legendär",     c: "#ff9d2e" },
  { n: "Mythisch",     c: "#ffd83d" },
];
const codePop = {};  // Einwohner im Zulassungsgebiet des Kürzels
const codeAlt = {};  // nirgendwo Erstkürzel -> Altkennzeichen/Zweitkürzel
const codeTier = {};
for (const c of ALL_CODES) {
  codePop[c] = codeToFeats[c].reduce((s, f) => s + f.ew, 0);
  codeAlt[c] = codeToFeats[c].every((f) => f.codes[0] !== c);
  const p = codePop[c];
  let t;
  if (p < 10000) t = 5;
  else {
    t = p >= 300000 ? 0 : p >= 170000 ? 1 : p >= 100000 ? 2 : p >= 50000 ? 3 : 4;
    if (codeAlt[c]) t = Math.min(t + 1, 4); // Altkennzeichen sieht man seltener
  }
  codeTier[c] = t;
}

/* ---------- Suche ---------- */

const searchIdx = ALL_CODES.map((c) => ({
  code: c,
  exp: expand(c),
  name: codeName(c),
  hay: expand(codeName(c) + " " + codeToFeats[c].map((f) => f.name).join(" ") + " " + codeState(c)),
}));

/* ---------- Zustand ---------- */

let found = {};    // code -> timestamp
let achStore = {}; // achievement-id -> timestamp der Freischaltung
try {
  const raw = JSON.parse(localStorage.getItem(STORAGE_KEY));
  if (raw && raw.found) found = raw.found;
  if (raw && raw.ach) achStore = raw.ach;
} catch (e) { /* frisch starten */ }
const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, found, ach: achStore }));
const foundCount = () => Object.keys(found).length;

/* ---------- Errungenschaften ---------- */

const SINGLES = ALL_CODES.filter((c) => c.length === 1);
const DOUBLES = ALL_CODES.filter((c) => c.length === 2 && c[0] === c[1]);
const LEGENDS = ALL_CODES.filter((c) => codeTier[c] >= 4);
const setDef = (list) => list.filter((c) => codeToFeats[c]);
const HANSE = setDef(["HH", "HB", "HL", "HRO", "HST", "HWI", "HGW", "STD", "LG"]);
const RACE = setDef(["AW", "HOT", "OC", "SCZ"]);
const WORTE = setDef(["BAD", "EIS", "ROT", "OHA"]);
const ALPEN = setDef(["GAP", "BGL", "OA"]);
const WEIN = setDef(["NW", "DÜW", "SÜW", "LD"]);
const MILLIONEN = setDef(["B", "HH", "M", "K"]);
const TRIO = setDef(["B", "HH", "HB"]);

const cntAch = (goal, icon, id, name, desc) =>
  ({ id, icon, name, desc, prog: (c) => [Math.min(c.n, goal), goal], check: (c) => c.n >= goal });

const ACHIEVEMENTS = [
  cntAch(1, "🚗", "c1", "Startschuss", "Dein erstes Kennzeichen gesammelt"),
  cntAch(5, "✋", "c5", "Handvoll", "5 Kennzeichen gesammelt"),
  cntAch(10, "🔟", "c10", "Zweistellig", "10 Kennzeichen gesammelt"),
  cntAch(25, "🎒", "c25", "Sammlerherz", "25 Kennzeichen gesammelt"),
  cntAch(50, "🚙", "c50", "Halbes Hundert", "50 Kennzeichen gesammelt"),
  cntAch(100, "💯", "c100", "Dreistellig", "100 Kennzeichen gesammelt"),
  cntAch(200, "🚛", "c200", "Autobahn-Profi", "200 Kennzeichen gesammelt"),
  cntAch(351, "🗺️", "c351", "Die halbe Sammlung", "351 von 702 – die Hälfte ist voll!"),
  cntAch(500, "🏅", "c500", "Club der 500", "500 Kennzeichen gesammelt"),
  cntAch(702, "👑", "call", "Deutschland komplett", "Alle 702 Kennzeichen gesammelt"),
  { id: "r2", icon: "🔵", name: "Selten gut", desc: "Ein Kennzeichen der Stufe Selten oder höher", prog: (c) => [Math.min(c.tierGE(2), 1), 1], check: (c) => c.tierGE(2) >= 1 },
  { id: "r3", icon: "🟣", name: "Episch!", desc: "Ein Kennzeichen der Stufe Episch oder höher", prog: (c) => [Math.min(c.tierGE(3), 1), 1], check: (c) => c.tierGE(3) >= 1 },
  { id: "r4", icon: "🟠", name: "Legende gesichtet", desc: "Ein legendäres Kennzeichen gefunden", prog: (c) => [Math.min(c.tierGE(4), 1), 1], check: (c) => c.tierGE(4) >= 1 },
  { id: "r4x10", icon: "🏆", name: "Raritätenkabinett", desc: "10 legendäre (oder bessere) Kennzeichen", prog: (c) => [Math.min(c.tierGE(4), 10), 10], check: (c) => c.tierGE(4) >= 10 },
  { id: "laender", icon: "🧭", name: "Ländersammler", desc: "Aus allen 16 Bundesländern mindestens eins", prog: (c) => [c.states.size, 16], check: (c) => c.states.size >= 16 },
  { id: "trio", icon: "🏙️", name: "Stadtstaaten-Trio", desc: "B, HH und HB gesammelt", prog: (c) => [c.have(TRIO), 3], check: (c) => c.have(TRIO) === 3 },
  { id: "mill", icon: "🌆", name: "Millionen-Metropolen", desc: "B, HH, M und K gesammelt", prog: (c) => [c.have(MILLIONEN), 4], check: (c) => c.have(MILLIONEN) === 4 },
  { id: "single", icon: "🔠", name: "Ein-Buchstaben-Club", desc: `Alle ${SINGLES.length} Ein-Buchstaben-Kennzeichen (A, B, D …)`, prog: (c) => [c.have(SINGLES), SINGLES.length], check: (c) => c.have(SINGLES) === SINGLES.length },
  { id: "abc", icon: "🔤", name: "Buchstaben-Bingo", desc: "Kennzeichen mit 20 verschiedenen Anfangsbuchstaben", prog: (c) => [c.initials.size, 20], check: (c) => c.initials.size >= 20 },
  { id: "area25", icon: "📐", name: "Viertel-Republik", desc: "25 % der Fläche Deutschlands abgedeckt", prog: (c) => [Math.min(Math.floor(c.areaPct), 25), 25], check: (c) => c.areaPct >= 25 },
  { id: "area50", icon: "🌍", name: "Halbe Fläche", desc: "50 % der Fläche Deutschlands abgedeckt", prog: (c) => [Math.min(Math.floor(c.areaPct), 50), 50], check: (c) => c.areaPct >= 50 },
  { id: "day20", icon: "📅", name: "Tagesausflug", desc: "20 Funde an einem einzigen Tag", prog: (c) => [Math.min(c.maxDay, 20), 20], check: (c) => c.daySpanOk },
  { id: "fast5", icon: "⚡", name: "Kolonne", desc: "5 Funde innerhalb von 5 Minuten", check: (c) => c.fast5 },
  { id: "umlaut", icon: "🎯", name: "Ümläut-Fän", desc: "5 Kennzeichen mit Ä, Ö oder Ü", prog: (c) => [Math.min(c.umlaut, 5), 5], check: (c) => c.umlaut >= 5 },
  { id: "hanse", icon: "⚓", name: "Hanse-Bündnis", desc: "5 alte Hansestädte (z. B. HH, HB, HL, HST, LG)", prog: (c) => [Math.min(c.have(HANSE), 5), 5], check: (c) => c.have(HANSE) >= 5 },
  { id: "alpen", icon: "⛰️", name: "Alpenpanorama", desc: "GAP, BGL und OA – die Alpenkreise", prog: (c) => [c.have(ALPEN), 3], check: (c) => c.have(ALPEN) === 3 },
  { id: "wein", icon: "🍷", name: "Weinstraßen-Tour", desc: "NW, DÜW, SÜW und LD – die Pfälzer Weinrunde", prog: (c) => [c.have(WEIN), 4], check: (c) => c.have(WEIN) === 4 },
  { id: "bezirk3", icon: "🧩", name: "Bezirks-Komplettierer", desc: "Einen Bezirk mit mindestens 3 Kürzeln vollständig gesammelt", check: (c) => c.fullDistrict3 },
  // Versteckte Errungenschaften – erscheinen als ??? und enthüllen sich beim Freischalten
  { hidden: true, id: "h_bues", icon: "🇨🇭", name: "Grüezi!", desc: "BÜS gefunden – die Schweizer Exklave Büsingen, das einzige Mythisch", check: () => !!found["BÜS"] },
  { hidden: true, id: "h_night", icon: "🌙", name: "Nachtschwärmer", desc: "Ein Fund zwischen 0 und 4 Uhr nachts", check: (c) => c.night },
  { hidden: true, id: "h_pasch", icon: "🎲", name: "Pasch!", desc: `6 Doppelbuchstaben-Kennzeichen (AA, BB, DD, EE …) – es gibt ${DOUBLES.length}`, check: (c) => c.have(DOUBLES) >= 6 },
  { hidden: true, id: "h_wort", icon: "🍜", name: "Buchstabensuppe", desc: "BAD, EIS, ROT und OHA – Kennzeichen, die echte Wörter sind", check: (c) => c.have(WORTE) === WORTE.length },
  { hidden: true, id: "h_race", icon: "🏁", name: "Vollgas-Tour", desc: "Alle vier Rennstrecken-Kreise: AW (Nürburgring), HOT (Sachsenring), OC (Oschersleben), SCZ (Schleizer Dreieck)", check: (c) => c.have(RACE) === RACE.length },
  { hidden: true, id: "h_leg", icon: "🦄", name: "Legenden-Meister", desc: `Alle ${LEGENDS.length} Kennzeichen der Stufen Legendär und Mythisch`, check: (c) => c.have(LEGENDS) === LEGENDS.length },
];
const PUB_ACH = ACHIEVEMENTS.filter((a) => !a.hidden);
const HID_ACH = ACHIEVEMENTS.filter((a) => a.hidden);

function achCtx() {
  const codes = Object.keys(found);
  const ts = codes.map((c) => found[c]).sort((a, b) => a - b);
  const tierN = [0, 0, 0, 0, 0, 0];
  const states = new Set(), initials = new Set();
  let umlaut = 0;
  for (const c of codes) {
    tierN[codeTier[c]]++;
    states.add(codeToFeats[c][0].land);
    initials.add(c[0]);
    if (/[ÄÖÜ]/.test(c)) umlaut++;
  }
  let covered = 0;
  for (const f of features) if (f.codes.some((c) => found[c])) covered += f.areaKm2;
  const perDay = {};
  for (const t of ts) {
    const d = new Date(t);
    const k = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
    (perDay[k] = perDay[k] || []).push(t);
  }
  let maxDay = 0, daySpanOk = false;
  for (const k in perDay) {
    const arr = perDay[k];
    if (arr.length > maxDay) maxDay = arr.length;
    // Mindest-Zeitspanne, damit ein Massen-Import nicht als "Tagesausflug" zählt
    if (arr.length >= 20 && arr[arr.length - 1] - arr[0] >= 600000) daySpanOk = true;
  }
  let fast5 = false;
  for (let i = 0; i + 4 < ts.length; i++) {
    const span = ts[i + 4] - ts[i];
    if (span <= 300000 && span >= 1500) { fast5 = true; break; }
  }
  return {
    n: codes.length,
    tierGE: (k) => tierN.slice(k).reduce((a, b) => a + b, 0),
    states, initials, umlaut,
    areaPct: (covered / TOTAL_AREA) * 100,
    maxDay, daySpanOk, fast5,
    night: ts.some((t) => { const h = new Date(t).getHours(); return h >= 0 && h < 4; }),
    fullDistrict3: features.some((f) => f.codes.length >= 3 && f.codes.every((c) => found[c])),
    have: (list) => list.filter((c) => found[c]).length,
  };
}

function renderAchievements(c) {
  const pu = PUB_ACH.filter((a) => achStore[a.id]).length;
  const hu = HID_ACH.filter((a) => achStore[a.id]).length;
  $("#ach-count").textContent = `${pu}/${PUB_ACH.length} (+${hu ? hu + "/" : ""}${HID_ACH.length})`;
  $("#ach-grid").innerHTML = ACHIEVEMENTS.map((a) => {
    const done = !!achStore[a.id];
    const secret = a.hidden && !done;
    const prog = !done && !secret && a.prog ? a.prog(c) : null;
    return `<div class="ach ${done ? "done" : ""} ${a.hidden ? "hidden-ach" : ""}">
      <span class="a-icon">${secret ? "❓" : a.icon}</span>
      <div class="a-body">
        <div class="a-name">${secret ? "???" : a.name}${a.hidden && done ? ' <span class="a-secret">Geheim</span>' : ""}</div>
        <div class="a-desc">${secret ? "Versteckte Errungenschaft – probier mal was Ungewöhnliches …" : a.desc}</div>
      </div>
      <span class="a-state">${done ? "✓" : prog ? `${prog[0]}/${prog[1]}` : ""}</span>
    </div>`;
  }).join("");
}

function evalAchievements() {
  const c = achCtx();
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (!achStore[a.id] && a.check(c)) {
      achStore[a.id] = Date.now();
      newly.push(a);
    }
  }
  if (newly.length) save();
  renderAchievements(c);
  return newly;
}

const achToastLine = (newly) =>
  `🏅 <b>Errungenschaft${newly.length > 1 ? "en" : ""} freigeschaltet:</b> ${newly.map((a) => `${a.icon} ${a.hidden ? `<span class="gold">${a.name}</span>` : a.name}`).join(" · ")}`;

/* ---------- Sync-Link (Fortschritt ohne Datei mitnehmen) ---------- */

const SYNC_ORDER = [...ALL_CODES].sort(); // deterministische Reihenfolge (UTF-16)

function encodeSync() {
  const bytes = new Uint8Array(Math.ceil(SYNC_ORDER.length / 8));
  SYNC_ORDER.forEach((c, i) => { if (found[c]) bytes[i >> 3] |= 1 << (i & 7); });
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return "1." + btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function decodeSync(str) {
  const [v, payload] = str.split(".");
  if (v !== "1" || !payload) return null;
  try {
    const bin = atob(payload.replaceAll("-", "+").replaceAll("_", "/"));
    const codes = [];
    SYNC_ORDER.forEach((c, i) => {
      if (i >> 3 < bin.length && bin.charCodeAt(i >> 3) & (1 << (i & 7))) codes.push(c);
    });
    return codes;
  } catch (e) { return null; }
}

function syncUrl() {
  return location.origin + location.pathname + "#s=" + encodeSync();
}

function importFromHash() {
  const m = location.hash.match(/[#&]s=([^&]+)/);
  if (!m) return null;
  const codes = decodeSync(decodeURIComponent(m[1]));
  history.replaceState(null, "", location.pathname + location.search);
  if (!codes) { toast("Sync-Link konnte nicht gelesen werden.", "err"); return null; }
  let added = 0;
  const now = Date.now();
  for (const c of codes) if (!found[c]) { found[c] = now; added++; }
  if (added) {
    save();
    return `🔗 Sync-Link geladen: <b>${added}</b> Kennzeichen übernommen (jetzt ${foundCount()}).`;
  }
  return codes.length ? "🔗 Sync-Link geladen – alles war schon in deiner Sammlung." : null;
}

/* ---------- UI-Helfer ---------- */

const plateHTML = (code, cls = "") =>
  `<span class="plate r${codeTier[code] ?? ""} ${cls}"><span class="pl-eu"><span class="pl-stars">★</span>D</span><span class="pl-txt">${code}</span></span>`;

const rarPill = (code) => {
  const r = RARITY[codeTier[code]];
  return `<span class="rar-pill" style="--rc:${r.c}">${r.n}</span>`;
};

const fmtNum = (n) => n.toLocaleString("de-DE");

let toastTimer;
function toast(msg, kind = "") {
  const t = $("#toast");
  t.className = "toast " + kind;
  t.innerHTML = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4800);
}

const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }) +
  ", " + new Date(ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr";

/* ---------- Karte aktualisieren ---------- */

function updateMap() {
  for (const f of features) {
    const n = f.codes.filter((c) => found[c]).length;
    const el = pathByIdx[f.idx];
    el.classList.toggle("full", n === f.codes.length && n > 0);
    el.classList.toggle("part", n > 0 && n < f.codes.length);
  }
}

function pulse(code) {
  for (const f of codeToFeats[code]) {
    const el = pathByIdx[f.idx];
    el.classList.remove("pulse");
    void el.getBoundingClientRect();
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

  // Raritäten-Übersicht
  const perTier = RARITY.map(() => ({ total: 0, found: 0 }));
  for (const c of ALL_CODES) {
    perTier[codeTier[c]].total++;
    if (found[c]) perTier[codeTier[c]].found++;
  }
  $("#rar-grid").innerHTML = RARITY.map((r, i) =>
    `<div class="rar-row" style="--rc:${r.c}"><i class="rar-dot"></i><span class="rar-name">${r.n}</span><span class="rar-count">${perTier[i].found}/${perTier[i].total}</span></div>`
  ).join("");

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
  if (mode === "abc") codes.sort((a, b) => a.localeCompare(b, "de"));
  else if (mode === "rar") codes.sort((a, b) => codeTier[b] - codeTier[a] || codePop[a] - codePop[b] || found[b] - found[a]);
  else codes.sort((a, b) => found[b] - found[a]);
  $("#collection").innerHTML = codes
    .map((c) => `<button class="coll-chip" data-code="${c}" title="${codeName(c)} – ${RARITY[codeTier[c]].n}">${plateHTML(c)}</button>`)
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
        <p class="fact-meta">${rarPill(code)} <span class="rar-why">≈ ${fmtNum(codePop[code])} Einwohner im Zulassungsgebiet${codeAlt[code] ? " · Altkennzeichen (+1 Stufe)" : ""}</span></p>
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

function showDistrict(idx) {
  const f = features[idx];
  if (f.codes.length === 1) return showCode(f.codes[0]);
  const panel = $("#fact-panel");
  panel.innerHTML = `
    <div class="fact-head">
      <div>
        <h3>${f.name}</h3>
        <p class="fact-meta">${BL[f.land]} · ≈ ${fmtNum(f.ew)} Einwohner · ${f.codes.length} Kennzeichen in diesem Bezirk</p>
      </div>
      <button class="fact-close" aria-label="Schließen">×</button>
    </div>
    <div class="collection" style="margin-top:12px">
      ${f.codes.map((c) => `<button class="coll-chip" data-code="${c}" title="${codeName(c)} – ${RARITY[codeTier[c]].n}" style="${found[c] ? "" : "opacity:.45"}">${plateHTML(c)}</button>`).join("")}
    </div>
    <p class="fact-locked" style="border:0;padding-top:6px">Kürzel antippen für Details${f.codes.some((c) => !found[c]) ? " – blasse sind noch offen." : "."}</p>
  `;
  panel.hidden = false;
  panel.querySelector(".fact-close").onclick = hideFacts;
  panel.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

/* ---------- Hinzufügen / Entfernen ---------- */

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
  const r = RARITY[codeTier[code]];
  const rarNote = codeTier[code] >= 3 ? ` <b style="color:${r.c}">${codeTier[code] >= 5 ? "MYTHISCH!! 🤯" : codeTier[code] >= 4 ? "LEGENDÄR! 🔥" : "Episch!"}</b>` : ` <span style="color:${r.c}">${r.n}</span>`;
  let msg = `🎉 <b>NEU:</b> ${plateHTML(code)}${rarNote} ${codeName(code)}`;
  const newly = evalAchievements();
  if (newly.length) msg += `<br>${achToastLine(newly)}`;
  toast(msg, "ok");
  showCode(code, false);
}

function removeCode(code) {
  delete found[code];
  save();
  updateMap(); updateStats(); updateCollection();
  renderAchievements(achCtx());
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
  const f = features[+p.dataset.i];
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
  if (p) showDistrict(+p.dataset.i);
});

/* ---------- Sammlung: Klicks & Sortierung ---------- */

document.addEventListener("click", (e) => {
  const chip = e.target.closest(".coll-chip");
  if (chip) showCode(chip.dataset.code);
});
$("#coll-sort").addEventListener("change", updateCollection);

/* ---------- Sync / Export / Import / Reset ---------- */

$("#sync-btn").addEventListener("click", () => {
  const url = syncUrl();
  const done = () => toast(`🔗 <b>Sync-Link kopiert!</b> Öffne ihn auf einem anderen Gerät (oder speichere ihn als Lesezeichen), um deine ${foundCount()} Kennzeichen mitzunehmen.`, "ok");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(url).then(done, () => window.prompt("Link kopieren:", url));
  } else {
    window.prompt("Link kopieren:", url);
  }
});

$("#export-btn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ app: "kennzeichen-sammler", exportiert: new Date().toISOString(), found, ach: achStore }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "kennzeichen-sammlung.json";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("Backup-Datei exportiert. 📦", "ok");
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
      if (data.ach) {
        for (const [id, ts] of Object.entries(data.ach)) {
          if (!achStore[id] && typeof ts === "number" && ACHIEVEMENTS.some((a) => a.id === id)) achStore[id] = ts;
        }
      }
      save(); updateMap(); updateStats(); updateCollection();
      const newly = evalAchievements();
      toast(`Import fertig: ${added} neue Kennzeichen übernommen.${newly.length ? "<br>" + achToastLine(newly) : ""}`, "ok");
    } catch (err) {
      toast("Datei konnte nicht gelesen werden.", "err");
    }
    e.target.value = "";
  });
});

$("#reset-btn").addEventListener("click", () => {
  if (confirm(`Wirklich alle ${foundCount()} gesammelten Kennzeichen löschen? Auch die Errungenschaften werden zurückgesetzt.`)) {
    found = {};
    achStore = {};
    save(); updateMap(); updateStats(); updateCollection(); hideFacts();
    renderAchievements(achCtx());
    toast("Sammlung zurückgesetzt – gute Fahrt! 🛣️", "");
  }
});

/* ---------- Start ---------- */

const syncMsg = importFromHash();
updateMap();
updateStats();
updateCollection();
const newlyOnLoad = evalAchievements();
{
  const msgs = [];
  if (syncMsg) msgs.push(syncMsg);
  if (newlyOnLoad.length) msgs.push(achToastLine(newlyOnLoad.slice(0, 4)) + (newlyOnLoad.length > 4 ? ` … und ${newlyOnLoad.length - 4} weitere` : ""));
  if (msgs.length) toast(msgs.join("<br>"), "ok");
}
if (matchMedia("(min-width: 980px)").matches) $("#ach-details").open = true;

})();
