/* Minimal static server for testing. WebRTC (versus mode) and reliable reloads
   both need a real HTTP origin — file:// will not do.
   Usage: node .claude/skills/verify-dojo/serve.js  [port]                        */
const http = require("http"), fs = require("fs"), path = require("path");

const root = path.resolve(__dirname, "..", "..", "..");
const port = +process.argv[2] || 8777;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css", ".md": "text/plain; charset=utf-8", ".json": "application/json",
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0].split("#")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end("no"); }
  fs.readFile(f, (e, d) => {
    if (e) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, {
      "content-type": types[path.extname(f)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(d);
  });
}).listen(port, "127.0.0.1", () =>
  console.log(`serving ${root} on http://127.0.0.1:${port}`));
