const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const PORT = 5500;
const API_HOST = "127.0.0.1";
const API_PORT = 8080;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname.startsWith("/api/")) {
    const proxyReq = http.request(
      {
        hostname: API_HOST,
        port: API_PORT,
        path: url.pathname + url.search,
        method: req.method,
        headers: { ...req.headers, host: `${API_HOST}:${API_PORT}` },
      },
      (proxyRes) => {
        res.writeHead(proxyRes.statusCode, proxyRes.headers);
        proxyRes.pipe(res);
      }
    );
    proxyReq.on("error", () => {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "无法连接后端 http://127.0.0.1:8080，请先启动 Go 服务" }));
    });
    req.pipe(proxyReq);
    return;
  }

  const filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
  const absPath = path.join(ROOT, safePath);

  fs.readFile(absPath, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(absPath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`Frontend: http://127.0.0.1:${PORT}`);
  console.log("Proxy /api -> http://127.0.0.1:8080");
});
