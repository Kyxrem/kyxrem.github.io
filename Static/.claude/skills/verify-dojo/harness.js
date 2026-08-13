/* VIM DOJO verification harness — paste/evaluate once per page load.
   Defines window.DOJO. Drives the REAL vim engine with synthetic keydowns so the
   keystroke counter stays honest, then checks the puzzle actually counted as clear.

   Why keydowns and not Vim.handleKey(): handleKey bypasses the app's own keydown
   listener, so `keys` stays 0 and any rule/scoring assertion is meaningless.       */
(() => {
  const view = CMV.EditorView.findFromDOM(document.querySelector(".cm-editor"));
  if (!view) throw new Error("no editor on this page");
  const C = view.contentDOM;

  const KD = (el, key, o = {}) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...o }));

  // Insert into EVERY selection range — visual-block `I` leaves multiple cursors
  // and typing into only selection.main silently produces a one-line result.
  const TX = (s) =>
    view.dispatch({
      changes: view.state.selection.ranges.map((r) => ({ from: r.from, to: r.to, insert: s })),
      userEvent: "input.type",
    });

  const panel = () => document.querySelector(".cm-editor input");
  const raw   = () => document.getElementById("tgtText").dataset.raw;
  const norm  = (s) => s.replace(/[ \t]+$/gm, "").replace(/\n+$/, "");
  const title = () => document.getElementById("lvTitle").textContent.trim();

  /* Replay the solution exactly as rendered in #solution. */
  function play() {
    const chunks = [...document.getElementById("solution").children]
      .filter((e) => e.classList.contains("sol-k") || e.classList.contains("sol-lit"))
      .map((e) => ({ lit: e.classList.contains("sol-lit"), t: e.textContent }));

    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      if (c.lit) { for (const x of c.t) KD(C, x); TX(c.t); continue; }   // count, then insert
      if (c.t === "<Esc>") { KD(C, "Escape"); continue; }
      if (c.t === "↵")     { continue; }                                 // consumed by : and / below
      if (/^Ctrl-/.test(c.t)) { KD(C, c.t.slice(5), { ctrlKey: true }); continue; }
      if (c.t[0] === ":" || c.t === "/") {
        KD(C, c.t[0]);                                                   // opens vim's panel
        const p = panel();
        const q = c.t === "/" ? chunks[i + 1].t : c.t.slice(1);
        for (const x of q) KD(p, x);                                     // counted, not sent to buffer
        p.value = q;
        p.dispatchEvent(new InputEvent("input", { bubbles: true }));
        KD(p, "Enter", { keyCode: 13, which: 13 });
        i += c.t === "/" ? 2 : 1;
        continue;
      }
      for (const x of c.t) KD(C, x);
    }
  }

  /* Solve current puzzle. Checks BOTH that text matches and that the app counted
     it — a rule violation (e.g. noInsert) matches text but must not count. */
  function solve() {
    view.focus();
    play();
    const textOk = norm(view.state.doc.toString()) === norm(raw());
    const counted = document.getElementById("tgtPane").classList.contains("match");
    return { ok: textOk && counted, textOk, counted, name: title(), doc: view.state.doc.toString() };
  }

  function levels() {
    const btns = [...document.querySelectorAll("#lvList .lv")];
    const fails = [];
    btns.forEach((b, i) => {
      b.click();
      if (view.state.selection.main.head !== 0) fails.push(`${i + 1} not at top-left`);
      const r = solve();
      if (!r.ok) fails.push(`${i + 1} ${r.name} textOk=${r.textOk} counted=${r.counted}`);
    });
    return { pass: btns.length - fails.length, total: btns.length, fails };
  }

  /* Endless run of one tier. Keep n small — the tool call budget is ~30s and a
     timeout mid-sweep leaves CodeMirror wedged, which fails every later puzzle. */
  function tier(name, n = 40) {
    document.querySelector(`#tierChips .chip[data-tier="${name}"]`).click();
    document.querySelector('#lenChips .chip[data-len="0"]').click();
    document.getElementById("btnRun").click();
    const st = {};
    for (let i = 0; i < n; i++) {
      const nm = title().replace(/^\s*\w+\s*/, "");
      const r = solve();
      (st[nm] = st[nm] || { p: 0, f: 0, sample: null });
      if (r.ok) st[nm].p++;
      else { st[nm].f++; st[nm].sample = st[nm].sample || { doc: r.doc, want: raw() }; }
      document.getElementById("btnNext").click();
    }
    const bad = Object.entries(st).filter(([, v]) => v.f);
    return {
      total: n,
      pass: Object.values(st).reduce((a, v) => a + v.p, 0),
      templates: Object.keys(st).length,
      failures: bad.map(([k, v]) => ({ template: k, fails: v.f, ...v.sample })),
    };
  }

  /* Every solution key must resolve to a real cheat-sheet card. */
  function deadLinks() {
    const cards = new Set();
    document.querySelectorAll(".card").forEach((c) =>
      c.dataset.keys.split(/\s+/).forEach((t) => cards.add(t)));
    const dead = new Set();
    [...document.querySelectorAll(".sol-k")].forEach((b) => {
      if (!cards.has(b.dataset.tok)) dead.add(b.dataset.tok);
    });
    return [...dead];
  }

  const reset = () => {
    try { localStorage.removeItem("vimdojo.best.v1"); localStorage.removeItem("vimdojo.run.v1"); } catch {}
  };

  window.DOJO = { play, solve, levels, tier, deadLinks, reset, view };
  return "DOJO ready — DOJO.levels() / DOJO.tier('MASTER',40) / DOJO.deadLinks() / DOJO.reset()";
})();
