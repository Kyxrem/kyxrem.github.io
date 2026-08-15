// Headless smoke test: loads the real page in jsdom, clicks every tab,
// and cross-checks the Ores tab math against data.js.
// Run from the clash/ directory:  npm i jsdom && node tools/smoke_test.js
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..") + path.sep;

const html = fs.readFileSync(root + "index.html", "utf8");
const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.com/" });
const { window } = dom;
for (const f of ["data.js", "layout-data.js", "mybase.js", "app.js"]) {
  window.eval(fs.readFileSync(root + f, "utf8"));
}
window.document.dispatchEvent(new window.Event("DOMContentLoaded", { bubbles: true }));

(async () => {
await new Promise(r => setTimeout(r, 100)); // boot() is async

const $ = s => window.document.querySelector(s);
const assert = (cond, msg) => { if (!cond) { console.error("FAIL:", msg); process.exitCode = 1; } else console.log("ok:", msg); };

// click through every tab, each must render non-trivial content
// (the Base Builder tab logs a canvas error under jsdom — harmless, no canvas impl)
for (const btn of window.document.querySelectorAll("nav.tabs button")) {
  btn.click();
  const sec = $("#tab-" + btn.dataset.tab);
  assert(sec && !sec.hidden && sec.innerHTML.length > 200, `tab "${btn.dataset.tab}" renders (${sec ? sec.innerHTML.length : 0} chars)`);
}

// Ores tab: income calculator syncs the weekly plan values
$('nav.tabs button[data-tab="ores"]').click();
assert(/Upgrade cost calculator/.test($("#tab-ores").innerHTML), "ores: cost calculator present");
assert(window.document.querySelector('[data-orecalc="league"]').options.length === 34, "ores: 34 leagues in select");
const lg = window.document.querySelector('[data-orecalc="league"]');
lg.value = "33"; // Legend: 1100/65/2 per star bonus
lg.dispatchEvent(new window.Event("change", { bubbles: true }));
const st = JSON.parse(window.localStorage.getItem("clashAnalyzerV1"));
assert(st.settings.oreCalc.league === 33 && st.settings.oreWeekShiny > 1100 * 7, `ores: league change syncs weekly shiny (${st.settings.oreWeekShiny})`);

// cost calculator: epic 1→27 must equal the data.js level table exactly
const idSel = window.document.querySelector('[data-oresel="id"]');
idSel.value = "action_figure";
idSel.dispatchEvent(new window.Event("change", { bubbles: true }));
const from = window.document.querySelector('[data-oresel="from"]');
from.value = "1"; from.dispatchEvent(new window.Event("change", { bubbles: true }));
const to = window.document.querySelector('[data-oresel="to"]');
to.value = "27"; to.dispatchEvent(new window.Event("change", { bubbles: true }));
const eq = window.COC_DATA.equipment.find(e => e.id === "action_figure");
const want = eq.levels.filter(r => r[0] >= 2).reduce((s, r) => [s[0] + r[1], s[1] + r[2], s[2] + r[3]], [0, 0, 0]);
const gems = want[0] + want[1] * 5 + want[2] * 35;
const oh = $("#tab-ores").innerHTML;
assert(oh.includes(want[0].toLocaleString("en-US")) && oh.includes(want[1].toLocaleString("en-US")), `ores: 1→27 ore sums match data (${want.join("/")})`);
assert(oh.includes(gems.toLocaleString("en-US")), `ores: gem equivalent ${gems} shown`);

// Magic Items tab
$('nav.tabs button[data-tab="magic"]').click();
const mh = $("#tab-magic").innerHTML;
assert(/Book of Building/.test(mh) && /Hammer of Heroes/.test(mh), "magic: best-use table present");
assert(/Rune of Gold/.test(mh) && /Wall Ring/.test(mh), "magic: runes + wall ring rows present");
assert((mh.match(/<tr><td>/g) || []).length >= 25, "magic: reference table has all items");
assert(/skipped/.test(mh), "magic: book has a computed target");

console.log(process.exitCode ? "\nSMOKE TEST FAILED" : "\nall good");
})();
