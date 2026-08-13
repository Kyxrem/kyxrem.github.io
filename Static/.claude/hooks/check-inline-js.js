/* PostToolUse: parse the inline <script> in index.html after every edit.
   The whole app is one 1,500-line inline script, and big regex splices into it
   can leave unbalanced braces or a broken template literal — which only shows up
   as a blank page after a reload.

   Catches: syntax errors (braces, template literals, stray tokens).
   Does NOT catch: use-before-declare, undefined names, or any runtime fault.
   Upgrade path is ESLint with no-undef + no-use-before-define, which costs a
   package.json this project currently does without.                            */
const fs = require("fs"), path = require("path"), os = require("os");
const { execFileSync } = require("child_process");

let raw = "";
process.stdin.on("data", (d) => (raw += d)).on("end", () => {
  let p = "";
  try { p = (JSON.parse(raw).tool_input || {}).file_path || ""; } catch { process.exit(0); }
  if (!/index\.html$/i.test(p) || !fs.existsSync(p)) process.exit(0);

  const html = fs.readFileSync(p, "utf8");
  const blocks = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  if (!blocks.length) process.exit(0);

  const tmp = path.join(os.tmpdir(), "dojo-inline-check.js");
  for (const [i, m] of blocks.entries()) {
    fs.writeFileSync(tmp, m[1]);
    try {
      execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    } catch (e) {
      const msg = (e.stderr || "").toString().split("\n").slice(0, 6).join("\n");
      // line numbers are relative to the extracted block, not the file
      const offset = html.slice(0, m.index).split("\n").length;
      console.error(
        `Syntax error in inline <script> #${i + 1} of index.html\n` +
        `(block starts near line ${offset}; the line below is relative to the block)\n\n` + msg
      );
      process.exit(2);
    }
  }
  process.exit(0);
});
