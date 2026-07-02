// Нулевая зависимость: статический файловый сервер поверх корня репозитория.
// Только встроенные модули Node (http/fs/path) — чтобы соблюсти правило проекта
// «без package.json / без npm-зависимостей» (CLAUDE.md §8). Playwright-скриптам
// нужен реальный http-origin (localStorage/Service Worker/CSP не работают на file://).

const http = require("http");
const fs = require("fs");
const path = require("path");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".webmanifest": "application/manifest+json",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

// Запускает статический сервер над `root`. Возвращает { url, port, close }.
// port=0 → ОС выдаёт свободный порт (параллельные прогоны не конфликтуют).
function startServer(root, port = 0) {
  const server = http.createServer((req, res) => {
    let urlPath;
    try {
      urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400);
      return res.end("bad url");
    }
    if (urlPath === "/") urlPath = "/index.html";

    // Защита от path traversal: резолвим и проверяем, что остались под root.
    const filePath = path.join(root, urlPath);
    if (!filePath.startsWith(path.resolve(root))) {
      res.writeHead(403);
      return res.end("forbidden");
    }

    fs.stat(filePath, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("404 " + urlPath);
      }
      res.writeHead(200, {
        "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(filePath).pipe(res);
    });
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const actualPort = server.address().port;
      resolve({
        url: `http://127.0.0.1:${actualPort}`,
        port: actualPort,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

module.exports = { startServer };
