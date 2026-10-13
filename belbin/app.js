/* Belbin-Teamrollen-Test – Ablauf, Speicherung und Auswertung. */
(() => {
  "use strict";

  const ROLE_KEYS = Object.keys(ROLES);
  const STORE_KEY = "belbin-v1";
  const app = document.getElementById("app");

  /* Aussagen pro Abschnitt in fester, aber gemischter Reihenfolge,
     damit dieselbe Rolle nicht immer an derselben Stelle steht. */
  const ORDER = SECTIONS.map((_, i) => {
    const keys = ROLE_KEYS.slice();
    let seed = 7919 * (i + 3);
    for (let j = keys.length - 1; j > 0; j--) {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      const k = seed % (j + 1);
      [keys[j], keys[k]] = [keys[k], keys[j]];
    }
    return keys;
  });

  let state = load() || fresh();

  function fresh() {
    return { step: -1, answers: SECTIONS.map(() => Object.fromEntries(ROLE_KEYS.map(k => [k, 0]))) };
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(STORE_KEY));
      if (s && Array.isArray(s.answers) && s.answers.length === SECTIONS.length) return s;
    } catch (_) { /* kein Speicher verfügbar */ }
    return null;
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* egal */ }
  }

  const sum = obj => Object.values(obj).reduce((a, b) => a + b, 0);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function totals(answers) {
    const t = Object.fromEntries(ROLE_KEYS.map(k => [k, 0]));
    answers.forEach(a => ROLE_KEYS.forEach(k => { t[k] += a[k] || 0; }));
    return t;
  }

  /* ---------- Teilen per URL-Hash: #r=12.8.5.… in ROLE_KEYS-Reihenfolge ---------- */
  function encode(t) { return "r=" + ROLE_KEYS.map(k => t[k]).join("."); }
  function decode(hash) {
    const m = /^#r=([\d.]+)$/.exec(hash);
    if (!m) return null;
    const nums = m[1].split(".").map(Number);
    if (nums.length !== ROLE_KEYS.length || nums.some(n => !Number.isInteger(n) || n < 0 || n > 70)) return null;
    return Object.fromEntries(ROLE_KEYS.map((k, i) => [k, nums[i]]));
  }

  /* ---------- Rendering ---------- */
  function render() {
    const shared = decode(location.hash);
    if (shared) return renderResult(shared, true);
    if (state.step < 0) return renderIntro();
    if (state.step >= SECTIONS.length) return renderResult(totals(state.answers), false);
    renderSection(state.step);
  }

  function go(step) {
    state.step = step;
    save();
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderIntro() {
    const started = state.answers.some(a => sum(a) > 0);
    app.innerHTML = `
      <section class="card intro">
        <h2>So funktioniert's</h2>
        <ol class="steps">
          <li>Du bekommst <strong>${SECTIONS.length} Situationen</strong> mit je ${ROLE_KEYS.length} Aussagen.</li>
          <li>Verteile pro Situation genau <strong>${POINTS_PER_SECTION} Punkte</strong> auf die Aussagen, die dich am besten beschreiben.
              Du kannst alle Punkte einer Aussage geben oder sie auf mehrere aufteilen.</li>
          <li>Am Ende siehst du deine stärksten Teamrollen – mit Stärken, typischen Schwächen und Tipps.</li>
        </ol>
        <p class="muted">Dauer: etwa 5–10 Minuten. Antworte so, wie du dich tatsächlich verhältst – nicht, wie du gern wärst.</p>
        <div class="actions">
          <button class="btn primary" data-act="start">${started ? "Weitermachen" : "Test starten"}</button>
          ${started ? `<button class="btn" data-act="reset">Von vorn beginnen</button>` : ""}
        </div>
      </section>
      <section class="card">
        <h2>Die neun Teamrollen</h2>
        <div class="cats">
          ${Object.entries(CATEGORIES).map(([ck, c]) => `
            <div class="cat cat-${ck}">
              <h3>${c.name}</h3>
              <p class="muted small">${c.hint}</p>
              <ul>${ROLE_KEYS.filter(k => ROLES[k].cat === ck).map(k =>
                `<li><span aria-hidden="true">${ROLES[k].icon}</span> <strong>${ROLES[k].name}</strong><br><span class="small muted">${ROLES[k].short}</span></li>`).join("")}</ul>
            </div>`).join("")}
        </div>
      </section>`;
  }

  function renderSection(i) {
    const sec = SECTIONS[i];
    const a = state.answers[i];
    const left = POINTS_PER_SECTION - sum(a);
    app.innerHTML = `
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${SECTIONS.length}" aria-valuenow="${i}">
        <div class="progress-bar" style="width:${(i / SECTIONS.length) * 100}%"></div>
      </div>
      <section class="card">
        <p class="eyebrow">Situation ${i + 1} von ${SECTIONS.length}</p>
        <h2>${esc(sec.title)}</h2>
        <div class="pool" aria-hidden="true">${Array.from({ length: POINTS_PER_SECTION }, (_, n) =>
          `<span class="dot${n < POINTS_PER_SECTION - left ? " on" : ""}"></span>`).join("")}</div>
        <p class="left ${left === 0 ? "done" : ""}" id="left">${leftText(left)}</p>
        <ul class="items">
          ${ORDER[i].map(k => `
            <li class="item${a[k] > 0 ? " has" : ""}">
              <span class="text">${esc(sec.items[k])}</span>
              <span class="stepper">
                <button class="step" data-act="dec" data-k="${k}" aria-label="Einen Punkt weniger" ${a[k] === 0 ? "disabled" : ""}>−</button>
                <output class="val" aria-label="Punkte">${a[k]}</output>
                <button class="step" data-act="inc" data-k="${k}" aria-label="Einen Punkt mehr" ${left === 0 ? "disabled" : ""}>+</button>
              </span>
            </li>`).join("")}
        </ul>
        <div class="actions split">
          <button class="btn" data-act="back">← ${i === 0 ? "Übersicht" : "Zurück"}</button>
          <span class="actions-r">
            ${sum(a) > 0 ? `<button class="btn ghost" data-act="clear">Leeren</button>` : ""}
            <button class="btn primary" data-act="next" ${left !== 0 ? "disabled" : ""}>
              ${i === SECTIONS.length - 1 ? "Auswerten" : "Weiter →"}</button>
          </span>
        </div>
      </section>`;
  }

  function leftText(left) {
    if (left === 0) return "✓ Alle Punkte verteilt";
    return `Noch <strong>${left}</strong> ${left === 1 ? "Punkt" : "Punkte"} zu verteilen`;
  }

  function renderResult(t, shared) {
    const ranked = ROLE_KEYS.slice().sort((x, y) => t[y] - t[x]);
    const total = sum(t) || 1;
    const max = Math.max(...ranked.map(k => t[k]), 1);
    const avg = total / ROLE_KEYS.length;
    const top = ranked.slice(0, 3);
    const low = ranked.slice(-2).reverse();
    const main = ROLES[top[0]];
    const catTotals = Object.keys(CATEGORIES).map(ck => [ck, ROLE_KEYS.filter(k => ROLES[k].cat === ck).reduce((s, k) => s + t[k], 0)]);

    app.innerHTML = `
      ${shared ? `<p class="banner">Du siehst ein geteiltes Ergebnis. <a href="#" data-act="own">Selbst den Test machen →</a></p>` : ""}
      <section class="card hero cat-${main.cat}">
        <p class="eyebrow">${shared ? "Hauptrolle" : "Deine Hauptrolle"}</p>
        <h2 class="big"><span aria-hidden="true">${main.icon}</span> ${main.name}</h2>
        <p class="en">${main.en} · ${CATEGORIES[main.cat].name}</p>
        <p>${main.short}</p>
      </section>

      <section class="card">
        <h2>Alle Rollen im Überblick</h2>
        <p class="muted small">Punkte pro Rolle (max. ${SECTIONS.length * POINTS_PER_SECTION}). Die gestrichelte Linie zeigt den Durchschnitt von ${fmt(avg)} Punkten.</p>
        <div class="bars" style="--avg:${(avg / max) * 100}%">
          ${ranked.map(k => `
            <div class="bar-row">
              <span class="bar-label"><span aria-hidden="true">${ROLES[k].icon}</span> ${ROLES[k].name}</span>
              <span class="bar-track"><span class="bar cat-${ROLES[k].cat}" style="width:${(t[k] / max) * 100}%"></span></span>
              <span class="bar-val">${t[k]}</span>
            </div>`).join("")}
        </div>
        <div class="mix" aria-label="Verteilung nach Kategorie">
          ${catTotals.map(([ck, v]) => v > 0 ? `<span class="mix-seg cat-${ck}" style="flex:${v}" title="${CATEGORIES[ck].name}: ${Math.round(v / total * 100)} %"></span>` : "").join("")}
        </div>
        <ul class="legend">
          ${catTotals.map(([ck, v]) => `<li><span class="swatch cat-${ck}"></span>${CATEGORIES[ck].name} <strong>${Math.round(v / total * 100)} %</strong></li>`).join("")}
        </ul>
      </section>

      <h2 class="section-h">${shared ? "Stärkste Rollen" : "Deine stärksten Rollen"}</h2>
      <div class="role-grid">
        ${top.map((k, n) => roleCard(k, t[k], n + 1)).join("")}
      </div>

      <section class="card">
        <h2>Weniger ausgeprägt</h2>
        <p class="muted small">Diese Rollen übernehmen im Team vermutlich besser andere – gut zu wissen, wen man ergänzend braucht.</p>
        <ul class="low">
          ${low.map(k => `<li><span aria-hidden="true">${ROLES[k].icon}</span> <strong>${ROLES[k].name}</strong> <span class="muted">(${t[k]} Punkte)</span> – ${ROLES[k].short}</li>`).join("")}
        </ul>
      </section>

      <div class="actions">
        ${shared
          ? `<button class="btn primary" data-act="own">Selbst den Test machen</button>`
          : `<button class="btn primary" data-act="share">🔗 Ergebnis-Link kopieren</button>
             <button class="btn" data-act="edit">Antworten ändern</button>
             <button class="btn ghost" data-act="reset">Neu starten</button>`}
      </div>
      <p class="toast" id="toast" hidden></p>`;
  }

  function roleCard(k, score, rank) {
    const r = ROLES[k];
    return `
      <article class="card role cat-${r.cat}">
        <header>
          <span class="rank">#${rank}</span>
          <h3><span aria-hidden="true">${r.icon}</span> ${r.name}</h3>
          <span class="score">${score} P.</span>
        </header>
        <p class="en">${r.en}</p>
        <p>${r.short}</p>
        <h4>Stärken</h4>
        <ul>${r.strengths.map(s => `<li>${s}</li>`).join("")}</ul>
        <h4>Typische Schwächen</h4>
        <ul>${r.weaknesses.map(s => `<li>${s}</li>`).join("")}</ul>
        <p class="tip">💬 ${r.tip}</p>
      </article>`;
  }

  const fmt = n => n.toLocaleString("de-DE", { maximumFractionDigits: 1 });

  /* ---------- Interaktion ---------- */
  app.addEventListener("click", e => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const act = btn.dataset.act;
    const i = state.step;

    switch (act) {
      case "start": {
        // Beim ersten unvollständigen Abschnitt weitermachen
        const next = state.answers.findIndex(a => sum(a) !== POINTS_PER_SECTION);
        go(next === -1 ? SECTIONS.length : next);
        break;
      }
      case "inc":
      case "dec": {
        const a = state.answers[i];
        const k = btn.dataset.k;
        if (act === "inc" && sum(a) < POINTS_PER_SECTION) a[k]++;
        if (act === "dec" && a[k] > 0) a[k]--;
        save();
        renderSection(i);
        // Fokus auf dem gleichen Knopf halten (Tastatur/Screenreader)
        const same = app.querySelector(`[data-act="${act}"][data-k="${k}"]`);
        (same && !same.disabled ? same : app.querySelector(`[data-act="next"]:not([disabled])`) || same)?.focus();
        break;
      }
      case "clear":
        ROLE_KEYS.forEach(k => { state.answers[i][k] = 0; });
        save();
        renderSection(i);
        break;
      case "next":
        go(i + 1);
        break;
      case "back":
        go(i - 1);
        break;
      case "edit":
        go(0);
        break;
      case "reset":
        if (!confirm("Alle Antworten löschen und neu beginnen?")) return;
        state = fresh();
        go(-1);
        break;
      case "share":
        share();
        break;
      case "own":
        e.preventDefault();
        history.replaceState(null, "", location.pathname);
        render();
        break;
    }
  });

  async function share() {
    const url = location.origin + location.pathname + "#" + encode(totals(state.answers));
    let msg = "Link kopiert – teil ihn mit deinem Team!";
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title: "Mein Belbin-Ergebnis", url });
        return;
      }
      await navigator.clipboard.writeText(url);
    } catch (err) {
      if (err && err.name === "AbortError") return;
      msg = "Kopieren nicht möglich – hier ist der Link: " + url;
    }
    const toast = document.getElementById("toast");
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(share.t);
    share.t = setTimeout(() => { toast.hidden = true; }, 6000);
  }

  window.addEventListener("hashchange", render);
  render();
})();
